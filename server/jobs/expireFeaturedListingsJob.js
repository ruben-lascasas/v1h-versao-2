/**
 * Daily job that handles "destaque" (featured listing) lifecycle:
 *
 *   - 3 days before expiry → send a renewal-reminder email + push an in-app
 *     toast alert (kind: 'destaque-expiring-soon')
 *   - At expiry → flip publicData.featured back to 'false', send a "saiu
 *     dos destaques" email + push an in-app toast alert (kind:
 *     'destaque-expired')
 *
 * Schema written by the "Destacar Anúncio" flow:
 *   publicData.featured: 'true'
 *   publicData.featuredAt: <ISO timestamp>
 *
 * To avoid double-sending the 3-day warning every tick once we're inside
 * the warning window, we stamp the listing's publicData.destaqueWarningSent
 * with the same `featuredAt` string. When the host re-destaca, the thunk
 * (src/ducks/highlightedListings.duck.js) clears this so warnings restart
 * for the new cycle.
 *
 * In-app alerts piggy-back on the same `metadata.unseenExtraAlerts` array
 * the favourite/follow notifications use (src/ducks/extraAlerts.duck.js),
 * so they show up automatically as toasts via src/components/ExtraAlerts.
 *
 * Default schedule: 04:00 server time daily. Override via env:
 *   FEATURED_EXPIRY_CRON       (default "0 4 * * *")
 *   FEATURED_EXPIRY_DAYS       (default 30)
 *   FEATURED_EXPIRY_WARN_DAYS  (default 3)
 *   DISABLE_FEATURED_EXPIRY=true  → skip scheduling (dev convenience)
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { getIntegrationSdk } = require('../api-util/sdk');

const PER_PAGE = 100;
const DEFAULT_TTL_DAYS = 30;
const DEFAULT_WARN_DAYS = 3;
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';

const getTtlMs = () => {
  const raw = process.env.FEATURED_EXPIRY_DAYS;
  const days =
    raw != null && !Number.isNaN(parseInt(raw, 10)) ? parseInt(raw, 10) : DEFAULT_TTL_DAYS;
  return days * 24 * 60 * 60 * 1000;
};
const getWarnMs = () => {
  const raw = process.env.FEATURED_EXPIRY_WARN_DAYS;
  const days =
    raw != null && !Number.isNaN(parseInt(raw, 10)) ? parseInt(raw, 10) : DEFAULT_WARN_DAYS;
  return days * 24 * 60 * 60 * 1000;
};

const fetchAllFeatured = async sdk => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await sdk.listings.query({
      pub_featured: true,
      page,
      perPage: PER_PAGE,
      include: ['author'],
      'fields.listing': ['title', 'publicData'],
    });
    const items = res?.data?.data || [];
    all.push(...items);
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
};

// Fetch user (with profile + email) from the Integration SDK.
const fetchUser = async (sdk, userId) => {
  try {
    const res = await sdk.users.show({ id: userId });
    return res?.data?.data || null;
  } catch (e) {
    console.error(`[expireFeatured] users.show failed for ${userId}:`, e?.message || e);
    return null;
  }
};

// Push one in-app toast alert onto `metadata.unseenExtraAlerts`. Mirrors the
// shape produced by notifyExtraAlertsJob so the existing client component
// renders them with zero extra wiring.
const pushAlert = async (sdk, user, alert) => {
  if (!user || !alert) return;
  const uid = user.id?.uuid;
  const existing = user?.attributes?.profile?.metadata?.unseenExtraAlerts || [];
  // De-dup: avoid stacking the same kind for the same listing if the job
  // re-runs before the user dismisses the previous one.
  const filtered = existing.filter(
    a => !(a?.kind === alert.kind && a?.listingId === alert.listingId)
  );
  const next = [...filtered, alert];
  try {
    await sdk.users.updateProfile({ id: uid, metadata: { unseenExtraAlerts: next } });
  } catch (e) {
    console.error(`[expireFeatured] updateProfile failed for ${uid}:`, e?.message || e);
  }
};

const buildExpiredEmail = ({ firstName, listingTitle }) => {
  const safeName = firstName || 'olá';
  const safeTitle = String(listingTitle || 'o teu anúncio').replace(/</g, '&lt;');
  const renewUrl = `${ROOT_URL.replace(/\/$/, '')}/destacar-anuncio`;
  const subject = `O destaque de "${safeTitle}" terminou — Venue1Hub`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;line-height:1.6;">
      <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;margin-bottom:24px;">
        O teu destaque chegou ao fim
      </h2>
      <p style="margin:0 0 16px;">Olá ${safeName},</p>
      <p style="margin:0 0 16px;">
        O destaque do anúncio <strong>${safeTitle}</strong> terminou hoje, ao fim dos 30 dias habituais. A partir de agora deixa de aparecer na secção de destaques da página principal, mas continua publicado e disponível para reservas normalmente.
      </p>
      <p style="margin:0 0 16px;">
        Os destaques ajudam a aumentar a visibilidade do espaço junto de quem está à procura. Se quiseres voltar a destacar este anúncio, podes fazê-lo a qualquer altura:
      </p>
      <p style="margin:24px 0;">
        <a href="${renewUrl}"
           style="color:#ffffff;background:#5C3317;padding:12px 28px;border-radius:6px;
                  text-decoration:none;font-weight:700;letter-spacing:.06em;
                  text-transform:uppercase;font-size:13px;display:inline-block;">
          Voltar a destacar
        </a>
      </p>
      <p style="margin:32px 0 0;font-size:12px;color:#999;">
        Recebes este email porque tens um anúncio publicado no Venue1Hub.
      </p>
    </div>
  `;
  return { subject, html };
};

const buildExpiringSoonEmail = ({ firstName, listingTitle, daysLeft }) => {
  const safeName = firstName || 'olá';
  const safeTitle = String(listingTitle || 'o teu anúncio').replace(/</g, '&lt;');
  const renewUrl = `${ROOT_URL.replace(/\/$/, '')}/destacar-anuncio`;
  const dayWord = daysLeft === 1 ? 'dia' : 'dias';
  const subject = `O destaque de "${safeTitle}" termina em ${daysLeft} ${dayWord} — Venue1Hub`;
  const html = `
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
        <a href="${renewUrl}"
           style="color:#ffffff;background:#5C3317;padding:12px 28px;border-radius:6px;
                  text-decoration:none;font-weight:700;letter-spacing:.06em;
                  text-transform:uppercase;font-size:13px;display:inline-block;">
          Renovar destaque
        </a>
      </p>
      <p style="margin:32px 0 0;font-size:12px;color:#999;">
        Recebes este email porque tens um anúncio em destaque no Venue1Hub.
      </p>
    </div>
  `;
  return { subject, html };
};

const sendEmail = async ({ resend, to, subject, html, tag }) => {
  if (!resend || !to) return false;
  try {
    await resend.emails.send({
      from: 'Venue1Hub <onboarding@resend.dev>',
      to: [to],
      subject,
      html,
    });
    console.log(`[expireFeatured] ${tag} sent → ${to}`);
    return true;
  } catch (e) {
    console.error(`[expireFeatured] ${tag} email failed for ${to}:`, e?.message || e);
    return false;
  }
};

const runOnce = async ({ dryRun = false } = {}) => {
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.warn('[expireFeatured] skipped (Integration SDK not configured)');
    return { expired: 0, warned: 0, kept: 0, skipped: 0 };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  if (!resend) {
    console.warn('[expireFeatured] RESEND_API_KEY missing — emails will not be sent');
  }

  const ttlMs = getTtlMs();
  const warnMs = getWarnMs();
  const cutoffMs = Date.now() - ttlMs;
  const warnCutoffMs = Date.now() - (ttlMs - warnMs);
  console.log(
    `[expireFeatured] tick start — TTL=${ttlMs / (24 * 60 * 60 * 1000)}d, ` +
      `warn ${warnMs / (24 * 60 * 60 * 1000)}d before, ` +
      `expiry cutoff=${new Date(cutoffMs).toISOString()}${dryRun ? ' (dry-run)' : ''}`
  );

  let listings;
  try {
    listings = await fetchAllFeatured(sdk);
  } catch (e) {
    console.error('[expireFeatured] query failed:', e?.message || e);
    return { expired: 0, warned: 0, kept: 0, skipped: 0 };
  }

  let expired = 0;
  let warned = 0;
  let kept = 0;
  let skipped = 0;

  for (const listing of listings) {
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

    // 1) Expired — flip featured to 'false' and notify.
    if (featuredAtMs <= cutoffMs) {
      if (dryRun) {
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
        console.error(`  ${id}  ${title}  FAILED to expire:`, e?.message || e);
        continue;
      }

      const user = authorId ? await fetchUser(sdk, authorId) : null;
      const email = user?.attributes?.email;
      const firstName = user?.attributes?.profile?.firstName;

      if (resend && email) {
        const { subject, html } = buildExpiredEmail({
          firstName,
          listingTitle: title,
          listingId: id,
        });
        await sendEmail({ resend, to: email, subject, html, tag: 'expired' });
      }

      if (user) {
        await pushAlert(sdk, user, {
          id: `destaque-expired-${id}-${Date.now()}`,
          kind: 'destaque-expired',
          listingId: id,
          listingTitle: title,
          createdAt: new Date().toISOString(),
        });
      }

      expired += 1;
      console.log(`  ${id}  ${title}  → expired (featuredAt=${featuredAt})`);
      continue;
    }

    // 2) Approaching expiry (within warnMs of the cutoff) — send warning
    //    once per destaque cycle. We mark publicData.destaqueWarningSent with
    //    the current featuredAt so re-destacando (new featuredAt) re-arms it.
    if (featuredAtMs <= warnCutoffMs) {
      if (publicData.destaqueWarningSent === featuredAt) {
        kept += 1;
        continue; // already warned for this destaque cycle
      }

      const daysLeft = Math.max(
        1,
        Math.ceil((featuredAtMs + ttlMs - Date.now()) / (24 * 60 * 60 * 1000))
      );

      if (dryRun) {
        console.log(
          `  ${id}  ${title}  → would WARN (featuredAt=${featuredAt}, daysLeft=${daysLeft})`
        );
        warned += 1;
        continue;
      }

      const user = authorId ? await fetchUser(sdk, authorId) : null;
      const email = user?.attributes?.email;
      const firstName = user?.attributes?.profile?.firstName;

      if (resend && email) {
        const { subject, html } = buildExpiringSoonEmail({
          firstName,
          listingTitle: title,
          daysLeft,
        });
        await sendEmail({ resend, to: email, subject, html, tag: 'expiring-soon' });
      }

      if (user) {
        await pushAlert(sdk, user, {
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
        console.error(
          `  ${id}  ${title}  FAILED to mark destaqueWarningSent:`,
          e?.message || e
        );
      }

      warned += 1;
      console.log(`  ${id}  ${title}  → warned (${daysLeft}d left)`);
      continue;
    }

    kept += 1;
  }

  console.log(
    `[expireFeatured] tick done. expired=${expired} warned=${warned} kept=${kept} skipped=${skipped} (total=${listings.length})`
  );
  return { expired, warned, kept, skipped };
};

const start = () => {
  if (process.env.DISABLE_FEATURED_EXPIRY === 'true') {
    console.log('[expireFeatured] disabled via env');
    return;
  }
  const expr = process.env.FEATURED_EXPIRY_CRON || '0 4 * * *';
  try {
    cron.schedule(expr, () => {
      runOnce().catch(e =>
        console.error('[expireFeatured] tick failed:', e?.message || e)
      );
    });
    console.log(`[expireFeatured] scheduled (cron: "${expr}")`);
  } catch (e) {
    console.error('[expireFeatured] failed to schedule:', e?.message || e);
  }
};

module.exports = { start, runOnce };
