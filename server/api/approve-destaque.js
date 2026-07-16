/**
 * GET /api/approve-destaque?listingId=xxx&action=approve|reject&token=yyy
 *
 * Link enviado no email de notificação ao admin (notify-admin.js).
 * Verifica o token HMAC e chama a Integration SDK para aprovar ou rejeitar.
 *
 * Aprovação: featured='true', featuredAt=now, featuredPending=null
 * Rejeição:  featuredPending=null  (listing fica publicado mas sem destaque)
 *
 * Variável de ambiente necessária:
 *   DESTAQUE_APPROVAL_SECRET — segredo para assinar/verificar os tokens HMAC
 *                              (cria um valor aleatório longo, ex: openssl rand -hex 32)
 */

const crypto = require('crypto');
const { getIntegrationSdk } = require('../api-util/sdk');

const buildToken = (listingId, action, secret) =>
  crypto.createHmac('sha256', secret).update(`${listingId}:${action}`).digest('hex');

const html = (title, body, color = '#2E6E3E') => `
<!DOCTYPE html>
<html lang="pt">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} — Venue1Hub</title>
  <style>
    body { font-family: Arial, sans-serif; background: #f5f5f5; display: flex;
           align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
    .card { background: #fff; border-radius: 8px; padding: 40px 48px; max-width: 480px;
            width: 100%; box-shadow: 0 2px 12px rgba(0,0,0,.1); text-align: center; }
    h1 { color: ${color}; font-size: 22px; margin: 0 0 16px; }
    p  { color: #555; font-size: 15px; line-height: 1.6; margin: 0; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${title}</h1>
    <p>${body}</p>
  </div>
</body>
</html>`;

module.exports = async (req, res) => {
  const { listingId, action, token } = req.query || {};

  if (!listingId || !action || !token) {
    return res.status(400).send(html('Parâmetros inválidos', 'O link está incompleto.', '#c0392b'));
  }
  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).send(html('Ação inválida', 'O link contém uma ação desconhecida.', '#c0392b'));
  }

  const secret = process.env.DESTAQUE_APPROVAL_SECRET;
  if (!secret) {
    console.error('[approve-destaque] DESTAQUE_APPROVAL_SECRET not configured');
    return res.status(500).send(html('Erro de configuração', 'O servidor não está configurado para processar aprovações.', '#c0392b'));
  }

  const expected = buildToken(listingId, action, secret);
  if (!crypto.timingSafeEqual(Buffer.from(token, 'hex'), Buffer.from(expected, 'hex'))) {
    return res.status(403).send(html('Token inválido', 'Este link não é válido ou já expirou.', '#c0392b'));
  }

  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('[approve-destaque] Integration SDK not configured');
    return res.status(500).send(html('Erro de configuração', 'A Integration API não está configurada.', '#c0392b'));
  }

  try {
    if (action === 'approve') {
      await sdk.listings.update({
        id: listingId,
        publicData: {
          featured: 'true',
          featuredAt: new Date().toISOString(),
          featuredPending: null,
        },
      });
      console.log(`[approve-destaque] approved → ${listingId}`);
      return res.send(html(
        'Destaque aprovado ✓',
        `O anúncio <code>${listingId}</code> está agora em destaque na página principal.`
      ));
    } else {
      await sdk.listings.update({
        id: listingId,
        publicData: { featuredPending: null },
      });
      console.log(`[approve-destaque] rejected → ${listingId}`);
      return res.send(html(
        'Pedido rejeitado',
        `O pedido de destaque para o anúncio <code>${listingId}</code> foi rejeitado. O anúncio continua publicado normalmente.`,
        '#8B4513'
      ));
    }
  } catch (err) {
    console.error(`[approve-destaque] SDK error for ${listingId}:`, err?.message || err);
    return res.status(500).send(html('Erro', `Não foi possível atualizar o anúncio: ${err?.message || 'erro desconhecido'}`, '#c0392b'));
  }
};

module.exports.buildToken = buildToken;
