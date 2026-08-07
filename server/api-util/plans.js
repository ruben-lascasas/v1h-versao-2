/**
 * Catálogo de planos de subscrição do anfitrião (§8.3 do plano de negócios) e a
 * sua ligação aos modelos de comissão do §8.2.
 *
 * ── Porque é que o mapeamento é este ──────────────────────────────────────
 * O plano de negócios descreve os dois eixos separadamente e só liga o Plano
 * Gratuito ao Modelo Standard. A leitura literal — Pro a pagar comissão Premium
 * — faz o Pro custar sempre mais do que não ter plano nenhum: 19 €/mês mais 12%
 * contra 0 €/mês e 10% nunca compensa, seja qual for o volume de reservas. A
 * escada só fecha se a subscrição comprar funcionalidades ou comissão mais
 * baixa, nunca as duas ao contrário:
 *
 *   Gratuito  0 €/mês  + 10%  →  referência
 *   Pro      19 €/mês  + 10%  →  paga-se pelas funcionalidades, comissão igual
 *   Business 59 €/mês  +  8%  →  compensa-se acima de ~2.950 €/mês de reservas
 *   Enterprise  sob consulta  →  comissão negociada caso a caso (8% a 12%)
 *
 * O Modelo Premium (12%+5%) fica onde o plano de facto o descreve: uma opção
 * avulsa para quem não assina nada mas quer destaque nas pesquisas — paga mais
 * por reserva em vez de mensalidade. Não é atribuído por nenhuma subscrição.
 *
 * Mudar de ideias custa uma linha em COMMISSION_MODEL_BY_PLAN.
 */

const FREE = 'gratuito';
const PRO = 'pro';
const BUSINESS = 'business';
const ENTERPRISE = 'enterprise';

const PLAN_KEYS = [FREE, PRO, BUSINESS, ENTERPRISE];

/** Plano → modelo de comissão aplicado. Ver a nota acima. */
const COMMISSION_MODEL_BY_PLAN = {
  [FREE]: 'standard',
  [PRO]: 'standard',
  [BUSINESS]: 'enterprise',
  [ENTERPRISE]: 'enterprise',
};

/**
 * Percentagem do anfitrião para os planos que caem no modelo Enterprise, que é
 * negociável. O Business tem um valor de tabela; o Enterprise fica sem valor
 * para que a negociação real seja gravada à mão, caso a caso.
 */
const NEGOTIATED_PROVIDER_PERCENTAGE = {
  [BUSINESS]: 8,
};

/**
 * Preços indicativos do §8.3. Os IDs de Price vêm do ambiente porque são
 * criados na conta Stripe e diferem entre teste e produção.
 */
const PLANS = {
  [FREE]: {
    key: FREE,
    label: 'Gratuito',
    labelEN: 'Free',
    monthly: 0,
    yearly: 0,
    purchasable: false,
  },
  [PRO]: {
    key: PRO,
    label: 'Pro',
    labelEN: 'Pro',
    monthly: 19,
    yearly: 190,
    purchasable: true,
    priceEnv: { month: 'STRIPE_PRICE_PRO_MONTH', year: 'STRIPE_PRICE_PRO_YEAR' },
  },
  [BUSINESS]: {
    key: BUSINESS,
    label: 'Business',
    labelEN: 'Business',
    monthly: 59,
    yearly: 590,
    purchasable: true,
    priceEnv: { month: 'STRIPE_PRICE_BUSINESS_MONTH', year: 'STRIPE_PRICE_BUSINESS_YEAR' },
  },
  [ENTERPRISE]: {
    key: ENTERPRISE,
    label: 'Enterprise',
    labelEN: 'Enterprise',
    monthly: null, // sob consulta
    yearly: null,
    // Não se compra sozinho: é negociado e atribuído à mão.
    purchasable: false,
  },
};

const isPlanKey = key => PLAN_KEYS.includes(key);

/** Normaliza o que vier da metadata; desconhecido ou ausente é Gratuito. */
const normalisePlan = value => {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : null;
  return isPlanKey(key) ? key : FREE;
};

/**
 * O que se escreve na metadata do anfitrião quando o plano muda. É esta função
 * que liga as subscrições ao motor de comissões: devolve exactamente as chaves
 * que o hostCommission.js lê.
 *
 * @param {string} planKey
 * @returns {Object} campos de metadata
 */
const metadataForPlan = planKey => {
  const plan = normalisePlan(planKey);
  const commissionModel = COMMISSION_MODEL_BY_PLAN[plan];
  const negotiated = NEGOTIATED_PROVIDER_PERCENTAGE[plan];

  return {
    plan,
    commissionModel,
    // Só se escreve quando há valor de tabela. No plano Enterprise fica a null
    // para não sobrepor uma negociação já gravada à mão.
    ...(typeof negotiated === 'number' ? { commissionProviderPercentage: negotiated } : {}),
  };
};

/**
 * ID do Price do Stripe para um plano e periodicidade, lido do ambiente.
 * @returns {string|null} null se o plano não se compra ou o ID não está definido
 */
const priceIdFor = (planKey, interval) => {
  const plan = PLANS[normalisePlan(planKey)];
  if (!plan?.purchasable) return null;
  const envName = plan.priceEnv?.[interval];
  return envName ? process.env[envName] || null : null;
};

/** Plano correspondente a um Price ID, para o sentido inverso (webhooks). */
const planForPriceId = priceId => {
  if (!priceId) return null;
  for (const key of PLAN_KEYS) {
    const plan = PLANS[key];
    if (!plan.purchasable) continue;
    for (const interval of ['month', 'year']) {
      const envName = plan.priceEnv?.[interval];
      if (envName && process.env[envName] === priceId) return { plan: key, interval };
    }
  }
  return null;
};

/** Catálogo para o frontend, sem nada que só interesse ao servidor. */
const publicCatalogue = () =>
  PLAN_KEYS.map(key => {
    const { priceEnv, ...rest } = PLANS[key];
    return {
      ...rest,
      commissionModel: COMMISSION_MODEL_BY_PLAN[key],
      providerPercentage: NEGOTIATED_PROVIDER_PERCENTAGE[key] ?? null,
      available: PLANS[key].purchasable
        ? Boolean(priceIdFor(key, 'month') || priceIdFor(key, 'year'))
        : true,
    };
  });

module.exports = {
  FREE,
  PRO,
  BUSINESS,
  ENTERPRISE,
  PLAN_KEYS,
  PLANS,
  COMMISSION_MODEL_BY_PLAN,
  NEGOTIATED_PROVIDER_PERCENTAGE,
  isPlanKey,
  normalisePlan,
  metadataForPlan,
  priceIdFor,
  planForPriceId,
  publicCatalogue,
};
