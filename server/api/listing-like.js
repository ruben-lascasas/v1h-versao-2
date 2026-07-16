const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/listing-like
 * Persist a per-listing like in operator-only metadata so cards can show
 * a Vinted-style favourite counter visible to every visitor.
 *
 * Body: { listingId: string, action: 'like' | 'unlike' }
 * Auth: standard SDK cookie session — the userId comes from currentUser.show()
 *       (clients can't fake another user's like).
 *
 * Notification side-effect:
 *   Each new fan triggers at most one alert per (fan, listing) pair per 24h.
 *   The throttle map lives in `listing.metadata.likeNotifs`; passing alerts are
 *   appended to the owner's `user.metadata.unseenFavoriteAlerts` (for in-app
 *   toast) and aggregated into `user.metadata.dailyFavoriteDigest` (for the
 *   daily email cron). Toggling unlike/like by the same fan within 24h does
 *   nothing — exactly the anti-spam behaviour requested.
 *
 * Required env:
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_UNSEEN_ALERTS = 50;

const todayKey = (now = new Date()) =>
  now.toISOString().slice(0, 10); // YYYY-MM-DD

const recordOwnerAlert = async ({ integrationSdk, ownerId, listingId, listingTitle, now }) => {
  let ownerMeta = {};
  try {
    const userRes = await integrationSdk.users.show({ id: ownerId });
    ownerMeta = userRes?.data?.data?.attributes?.profile?.metadata || {};
  } catch (e) {
    console.error('[ListingLike] users.show failed:', e?.message || e);
    return;
  }

  const prevUnseen = Array.isArray(ownerMeta.unseenFavoriteAlerts)
    ? ownerMeta.unseenFavoriteAlerts
    : [];
  const unseenFavoriteAlerts = [
    { listingId, listingTitle, at: now },
    ...prevUnseen,
  ].slice(0, MAX_UNSEEN_ALERTS);

  const prevDigest = ownerMeta.dailyFavoriteDigest || {};
  const day = todayKey();
  const digestListings =
    prevDigest.date === day && prevDigest.listings && typeof prevDigest.listings === 'object'
      ? { ...prevDigest.listings }
      : {};
  const prevEntry = digestListings[listingId] || { title: listingTitle, count: 0 };
  digestListings[listingId] = {
    title: listingTitle || prevEntry.title || 'Anúncio',
    count: (prevEntry.count || 0) + 1,
  };
  const dailyFavoriteDigest = { date: day, listings: digestListings };

  try {
    await integrationSdk.users.updateProfile({
      id: ownerId,
      metadata: { unseenFavoriteAlerts, dailyFavoriteDigest },
    });
  } catch (e) {
    console.error('[ListingLike] owner metadata update failed:', e?.message || e);
  }
};

module.exports = async (req, res) => {
  const { listingId, action } = req.body || {};
  if (!listingId || (action !== 'like' && action !== 'unlike')) {
    return res.status(400).json({ error: 'invalid-params' });
  }

  // 1. Auth — get the userId from the session cookie. No userId means the
  //    request is anonymous; we refuse so likes can't be forged.
  const sdk = getSdk(req, res);
  let userId;
  try {
    const me = await sdk.currentUser.show();
    userId = me?.data?.data?.id?.uuid;
    if (!userId) throw new Error('no-current-user');
  } catch (_) {
    return res.status(401).json({ error: 'not-authenticated' });
  }

  // 2. Read current metadata via Integration SDK.
  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    return res.status(503).json({ error: 'backend-down' });
  }

  let likedBy = [];
  let currentPublicCount;
  let likeNotifs = {};
  let ownerId = null;
  let listingTitle = '';
  try {
    const listingRes = await integrationSdk.listings.show({
      id: listingId,
      include: ['author'],
    });
    const data = listingRes?.data?.data;
    const attrs = data?.attributes || {};
    likedBy = Array.isArray(attrs.metadata?.likedBy)
      ? attrs.metadata.likedBy.filter(Boolean)
      : [];
    currentPublicCount = attrs.publicData?.favoritesCount;
    likeNotifs =
      attrs.metadata?.likeNotifs && typeof attrs.metadata.likeNotifs === 'object'
        ? attrs.metadata.likeNotifs
        : {};
    // Integration SDK sometimes returns the relationship id as a UUID instance
    // (`{ uuid }`) and sometimes as a plain string — handle both shapes.
    const authorIdRaw = data?.relationships?.author?.data?.id;
    ownerId = authorIdRaw?.uuid || (typeof authorIdRaw === 'string' ? authorIdRaw : null);
    listingTitle = attrs.title || '';
  } catch (e) {
    console.error('[ListingLike] listings.show failed:', e?.message || e);
    return res.status(404).json({ error: 'listing-not-found' });
  }

  // 3. Mutate the array idempotently — one entry per user, regardless of how
  //    many times the toggle is called.
  const has = likedBy.includes(userId);
  let nextLikedBy = likedBy;
  if (action === 'like' && !has) nextLikedBy = [...likedBy, userId];
  if (action === 'unlike' && has) nextLikedBy = likedBy.filter(u => u !== userId);

  // 4. Decide whether this like should also trigger an owner notification.
  //    Rules: only on `like`, only when 24h passed since the previous alert
  //    for the same (fan, listing) pair, and not if the fan IS the owner.
  const now = Date.now();
  const lastNotif = likeNotifs[userId];
  const shouldNotifyOwner =
    action === 'like' &&
    ownerId &&
    ownerId !== userId &&
    (!lastNotif || now - lastNotif > DAY_MS);
  const nextLikeNotifs = shouldNotifyOwner
    ? { ...likeNotifs, [userId]: now }
    : likeNotifs;

  // Skip the SDK call only when nothing would change. Note we also write
  // publicData if it's drifted from the source-of-truth array length — this
  // recovers from listings liked under the old metadata-only code path.
  const arrayUnchanged = nextLikedBy === likedBy;
  const publicCountInSync = currentPublicCount === nextLikedBy.length;
  const notifsUnchanged = nextLikeNotifs === likeNotifs;
  if (arrayUnchanged && publicCountInSync && notifsUnchanged) {
    return res.status(200).json({ count: nextLikedBy.length });
  }

  // 5. Persist. `likedBy` and `likeNotifs` stay in metadata (operator-only) so
  //    a malicious user can't read who liked what or game the throttle. The
  //    public count goes in publicData since Sharetribe's Marketplace API
  //    hides metadata from everyone except operators.
  try {
    await integrationSdk.listings.update({
      id: listingId,
      publicData: { favoritesCount: nextLikedBy.length },
      metadata: { likedBy: nextLikedBy, likeNotifs: nextLikeNotifs },
    });
  } catch (e) {
    console.error('[ListingLike] listings.update failed:', e?.message || e);
    return res.status(500).json({ error: 'update-failed' });
  }

  // 6. Best-effort owner notification — failures here must not block the like
  //    response since the heart count is the primary user-facing action.
  if (shouldNotifyOwner) {
    recordOwnerAlert({
      integrationSdk,
      ownerId,
      listingId,
      listingTitle,
      now,
    }).catch(e =>
      console.error('[ListingLike] recordOwnerAlert failed:', e?.message || e)
    );
  }

  return res.status(200).json({ count: nextLikedBy.length });
};
