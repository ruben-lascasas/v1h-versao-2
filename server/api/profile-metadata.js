const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/profile-metadata
 * Persist the "Profissão" chosen during sign-up into the user's operator-only
 * metadata (Console user field `profissao`, access level Metadata).
 *
 * The Marketplace API can't write metadata, so the client calls this right
 * after signup and the write happens through the Integration SDK.
 *
 * Body: { profissao: string }
 * Auth: standard SDK cookie session — the userId comes from currentUser.show()
 *       so a client can only ever update its own profile.
 *
 * Required env:
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 */

// Same limit as Console single-line text user fields.
const MAX_LENGTH = 70;

module.exports = async (req, res) => {
  const { profissao } = req.body || {};
  const value = typeof profissao === 'string' ? profissao.trim() : '';
  if (!value || value.length > MAX_LENGTH) {
    return res.status(400).json({ error: 'invalid-params' });
  }

  const sdk = getSdk(req, res);
  let userId = null;
  try {
    const me = await sdk.currentUser.show();
    userId = me?.data?.data?.id?.uuid || null;
  } catch (e) {
    // fall through to the 401 below
  }
  if (!userId) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    console.error('[ProfileMetadata] Integration SDK credentials missing');
    return res.status(503).json({ error: 'integration-sdk-unavailable' });
  }

  try {
    await integrationSdk.users.updateProfile({
      id: userId,
      metadata: { profissao: value },
    });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[ProfileMetadata] updateProfile failed:', e?.message || e);
    return res.status(500).json({ error: 'update-failed' });
  }
};
