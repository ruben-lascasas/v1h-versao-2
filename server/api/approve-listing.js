/**
 * GET /api/approve-listing?listingId=xxx&action=approve|reject&token=yyy
 *
 * Link enviado no email de notificação ao admin quando um anúncio novo é publicado.
 * O anúncio é fechado imediatamente pelo notify-admin e só fica visível após aprovação.
 *
 * Aprovação: listings.open() → publicado, listingPending=null
 * Rejeição:  listings.update() → listingRejected=true (fica fechado)
 *
 * Usa a mesma variável de ambiente que os destaques:
 *   DESTAQUE_APPROVAL_SECRET
 */

const crypto = require('crypto');
const { getIntegrationSdk } = require('../api-util/sdk');

const buildToken = (listingId, action, secret) =>
  crypto.createHmac('sha256', secret).update(`${listingId}:listing:${action}`).digest('hex');

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
    console.error('[approve-listing] DESTAQUE_APPROVAL_SECRET not configured');
    return res.status(500).send(html('Erro de configuração', 'O servidor não está configurado para processar aprovações.', '#c0392b'));
  }

  const expected = buildToken(listingId, action, secret);
  let tokenBuf, expectedBuf;
  try {
    tokenBuf = Buffer.from(token, 'hex');
    expectedBuf = Buffer.from(expected, 'hex');
  } catch (_) {
    return res.status(403).send(html('Token inválido', 'Este link não é válido.', '#c0392b'));
  }
  if (tokenBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(tokenBuf, expectedBuf)) {
    return res.status(403).send(html('Token inválido', 'Este link não é válido ou já expirou.', '#c0392b'));
  }

  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('[approve-listing] Integration SDK not configured');
    return res.status(500).send(html('Erro de configuração', 'A Integration API não está configurada.', '#c0392b'));
  }

  try {
    if (action === 'approve') {
      await sdk.listings.open({ id: listingId });
      await sdk.listings.update({ id: listingId, publicData: { listingPending: null } });
      console.log(`[approve-listing] approved → ${listingId}`);
      return res.send(html(
        'Anúncio aprovado ✓',
        `O anúncio <code>${listingId}</code> está agora publicado e visível na plataforma.`
      ));
    } else {
      await sdk.listings.update({ id: listingId, publicData: { listingRejected: true, listingPending: null } });
      console.log(`[approve-listing] rejected → ${listingId}`);
      return res.send(html(
        'Anúncio rejeitado',
        `O anúncio <code>${listingId}</code> foi rejeitado e permanece fechado.`,
        '#8B4513'
      ));
    }
  } catch (err) {
    console.error(`[approve-listing] SDK error for ${listingId}:`, err?.message || err);
    return res.status(500).send(html('Erro', `Não foi possível atualizar o anúncio: ${err?.message || 'erro desconhecido'}`, '#c0392b'));
  }
};

module.exports.buildToken = buildToken;
