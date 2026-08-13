const { Resend } = require('resend');
const { mailFrom } = require('../api-util/emailSender');
const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/user-follow
 * Notify the followed user that someone started following them. Mirrors the
 * /api/listing-like throttle so the same fan can only trigger one alert per
 * target per 24h — toggling unfollow/follow in a loop does nothing.
 *
 * Body: { targetUserId: string, action: 'follow' | 'unfollow' }
 * Auth: SDK cookie session — fanUserId taken from currentUser.show().
 *
 * Email behaviour: unlike the favourites digest, follows send an email
 * IMMEDIATELY the moment the throttle is crossed. The 24h per-fan throttle is
 * already enforced via `metadata.followNotifs`, so there's no extra spam risk
 * — the user-facing rule is "I want to know right away when someone new
 * follows me, but I don't want to be re-emailed every time they toggle".
 *
 * Note: the fan's own `privateData.following` list is still written client-side
 * via toggleFollowAndSync. This endpoint only takes care of the notification
 * side-effect on the target user.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_UNSEEN_ALERTS = 50;
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';

const buildEmail = (targetProfile, fanName, fanUserId, locale) => {
  const isEN = locale && locale.toLowerCase().startsWith('en');
  const name = targetProfile?.firstName || (isEN ? 'there' : 'olá');
  const safeFanName = String(fanName || (isEN ? 'A user' : 'Um utilizador')).replace(/</g, '&lt;');
  const fanUrl = `${ROOT_URL}/u/${fanUserId}`;

  const subject = isEN
    ? `[Venue1Hub] ${safeFanName} started following you`
    : `[Venue1Hub] ${safeFanName} começou a seguir-te`;

  const html = isEN
    ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">You have a new follower</h2>
        <p>Hi ${name},</p>
        <p><a href="${fanUrl}" style="color:#5C3317;font-weight:600;">${safeFanName}</a> just started following you on Venue1Hub.</p>
        <p style="margin-top:24px;"><a href="${fanUrl}" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">View profile</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">You'll only receive this email once per follower in a 24h window — no spam from people toggling follow on and off.</p>
      </div>
    `
    : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">Tens um novo seguidor</h2>
        <p>Olá ${name},</p>
        <p>O(A) <a href="${fanUrl}" style="color:#5C3317;font-weight:600;">${safeFanName}</a> começou a seguir-te na Venue1Hub.</p>
        <p style="margin-top:24px;"><a href="${fanUrl}" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">Ver perfil</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">Só recebes este email uma vez por seguidor em cada 24h — sem spam se alguém andar a alternar follow/unfollow.</p>
      </div>
    `;

  return { subject, html };
};

const sendFollowEmail = async ({ targetUser, fanName, fanUserId }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return;
  const email = targetUser?.attributes?.email;
  if (!email) return;
  const profile = targetUser?.attributes?.profile || {};
  const locale = profile.publicData?.locale || 'pt';
  const resend = new Resend(apiKey);
  const { subject, html } = buildEmail(profile, fanName, fanUserId, locale);
  try {
    await resend.emails.send({
      from: mailFrom(),
      to: [email],
      subject,
      html,
    });
  } catch (e) {
    console.error('[UserFollow] email send failed:', e?.message || e);
  }
};

const recordTargetAlert = async ({
  integrationSdk,
  targetUserId,
  fanUserId,
  fanName,
  now,
}) => {
  let targetUser = null;
  try {
    const userRes = await integrationSdk.users.show({ id: targetUserId });
    targetUser = userRes?.data?.data || null;
  } catch (e) {
    console.error('[UserFollow] users.show failed:', e?.message || e);
    return;
  }

  const meta = targetUser?.attributes?.profile?.metadata || {};
  const prevUnseen = Array.isArray(meta.unseenFollowAlerts)
    ? meta.unseenFollowAlerts
    : [];
  const unseenFollowAlerts = [
    { fanUserId, fanName, at: now },
    ...prevUnseen,
  ].slice(0, MAX_UNSEEN_ALERTS);

  try {
    await integrationSdk.users.updateProfile({
      id: targetUserId,
      metadata: { unseenFollowAlerts },
    });
  } catch (e) {
    console.error('[UserFollow] target metadata update failed:', e?.message || e);
  }

  // Fire-and-forget email — failure here mustn't block the toast pipeline.
  sendFollowEmail({ targetUser, fanName, fanUserId });
};

