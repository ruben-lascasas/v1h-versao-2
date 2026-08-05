/**
 * POST /api/change-user-type
 * Body: { userType }
 *
 * Lets someone switch account type after signing up — a visitante who decides
 * to advertise, an anunciante who also wants to offer services.
 *
 * Why this lives on the server rather than being a plain profile update from
 * the browser:
 *
 *   - The list of valid types comes from the Console asset, so a type that was
 *     removed (or a leftover like "test12") can never be selected, whatever the
 *     client sends.
 *   - Dropping the provider role while listings are still published would
 *     strand those listings. That has to be checked before the write, not after.
 *   - The verification gate has to be re-applied in the same breath: becoming an
 *     anunciante means postListings is denied until documents are approved, and
 *     leaving that type has to give the permission back.
 *
 * Auth: the standard SDK cookie session. The user id comes from
 * currentUser.show(), never from the body.
 */

const sharetribeSdk = require('sharetribe-flex-sdk');
const { getSdk, getIntegrationSdk } = require('../api-util/sdk');
const {
  verificationUserTypes,
  readDocs,
  syncPermissions,
  ensurePostingAllowed,
  EXEMPT_MARKER,
} = require('../api-util/verification');

const USER_TYPES_ASSET = '/users/user-types.json';
const CACHE_MS = 10 * 60 * 1000;

let cache = { at: 0, types: null };

/**
 * Types configured in Console, with the bits we need to reason about.
 *
 * @returns {Promise<Array<{id: string, label: string, isProvider: boolean}>>}
 */
const loadUserTypes = async () => {
  if (cache.types && Date.now() - cache.at < CACHE_MS) {
    return cache.types;
  }
  const sdk = sharetribeSdk.createInstance({
    clientId: process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID,
  });
  const response = await sdk.assetsByAlias({ paths: [USER_TYPES_ASSET], alias: 'latest' });
  const raw = response?.data?.data?.[0]?.attributes?.data?.userTypes || [];
  const types = raw
    .filter(t => t?.id)
    .map(t => ({
      id: t.id,
      label: t.label || t.id,
      isProvider: t.roles?.provider === true,
    }));
  cache = { at: Date.now(), types };
  return types;
};

/**
 * GET /api/user-types
 * The types someone may switch to. Read from Console, so it can never offer
 * something that no longer exists.
 */
const list = async (req, res) => {
  try {
    const types = await loadUserTypes();
    return res.json({ userTypes: types });
  } catch (e) {
    console.error('[change-user-type] list failed:', e?.message || e);
    return res.status(500).json({ error: 'list-failed' });
  }
};

const countPublishedListings = async (sdk, authorId) => {
  const response = await sdk.listings.query({ authorId, states: ['published', 'closed'], perPage: 1 });
  return response?.data?.meta?.totalItems || 0;
};

const change = async (req, res) => {
  const { userType } = req.body || {};
  if (!userType || typeof userType !== 'string') {
    return res.status(400).json({ error: 'invalid-params' });
  }

  let user;
  try {
    const sdk = getSdk(req, res);
    const response = await sdk.currentUser.show();
    user = response?.data?.data;
  } catch (_) {
    user = null;
  }
  if (!user?.id?.uuid) return res.status(401).json({ error: 'not-authenticated' });

  const userId = user.id.uuid;
  const currentType = user.attributes?.profile?.publicData?.userType || null;
  if (currentType === userType) {
    return res.json({ userType, changed: false });
  }

  try {
    const types = await loadUserTypes();
    const target = types.find(t => t.id === userType);
    if (!target) {
      // Covers both a typo and a legacy id that Console no longer defines.
      return res.status(400).json({ error: 'unknown-user-type' });
    }

    const integrationSdk = getIntegrationSdk();
    if (!integrationSdk) return res.status(500).json({ error: 'integration-sdk-not-configured' });

    const from = types.find(t => t.id === currentType);
    const losingProviderRole = from?.isProvider && !target.isProvider;
    if (losingProviderRole) {
      const listings = await countPublishedListings(integrationSdk, userId);
      if (listings > 0) {
        // Refusing is kinder than silently orphaning their listings.
        return res.status(409).json({ error: 'has-listings', listings });
      }
    }

    await integrationSdk.users.updateProfile({ id: userId, publicData: { userType } });

    // Re-apply the verification gate for the new type, in the same request, so
    // the account is never left in a state that says one thing and does another.
    const profile = (await integrationSdk.users.show({ id: userId }))?.data?.data?.attributes
      ?.profile;
    const verification = profile?.privateData?.verification || {};

    if (verificationUserTypes().includes(userType)) {
      const docs = readDocs(verification);
      const { status } = await syncPermissions(userId, docs, null);
      await integrationSdk.users.updateProfile({
        id: userId,
        privateData: { verification: { ...verification, appliedStatus: status } },
      });
      console.log(`[change-user-type] ${userId}: ${currentType} → ${userType} (verificação: ${status})`);
      return res.json({ userType, changed: true, verificationStatus: status });
    }

    const granted = await ensurePostingAllowed(userId, userType, null);
    if (granted) {
      await integrationSdk.users.updateProfile({
        id: userId,
        privateData: { verification: { ...verification, appliedStatus: EXEMPT_MARKER } },
      });
    }
    // The public flag would otherwise keep claiming a status this type no
    // longer has.
    await integrationSdk.users.updateProfile({ id: userId, metadata: { verificationStatus: null } });

    console.log(`[change-user-type] ${userId}: ${currentType} → ${userType}`);
    return res.json({ userType, changed: true, verificationStatus: null });
  } catch (e) {
    console.error('[change-user-type] failed:', e?.message || e);
    return res.status(500).json({ error: 'change-failed' });
  }
};

module.exports = { list, change };
