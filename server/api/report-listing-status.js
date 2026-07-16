const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * GET /api/report-listing-status?listingId=<uuid>
 * Returns the current rate-limit status for the authenticated reporter so the
 * UI can show "X/5 today" and warn about same-listing/cooldown limits before
 * the user wastes time filling the form.
 *
 * Response: {
 *   usedToday, maxPerDay, perTargetDays, cooldownSeconds,
 *   alreadyReportedTarget: bool,
 *   cooldownRemainingSec: number,
 * }
 *
 * Returns 401 if not authenticated, 503 if backend creds missing.
 */

const LIMITS = {
  perDay: 8,
  perTargetDays: 30,
  cooldownSeconds: 60,
};

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = async (req, res) => {
  const listingId = (req.query?.listingId || '').toString();

  const sdk = getSdk(req, res);
  let reporterId;
  try {
    const me = await sdk.currentUser.show();
    reporterId = me?.data?.data?.id?.uuid;
    if (!reporterId) throw new Error('no-current-user');
  } catch (_) {
    return res.status(401).json({ error: 'not-authenticated' });
  }

  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    return res.status(503).json({ error: 'integration-sdk-missing' });
  }

  let history = [];
  try {
    const userRes = await integrationSdk.users.show({ id: reporterId });
    const meta = userRes?.data?.data?.attributes?.profile?.metadata || {};
    history = Array.isArray(meta.reportListingHistory) ? meta.reportListingHistory : [];
  } catch (e) {
    console.error('[ReportListingStatus] users.show failed:', e?.message || e);
  }

  const now = Date.now();
  const usedToday = history.filter(r => r && now - r.at < DAY_MS).length;
  const alreadyReportedTarget = listingId
    ? history.some(
        r => r && r.listingId === listingId && now - r.at < LIMITS.perTargetDays * DAY_MS
      )
    : false;
  const lastReport = history.length > 0 ? history.reduce((a, b) => (a.at > b.at ? a : b)) : null;
  const cooldownRemainingSec =
    lastReport && now - lastReport.at < LIMITS.cooldownSeconds * 1000
      ? Math.ceil((LIMITS.cooldownSeconds * 1000 - (now - lastReport.at)) / 1000)
      : 0;

  return res.status(200).json({
    usedToday,
    maxPerDay: LIMITS.perDay,
    perTargetDays: LIMITS.perTargetDays,
    cooldownSeconds: LIMITS.cooldownSeconds,
    alreadyReportedTarget,
    cooldownRemainingSec,
  });
};
