/**
 * Webhook do Stripe.
 *
 *   POST /api/stripe/webhook
 *
 * É aqui — e só aqui — que um destaque fica activo. O regresso do Checkout não
 * serve para isso: o utilizador pode fechar o separador antes de o pagamento
 * confirmar, ou forjar o URL de sucesso. O webhook vem assinado pelo Stripe e é
 * verificado antes de se ler seja o que for.
 *
 * Precisa do corpo em bruto para a verificação da assinatura, por isso a rota é
 * registada com bodyParser.raw antes do parser de JSON (ver apiRouter.js).
 *
 * Eventos tratados:
 *   checkout.session.completed → activa o que foi pago
 *
 * Já não há subscrições: a plataforma vive da comissão por reserva, e o
 * destaque passou a pagamento único.
 */

const billing = require('../api-util/stripeBilling');
const { getIntegrationSdk } = require('../api-util/sdk');
const { DESTAQUE } = require('../api-util/plans');

/**
 * Activa o destaque de um anúncio.
 *
 * Grava `featuredAt` com o instante do pagamento; a partir daí é o job diário
 * que conta os dias e o desliga no fim (FEATURED_EXPIRY_DAYS). Não se guarda
 * aqui nenhuma data de fim para não haver duas versões do mesmo prazo.
 */
const activateDestaque = async session => {
  const listingId = session?.metadata?.listingId;
  if (!listingId) {
    console.error('[stripe-webhook] destaque sem listingId:', session?.id);
    return;
  }

  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');

  await sdk.listings.update({
    id: listingId,
    publicData: {
      featured: 'true',
      featuredAt: new Date().toISOString(),
      // Limpa o aviso de "faltam 3 dias" do ciclo anterior, para o novo
      // período voltar a avisar a tempo.
      destaqueWarningSent: null,
      featuredPending: null,
    },
  });

  console.log(`[stripe-webhook] destaque activo → ${listingId}`);
};

/**
 * POST /api/stripe/webhook
 */
const handler = async (req, res) => {
  if (!billing.isConfigured()) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY não está configurada');
    return res.status(503).json({ error: 'billing-not-configured' });
  }

  let event;
  try {
    event = billing.constructWebhookEvent(req.body, req.get('stripe-signature'));
  } catch (e) {
    // Assinatura inválida: não é nosso, ou o segredo está errado.
    console.error('[stripe-webhook] assinatura inválida:', e?.message || e);
    return res.status(400).json({ error: 'invalid-signature' });
  }

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      // Um Checkout em modo payment pode ficar pendente (multibanco, por
      // exemplo). Só se activa o que está mesmo pago.
      if (session?.payment_status !== 'paid') {
        console.log(`[stripe-webhook] sessão ${session?.id} ainda não paga, ignorada`);
      } else if (session?.metadata?.kind === DESTAQUE.key) {
        await activateDestaque(session);
      }
    }
  } catch (e) {
    // 500 faz o Stripe repetir o evento, que é o que queremos: activar o mesmo
    // destaque duas vezes escreve o mesmo estado.
    console.error(`[stripe-webhook] falha a tratar ${event.type}:`, e?.message || e);
    return res.status(500).json({ error: 'handler-failed' });
  }

  return res.json({ received: true });
};

module.exports = { handler, activateDestaque };
