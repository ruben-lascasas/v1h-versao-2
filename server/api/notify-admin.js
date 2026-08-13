const { Resend } = require('resend');
const { mailFrom, adminEmail } = require('../api-util/emailSender');
const { buildToken: buildDestaqueToken } = require('./approve-destaque');
const { buildToken: buildListingToken } = require('./approve-listing');
const { getIntegrationSdk } = require('../api-util/sdk');

/**
 * POST /api/notify-admin
 *
 * Body:
 *   { type: 'destaque' | 'novo-anuncio', listingId, listingTitle?, userId?, userName? }
 *
 * Para 'destaque':
 *   - Envia email com botões Aprovar/Rejeitar (via /api/approve-destaque)
 *   - O anúncio fica em featuredPending até aprovação
 *
 * Para 'novo-anuncio':
 *   - Fecha o anúncio imediatamente via Integration SDK (invisível até aprovação)
 *   - Envia email com botões Aprovar/Rejeitar (via /api/approve-listing)
 *
 * Env vars:
 *   RESEND_API_KEY, ADMIN_NOTIFY_RECIPIENT, REACT_APP_MARKETPLACE_ROOT_URL,
 *   SHARETRIBE_CONSOLE_BASE_URL, DESTAQUE_APPROVAL_SECRET
 */
