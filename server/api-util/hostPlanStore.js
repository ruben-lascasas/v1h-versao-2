/**
 * Leitura e escrita do estado de faturação de um anfitrião.
 *
 * Divisão dos dados, que não é arbitrária:
 *
 *   metadata     plan, commissionModel, commissionProviderPercentage
 *                → público e só escrito pela Integration API. Tem de ser
 *                  metadata porque é daqui que o hostCommission.js decide a
 *                  comissão; se vivesse em publicData, o anfitrião baixava a
 *                  sua própria taxa a partir do formulário do perfil.
 *
 *   privateData  stripeCustomerId, subscription
 *                → não é público. A identificação de faturação de um anfitrião
 *                  não tem de estar à vista de toda a gente.
 */

const { getIntegrationSdk } = require('./sdk');
const { normalisePlan, metadataForPlan, FREE } = require('./plans');

const sdkOrThrow = () => {
  const sdk = getIntegrationSdk();
  if (!sdk) throw new Error('integration-sdk-not-configured');
  return sdk;
};

/**
 * Estado de faturação de um utilizador.
 * @returns {Promise<{plan, stripeCustomerId, subscription, email, name}>}
 */
const load = async userId => {
  const sdk = sdkOrThrow();
  const response = await sdk.users.show({ id: userId });
  const user = response?.data?.data;
  const profile = user?.attributes?.profile || {};
  const billing = profile.privateData?.billing || {};

  return {
    plan: normalisePlan(profile.metadata?.plan),
    commissionModel: profile.metadata?.commissionModel || null,
    commissionProviderPercentage:
      typeof profile.metadata?.commissionProviderPercentage === 'number'
        ? profile.metadata.commissionProviderPercentage
        : null,
    stripeCustomerId: billing.stripeCustomerId || null,
    subscription: billing.subscription || null,
    email: user?.attributes?.email || null,
    name: [profile.firstName, profile.lastName].filter(Boolean).join(' ') || null,
  };
};

/** Guarda o ID de Customer do Stripe sem tocar em mais nada. */
const saveCustomerId = async (userId, stripeCustomerId) => {
  const sdk = sdkOrThrow();
  const current = await load(userId);
  await sdk.users.updateProfile({
    id: userId,
    // billing é reescrito por inteiro, por isso a subscrição existente vai
    // junto; o resto de privateData (verificação) não é tocado.
    privateData: { billing: { stripeCustomerId, subscription: current.subscription || null } },
  });
};

/**
 * Aplica um plano ao anfitrião: escreve o plano e o modelo de comissão em
 * metadata, e o resumo da subscrição em privateData, numa só chamada.
 *
 * @param {string} userId
 * @param {string} planKey
 * @param {Object|null} subscription resumo de stripeBilling.subscriptionSummary
 * @param {string} [stripeCustomerId] mantido se não for passado
 */
const applyPlan = async (userId, planKey, subscription, stripeCustomerId) => {
  const sdk = sdkOrThrow();
  const current = await load(userId);
  const plan = normalisePlan(planKey);

  // No plano Enterprise a percentagem é negociada à mão. metadataForPlan não a
  // devolve nesse caso, e nós não a apagamos: uma negociação já gravada tem de
  // sobreviver a uma renovação de subscrição.
  const metadata = metadataForPlan(plan);
  const keepNegotiated =
    metadata.commissionProviderPercentage === undefined &&
    typeof current.commissionProviderPercentage === 'number'
      ? { commissionProviderPercentage: current.commissionProviderPercentage }
      : {};

  await sdk.users.updateProfile({
    id: userId,
    metadata: { ...metadata, ...keepNegotiated },
    privateData: {
      billing: {
        stripeCustomerId: stripeCustomerId || current.stripeCustomerId || null,
        subscription: subscription || null,
      },
    },
  });

  return { plan, metadata: { ...metadata, ...keepNegotiated } };
};

/** Volta ao Gratuito, mantendo o Customer para futuras subscrições. */
const revertToFree = (userId, subscription = null) =>
  applyPlan(userId, FREE, subscription);

module.exports = { load, saveCustomerId, applyPlan, revertToFree };
