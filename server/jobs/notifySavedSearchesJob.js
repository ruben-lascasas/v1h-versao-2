/**
 * Runs the "new results for your saved search" notifier from inside the
 * Express server so deploys on Heroku/AWS/localhost don't need an external
 * scheduler. The logic mirrors scripts/notify-saved-searches.js but uses the
 * SDK instance the rest of the API already builds.
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { mailFrom } = require('../api-util/emailSender');
const { getIntegrationSdk } = require('../api-util/sdk');

const PER_PAGE = 100;
const SKIP_PARAMS = new Set(['page', 'sort', 'view', 'mapSearch']);
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';

const sanitiseParams = params => {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (!SKIP_PARAMS.has(k) && v != null && v !== '') out[k] = v;
  });
  return out;
};

const fetchAllUsersWithSavedSearches = async sdk => {
  const result = [];
  let page = 1;
  while (true) {
    const res = await sdk.users.query({ page, perPage: PER_PAGE });
    const items = res?.data?.data || [];
    items.forEach(u => {
      const saved = u?.attributes?.profile?.privateData?.savedSearches;
      if (Array.isArray(saved) && saved.length > 0) result.push(u);
    });
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return result;
};

const fetchNewListings = async (sdk, savedSearch, sinceISO) => {
  const safe = sanitiseParams(savedSearch.params);
  try {
    const res = await sdk.listings.query({
      ...safe,
      createdAtStart: sinceISO,
      sort: '-createdAt',
      perPage: 10,
    });
    return res?.data?.data || [];
  } catch (e) {
    console.error(`[savedSearchNotifier] query failed:`, e?.message || e);
    return [];
  }
};

const buildEmail = (user, entry, listings, locale) => {
  const isEN = locale && locale.toLowerCase().startsWith('en');
  const name = user?.attributes?.profile?.firstName || (isEN ? 'there' : 'olá');
  const rows = listings
    .slice(0, 6)
    .map(l => {
      const title = (l?.attributes?.title || '').replace(/</g, '&lt;');
      const slug = (l?.attributes?.title || 'listing')
        .toLowerCase()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      const url = `${ROOT_URL}/l/${slug}/${l.id.uuid}`;
      const price = l?.attributes?.price?.amount
        ? ` — ${(l.attributes.price.amount / 100).toFixed(2)}€`
        : '';
      return `<li style="padding:8px 0;border-bottom:1px solid #f1ece4;"><a href="${url}" style="color:#5C3317;text-decoration:none;font-weight:600;">${title}</a><span style="color:#7C6350;">${price}</span></li>`;
    })
    .join('');
  const subject = isEN
    ? `[Venue1Hub] ${listings.length} new ${listings.length === 1 ? 'result' : 'results'} for "${entry.label}"`
    : `[Venue1Hub] ${listings.length} ${listings.length === 1 ? 'novo resultado' : 'novos resultados'} para "${entry.label}"`;
  const html = isEN
    ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">New results for your saved search</h2>
        <p>Hi ${name},</p>
        <p>${listings.length} new ${listings.length === 1 ? 'listing matches' : 'listings match'} <strong>"${entry.label}"</strong> on Venue1Hub.</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${rows}</ul>
        <p style="margin-top:24px;"><a href="${ROOT_URL}${entry.url}" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">See all results</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">Manage your saved searches at <a href="${ROOT_URL}/pesquisas-guardadas" style="color:#BAA38A;">Saved searches</a>.</p>
      </div>
    `
    : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">Novos resultados na tua pesquisa guardada</h2>
        <p>Olá ${name},</p>
        <p>Há ${listings.length} ${listings.length === 1 ? 'novo anúncio' : 'novos anúncios'} para <strong>"${entry.label}"</strong> na Venue1Hub.</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${rows}</ul>
        <p style="margin-top:24px;"><a href="${ROOT_URL}${entry.url}" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">Ver todos os resultados</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">Gere as tuas pesquisas guardadas em <a href="${ROOT_URL}/pesquisas-guardadas" style="color:#BAA38A;">Pesquisas guardadas</a>.</p>
      </div>
    `;
  return { subject, html };
};

const runOnce = async () => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[savedSearchNotifier] skipped (RESEND_API_KEY missing)');
    return { sent: 0, skipped: 0 };
  }
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.warn('[savedSearchNotifier] skipped (Integration SDK not configured)');
    return { sent: 0, skipped: 0 };
  }
  const resend = new Resend(apiKey);

  const users = await fetchAllUsersWithSavedSearches(sdk);
  let sent = 0;
  let skipped = 0;
  const nowISO = new Date().toISOString();

  for (const user of users) {
    const uid = user.id?.uuid;
    const email = user?.attributes?.email;
    const locale = user?.attributes?.profile?.publicData?.locale || 'pt';
    const saved = user?.attributes?.profile?.privateData?.savedSearches || [];
    const notifMap = user?.attributes?.profile?.metadata?.savedSearchesNotified || {};
    if (!email) {
      skipped += saved.length;
      continue;
    }
    const updates = { ...notifMap };

    for (const entry of saved) {
      const sinceISO = notifMap[entry.id] || new Date(entry.savedAt).toISOString();
      const fresh = await fetchNewListings(sdk, entry, sinceISO);
      const others = fresh.filter(
        l => l?.relationships?.author?.data?.id?.uuid !== uid
      );
      if (others.length === 0) {
        skipped += 1;
        continue;
      }
      const { subject, html } = buildEmail(user, entry, others, locale);
      try {
        await resend.emails.send({
          from: mailFrom(),
          to: [email],
          subject,
          html,
        });
        updates[entry.id] = nowISO;
        sent += 1;
        console.log(`[savedSearchNotifier] sent → ${email} (${others.length} new for "${entry.label}")`);
      } catch (e) {
        console.error('[savedSearchNotifier] send failed:', e?.message || e);
      }
    }

    if (Object.keys(updates).length > 0) {
      try {
        await sdk.users.updateProfile({
          id: uid,
          metadata: { savedSearchesNotified: updates },
        });
      } catch (e) {
        console.error('[savedSearchNotifier] updateProfile failed:', e?.message || e);
      }
    }
  }

  console.log(`[savedSearchNotifier] tick done. sent=${sent} skipped=${skipped}`);
  return { sent, skipped };
};

// Cron expression: every 5 minutes ("*/5 * * * *") — fires at :00, :05,
// :10, … :55 so users get notified within ~5 min of a new matching listing.
// Override via SAVED_SEARCH_NOTIFY_CRON env var if a different schedule is
// preferred.
const start = () => {
  if (process.env.DISABLE_SAVED_SEARCH_NOTIFIER === 'true') {
    console.log('[savedSearchNotifier] disabled via env');
    return;
  }
  const expr = process.env.SAVED_SEARCH_NOTIFY_CRON || '*/5 * * * *';
  try {
    cron.schedule(expr, () => {
      runOnce().catch(e =>
        console.error('[savedSearchNotifier] tick failed:', e?.message || e)
      );
    });
    console.log(`[savedSearchNotifier] scheduled (cron: "${expr}")`);
  } catch (e) {
    console.error('[savedSearchNotifier] failed to schedule:', e?.message || e);
  }
};

module.exports = { start, runOnce };
