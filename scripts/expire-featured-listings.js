/**
 * One-shot manual expiry + 3-day-warning for "destaques" (featured
 * listings). Same logic as server/jobs/expireFeaturedListingsJob.js but
 * runs once and exits — useful for backfilling before the cron starts,
 * or for ad-hoc cleanup.
 *
 * Required env vars (already used by the server):
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 *   REACT_APP_SHARETRIBE_SDK_BASE_URL  (optional, defaults to prod)
 *   RESEND_API_KEY                     (optional; without it emails are skipped)
 *
 * Run with:
 *   node scripts/expire-featured-listings.js
 *   node scripts/expire-featured-listings.js --dry-run
 *
 * PowerShell to override TTL inline:
 *   $env:FEATURED_EXPIRY_DAYS=0; node scripts/expire-featured-listings.js --dry-run
 */

require('dotenv').config();

const integrationSdkPkg = require('sharetribe-flex-integration-sdk');
const { Resend } = require('resend');

const INTEGRATION_CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const INTEGRATION_CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';
const DRY_RUN = process.argv.includes('--dry-run');
const DEFAULT_TTL_DAYS = 30;
const DEFAULT_WARN_DAYS = 3;

if (!INTEGRATION_CLIENT_ID || !INTEGRATION_CLIENT_SECRET) {
  console.error(
    'Missing SHARETRIBE_INTEGRATION_CLIENT_ID or SHARETRIBE_INTEGRATION_CLIENT_SECRET in .env'
  );
  process.exit(1);
}

const ttlDays = parseInt(process.env.FEATURED_EXPIRY_DAYS, 10);
const warnDays = parseInt(process.env.FEATURED_EXPIRY_WARN_DAYS, 10);
const TTL_DAYS = Number.isNaN(ttlDays) ? DEFAULT_TTL_DAYS : ttlDays;
const WARN_DAYS = Number.isNaN(warnDays) ? DEFAULT_WARN_DAYS : warnDays;
const ttlMs = TTL_DAYS * 24 * 60 * 60 * 1000;
const warnMs = WARN_DAYS * 24 * 60 * 60 * 1000;
const cutoffMs = Date.now() - ttlMs;
const warnCutoffMs = Date.now() - (ttlMs - warnMs);

const sdk = integrationSdkPkg.createInstance({
  clientId: INTEGRATION_CLIENT_ID,
  clientSecret: INTEGRATION_CLIENT_SECRET,
  ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
});

const apiKey = process.env.RESEND_API_KEY;
const resend = apiKey ? new Resend(apiKey) : null;

const fetchUser = async userId => {
  try {
    const res = await sdk.users.show({ id: userId });
    return res?.data?.data || null;
  } catch (e) {
    console.error(`  users.show failed for ${userId}:`, e?.message || e);
    return null;
  }
};

const pushAlert = async (user, alert) => {
  if (!user) return;
  const uid = user.id?.uuid;
  const existing = user?.attributes?.profile?.metadata?.unseenExtraAlerts || [];
  const filtered = existing.filter(
    a => !(a?.kind === alert.kind && a?.listingId === alert.listingId)
  );
  const next = [...filtered, alert];
  try {
    await sdk.users.updateProfile({ id: uid, metadata: { unseenExtraAlerts: next } });
  } catch (e) {
    console.error(`  updateProfile failed for ${uid}:`, e?.message || e);
  }
};

const buildExpiredEmail = ({ firstName, listingTitle }) => {
  const safeName = firstName || 'olá';
  const safeTitle = String(listingTitle || 'o teu anúncio').replace(/</g, '&lt;');
  const renewUrl = `${ROOT_URL.replace(/\/$/, '')}/destacar-anuncio`;
  return {
    subject: `O destaque de "${safeTitle}" terminou — Venue1Hub`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;line-height:1.6;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;margin-bottom:24px;">
          O teu destaque chegou ao fim
        </h2>
        <p style="margin:0 0 16px;">Olá ${safeName},</p>
        <p style="margin:0 0 16px;">
          O destaque do anúncio <strong>${safeTitle}</strong> terminou hoje, ao fim dos ${TTL_DAYS} dias habituais. A partir de agora deixa de aparecer na secção de destaques da página principal, mas continua publicado e disponível para reservas normalmente.
        </p>
        <p style="margin:0 0 16px;">
          Os destaques ajudam a aumentar a visibilidade do espaço junto de quem está à procura. Se quiseres voltar a destacar este anúncio, podes fazê-lo a qualquer altura:
        </p>
        <p style="margin:24px 0;">
          <a href="${renewUrl}" style="color:#fff;background:#5C3317;padding:12px 28px;
              border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;
              text-transform:uppercase;font-size:13px;display:inline-block;">Voltar a destacar</a>
        </p>
        <p style="margin:32px 0 0;font-size:12px;color:#999;">
          Recebes este email porque tens um anúncio publicado no Venue1Hub.
        </p>
      </div>
    `,
  };
};

const buildExpiringSoonEmail = ({ firstName, listingTitle, daysLeft }) => {
  const safeName = firstName || 'olá';
  const safeTitle = String(listingTitle || 'o teu anúncio').replace(/</g, '&lt;');
  const renewUrl = `${ROOT_URL.replace(/\/$/, '')}/destacar-anuncio`;
  const dayWord = daysLeft === 1 ? 'dia' : 'dias';
  return {
    subject: `O destaque de "${safeTitle}" termina em ${daysLeft} ${dayWord} — Venue1Hub`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;line-height:1.6;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;margin-bottom:24px;">
          O teu destaque está quase a terminar
        </h2>
        <p style="margin:0 0 16px;">Olá ${safeName},</p>
        <p style="margin:0 0 16px;">
          Faltam apenas <strong>${daysLeft} ${dayWord}</strong> para o destaque do anúncio <strong>${safeTitle}</strong> terminar. Depois deixará de aparecer na secção de destaques da página principal.
        </p>
        <p style="margin:0 0 16px;">
          Se quiseres garantir que continua visível para mais utilizadores, podes renová-lo agora — leva menos de um minuto:
        </p>
        <p style="margin:24px 0;">
          <a href="${renewUrl}" style="color:#fff;background:#5C3317;padding:12px 28px;
              border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;
              text-transform:uppercase;font-size:13px;display:inline-block;">Renovar destaque</a>
        </p>
        <p style="margin:32px 0 0;font-size:12px;color:#999;">
          Recebes este email porque tens um anúncio em destaque no Venue1Hub.
        </p>
      </div>
    `,
  };
};

