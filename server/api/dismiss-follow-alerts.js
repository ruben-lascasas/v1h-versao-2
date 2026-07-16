const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/dismiss-follow-alerts
 * Clears toast alerts so they disappear across devices.
 *
 * Body:
 *   { fanUserId }  -> remove only that fan's alerts (per-banner dismiss)
 *   {}             -> clear all (legacy "close all" path)
 *
 * The daily email digest is NOT cleared here.
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

  const { fanUserId } = req.body || {};

  try {
    let nextValue = [];
    if (fanUserId) {
      const fresh = await integrationSdk.users.show({ id: userId });
      const current =
        fresh?.data?.data?.attributes?.profile?.metadata?.unseenFollowAlerts ||
        [];
      nextValue = current.filter(a => a && a.fanUserId !== fanUserId);
    }
    await integrationSdk.users.updateProfile({
      id: userId,
      metadata: { unseenFollowAlerts: nextValue },
    });
  } catch (e) {
    console.error('[DismissFollowAlerts] update failed:', e?.message || e);
    return res.status(500).json({ error: 'update-failed' });
  }

  return res.status(200).json({ ok: true });
};
