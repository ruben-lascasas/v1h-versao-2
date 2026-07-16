/**
 * Send "new results for your saved search" emails to every user that has at
 * least one entry in `privateData.savedSearches`.
 *
 * For each saved search we:
 *   1. Re-run the saved params against Sharetribe.
 *   2. Pick the listings whose `createdAt` is after the last notification we
 *      sent for this entry (or, on first run, after the search was saved).
 *   3. If any new listings, send an email via Resend.
 *   4. Update `metadata.savedSearchesNotified[id] = nowISO` so we don't notify
 *      again about the same listings.
 *
 * Required env vars:
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 *   RESEND_API_KEY
 *   REACT_APP_SHARETRIBE_SDK_BASE_URL  (optional)
 *
 * Run with:
 *   node scripts/notify-saved-searches.js
 *   node scripts/notify-saved-searches.js --dry-run
 */

require('dotenv').config();

const integrationSdkPkg = require('sharetribe-flex-integration-sdk');
const { Resend } = require('resend');

const INTEGRATION_CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const INTEGRATION_CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';
const DRY_RUN = process.argv.includes('--dry-run');

if (!INTEGRATION_CLIENT_ID || !INTEGRATION_CLIENT_SECRET) {
  console.error('Missing SHARETRIBE_INTEGRATION_CLIENT_ID/SECRET in .env');
  process.exit(1);
}
if (!RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY in .env');
  process.exit(1);
}

const sdk = integrationSdkPkg.createInstance({
  clientId: INTEGRATION_CLIENT_ID,
  clientSecret: INTEGRATION_CLIENT_SECRET,
  ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
});
const resend = new Resend(RESEND_API_KEY);

const PER_PAGE = 100;
const SKIP_PARAMS = new Set(['page', 'sort', 'view', 'mapSearch']);

const sanitiseParams = params => {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (!SKIP_PARAMS.has(k) && v != null && v !== '') out[k] = v;
  });
  return out;
};

const fetchAllUsersWithSavedSearches = async () => {
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

const fetchNewListings = async (savedSearch, sinceISO) => {
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
    console.error(`  query failed for ${savedSearch.id}:`, e?.message || e);
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
        .replace(/[̀-ͯ]/g, '')
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

(async () => {
  console.log(`[notify] mode: ${DRY_RUN ? 'DRY-RUN' : 'SEND'}`);

  const users = await fetchAllUsersWithSavedSearches();
  console.log(`[notify] ${users.length} users with saved searches`);

  let sent = 0;
  let skipped = 0;
  const nowISO = new Date().toISOString();

  for (const user of users) {
    const uid = user.id?.uuid;
    const email = user?.attributes?.email;
    const locale = user?.attributes?.profile?.publicData?.locale || 'pt';
    const saved = user?.attributes?.profile?.privateData?.savedSearches || [];
    const notifMap =
      user?.attributes?.profile?.metadata?.savedSearchesNotified || {};

    if (!email) {
      skipped += saved.length;
      continue;
    }

    const updates = { ...notifMap };

    for (const entry of saved) {
      const sinceISO = notifMap[entry.id] || new Date(entry.savedAt).toISOString();
      const fresh = await fetchNewListings(entry, sinceISO);
      // Filter out the user's own listings — we don't email someone about their
      // own postings.
      const others = fresh.filter(l => l?.relationships?.author?.data?.id?.uuid !== uid);
      if (others.length === 0) {
        skipped += 1;
        continue;
      }
      const { subject, html } = buildEmail(user, entry, others, locale);
      console.log(`  ${email}  →  "${entry.label}"  (${others.length} new)`);
      if (!DRY_RUN) {
        try {
          await resend.emails.send({
            from: 'Venue1Hub <onboarding@resend.dev>',
            to: [email],
            subject,
            html,
          });
          updates[entry.id] = nowISO;
          sent += 1;
        } catch (e) {
          console.error(`    send failed:`, e?.message || e);
        }
      } else {
        sent += 1;
      }
    }

    if (!DRY_RUN && Object.keys(updates).length > 0) {
      try {
        await sdk.users.updateProfile({
          id: uid,
          metadata: { savedSearchesNotified: updates },
        });
      } catch (e) {
        console.error(`  updateProfile failed for ${uid}:`, e?.message || e);
      }
    }
  }

  console.log(`[notify] done. sent=${sent} skipped=${skipped}`);
})();
