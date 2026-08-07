/**
 * Stripe — pagamentos únicos (hoje, apenas o destaque de anúncio).
 *
 * Isto é uma integração *nossa*, separada do Stripe que a Sharetribe usa para as
 * transações do marketplace. A Sharetribe trata das reservas e da comissão —
 * que é de onde vem a receita da plataforma — através de Connect e
 * PaymentIntents. Isto trata do que se vende à parte, e convive na mesma conta
 * sem lhe tocar.
 *
 * Usamos Checkout alojado pelo Stripe em vez de Elements: assim nunca passam
 * dados de cartão pelo nosso servidor, e SCA, 3-D Secure, IVA e recibos ficam
 * do lado deles.
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
 * Sessão de Checkout para um pagamento único.
 *
 * Modo "payment", não "subscription": a plataforma não cobra mensalidades a
 * ninguém — vive da comissão por reserva. O que se compra aqui paga-se uma vez.
 *
 * O client_reference_id leva o UUID do utilizador para o webhook não ter de
 * adivinhar de quem é o pagamento.
 */
const createCheckoutSession = async ({
  customerId,
  priceId,
  userId,
  successUrl,
  cancelUrl,
  locale,
  extraMetadata,
}) => {
  const stripe = client();
  const metadata = { sharetribeUserId: userId, ...(extraMetadata || {}) };
  return stripe.checkout.sessions.create({
    mode: 'payment',
    customer: customerId,
    client_reference_id: userId,
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    locale: locale === 'en' ? 'en' : 'pt',
    // A morada de faturação é precisa para o IVA e para o Stripe emitir recibo.
    billing_address_collection: 'required',
    automatic_tax: { enabled: false },
    metadata,
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

module.exports = {
  isConfigured,
  client,
  __setClient,
  ensureCustomer,
  createCheckoutSession,
  constructWebhookEvent,
};
