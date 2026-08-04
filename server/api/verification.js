/**
 * Anunciante verification — the endpoints the account owner uses.
 *
 *   GET  /api/verification         current status of each document
 *   POST /api/verification/upload  submit (or re-submit) one document
 *
 * Auth: the standard SDK cookie session. The user id always comes from
 * currentUser.show(), never from the request body, so a caller can only ever
 * read or change their own documents.
 *
 * The file arrives base64-encoded in the JSON body. That keeps the bucket free
 * of CORS rules and avoids a multipart dependency; the 8 MB cap sits well
 * inside the router's 30 MB JSON limit even after base64 overhead.
 */

const { getSdk, getIntegrationSdk } = require('../api-util/sdk');
const r2 = require('../api-util/r2');
const {
  STATUS,
  DOC_KEYS,
  ACCEPTED_MIME,
  MAX_BYTES,
  isAnunciante,
  readDocs,
  syncPermissions,
  buildObjectKey,
  publicShape,
} = require('../api-util/verification');

// Fetch the caller together with the private data we need. currentUser.show()
// is scoped to the session, so this is the authorisation check.
const loadCaller = async (req, res) => {
  try {
    const sdk = getSdk(req, res);
    const response = await sdk.currentUser.show();
    const user = response?.data?.data;
    return user?.id?.uuid ? user : null;
  } catch (_) {
    // No session, or an expired one. That is a 401 for the caller, not a
    // server fault — swallow it here so it doesn't surface as a 500.
    return null;
  }
};

// privateData is not exposed on currentUser.show() by default in a way we can
// rely on, so read it back through the Integration API.
const loadVerification = async userId => {
  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');
  const response = await sdk.users.show({ id: userId });
  const profile = response?.data?.data?.attributes?.profile || {};
  return profile.privateData?.verification || {};
};

const persist = async (userId, verification) => {
  const sdk = getIntegrationSdk();
  await sdk.users.updateProfile({ id: userId, privateData: { verification } });
};

/**
 * GET /api/verification
 */
const getStatus = async (req, res) => {
  try {
    const user = await loadCaller(req, res);
    if (!user) return res.status(401).json({ error: 'not-authenticated' });

    if (!isAnunciante(user)) {
      // Not an anunciante: nothing to submit, and nothing to block.
      return res.json({ required: false, docs: [], status: null });
    }

    const verification = await loadVerification(user.id.uuid);
    const docs = readDocs(verification);
    const { status, changed } = await syncPermissions(
      user.id.uuid,
      docs,
      verification.appliedStatus
    );
    if (changed) {
      await persist(user.id.uuid, { ...verification, appliedStatus: status });
    }

    return res.json({ required: true, status, docs: publicShape(docs) });
  } catch (e) {
    console.error('[verification] getStatus failed:', e?.message || e);
    return res.status(500).json({ error: 'status-failed' });
  }
};

/**
 * POST /api/verification/upload
 * Body: { docKey, filename, contentType, data } — data is base64, no data: prefix.
 */
const upload = async (req, res) => {
  try {
    const { docKey, filename, contentType, data } = req.body || {};

    if (!DOC_KEYS.includes(docKey)) {
      return res.status(400).json({ error: 'invalid-doc' });
    }
    if (!ACCEPTED_MIME.includes(contentType)) {
      return res.status(400).json({ error: 'invalid-type' });
    }
    if (typeof data !== 'string' || data.length === 0) {
      return res.status(400).json({ error: 'missing-file' });
    }

    const buffer = Buffer.from(data, 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: 'missing-file' });
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'too-large' });

    if (!r2.isConfigured()) {
      console.error('[verification] R2 is not configured');
      return res.status(500).json({ error: 'storage-not-configured' });
    }

    const user = await loadCaller(req, res);
    if (!user) return res.status(401).json({ error: 'not-authenticated' });
    if (!isAnunciante(user)) return res.status(403).json({ error: 'not-an-anunciante' });

    const userId = user.id.uuid;
    const verification = await loadVerification(userId);
    const existing = verification.docs?.[docKey];

    // An approved document is final. Re-submitting one would silently drop the
    // account back to pending, which is not something a stray click should do.
    if (existing?.status === STATUS.APPROVED) {
      return res.status(409).json({ error: 'already-approved' });
    }

    const objectKey = buildObjectKey(userId, docKey, contentType);
    await r2.putObject(objectKey, buffer, contentType);

    const nextDocs = {
      ...(verification.docs || {}),
      [docKey]: {
        key: objectKey,
        filename: typeof filename === 'string' ? filename.slice(0, 120) : null,
        contentType,
        size: buffer.length,
        status: STATUS.PENDING,
        reason: null,
        uploadedAt: new Date().toISOString(),
        reviewedAt: null,
      },
    };

    const docs = readDocs({ docs: nextDocs });
    const { status } = await syncPermissions(userId, docs, verification.appliedStatus);
    await persist(userId, { ...verification, docs: nextDocs, appliedStatus: status });

    // The superseded file is no longer referenced by anything; drop it rather
    // than leave identity documents lying around.
    if (existing?.key && existing.key !== objectKey) {
      r2.deleteObject(existing.key).catch(err =>
        console.error('[verification] failed to delete superseded object:', err?.message || err)
      );
    }

    return res.json({ status, docs: publicShape(docs) });
  } catch (e) {
    console.error('[verification] upload failed:', e?.message || e);
    return res.status(500).json({ error: 'upload-failed' });
  }
};

module.exports = { getStatus, upload };
