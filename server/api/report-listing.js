const { Resend } = require('resend');
const { mailFrom, adminEmail } = require('../api-util/emailSender');
const { getSdk, getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/report-listing
 * Sends a listing-report email via Resend and enforces server-side rate limits
 * stored in `metadata.reportListingHistory` (operator-only, tamper-proof).
 *
 * Limits applied per reporter (logged-in user):
 *   - Max 5 listing reports per rolling 24h
 *   - Max 1 report per same listing per 30 days
 *   - 60-second cooldown between any two listing reports
 *
 * Required env vars:
 *   RESEND_API_KEY                          — Resend email API key
 *   SHARETRIBE_INTEGRATION_CLIENT_ID        — operator credentials
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 * Optional:
 *   REPORTS_TO_EMAIL  opcional; sem ele usa CONTACT_RECIPIENT
 */

const LIMITS = {
  perDay: 8,
  perTargetDays: 30,
  cooldownSeconds: 60,
};

const DAY_MS = 24 * 60 * 60 * 1000;

const errorPayload = (codeKey, locale, extras = {}) => {
  const messages = {
    NEED_AUTH: {
      pt: 'Tem de iniciar sessão para denunciar.',
      en: 'You must be signed in to report a listing.',
    },
    DAILY_LIMIT: {
      pt: `Já atingiu o limite diário de ${LIMITS.perDay} denúncias. Tente novamente amanhã.`,
      en: `You've reached the daily limit of ${LIMITS.perDay} reports. Try again tomorrow.`,
    },
    SAME_TARGET: {
      pt: `Já denunciou este anúncio nos últimos ${LIMITS.perTargetDays} dias.`,
      en: `You've already reported this listing within the past ${LIMITS.perTargetDays} days.`,
    },
    COOLDOWN: {
      pt: `Aguarde ${extras.wait}s antes de fazer outra denúncia.`,
      en: `Wait ${extras.wait}s before submitting another report.`,
    },
    BACKEND_DOWN: {
      pt: 'Sistema de denúncias temporariamente indisponível.',
      en: 'Reports system temporarily unavailable.',
    },
  };
  const lang = locale === 'en' ? 'en' : 'pt';
  return { code: codeKey, error: messages[codeKey][lang] };
};

module.exports = async (req, res) => {
  const {
    listingTitle = '',
    listingId = '',
    listingUrl = '',
    reasonKey = '',
    reasonLabel = '',
    description = '',
    reporterEmail = '',
    attachments = [],
    locale = 'pt',
  } = req.body || {};

  if (!reasonKey || !reporterEmail) {
    return res.status(400).json({ error: 'Por favor preencha os campos obrigatórios.' });
  }

  // ─── 1. Authenticate the reporter ──────────────────────────────────────
  const sdk = getSdk(req, res);
  let reporterId;
  try {
    const me = await sdk.currentUser.show();
    reporterId = me?.data?.data?.id?.uuid;
    if (!reporterId) throw new Error('no-current-user');
  } catch (_) {
    return res.status(401).json(errorPayload('NEED_AUTH', locale));
  }

  // ─── 2. Rate-limit check via Integration SDK ───────────────────────────
  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    return res.status(503).json(errorPayload('BACKEND_DOWN', locale));
  }

  let history = [];
  try {
    const userRes = await integrationSdk.users.show({ id: reporterId });
    const meta = userRes?.data?.data?.attributes?.profile?.metadata || {};
    history = Array.isArray(meta.reportListingHistory) ? meta.reportListingHistory : [];
  } catch (e) {
    console.error('[ReportListing] users.show failed:', e?.message || e);
    history = [];
  }

  const now = Date.now();
  const recentReports = history.filter(r => r && now - r.at < DAY_MS);
  if (recentReports.length >= LIMITS.perDay) {
    return res.status(429).json(errorPayload('DAILY_LIMIT', locale));
  }

  const sameTargetReports = history.filter(
    r => r && r.listingId === listingId && now - r.at < LIMITS.perTargetDays * DAY_MS
  );
  if (sameTargetReports.length > 0) {
    return res.status(429).json(errorPayload('SAME_TARGET', locale));
  }

  const lastReport = history.length > 0 ? history.reduce((a, b) => (a.at > b.at ? a : b)) : null;
  if (lastReport && now - lastReport.at < LIMITS.cooldownSeconds * 1000) {
    const wait = Math.ceil((LIMITS.cooldownSeconds * 1000 - (now - lastReport.at)) / 1000);
    return res.status(429).json(errorPayload('COOLDOWN', locale, { wait }));
  }

  // ─── 3. Persist the new entry (operator-only metadata) ─────────────────
  const pruneCutoff = now - LIMITS.perTargetDays * DAY_MS;
  const newEntry = { listingId, at: now, reason: reasonKey };
  const updatedHistory = [...history.filter(r => r && r.at > pruneCutoff), newEntry];

  try {
    await integrationSdk.users.updateProfile({
      id: reporterId,
      metadata: { reportListingHistory: updatedHistory },
    });
  } catch (e) {
    console.error('[ReportListing] updateProfile failed:', e?.message || e);
  }

  // ─── 4. Send the report email to admin ─────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.REPORTS_TO_EMAIL || adminEmail();

  if (!apiKey) {
    console.log('[ReportListing] New report (RESEND_API_KEY not configured):');
    console.log(`  Listing: ${listingTitle} (${listingId})`);
    console.log(`  Reason: ${reasonLabel || reasonKey}`);
    console.log(`  Reporter: ${reporterEmail} (${reporterId})`);
    return res.status(200).json({ success: true });
  }

  try {
    const resend = new Resend(apiKey);

    const safeDescription = (description || '(sem descrição adicional)').replace(/</g, '&lt;');
    const safeTitle = (listingTitle || '(sem título)').replace(/</g, '&lt;');
    const safeReason = (reasonLabel || reasonKey).replace(/</g, '&lt;');

    const safeAttachments = Array.isArray(attachments)
      ? attachments
          .slice(0, 5)
          .map(a => {
            if (!a?.filename || !a?.base64) return null;
            const base64 = a.base64.includes(',') ? a.base64.split(',')[1] : a.base64;
            return { filename: a.filename, content: base64 };
          })
          .filter(Boolean)
      : [];

    await resend.emails.send({
      from: mailFrom('Denúncias'),
      reply_to: reporterEmail,
      to: [recipient],
      subject: `[Venue1Hub - Denúncia Anúncio] ${safeTitle} — ${safeReason}`,
      attachments: safeAttachments,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #c62828; border-bottom: 2px solid #c62828; padding-bottom: 12px;">Nova denúncia de anúncio</h2>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr><td style="padding:8px 0; color:#666; width:120px;"><strong>Anúncio:</strong></td><td style="padding:8px 0;">${safeTitle}</td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>ID:</strong></td><td style="padding:8px 0;"><code>${listingId}</code></td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Link:</strong></td><td style="padding:8px 0;"><a href="${listingUrl}" style="color:#BAA38A;">${listingUrl}</a></td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Motivo:</strong></td><td style="padding:8px 0;"><strong>${safeReason}</strong></td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Denunciante:</strong></td><td style="padding:8px 0;"><a href="mailto:${reporterEmail}" style="color:#BAA38A;">${reporterEmail}</a> <code style="font-size:11px;color:#999;">(${reporterId})</code></td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Data:</strong></td><td style="padding:8px 0;">${new Date().toLocaleString('pt-PT')}</td></tr>
          </table>
          <div style="margin-top:24px; padding:16px; background:#fff5f5; border-left:4px solid #c62828; border-radius:2px;">
            <p style="margin:0 0 8px 0; color:#666; font-size:13px;"><strong>Descrição:</strong></p>
            <p style="margin:0; color:#2E2E2E; line-height:1.6; white-space:pre-wrap;">${safeDescription}</p>
          </div>
          <p style="margin-top:24px; font-size:12px; color:#999;">Para tomar medidas, aceda ao Sharetribe Console e gerencie o anúncio. Pode responder a este email para contactar o denunciante.</p>
        </div>
      `,
    });

    // ─── 5. Confirmation email to reporter ─────────────────────────────
    const isEN = (locale || 'pt').toLowerCase().startsWith('en');
    const reporterSubject = isEN
      ? `[Venue1Hub] We received your report — ${safeTitle}`
      : `[Venue1Hub] Recebemos a sua denúncia — ${safeTitle}`;
    const reporterHtml = isEN
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2E2E2E;">
          <h2 style="color: #5C3317; border-bottom: 2px solid #BAA38A; padding-bottom: 12px;">Thank you for your report</h2>
          <p style="line-height: 1.6;">Hi,</p>
          <p style="line-height: 1.6;">We've received your report and our team will review it shortly. We may follow up by email if we need more information. Otherwise, you don't have to do anything else.</p>
          <h3 style="color: #5C3317; margin-top: 28px; font-size: 16px;">Summary of your report</h3>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="padding:6px 0; color:#666; width:140px;"><strong>Reported listing:</strong></td><td style="padding:6px 0;">${safeTitle}</td></tr>
            <tr><td style="padding:6px 0; color:#666;"><strong>Reason:</strong></td><td style="padding:6px 0;">${safeReason}</td></tr>
            <tr><td style="padding:6px 0; color:#666;"><strong>Date:</strong></td><td style="padding:6px 0;">${new Date().toLocaleString('en-GB')}</td></tr>
          </table>
          <div style="margin-top:18px; padding:14px; background:#f6f0e8; border-left:4px solid #BAA38A; border-radius:2px;">
            <p style="margin:0 0 6px 0; color:#666; font-size:13px;"><strong>Description you sent:</strong></p>
            <p style="margin:0; line-height:1.6; white-space:pre-wrap;">${safeDescription}</p>
          </div>
          <p style="margin-top:24px; font-size:12px; color:#999;">If you didn't send this report, please reply to this email so we can investigate. — Venue1Hub Trust &amp; Safety</p>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2E2E2E;">
          <h2 style="color: #5C3317; border-bottom: 2px solid #BAA38A; padding-bottom: 12px;">Recebemos a sua denúncia</h2>
          <p style="line-height: 1.6;">Olá,</p>
          <p style="line-height: 1.6;">Obrigado por nos ter contactado. A sua denúncia foi recebida e a nossa equipa vai analisá-la em breve. Se for necessária mais informação, entraremos em contacto consigo por email. Caso contrário, não tem de fazer mais nada.</p>
          <h3 style="color: #5C3317; margin-top: 28px; font-size: 16px;">Resumo da sua denúncia</h3>
          <table style="width:100%; border-collapse:collapse;">
            <tr><td style="padding:6px 0; color:#666; width:160px;"><strong>Anúncio denunciado:</strong></td><td style="padding:6px 0;">${safeTitle}</td></tr>
            <tr><td style="padding:6px 0; color:#666;"><strong>Motivo:</strong></td><td style="padding:6px 0;">${safeReason}</td></tr>
            <tr><td style="padding:6px 0; color:#666;"><strong>Data:</strong></td><td style="padding:6px 0;">${new Date().toLocaleString('pt-PT')}</td></tr>
          </table>
          <div style="margin-top:18px; padding:14px; background:#f6f0e8; border-left:4px solid #BAA38A; border-radius:2px;">
            <p style="margin:0 0 6px 0; color:#666; font-size:13px;"><strong>Descrição enviada:</strong></p>
            <p style="margin:0; line-height:1.6; white-space:pre-wrap;">${safeDescription}</p>
          </div>
          <p style="margin-top:24px; font-size:12px; color:#999;">Se não foi o autor desta denúncia, responda a este email para podermos investigar. — Equipa Venue1Hub</p>
        </div>
      `;

    try {
      await resend.emails.send({
        from: mailFrom(),
        reply_to: recipient,
        to: [reporterEmail],
        subject: reporterSubject,
        html: reporterHtml,
      });
    } catch (err) {
      console.error('[ReportListing] Reporter confirmation email failed:', err?.message || err);
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[ReportListing] Resend error:', err.message);
    return res.status(500).json({ error: 'Erro ao enviar a denúncia. Tente novamente.' });
  }
};
