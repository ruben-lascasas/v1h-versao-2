/**
 * Modelo de comissionamento por anfitrião.
 *
 * A Console define uma comissão única para todo o marketplace. O plano de
 * negócios (§8.2) prevê três modelos — Standard, Premium e Enterprise — que
 * variam por anfitrião. Este módulo sobrepõe a percentagem da Console quando o
 * anfitrião tem um modelo atribuído, e não faz nada quando não tem: sem
 * metadata, o comportamento é exactamente o de hoje.
 *
 * O modelo vive em `profile.metadata` do anfitrião, e não em `publicData`,
 * porque metadata só é escrita pela Integration API. Um anfitrião não pode
 * baixar a sua própria comissão editando o perfil.
 *
 * Nota sobre a ambiguidade do plano: o documento descreve dois eixos — modelos
 * de comissão (Standard/Premium/Enterprise) e planos de subscrição
 * (Gratuito/Pro/Business/Enterprise) — e só liga explicitamente o Plano
 * Gratuito ao Modelo Standard. Não inventámos o resto do mapeamento: o modelo é
 * um atributo próprio, e a decisão de "o Pro implica Premium?" fica a cargo de
 * quem escreve a metadata, sem alterar código.
 */

const MODELS = {
  // Percentagens do §8.2. `customer` é 5% em todos os modelos.
  standard: { provider: 10, customer: 5 },
  premium: { provider: 12, customer: 5 },
  // Enterprise é negociado caso a caso, entre 8% e 12%. Sem valor negociado
  // fica no topo do intervalo — o anfitrião nunca beneficia de um desconto que
  // ninguém lhe concedeu por engano.
  enterprise: { provider: 12, customer: 5, negotiable: true },
};

const ENTERPRISE_MIN = 8;
const ENTERPRISE_MAX = 12;

const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

/**
 * Percentagem do anfitrião para um modelo, aplicando o valor negociado quando o
 * modelo o permite. Valores fora do intervalo acordado são trazidos para dentro
 * dele em vez de aceites: um erro de digitação não deve custar comissão.
 */
const providerPercentage = (model, negotiated) => {
  if (!model.negotiable || typeof negotiated !== 'number' || isNaN(negotiated)) {
    return model.provider;
  }
  return clamp(negotiated, ENTERPRISE_MIN, ENTERPRISE_MAX);
};

/**
 * Lê o modelo de comissão da metadata de um anfitrião.
 *
 * @param {Object} metadata `profile.metadata` do anfitrião
 * @returns {Object|null} `{ key, provider, customer }` ou null se não houver
 *   modelo atribuído ou se o nome não for reconhecido.
 */
const commissionModelFor = metadata => {
  const key = typeof metadata?.commissionModel === 'string'
    ? metadata.commissionModel.trim().toLowerCase()
    : null;
  const model = key ? MODELS[key] : null;
  if (!model) return null;

  return {
    key,
    provider: providerPercentage(model, metadata?.commissionProviderPercentage),
    customer: model.customer,
  };
};

/**
 * Aplica o modelo do anfitrião à comissão vinda da Console.
 *
 * Só a percentagem é substituída. Tudo o resto que a Console traga — em
 * particular `minimum_amount` — é preservado, porque um mínimo continua a ser um
 * mínimo seja qual for o modelo.
 *
 * @param {Object} base `{ providerCommission, customerCommission }` da Console
 * @param {Object} hostMetadata `profile.metadata` do anfitrião
 * @returns {Object} `{ providerCommission, customerCommission, appliedModel }`
 */
const resolveCommission = (base, hostMetadata) => {
  const { providerCommission, customerCommission } = base || {};
  const model = commissionModelFor(hostMetadata);

  if (!model) {
    return { providerCommission, customerCommission, appliedModel: null };
  }

  return {
    providerCommission: { ...(providerCommission || {}), percentage: model.provider },
    customerCommission: { ...(customerCommission || {}), percentage: model.customer },
    appliedModel: model.key,
  };
};

/**
 * Encontra a metadata do anfitrião numa resposta que tenha vindo com
 * `include: ['author']` (ou `['listing.author']`).
 *
 * Devolve `{}` quando o autor não vem incluído, o que faz `resolveCommission`
 * cair no valor da Console. Preferimos isso a falhar o cálculo do preço.
 */
const hostMetadataFrom = apiResponse => {
  const included = apiResponse?.data?.included || [];
  const author = included.find(r => r.type === 'user');
  return author?.attributes?.profile?.metadata || {};
};

module.exports = {
  MODELS,
  ENTERPRISE_MIN,
  ENTERPRISE_MAX,
  commissionModelFor,
  resolveCommission,
  hostMetadataFrom,
};
