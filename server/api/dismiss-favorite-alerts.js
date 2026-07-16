const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/dismiss-favorite-alerts
 * Clears toast alerts so they disappear across devices.
 *
 * Body:
 *   { listingId }  -> remove only that listing's alerts (newly added so the
 *                     client can dismiss one banner at a time and let the
 *                     next queued one slide in)
 *   {}             -> clear all (backwards compat for callers that don't pass
 *                     a listingId — e.g. legacy "close all" buttons)
 *
 * The daily email digest is NOT cleared here — it's reset by the cron after
 * the email is sent, on purpose.
 */
module.exports = async (req, res) => {
  const sdk = getSdk(req, res);
  let userId;
  try {
    const me = await sdk.currentUser.show();
    userId = me?.data?.data?.id?.uuid;
    if (!userId) throw new Error('no-current-user');
  } catch (_) {
    return res.status(401).json({ error: 'not-authenticated' });
  }

  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    return res.status(503).json({ error: 'backend-down' });
  }

  const { listingId } = req.body || {};

  try {
    let nextValue = [];
    if (listingId) {
      // Per-entry dismissal: read current array, filter out matching entries.
      const fresh = await integrationSdk.users.show({ id: userId });
      const current =
        fresh?.data?.data?.attributes?.profile?.metadata?.unseenFavoriteAlerts ||
        [];
      nextValue = current.filter(a => a && a.listingId !== listingId);
    }
    await integrationSdk.users.updateProfile({
      id: userId,
      metadata: { unseenFavoriteAlerts: nextValue },
    });
  } catch (e) {
    console.error('[DismissFavoriteAlerts] update failed:', e?.message || e);
    return res.status(500).json({ error: 'update-failed' });
  }

  return res.status(200).json({ ok: true });
};
