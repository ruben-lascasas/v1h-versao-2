/**
 * Stripe Billing — subscrições dos anfitriões (§8.3) e destaques recorrentes.
 *
 * Isto é uma integração *nossa*, separada do Stripe que a Sharetribe usa para as
 * transações do marketplace. A API da Sharetribe não tem cobrança recorrente:
 * ela cria PaymentIntents por reserva, não subscrições. As duas convivem na
 * mesma conta Stripe sem se tocarem — a Sharetribe mexe em Connect e
 * PaymentIntents, isto mexe em Customers, Prices e Subscriptions.
 *
 * Usamos Checkout alojado pelo Stripe em vez de Elements: assim nunca passam
 * dados de cartão pelo nosso servidor, e SCA, 3-D Secure, IVA e recibos ficam
 * do lado deles. O cancelamento e a troca de cartão vão para o Billing Portal
 * pela mesma razão.
 */

const Stripe = require('stripe');

const SECRET = () => process.env.STRIPE_SECRET_KEY;
const WEBHOOK_SECRET = () => process.env.STRIPE_WEBHOOK_SECRET;

let cached = null;
let cachedKey = null;

/** true quando há chave configurada. Sem ela, tudo isto fica inerte. */
const isConfigured = () => Boolean(SECRET());

/**
 * Cliente Stripe, criado à primeira utilização. Recriado se a chave mudar, o
 * que só acontece em testes.
 */
const client = () => {
  const key = SECRET();
  if (!key) throw new Error('STRIPE_SECRET_KEY is not configured');
  if (!cached || cachedKey !== key) {
    cached = new Stripe(key, { apiVersion: '2024-06-20' });
    cachedKey = key;
  }
  return cached;
};

/** Só para testes: injectar um duplo e limpar a seguir. */
const __setClient = fake => {
  cached = fake;
  cachedKey = SECRET();
};

/**
 * Customer do Stripe correspondente a um utilizador da Sharetribe.
 *
 * O ID fica em `privateData` e não em `metadata`: metadata é público, e não há
 * razão para expor a identificação de faturação de um anfitrião. A ligação no
 * sentido inverso vai nos metadata do próprio Customer, para que quem esteja no
 * painel do Stripe saiba de quem se trata.
 *
 * @param {Object} params
 * @param {string} params.userId    UUID Sharetribe
 * @param {string} params.email
 * @param {string} [params.name]
 * @param {string} [params.existingCustomerId] o que já estiver em privateData
 * @returns {Promise<string>} customer id
 */
const ensureCustomer = async ({ userId, email, name, existingCustomerId }) => {
  const stripe = client();

  if (existingCustomerId) {
    try {
      const found = await stripe.customers.retrieve(existingCustomerId);
      // Um customer apagado no painel do Stripe volta como deleted em vez de
      // dar erro; nesse caso cria-se outro em vez de rebentar mais à frente.
      if (found && !found.deleted) return found.id;
    } catch (e) {
      if (e?.statusCode !== 404) throw e;
    }
  }

  const created = await stripe.customers.create({
    email,
    name: name || undefined,
    metadata: { sharetribeUserId: userId },
  });
  return created.id;
};

/**
 * Sessão de Checkout para assinar um plano.
 *
 * `client_reference_id` leva o UUID do utilizador para o webhook não ter de
 * adivinhar de quem é a subscrição.
 */
const createCheckoutSession = async ({
  customerId,
  priceId,
  userId,
  planKey,
  successUrl,
  cancelUrl,
  locale,
  extraMetadata,
}) => {
  const stripe = client();
  // Os metadata vão à sessão e à subscrição: o webhook lê os da subscrição, que
  // é o objecto que chega nos eventos de renovação e cancelamento.
  const metadata = { sharetribeUserId: userId, plan: planKey, ...(extraMetadata || {}) };
  return stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: locale === 'en' ? 'en' : 'pt',
    // Recolher a morada de faturação é necessário para o IVA e é o que
    // permite ao Stripe emitir recibos corretos.
    billing_address_collection: 'required',
    automatic_tax: { enabled: false },
    subscription_data: { metadata },
    metadata,
  });
};

/** Portal de faturação: mudar cartão, ver recibos, cancelar. */
const createPortalSession = async ({ customerId, returnUrl }) => {
  const stripe = client();
  return stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
};

/**
 * Valida a assinatura do webhook e devolve o evento.
 * @throws quando a assinatura não bate certo — nunca confiar no corpo sem isto.
 */
const constructWebhookEvent = (rawBody, signature) => {
  const secret = WEBHOOK_SECRET();
  if (!secret) throw new Error('STRIPE_WEBHOOK_SECRET is not configured');
  return client().webhooks.constructEvent(rawBody, signature, secret);
};

/** Estados do Stripe que significam "esta subscrição dá direito ao plano". */
const ACTIVE_STATUSES = ['active', 'trialing'];

const isActiveStatus = status => ACTIVE_STATUSES.includes(status);

/**
 * Reduz uma subscrição do Stripe ao que guardamos.
 *
 * Guarda-se o mínimo: o suficiente para mostrar o estado ao anfitrião e para
 * decidir a comissão. Tudo o resto vive no Stripe, que é onde está a verdade.
 */
const subscriptionSummary = subscription => {
  if (!subscription) return null;
  const item = subscription.items?.data?.[0];
  return {
    id: subscription.id,
    status: subscription.status,
    active: isActiveStatus(subscription.status),
    priceId: item?.price?.id || null,
    interval: item?.price?.recurring?.interval || null,
    cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end),
    currentPeriodEnd: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
  };
};

const getSubscription = async id => client().subscriptions.retrieve(id);

module.exports = {
  isConfigured,
  client,
  __setClient,
  ensureCustomer,
  createCheckoutSession,
  createPortalSession,
  constructWebhookEvent,
  subscriptionSummary,
  isActiveStatus,
  ACTIVE_STATUSES,
  getSubscription,
};
