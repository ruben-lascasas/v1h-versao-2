/**
 * Pagamento do destaque de um anúncio.
 *
 *   POST /api/destaque/checkout   abre uma sessão de Checkout para um anúncio
 *
 * Pagamento único: 9,99 € por período de destaque. Não é subscrição — a
 * plataforma não cobra mensalidades, vive da comissão por reserva.
 *
 * Antes disto, a página de destaques mostrava um formulário de cartão que nunca
 * cobrava nada: o elemento do Stripe era criado e nunca lido.
 *
 * Quem activa o destaque é o webhook, depois de o Stripe confirmar a cobrança.
 * A posse do anúncio é verificada aqui com ownListings.show, que só devolve
 * anúncios da sessão em curso — ninguém consegue destacar o anúncio de outro.
 */

const { getSdk } = require('../api-util/sdk');
const billing = require('../api-util/stripeBilling');
const { destaquePriceId, DESTAQUE } = require('../api-util/plans');

const ROOT_URL = () => process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'http://localhost:3000';

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

/** true se o anúncio for mesmo de quem está a pedir. */
const ownsListing = async (req, res, listingId) => {
  try {
    const sdk = getSdk(req, res);
    const response = await sdk.ownListings.show({ id: listingId });
    return Boolean(response?.data?.data?.id?.uuid);
  } catch (_) {
    return false;
  }
};

/**
 * POST /api/destaque/checkout
 * Body: { listingId }
 */
const checkout = async (req, res) => {
  const user = await loadCaller(req, res);
  if (!user) return res.status(401).json({ error: 'not-authenticated' });
  if (!billing.isConfigured()) return res.status(503).json({ error: 'billing-not-configured' });

  const priceId = destaquePriceId();
  if (!priceId) return res.status(503).json({ error: 'price-not-configured' });

  const listingId = req.body?.listingId;
  if (!listingId) return res.status(400).json({ error: 'missing-listing' });
  if (!(await ownsListing(req, res, listingId))) {
    return res.status(403).json({ error: 'not-your-listing' });
  }

  try {
    // Um Customer por anfitrião, para os recibos do Stripe saírem em nome
    // dele. Não se guarda o id do nosso lado: o Stripe encontra-o pelo email, e
    // um pagamento único não precisa de o reutilizar.
    const customerId = await billing.ensureCustomer({
      userId: user.id.uuid,
      email: user.attributes?.email,
      name: user.attributes?.profile?.firstName || null,
    });

    const root = ROOT_URL();
    const session = await billing.createCheckoutSession({
      customerId,
      priceId,
      userId: user.id.uuid,
      successUrl: `${root}/destacar-anuncio?destaque=sucesso`,
      cancelUrl: `${root}/destacar-anuncio?destaque=cancelado`,
      locale: req.body?.locale,
      // É por aqui que o webhook sabe que este pagamento é um destaque e de
      // que anúncio.
      extraMetadata: { kind: DESTAQUE.key, listingId },
    });

    return res.json({ url: session.url });
  } catch (e) {
    console.error('[destaque] checkout failed:', e?.message || e);
    return res.status(500).json({ error: 'checkout-failed' });
  }
};

module.exports = { checkout };
