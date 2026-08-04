/**
 * Anunciante verification — the operator side.
 *
 *   GET  /api/verification-admin/list      anunciantes and their documents
 *   GET  /api/verification-admin/doc       short-lived link to one document
 *   POST /api/verification-admin/decision  approve or reject one document
 *
 * Auth: the caller must be signed in AND their email must appear in the
 * ADMIN_EMAILS env var (comma separated). A secret URL is not access control —
 * URLs leak through history, logs and Referer headers. Tying it to the account
 * also means the decision log records who approved what.
 *
 * Required env:
 *   ADMIN_EMAILS=alguem@venue1hub.com,outra@venue1hub.com
 */

const { getSdk, getIntegrationSdk } = require('../api-util/sdk');
const r2 = require('../api-util/r2');
const emails = require('../api-util/verificationEmails');
const {
  STATUS,
  DOC_KEYS,
  verificationUserTypes,
  REQUIRED_DOCS,
  ACCOUNT_STATUS,
  readDocs,
  syncPermissions,
  publicShape,
} = require('../api-util/verification');

const DOC_URL_TTL_SECONDS = 300;
const MAX_USERS = 500;

const adminEmails = () =>
  (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

/**
 * @returns {Promise<{email: string, id: string}|null>} the admin, or null
 */
const requireAdmin = async (req, res) => {
  const allowed = adminEmails();
  if (allowed.length === 0) {
    console.error('[verification-admin] ADMIN_EMAILS is not configured');
    return null;
  }
  try {
    const sdk = getSdk(req, res);
    const response = await sdk.currentUser.show();
    const user = response?.data?.data;
    const email = user?.attributes?.email?.toLowerCase();
    if (!email || !allowed.includes(email)) return null;
    return { email, id: user.id.uuid };
  } catch (_) {
    return null;
  }
};

const deny = res => res.status(403).json({ error: 'forbidden' });

/**
 * GET /api/verification-admin/list
 * Anunciantes with at least one submitted document, newest submission first.
 */
const list = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return deny(res);

  const sdk = getIntegrationSdk();
  if (!sdk) return res.status(500).json({ error: 'integration-sdk-not-configured' });

  try {
    const collected = [];
    let page = 1;
    // Filtering by metadata would need a search schema configured in Console,
    // so page through and filter here instead. Capped so a growing user base
    // can never turn this into an unbounded scan.
    for (; page <= Math.ceil(MAX_USERS / 100); page++) {
      const response = await sdk.users.query({ page, perPage: 100 });
      const batch = response?.data?.data || [];
      collected.push(...batch);
      const totalPages = response?.data?.meta?.totalPages || 1;
      if (page >= totalPages || batch.length === 0) break;
    }

    const rows = collected
      .filter(u => verificationUserTypes().includes(u?.attributes?.profile?.publicData?.userType))
      .map(u => {
        const profile = u.attributes.profile || {};
        const verification = profile.privateData?.verification || {};
        const docs = readDocs(verification);
        const submitted = Object.values(docs).filter(d => d.status !== STATUS.MISSING);
        const lastUpload = submitted
          .map(d => d.uploadedAt)
          .filter(Boolean)
          .sort()
          .pop();
        return {
          userId: u.id.uuid,
          displayName: profile.displayName || null,
          email: u.attributes.email || null,
          status: profile.metadata?.verificationStatus || null,
          submittedCount: submitted.length,
          lastUploadAt: lastUpload || null,
          docs: publicShape(docs),
        };
      })
      .filter(row => row.submittedCount > 0)
      .sort((a, b) => String(b.lastUploadAt || '').localeCompare(String(a.lastUploadAt || '')));

    return res.json({ users: rows });
  } catch (e) {
    console.error('[verification-admin] list failed:', e?.message || e);
    return res.status(500).json({ error: 'list-failed' });
  }
};

