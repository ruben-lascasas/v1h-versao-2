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
const { isEnglish } = require('../api-util/emailSender');
const { collectVerificationRows } = require('../api-util/verificationList');
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
    const rows = await collectVerificationRows(sdk);
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
    const en = isEnglish(profile);
    if (verdict === 'reject') {
      emails
        .documentRejected({
          to,
          displayName,
          docLabel: def.label,
          docLabelEN: def.labelEN,
          reason: trimmedReason,
          en,
        })
        .catch(() => {});
    } else if (status === ACCOUNT_STATUS.APPROVED) {
      // Only when the last outstanding document lands — one email per account,
      // not one per document.
      emails.accountApproved({ to, displayName, en }).catch(() => {});
    }

    return res.json({ status, docs: publicShape(docs) });
  } catch (e) {
    console.error('[verification-admin] decision failed:', e?.message || e);
    return res.status(500).json({ error: 'decision-failed' });
  }
};


/**
 * GET /api/verification-admin/me
 *
 * Diz ao cliente se quem está autenticado é administrador, para o menu poder
 * mostrar a entrada do painel só a quem lá pode entrar. Não devolve a lista de
 * administradores nem nada além do sim/não — quem não é admin fica a saber
 * apenas isso.
 *
 * Isto é conveniência de interface, não segurança: os endpoints que interessam
 * verificam o mesmo por sua conta.
 */
const me = async (req, res) => {
  const admin = await requireAdmin(req, res);
  return res.json({ isAdmin: Boolean(admin) });
};

module.exports = { list, docUrl, decision, me };