const sendEmail = async ({ to, subject, html, tag }) => {
  if (!resend || !to) {
    if (!resend) console.log(`  (no RESEND_API_KEY — would send ${tag} to ${to || '<unknown>'})`);
    return;
  }
  try {
    await resend.emails.send({
      from: 'Venue1Hub <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    });
    console.log(`  ${tag} sent → ${to}`);
  } catch (e) {
    console.error(`  ${tag} email failed for ${to}:`, e?.message || e);
  }
};

(async () => {
  console.log(
    `[expire-featured] TTL=${TTL_DAYS}d, warn ${WARN_DAYS}d before, ` +
      `expiry cutoff=${new Date(cutoffMs).toISOString()}${DRY_RUN ? ' (dry-run)' : ''}`
  );

  const all = [];
  let page = 1;
  while (true) {
    const res = await sdk.listings.query({
      pub_featured: true,
      page,
      perPage: 100,
      include: ['author'],
      'fields.listing': ['title', 'publicData'],
    });
    const items = res?.data?.data || [];
    all.push(...items);
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  console.log(`[expire-featured] found ${all.length} listing(s) with pub_featured=true`);

  let expired = 0;
  let warned = 0;
  let kept = 0;
  let skipped = 0;
  let failed = 0;

  for (const listing of all) {
    const id = listing?.id?.uuid;
    const title = listing?.attributes?.title || '(sem título)';
    const publicData = listing?.attributes?.publicData || {};
    const featuredAt = publicData.featuredAt;
    const authorId =
      listing?.relationships?.author?.data?.id?.uuid ||
      listing?.author?.id?.uuid ||
      null;

    if (!featuredAt) {
      skipped += 1;
      console.log(`  ${id}  ${title}  → no featuredAt, skipped`);
      continue;
    }
    const featuredAtMs = Date.parse(featuredAt);
    if (Number.isNaN(featuredAtMs)) {
      skipped += 1;
      console.log(`  ${id}  ${title}  → invalid featuredAt, skipped`);
      continue;
    }

    if (featuredAtMs <= cutoffMs) {
      if (DRY_RUN) {
        console.log(`  ${id}  ${title}  → would EXPIRE (featuredAt=${featuredAt})`);
        expired += 1;
        continue;
      }
      try {
        await sdk.listings.update({
          id,
          publicData: { featured: 'false', destaqueWarningSent: null },
        });
      } catch (e) {
        failed += 1;
        console.error(`  ${id}  ${title}  FAILED:`, e?.message || e);
        continue;
      }
      const user = authorId ? await fetchUser(authorId) : null;
      const email = user?.attributes?.email;
      const firstName = user?.attributes?.profile?.firstName;
      if (email) {
        const { subject, html } = buildExpiredEmail({ firstName, listingTitle: title });
        await sendEmail({ to: email, subject, html, tag: 'expired' });
      }
      if (user) {
        await pushAlert(user, {
          id: `destaque-expired-${id}-${Date.now()}`,
          kind: 'destaque-expired',
          listingId: id,
          listingTitle: title,
          createdAt: new Date().toISOString(),
        });
      }
      expired += 1;
      console.log(`  ${id}  ${title}  → expired`);
      continue;
    }

    if (featuredAtMs <= warnCutoffMs) {
      if (publicData.destaqueWarningSent === featuredAt) {
        kept += 1;
        continue;
      }
      const daysLeft = Math.max(
        1,
        Math.ceil((featuredAtMs + ttlMs - Date.now()) / (24 * 60 * 60 * 1000))
      );
      if (DRY_RUN) {
        console.log(`  ${id}  ${title}  → would WARN (daysLeft=${daysLeft})`);
        warned += 1;
        continue;
      }
      const user = authorId ? await fetchUser(authorId) : null;
      const email = user?.attributes?.email;
      const firstName = user?.attributes?.profile?.firstName;
      if (email) {
        const { subject, html } = buildExpiringSoonEmail({
          firstName,
          listingTitle: title,
          daysLeft,
        });
        await sendEmail({ to: email, subject, html, tag: 'expiring-soon' });
      }
      if (user) {
        await pushAlert(user, {
          id: `destaque-warn-${id}-${Date.now()}`,
          kind: 'destaque-expiring-soon',
          listingId: id,
          listingTitle: title,
          daysLeft,
          createdAt: new Date().toISOString(),
        });
      }
      try {
        await sdk.listings.update({
          id,
          publicData: { destaqueWarningSent: featuredAt },
        });
      } catch (e) {
        failed += 1;
        console.error(`  ${id}  ${title}  FAILED to mark warning:`, e?.message || e);
      }
      warned += 1;
      console.log(`  ${id}  ${title}  → warned (${daysLeft}d left)`);
      continue;
    }

    kept += 1;
  }

  console.log(
    `[expire-featured] done. expired=${expired} warned=${warned} kept=${kept} skipped=${skipped} failed=${failed}`
  );
})();
