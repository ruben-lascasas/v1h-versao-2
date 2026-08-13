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
 *   checkout.session.completed              → activa, se já estiver pago
 *   checkout.session.async_payment_succeeded → activa quando o pagamento
 *                                              diferido acaba por entrar
 *   checkout.session.async_payment_failed    → limpa o pedido pendente
 *   checkout.session.expired                 → limpa o pedido pendente
 *
 * Os dois eventos assíncronos não são teoria: métodos como o Multibanco
 * fecham o Checkout com `payment_status: 'unpaid'` e só confirmam mais tarde.
 * Sem os tratar, quem pagasse por essa via ficava sem destaque nenhum — o
 * dinheiro entrava e nada acontecia. Hoje a conta não tem nenhum desses
 * métodos ligado, mas basta ligar um no painel do Stripe para o problema
 * aparecer sem ninguém tocar no código.
 *
 * Já não há subscrições: a plataforma vive da comissão por reserva, e o
 * destaque passou a pagamento único.
 */

const billing = require('../api-util/stripeBilling');
const { getIntegrationSdk } = require('../api-util/sdk');
const { DESTAQUE } = require('../api-util/plans');
const { sendDestaqueConfirmation } = require('../api-util/destaqueEmails');

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

  // Confirmação por email. Best-effort: o destaque já está activo, e uma
  // falha de correio não pode fazer o Stripe repetir o evento.
  sendDestaqueConfirmation({
    sdk,
    userId: session?.metadata?.sharetribeUserId || session?.client_reference_id,
    listingId,
    session,
  }).catch(e => console.error('[stripe-webhook] email de confirmação falhou:', e?.message || e));
};

/**
 * Limpa a marca de "destaque pedido" quando o pagamento não se concretiza.
 *
 * Sem isto, um Checkout abandonado ou um pagamento falhado deixava o anúncio
 * marcado como pendente para sempre.
 */
const clearPending = async session => {
  const listingId = session?.metadata?.listingId;
  if (!listingId) return;

  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');

  await sdk.listings.update({ id: listingId, publicData: { featuredPending: null } });
  console.log(`[stripe-webhook] pedido de destaque limpo → ${listingId}`);
};

/** true se este evento diz respeito a um destaque nosso. */
const isDestaque = session => session?.metadata?.kind === DESTAQUE.key;

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
    const session = event.data?.object;

    switch (event.type) {
      case 'checkout.session.completed':
        // Um Checkout em modo payment pode fechar sem estar pago (Multibanco e
        // afins). Nesse caso não se activa nada agora — espera-se pelo
        // async_payment_succeeded, tratado abaixo.
        if (!isDestaque(session)) break;
        if (session?.payment_status === 'paid') {
          await activateDestaque(session);
        } else {
          console.log(
            `[stripe-webhook] sessão ${session?.id} fechada por pagar ` +
              `(${session?.payment_status}) — à espera da confirmação`
          );
        }
        break;

      case 'checkout.session.async_payment_succeeded':
        // O pagamento diferido entrou. É agora que o destaque fica activo.
        if (isDestaque(session)) await activateDestaque(session);
        break;

      case 'checkout.session.async_payment_failed':
      case 'checkout.session.expired':
        if (isDestaque(session)) await clearPending(session);
        break;

      default:
        break;
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
