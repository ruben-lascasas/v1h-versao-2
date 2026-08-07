/**
 * Webhook do Stripe Billing.
 *
 *   POST /api/stripe/webhook
 *
 * É aqui — e só aqui — que o plano de um anfitrião muda. O regresso do Checkout
 * não serve para isso: o utilizador pode fechar o separador antes de o
 * pagamento confirmar, ou forjar o URL de sucesso. O webhook vem assinado pelo
 * Stripe e é verificado antes de se ler seja o que for.
 *
 * Precisa do corpo em bruto para a verificação da assinatura, por isso a rota é
 * registada com bodyParser.raw antes do parser de JSON (ver apiRouter.js).
 *
 * Eventos tratados:
 *   customer.subscription.created|updated  → aplica ou actualiza o plano
 *   customer.subscription.deleted          → volta ao Gratuito
 *   invoice.payment_failed                 → regista, não corta já o acesso
 *
 * checkout.session.completed é deliberadamente ignorado: o Stripe emite sempre
 * customer.subscription.created a seguir, e tratar os dois duplicava trabalho.
 */

const billing = require('../api-util/stripeBilling');
const store = require('../api-util/hostPlanStore');
const { planForPriceId, normalisePlan, FREE, DESTAQUE } = require('../api-util/plans');
const { getIntegrationSdk } = require('../api-util/sdk');

/**
 * De quem é esta subscrição. O ID do utilizador vem dos metadata que gravámos
 * ao criar a sessão de Checkout; se faltar, tenta-se o Customer.
 */
const resolveUserId = async subscription => {
  const fromSubscription = subscription?.metadata?.sharetribeUserId;
  if (fromSubscription) return fromSubscription;

  const customerId =
    typeof subscription?.customer === 'string' ? subscription.customer : subscription?.customer?.id;
  if (!customerId) return null;

  try {
    const customer = await billing.client().customers.retrieve(customerId);
    return customer?.metadata?.sharetribeUserId || null;
  } catch (_) {
    return null;
  }
};

/**
 * Plano correspondente a uma subscrição: primeiro pelo Price ID (a fonte
 * fiável), e só depois pelos metadata, que podem estar desactualizados se o
 * anfitrião trocou de plano dentro do Billing Portal.
 */
const planForSubscription = subscription => {
  const priceId = subscription?.items?.data?.[0]?.price?.id;
  const byPrice = planForPriceId(priceId);
  if (byPrice) return byPrice.plan;

  const fromMetadata = subscription?.metadata?.plan;
  return fromMetadata ? normalisePlan(fromMetadata) : null;
};

/**
 * Destaque de um anúncio: activa enquanto a subscrição estiver boa, desliga
 * quando deixar de estar.
 *
 * Marca-se `featuredSource: 'subscription'` para o job diário de expiração
 * deixar este anúncio em paz. Um destaque pago mensalmente não pode cair ao fim
 * de 30 dias enquanto o cartão continua a ser cobrado — quem manda aqui é o
 * estado da subscrição, não o relógio.
 */
const handleDestaqueChange = async subscription => {
  const listingId = subscription?.metadata?.listingId;
  if (!listingId) {
    console.error('[stripe-webhook] destaque sem listingId:', subscription?.id);
    return;
  }

  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');

  const active = billing.isActiveStatus(subscription.status);

  await sdk.listings.update({
    id: listingId,
    publicData: active
      ? {
          featured: 'true',
          featuredAt: new Date().toISOString(),
          featuredSource: 'subscription',
          featuredSubscriptionId: subscription.id,
          featuredPending: null,
        }
      : {
          featured: 'false',
          featuredSource: null,
          featuredSubscriptionId: null,
          featuredPending: null,
        },
  });

  console.log(
    `[stripe-webhook] destaque ${listingId}: ${subscription.status} → ${active ? 'activo' : 'desligado'}`
  );
};

const handleSubscriptionChange = async subscription => {
  // Uma subscrição de destaque não mexe no plano da conta.
  if (subscription?.metadata?.kind === DESTAQUE.key) {
    return handleDestaqueChange(subscription);
  }

  const userId = await resolveUserId(subscription);
  if (!userId) {
    console.error('[stripe-webhook] subscription without a resolvable user:', subscription?.id);
    return;
  }

  const summary = billing.subscriptionSummary(subscription);
  const plan = planForSubscription(subscription);

  // Uma subscrição que deixou de estar activa não dá direito a plano nenhum,
  // seja qual for o Price. Cobre canceled, unpaid, incomplete_expired e past_due.
  if (!summary.active) {
    await store.revertToFree(userId, summary);
    console.log(`[stripe-webhook] ${userId}: ${subscription.status} → gratuito`);
    return;
  }

  if (!plan) {
    console.error(
      `[stripe-webhook] ${userId}: price ${summary.priceId} não corresponde a nenhum plano`
    );
    return;
  }

  await store.applyPlan(userId, plan, summary);
  console.log(`[stripe-webhook] ${userId}: plano ${plan} (${subscription.status})`);
};

const handleSubscriptionDeleted = async subscription => {
  if (subscription?.metadata?.kind === DESTAQUE.key) {
    return handleDestaqueChange(subscription);
  }
  const userId = await resolveUserId(subscription);
  if (!userId) return;
  await store.revertToFree(userId, billing.subscriptionSummary(subscription));
  console.log(`[stripe-webhook] ${userId}: subscrição terminada → gratuito`);
};

/**
 * Falha de cobrança. Não se corta o plano aqui: o Stripe volta a tentar durante
 * dias e só então passa a subscrição a unpaid ou canceled, o que chega cá como
 * customer.subscription.updated e é tratado em cima. Cortar à primeira falha
 * tirava o plano a quem só teve um cartão recusado uma vez.
 */
const handlePaymentFailed = async invoice => {
  const subscriptionId =
    typeof invoice?.subscription === 'string' ? invoice.subscription : invoice?.subscription?.id;
  console.warn(
    `[stripe-webhook] pagamento falhado: fatura ${invoice?.id}, subscrição ${subscriptionId}`
  );
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
    switch (event.type) {
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
        await handleSubscriptionChange(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      default:
        break;
    }
  } catch (e) {
    // 500 faz o Stripe repetir o evento, que é o que queremos: as operações
    // acima são idempotentes — reescrevem o mesmo estado a partir do mesmo
    // objecto de subscrição.
    console.error(`[stripe-webhook] falha a tratar ${event.type}:`, e?.message || e);
    return res.status(500).json({ error: 'handler-failed' });
  }

  return res.json({ received: true });
};

module.exports = {
  handler,
  // Exportados para teste.
  resolveUserId,
  planForSubscription,
  handleDestaqueChange,
  handleSubscriptionChange,
  FREE,
};