module.exports = async (req, res) => {
  const { type, listingId, listingTitle, userId, userName } = req.body || {};

  if (!type || !listingId) {
    return res.status(400).json({ error: 'type and listingId are required' });
  }
  if (type !== 'destaque' && type !== 'novo-anuncio') {
    return res.status(400).json({ error: 'invalid type' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.ADMIN_NOTIFY_RECIPIENT || adminEmail();
  const publicRoot = (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');
  const consoleBase = (process.env.SHARETRIBE_CONSOLE_BASE_URL || '').replace(/\/$/, '');
  const consoleUrl = consoleBase
    ? `${consoleBase}/listings/${listingId}`
    : 'https://console.sharetribe.com/';
  const publicUrl = publicRoot ? `${publicRoot}/l/${listingId}` : '';
  const approvalSecret = process.env.DESTAQUE_APPROVAL_SECRET;

  const safeTitle = listingTitle || '(sem título)';
  const safeUser = userName || userId || '(utilizador desconhecido)';

  // ── Para novo-anuncio: fechar o anúncio antes de responder ao frontend ────
  // O frontend aguarda esta resposta (await fetch), por isso o close tem de
  // terminar aqui para garantir que o anúncio fica invisível antes de o
  // utilizador ser redirecionado.
  if (type === 'novo-anuncio') {
    const sdk = getIntegrationSdk();
    if (sdk) {
      try {
        await sdk.listings.close({ id: listingId });
        await sdk.listings.update({ id: listingId, publicData: { listingPending: true } });
        console.log(`[notify-admin] listing closed + marked pending → ${listingId}`);
      } catch (e) {
        console.error(`[notify-admin] failed to close listing ${listingId}:`, e?.message || e);
      }
    } else {
      console.warn('[notify-admin] Integration SDK not configured — listing not closed automatically');
    }
  }

  // ── Gerar URLs de aprovação ───────────────────────────────────────────────
  let approveUrl = null;
  let rejectUrl = null;

  if (approvalSecret) {
    if (type === 'destaque') {
      approveUrl = `${publicRoot}/api/approve-destaque?listingId=${listingId}&action=approve&token=${buildDestaqueToken(listingId, 'approve', approvalSecret)}`;
      rejectUrl  = `${publicRoot}/api/approve-destaque?listingId=${listingId}&action=reject&token=${buildDestaqueToken(listingId, 'reject', approvalSecret)}`;
    } else {
      approveUrl = `${publicRoot}/api/approve-listing?listingId=${listingId}&action=approve&token=${buildListingToken(listingId, 'approve', approvalSecret)}`;
      rejectUrl  = `${publicRoot}/api/approve-listing?listingId=${listingId}&action=reject&token=${buildListingToken(listingId, 'reject', approvalSecret)}`;
    }
  }

  const subject =
    type === 'destaque'
      ? `[Venue1Hub] Pedido de destaque${listingTitle ? `: ${listingTitle}` : ''}`
      : `[Venue1Hub] Novo anúncio para aprovação${listingTitle ? `: ${listingTitle}` : ''}`;

  const headline =
    type === 'destaque'
      ? 'Um utilizador pediu um destaque'
      : 'Um utilizador publicou um anúncio novo';

  const pendingNote =
    type === 'destaque'
      ? 'Este pedido está <strong>pendente de aprovação</strong>. O anúncio só aparecerá na secção de destaques após aprovares abaixo.'
      : 'Este anúncio está <strong>fechado e invisível</strong> até aprovares. Não é possível receber reservas enquanto estiver pendente.';

  const approveLabel = type === 'destaque' ? '✓ Aprovar destaque' : '✓ Publicar anúncio';

  if (!apiKey) {
    console.log(`[notify-admin] ${type} (RESEND_API_KEY not configured): listing=${listingId} user=${safeUser}`);
    return res.status(200).json({ success: true, sent: false });
  }

  try {
    const resend = new Resend(apiKey);
    console.log(`[notify-admin] sending ${type} → ${recipient} (listing ${listingId})`);

    await resend.emails.send({
      from: mailFrom('Admin'),
      to: [recipient],
      subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 880px; margin: 0 auto; padding: 0 16px;">
          <h2 style="color: #1a1a1a; border-bottom: 2px solid #BAA38A; padding-bottom: 12px;">${headline}</h2>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr>
              <td style="padding:8px 0; color:#666; width:120px;"><strong>Anúncio:</strong></td>
              <td style="padding:8px 0;">${safeTitle}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>ID:</strong></td>
              <td style="padding:8px 0; font-family: monospace; font-size: 12px;">${listingId}</td>
            </tr>
            <tr>
              <td style="padding:8px 0; color:#666;"><strong>Publicado por:</strong></td>
              <td style="padding:8px 0;">${safeUser}</td>
            </tr>
          </table>

          ${approveUrl ? `
          <div style="margin-top:28px; padding:20px; background:#f9f5f0; border-radius:8px; border:1px solid #e8ddd0;">
            <p style="margin:0 0 10px; font-weight:700; color:#1a1a1a; font-size:15px;">Ação necessária</p>
            <p style="margin:0 0 18px; color:#555; font-size:14px;">${pendingNote}</p>
            <div>
              <a href="${approveUrl}"
                 style="display:inline-block; margin-right:10px; margin-bottom:8px; padding:12px 28px;
                        background:#2E6E3E; color:#fff; border-radius:6px; text-decoration:none;
                        font-weight:700; font-size:13px; letter-spacing:.06em; text-transform:uppercase;">
                ${approveLabel}
              </a>
              <a href="${rejectUrl}"
                 style="display:inline-block; margin-bottom:8px; padding:12px 28px;
                        background:#c0392b; color:#fff; border-radius:6px; text-decoration:none;
                        font-weight:700; font-size:13px; letter-spacing:.06em; text-transform:uppercase;">
                ✕ Rejeitar
              </a>
            </div>
          </div>` : ''}

          <div style="margin-top:24px; color:#2E2E2E; line-height:1.7;">
            ${publicUrl ? `<p style="margin:0 0 8px 0;">Ver no site: <a href="${publicUrl}" style="color:#1a73e8;">${publicUrl}</a></p>` : ''}
            <p style="margin:0;">Sharetribe Console: <a href="${consoleUrl}" style="color:#1a73e8;">${consoleUrl}</a></p>
          </div>
          <p style="margin-top:24px; font-size:12px; color:#999;">Notificação automática — Venue1Hub</p>
        </div>
      `,
    });

    console.log(`[notify-admin] sent → ${recipient}: ${subject}`);
    return res.status(200).json({ success: true, sent: true });
  } catch (err) {
    console.error('[notify-admin] Resend error:', err.message);
    return res.status(500).json({ error: 'send-failed' });
  }
};
