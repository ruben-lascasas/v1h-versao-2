/**
 * Send ONE sample "new results for your saved search" email to a chosen user
 * so the design can be reviewed without waiting for a real new listing.
 *
 * Usage:
 *   node scripts/test-saved-search-email.js <email@example.com>
 * If no email is passed, falls back to the first user found that has saved
 * searches in privateData.
 *
 * The email uses real data from the recipient's first saved search and pulls
 * a few real listings from the marketplace to populate the list (newest first)
 * regardless of whether they actually post-date the savedAt cutoff. NOTHING
 * is written back to metadata, so the regular cron won't be affected.
 */

require('dotenv').config();

const integrationSdkPkg = require('sharetribe-flex-integration-sdk');
const { Resend } = require('resend');

const INTEGRATION_CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const INTEGRATION_CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'http://localhost:3000';

if (!INTEGRATION_CLIENT_ID || !INTEGRATION_CLIENT_SECRET) {
  console.error('Missing SHARETRIBE_INTEGRATION_CLIENT_ID/SECRET in .env');
  process.exit(1);
}
if (!RESEND_API_KEY) {
  console.error('Missing RESEND_API_KEY in .env');
  process.exit(1);
}

const targetEmailArg = process.argv[2];

const sdk = integrationSdkPkg.createInstance({
  clientId: INTEGRATION_CLIENT_ID,
  clientSecret: INTEGRATION_CLIENT_SECRET,
  ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
});
const resend = new Resend(RESEND_API_KEY);

const SKIP = new Set(['page', 'sort', 'view', 'mapSearch']);
const sanitiseParams = params => {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (!SKIP.has(k) && v != null && v !== '') out[k] = v;
  });
  return out;
};

const findRecipient = async () => {
  let page = 1;
  while (true) {
    const res = await sdk.users.query({ page, perPage: 100 });
    const items = res?.data?.data || [];
    for (const u of items) {
      const email = u?.attributes?.email;
      const saved = u?.attributes?.profile?.privateData?.savedSearches;
      if (targetEmailArg) {
        if (email && email.toLowerCase() === targetEmailArg.toLowerCase()) {
          if (Array.isArray(saved) && saved.length > 0) return u;
          throw new Error(`User ${email} has no saved searches.`);
        }
      } else if (Array.isArray(saved) && saved.length > 0) {
        return u;
      }
    }
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  throw new Error(targetEmailArg
    ? `Could not find user ${targetEmailArg}`
    : 'No users with saved searches found.');
};

(async () => {
  const user = await findRecipient();
  const email = user.attributes.email;
  const locale = user?.attributes?.profile?.publicData?.locale || 'pt';
  const isEN = locale.toLowerCase().startsWith('en');
  const name = user?.attributes?.profile?.firstName || (isEN ? 'there' : 'olá');
  const saved = user.attributes.profile.privateData.savedSearches;
  const entry = saved[0];

  console.log(`[test] using user ${email}`);
  console.log(`[test] using saved search "${entry.label}"`);

  // Try to fetch a few real listings that match the saved-search filters so
  // the email content feels real. Fallback to fake titles if the query
  // returns nothing.
  let listings = [];
  try {
    const safe = sanitiseParams(entry.params);
    const res = await sdk.listings.query({ ...safe, sort: '-createdAt', perPage: 3 });
    listings = res?.data?.data || [];
  } catch (e) {
    console.warn('  listing fetch failed, using fakes:', e?.message || e);
  }
  if (listings.length === 0) {
    listings = [
      { id: { uuid: 'fake-1' }, attributes: { title: 'Espaço exemplo 1', price: { amount: 5000 } } },
      { id: { uuid: 'fake-2' }, attributes: { title: 'Espaço exemplo 2', price: { amount: 8000 } } },
      { id: { uuid: 'fake-3' }, attributes: { title: 'Espaço exemplo 3', price: { amount: 12000 } } },
    ];
  }

  const rows = listings
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
    ? `[TEST] ${listings.length} new results for "${entry.label}"`
    : `[TESTE] ${listings.length} novos resultados para "${entry.label}"`;

  const html = isEN
    ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <div style="background:#fff3cd;border-left:4px solid #f0ad4e;padding:8px 12px;margin-bottom:18px;font-size:12px;color:#856404;">This is a TEST email — content is sampled from your existing saved search.</div>
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">New results for your saved search</h2>
        <p>Hi ${name},</p>
        <p>${listings.length} new listings match <strong>"${entry.label}"</strong> on Venue1Hub.</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${rows}</ul>
        <p style="margin-top:24px;"><a href="${ROOT_URL}${entry.url}" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">See all results</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">Manage your saved searches at <a href="${ROOT_URL}/pesquisas-guardadas" style="color:#BAA38A;">Saved searches</a>.</p>
      </div>
    `
    : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <div style="background:#fff3cd;border-left:4px solid #f0ad4e;padding:8px 12px;margin-bottom:18px;font-size:12px;color:#856404;">Este é um email de TESTE — conteúdo recolhido da tua pesquisa guardada existente.</div>
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">Novos resultados na tua pesquisa guardada</h2>
        <p>Olá ${name},</p>
        <p>Há ${listings.length} novos anúncios para <strong>"${entry.label}"</strong> na Venue1Hub.</p>
        <ul style="list-style:none;padding:0;margin:16px 0;">${rows}</ul>
        <p style="margin-top:24px;"><a href="${ROOT_URL}${entry.url}" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">Ver todos os resultados</a></p>
        <p style="margin-top:32px;font-size:12px;color:#999;">Gere as tuas pesquisas guardadas em <a href="${ROOT_URL}/pesquisas-guardadas" style="color:#BAA38A;">Pesquisas guardadas</a>.</p>
      </div>
    `;

  try {
    await resend.emails.send({
      from: 'Venue1Hub <onboarding@resend.dev>',
      to: [email],
      subject,
      html,
    });
    console.log(`[test] sent → ${email}`);
  } catch (e) {
    console.error('[test] send failed:', e?.message || e);
    process.exit(1);
  }
})();
