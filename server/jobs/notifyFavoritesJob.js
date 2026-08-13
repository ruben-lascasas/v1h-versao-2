/**
 * Daily digest email for "your listings got new favourites".
 *
 * Reads each user's `metadata.dailyFavoriteDigest` (populated by
 * /api/listing-like when a like passes the 24h per-fan throttle) and sends one
 * email per owner per day, then clears the digest so tomorrow starts fresh.
 *
 * Default schedule: 08:00 server time. Override with FAVORITE_DIGEST_CRON.
 * Disable in dev with DISABLE_FAVORITE_DIGEST=true.
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { mailFrom } = require('../api-util/emailSender');
const { getIntegrationSdk } = require('../api-util/sdk');

const PER_PAGE = 100;
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';

const fetchAllUsersWithDigest = async sdk => {
  const result = [];
  let page = 1;
  while (true) {
    const res = await sdk.users.query({ page, perPage: PER_PAGE });
    const items = res?.data?.data || [];
    items.forEach(u => {
      const digest = u?.attributes?.profile?.metadata?.dailyFavoriteDigest;
      if (digest?.listings && Object.keys(digest.listings).length > 0) {
        result.push(u);
      }
    });
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return result;
};

const buildEmail = (user, digest, locale) => {
  const isEN = locale && locale.toLowerCase().startsWith('en');
  const name = user?.attributes?.profile?.firstName || (isEN ? 'there' : 'olá');
  const entries = Object.entries(digest.listings || {});
  const total = entries.reduce((n, [, v]) => n + (v?.count || 0), 0);

  const rows = entries
    .slice(0, 10)
    .map(([listingId, info]) => {
      const title = String(info.title || 'Anúncio').replace(/</g, '&lt;');
      const slug = title
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const url = `${ROOT_URL}/l/${slug}/${listingId}`;
      const countLabel = isEN
        ? `${info.count} new ${info.count === 1 ? 'favourite' : 'favourites'}`
        : `${info.count} ${info.count === 1 ? 'novo favorito' : 'novos favoritos'}`;
      return `<li style="padding:8px 0;border-bottom:1px solid #f1ece4;"><a href="${url}" style="color:#5C3317;text-decoration:none;font-weight:600;">${title}</a> — <span style="color:#7C6350;">${countLabel}</span></li>`;
    })
    .join('');

  const subject = isEN
    ? `[Venue1Hub] ${total} new ${total === 1 ? 'favourite' : 'favourites'} on your listings`
    : `[Venue1Hub] ${total} ${total === 1 ? 'novo favorito' : 'novos favoritos'} nos teus anúncios`;

  const html = isEN
    ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">Your listings got new favourites today</h2>
        <p>Hi ${name},</p>
        <p>Today ${total} new ${total === 1 ? 'person added a listing of yours to their favourites' : 'people added your listings to their favourites'}:</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${rows}</ul>
        <p style="margin-top:24px;"><a href="${ROOT_URL}/your-listings" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">View your listings</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">One email per day, only when there's something new — no spam.</p>
      </div>
    `
    : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">Os teus anúncios receberam novos favoritos hoje</h2>
        <p>Olá ${name},</p>
        <p>Hoje ${total === 1 ? 'uma pessoa adicionou um anúncio teu aos favoritos dela' : `${total} pessoas adicionaram os teus anúncios aos favoritos`}:</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${rows}</ul>
        <p style="margin-top:24px;"><a href="${ROOT_URL}/your-listings" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">Ver os teus anúncios</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">Um email por dia, só quando há novidade — nada de spam.</p>
      </div>
    `;
  return { subject, html };
};

const runOnce = async () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[favoriteDigest] skipped (RESEND_API_KEY missing)');
    return { sent: 0 };
  }
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.warn('[favoriteDigest] skipped (Integration SDK not configured)');
    return { sent: 0 };
  }
  const resend = new Resend(apiKey);

  const users = await fetchAllUsersWithDigest(sdk);
  let sent = 0;
  for (const user of users) {
    const uid = user.id?.uuid;
    const email = user?.attributes?.email;
    const digest = user?.attributes?.profile?.metadata?.dailyFavoriteDigest || {};
    const locale = user?.attributes?.profile?.publicData?.locale || 'pt';

    if (!email || !digest.listings) continue;

    const { subject, html } = buildEmail(user, digest, locale);
    try {
      await resend.emails.send({
        from: mailFrom(),
        to: [email],
        subject,
        html,
      });
      sent += 1;
      console.log(`[favoriteDigest] sent → ${email}`);
    } catch (e) {
      console.error('[favoriteDigest] send failed:', e?.message || e);
      // Leave the digest untouched so tomorrow's run retries.
      continue;
    }

    try {
      // Clear the digest after a successful send so tomorrow starts at 0.
      await sdk.users.updateProfile({
        id: uid,
        metadata: { dailyFavoriteDigest: null },
      });
    } catch (e) {
      console.error('[favoriteDigest] reset digest failed:', e?.message || e);
    }
  }
  console.log(`[favoriteDigest] tick done. sent=${sent}`);
  return { sent };
};

// Default: every day at 08:00. Schedule with FAVORITE_DIGEST_CRON to override.
const start = () => {
  if (process.env.DISABLE_FAVORITE_DIGEST === 'true') {
    console.log('[favoriteDigest] disabled via env');
    return;
  }
  const expr = process.env.FAVORITE_DIGEST_CRON || '0 8 * * *';
  try {
    cron.schedule(expr, () => {
      runOnce().catch(e =>
        console.error('[favoriteDigest] tick failed:', e?.message || e)
      );
    });
    console.log(`[favoriteDigest] scheduled (cron: "${expr}")`);
  } catch (e) {
    console.error('[favoriteDigest] failed to schedule:', e?.message || e);
  }
};

module.exports = { start, runOnce };
