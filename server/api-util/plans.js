/**
 * Destaque de anúncio — a única coisa que se compra à parte.
 *
 * ── Porque é que isto já não tem planos ───────────────────────────────────
 * O plano de negócios previa subscrições mensais para os anfitriões (§8.3).
 * A cliente decidiu não seguir por aí: a plataforma vive da comissão por
 * reserva, e o anfitrião só paga na medida do que ganha. Essa comissão é
 * nativa da Sharetribe — vem do asset `transactions/commission.json` da Console
 * e é aplicada nos line items — por isso não há aqui nada a fazer por ela.
 *
 * O que resta de pago à parte é o destaque, e passou a pagamento único em vez
 * de subscrição, pela mesma razão: não se cobra mensalidade a ninguém.
 *
 * O motor de comissão por anfitrião continua em hostCommission.js, para se
 * poderem negociar condições com operadores grandes. Não depende disto.
 */

/**
 * Destaque: um pagamento, e o anúncio fica em destaque durante o período que o
 * job de expiração aplica (FEATURED_EXPIRY_DAYS, 30 dias por omissão).
 */
const DESTAQUE = {
  key: 'destaque',
  price: 9.99,
  priceEnv: 'STRIPE_PRICE_DESTAQUE',
};

/**
 * ID do Price do Stripe para o destaque, lido do ambiente porque é criado na
 * conta e difere entre teste e produção. Tem de ser um preço de pagamento
 * único, não recorrente.
 */
const destaquePriceId = () => process.env[DESTAQUE.priceEnv] || null;

module.exports = { DESTAQUE, destaquePriceId };
