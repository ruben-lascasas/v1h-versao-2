const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/dismiss-extra-alert
 * Removes a single alert from the logged-in user's
 * `metadata.unseenExtraAlerts` so it disappears across devices.
 *
 * Body:
 *   { id }   -> remove only that alert
 *   {}       -> clear all (legacy fallback)
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

  const { id } = req.body || {};

  try {
    let nextValue = [];
    if (id) {
      const fresh = await integrationSdk.users.show({ id: userId });
      const current =
        fresh?.data?.data?.attributes?.profile?.metadata?.unseenExtraAlerts ||
        [];
      nextValue = current.filter(a => a && a.id !== id);
    }
    await integrationSdk.users.updateProfile({
      id: userId,
      metadata: { unseenExtraAlerts: nextValue },
    });
  } catch (e) {
    console.error('[DismissExtraAlert] update failed:', e?.message || e);
    return res.status(500).json({ error: 'update-failed' });
  }

  return res.status(200).json({ ok: true });
};