module.exports = async (req, res) => {
  const { targetUserId, action } = req.body || {};
  if (!targetUserId || (action !== 'follow' && action !== 'unfollow')) {
    return res.status(400).json({ error: 'invalid-params' });
  }

  const sdk = getSdk(req, res);
  let fanUserId;
  let fanName;
  try {
    const me = await sdk.currentUser.show();
    const meData = me?.data?.data;
    fanUserId = meData?.id?.uuid;
    const profile = meData?.attributes?.profile || {};
    fanName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || '';
    if (!fanUserId) throw new Error('no-current-user');
  } catch (_) {
    return res.status(401).json({ error: 'not-authenticated' });
  }

  if (fanUserId === targetUserId) {
    return res.status(400).json({ error: 'cannot-follow-self' });
  }

  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    return res.status(503).json({ error: 'backend-down' });
  }

  // Read the target's current state: list of fans (operator-only, in metadata),
  // throttle map for notifications, and the public count we mirror so anyone
  // can render the "X followers" badge without scraping the followedBy list.
  let followNotifs = {};
  let followedBy = [];
  let currentPublicCount;
  try {
    const targetRes = await integrationSdk.users.show({ id: targetUserId });
    const attrs = targetRes?.data?.data?.attributes || {};
    const meta = attrs.profile?.metadata || {};
    followNotifs =
      meta.followNotifs && typeof meta.followNotifs === 'object' ? meta.followNotifs : {};
    followedBy = Array.isArray(meta.followedBy) ? meta.followedBy.filter(Boolean) : [];
    currentPublicCount = attrs.profile?.publicData?.followersCount;
  } catch (e) {
    console.error('[UserFollow] users.show failed:', e?.message || e);
    return res.status(404).json({ error: 'target-not-found' });
  }

  // Maintain the followedBy list idempotently — same fan can't show up twice
  // even if they spam the endpoint.
  const inList = followedBy.includes(fanUserId);
  let nextFollowedBy = followedBy;
  if (action === 'follow' && !inList) nextFollowedBy = [...followedBy, fanUserId];
  if (action === 'unfollow' && inList) nextFollowedBy = followedBy.filter(u => u !== fanUserId);

  const now = Date.now();
  const lastNotif = followNotifs[fanUserId];
  const shouldNotify =
    action === 'follow' && (!lastNotif || now - lastNotif > DAY_MS);
  const nextFollowNotifs = shouldNotify
    ? { ...followNotifs, [fanUserId]: now }
    : followNotifs;

  const listChanged = nextFollowedBy !== followedBy;
  const countNeedsSync = currentPublicCount !== nextFollowedBy.length;
  const notifsChanged = nextFollowNotifs !== followNotifs;

  if (!listChanged && !countNeedsSync && !notifsChanged) {
    return res.status(200).json({ ok: true, notified: false, count: followedBy.length });
  }

  try {
    await integrationSdk.users.updateProfile({
      id: targetUserId,
      publicData: { followersCount: nextFollowedBy.length },
      metadata: { followedBy: nextFollowedBy, followNotifs: nextFollowNotifs },
    });
  } catch (e) {
    console.error('[UserFollow] updateProfile failed:', e?.message || e);
    return res.status(500).json({ error: 'update-failed' });
  }

  if (shouldNotify) {
    recordTargetAlert({
      integrationSdk,
      targetUserId,
      fanUserId,
      fanName,
      now,
    }).catch(e => console.error('[UserFollow] recordTargetAlert failed:', e?.message || e));
  }

  return res.status(200).json({
    ok: true,
    notified: shouldNotify,
    count: nextFollowedBy.length,
  });
};