/**
 * GET /api/verification-admin/doc?userId=...&docKey=...
 * Returns a signed URL that stops working after DOC_URL_TTL_SECONDS.
 */
const docUrl = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return deny(res);

  const { userId, docKey } = req.query || {};
  if (!userId || !DOC_KEYS.includes(docKey)) {
    return res.status(400).json({ error: 'invalid-params' });
  }

  try {
    const sdk = getIntegrationSdk();
    const response = await sdk.users.show({ id: userId });
    const doc = response?.data?.data?.attributes?.profile?.privateData?.verification?.docs?.[docKey];
    if (!doc?.key) return res.status(404).json({ error: 'not-found' });

    return res.json({
      url: r2.getSignedUrl(doc.key, DOC_URL_TTL_SECONDS),
      contentType: doc.contentType || null,
      filename: doc.filename || null,
      expiresIn: DOC_URL_TTL_SECONDS,
    });
  } catch (e) {
    console.error('[verification-admin] docUrl failed:', e?.message || e);
    return res.status(500).json({ error: 'doc-url-failed' });
  }
};

/**
 * POST /api/verification-admin/decision
 * Body: { userId, docKey, decision: 'approve' | 'reject', reason? }
 *
 * Decisions are per document on purpose: one bad scan should send back only
 * that scan, not the whole submission.
 */
const decision = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return deny(res);

  const { userId, docKey, decision: verdict, reason } = req.body || {};
  if (!userId || !DOC_KEYS.includes(docKey) || !['approve', 'reject'].includes(verdict)) {
    return res.status(400).json({ error: 'invalid-params' });
  }
  const trimmedReason = typeof reason === 'string' ? reason.trim().slice(0, 300) : '';
  if (verdict === 'reject' && !trimmedReason) {
    // Without a reason the anunciante has no idea what to fix.
    return res.status(400).json({ error: 'reason-required' });
  }

  try {
    const sdk = getIntegrationSdk();
    const response = await sdk.users.show({ id: userId });
    const profile = response?.data?.data?.attributes?.profile || {};
    const verification = profile.privateData?.verification || {};
    const existing = verification.docs?.[docKey];
    if (!existing?.key) return res.status(404).json({ error: 'not-found' });

    const nextDocs = {
      ...verification.docs,
      [docKey]: {
        ...existing,
        status: verdict === 'approve' ? STATUS.APPROVED : STATUS.REJECTED,
        reason: verdict === 'reject' ? trimmedReason : null,
        reviewedAt: new Date().toISOString(),
        reviewedBy: admin.email,
      },
    };

    const docs = readDocs({ docs: nextDocs });
    const { status } = await syncPermissions(userId, docs, verification.appliedStatus);
    await sdk.users.updateProfile({
      id: userId,
      privateData: { verification: { ...verification, docs: nextDocs, appliedStatus: status } },
    });

    console.log(
      `[verification-admin] ${admin.email} ${verdict}d ${docKey} for ${userId} → ${status}`
    );

    // Best effort — the decision is already saved, and the panel should not
    // report a failure because a mailbox was unreachable.
    const def = REQUIRED_DOCS.find(d => d.key === docKey);
    const to = response?.data?.data?.attributes?.email;
    const displayName = profile.displayName;
    if (verdict === 'reject') {
      emails
        .documentRejected({
          to,
          displayName,
          docLabel: def.label,
          docLabelEN: def.labelEN,
          reason: trimmedReason,
        })
        .catch(() => {});
    } else if (status === ACCOUNT_STATUS.APPROVED) {
      // Only when the last outstanding document lands — one email per account,
      // not one per document.
      emails.accountApproved({ to, displayName }).catch(() => {});
    }

    return res.json({ status, docs: publicShape(docs) });
  } catch (e) {
    console.error('[verification-admin] decision failed:', e?.message || e);
    return res.status(500).json({ error: 'decision-failed' });
  }
};

module.exports = { list, docUrl, decision };
