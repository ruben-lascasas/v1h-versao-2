/**
 * Subscrições do anfitrião (§8.3 do plano de negócios).
 *
 *   GET  /api/subscriptions          plano actual, estado e catálogo
 *   POST /api/subscriptions/checkout abre uma sessão de Checkout do Stripe
 *   POST /api/subscriptions/portal   abre o Billing Portal do Stripe
 *
 * Auth: sessão SDK. O utilizador vem sempre de currentUser.show(), nunca do
 * corpo do pedido, por isso ninguém consegue assinar um plano em nome de outro.
 *
 * Quem muda o plano é o webhook, não estes endpoints. O Checkout devolve o
 * utilizador ao site antes de o Stripe confirmar a cobrança; escrever o plano
 * no regresso do Checkout daria plano a quem fechasse o separador a meio do
 * pagamento. Ver stripe-webhook.js.
 */

const { getSdk } = require('../api-util/sdk');
const billing = require('../api-util/stripeBilling');
const store = require('../api-util/hostPlanStore');
const { publicCatalogue, priceIdFor, normalisePlan, PLANS } = require('../api-util/plans');

const ROOT_URL = () =>
  process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'http://localhost:3000';

const loadCaller = async (req, res) => {
  try {
    const sdk = getSdk(req, res);
    const response = await sdk.currentUser.show();
    const user = response?.data?.data;
    return user?.id?.uuid ? user : null;
  } catch (_) {
    return null;
  }
};

/**
 * GET /api/subscriptions
 */
const status = async (req, res) => {
  const user = await loadCaller(req, res);
  if (!user) return res.status(401).json({ error: 'not-authenticated' });

  try {
    const state = await store.load(user.id.uuid);
    return res.json({
      plan: state.plan,
      commissionModel: state.commissionModel,
      subscription: state.subscription,
      catalogue: publicCatalogue(),
      // O frontend precisa de saber se pode sequer mostrar os botões.
      billingConfigured: billing.isConfigured(),
    });
  } catch (e) {
    console.error('[subscriptions] status failed:', e?.message || e);
    return res.status(500).json({ error: 'status-failed' });
  }
};

/**
 * POST /api/subscriptions/checkout
 * Body: { plan, interval } — interval é 'month' ou 'year'.
 */
const checkout = async (req, res) => {
  const user = await loadCaller(req, res);
  if (!user) return res.status(401).json({ error: 'not-authenticated' });
  if (!billing.isConfigured()) return res.status(503).json({ error: 'billing-not-configured' });

  const plan = normalisePlan(req.body?.plan);
  const interval = req.body?.interval === 'year' ? 'year' : 'month';

  if (!PLANS[plan]?.purchasable) {
    return res.status(400).json({ error: 'plan-not-purchasable' });
  }
  const priceId = priceIdFor(plan, interval);
  if (!priceId) return res.status(503).json({ error: 'price-not-configured' });

  try {
    const state = await store.load(user.id.uuid);
    const customerId = await billing.ensureCustomer({
      userId: user.id.uuid,
      email: state.email,
      name: state.name,
      existingCustomerId: state.stripeCustomerId,
    });

    if (customerId !== state.stripeCustomerId) {
      await store.saveCustomerId(user.id.uuid, customerId);
    }

    const root = ROOT_URL();
    const session = await billing.createCheckoutSession({
      customerId,
      priceId,
      userId: user.id.uuid,
      planKey: plan,
      successUrl: `${root}/subscricoes?checkout=sucesso`,
      cancelUrl: `${root}/subscricoes?checkout=cancelado`,
      locale: req.body?.locale,
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('[subscriptions] checkout failed:', e?.message || e);
    return res.status(500).json({ error: 'checkout-failed' });
  }
};

/**
 * POST /api/subscriptions/portal
 */
const portal = async (req, res) => {
  const user = await loadCaller(req, res);
  if (!user) return res.status(401).json({ error: 'not-authenticated' });
  if (!billing.isConfigured()) return res.status(503).json({ error: 'billing-not-configured' });

  try {
    const state = await store.load(user.id.uuid);
    if (!state.stripeCustomerId) return res.status(400).json({ error: 'no-customer' });

    const session = await billing.createPortalSession({
      customerId: state.stripeCustomerId,
      returnUrl: `${ROOT_URL()}/subscricoes`,
    });
    return res.json({ url: session.url });
  } catch (e) {
    console.error('[subscriptions] portal failed:', e?.message || e);
    return res.status(500).json({ error: 'portal-failed' });
  }
};

module.exports = { status, checkout, portal };
