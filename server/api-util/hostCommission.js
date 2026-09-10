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
  // `customer` é 5% em todos os modelos.
  //
  // Standard subiu de 10% para 12,5% em 2026-09-10. Não é retroactivo: quem já
  // tem `commissionModel: 'standard'` gravado passa a pagar 12,5% na reserva
  // seguinte, porque a percentagem é lida daqui a cada cálculo e só o *nome* do
  // modelo é que fica preso à conta. A condição de fundador é a única que se
  // prometeu vitalícia, e essa não muda.
  standard: { provider: 12.5, customer: 5 },
  // Condição de fundador: metade da comissão, para quem se registou até à data
  // limite da campanha de lançamento. É vitalícia — foi o que se prometeu — e
  // por isso fica gravada na conta em vez de ser recalculada a cada reserva.
  // Se um dia a data limite mudar, quem já a tem não a perde.
  fundador: { provider: 5, customer: 5 },
  // ATENÇÃO: com o Standard a 12,5%, o Premium ficou mais barato do que o
  // modelo base — o que inverte o sentido dos dois nomes. Nenhuma conta usa
  // Premium hoje, por isso não se mexeu; se um dia se atribuir, é preciso
  // decidir antes qual deve ser a percentagem.
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

/**
 * Data limite da condição de fundador, como instante ISO.
 *
 * Sem a variável definida não há campanha nenhuma: ninguém é marcado como
 * fundador e toda a gente fica no valor da Console. Preferimos isso a assumir
 * uma data — dar 5% por engano é dinheiro que não se recupera.
 *
 * FOUNDER_COMMISSION_UNTIL, ex.: 2026-12-31T23:59:59Z
 */
const limiteFundador = () => {
  const raw = process.env.FOUNDER_COMMISSION_UNTIL;
  if (!raw) return null;
  const t = Date.parse(raw);
  if (Number.isNaN(t)) {
    console.error(`[comissão] FOUNDER_COMMISSION_UNTIL inválido: ${raw}`);
    return null;
  }
  return t;
};

/** Tipos de conta que ganham comissão e por isso entram na campanha. */
const tiposComComissao = () =>
  (process.env.FOUNDER_COMMISSION_USER_TYPES || 'anunciante,prestador_de_servicos')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);

/**
 * Número máximo de contas com condição de fundador.
 *
 * A campanha acaba no que vier primeiro: a data limite ou as vagas esgotadas.
 * FOUNDER_COMMISSION_MAX, por omissão 100.
 */
const vagasFundador = () => {
  const raw = parseInt(process.env.FOUNDER_COMMISSION_MAX, 10);
  return Number.isNaN(raw) ? 100 : raw;
};

/**
 * Quantas contas já têm a condição de fundador.
 *
 * Conta-se por varredura em vez de se guardar um contador: um contador à parte
 * dessincroniza-se do que está gravado nas contas — e nesse caso o número em que
 * confiamos deixa de corresponder a quem tem mesmo o desconto. A varredura é
 * lenta mas nunca mente.
 *
 * Só é feita para contas ainda por marcar, o que na prática é uma vez por
 * utilizador.
 */
const contarFundadores = async sdk => {
  let total = 0;
  for (let page = 1; page <= 20; page++) {
    const res = await sdk.users.query({ page, perPage: 100 });
    const batch = res?.data?.data || [];
    total += batch.filter(u => u.attributes?.profile?.metadata?.commissionModel === 'fundador')
      .length;
    const totalPages = res?.data?.meta?.totalPages || 1;
    if (page >= totalPages || batch.length === 0) break;
  }
  return total;
};

/**
 * Que modelo esta conta deve ter, olhando para a data de registo.
 *
 * Não decide sobre as vagas — isso depende do estado das outras contas e é
 * resolvido em `ensureCommissionModel`, o mais perto possível da escrita.
 *
 * @returns {'fundador'|'standard'|null} null quando a conta não ganha comissão
 *   ou quando não há campanha configurada.
 */
const modeloParaConta = user => {
  const limite = limiteFundador();
  if (limite == null) return null;

  const perfil = user?.attributes?.profile || {};
  if (!tiposComComissao().includes(perfil.publicData?.userType)) return null;

  const criadoEm = Date.parse(user?.attributes?.createdAt);
  if (Number.isNaN(criadoEm)) return null;

  return criadoEm <= limite ? 'fundador' : 'standard';
};

/**
 * Grava o modelo de comissão na conta, se ainda não tiver um.
 *
 * Porque é que se grava em vez de se calcular a cada reserva: a condição de
 * fundador é uma promessa vitalícia. Recalculá-la a partir da data limite
 * significava que mexer nessa data mudava retroactivamente o que já tinha sido
 * prometido a quem se registou. Gravado, o compromisso fica preso à conta.
 *
 * Nunca sobrepõe um modelo existente. Um anfitrião com condições negociadas
 * (premium, enterprise) mantém-nas; e um fundador não é despromovido no dia
 * seguinte ao fim da campanha.
 *
 * Vive em `metadata` e não em `publicData` porque só a Integration API lá
 * escreve — ninguém baixa a sua própria comissão editando o perfil.
 *
 * @returns {Promise<string|null>} o modelo gravado, ou null se nada mudou
 */
const ensureCommissionModel = async (sdk, user, opcoes = {}) => {
  const uid = user?.id?.uuid;
  if (!sdk || !uid) return null;

  const metadata = user?.attributes?.profile?.metadata || {};
  if (metadata.commissionModel) return null;

  let modelo = modeloParaConta(user);
  if (!modelo) return null;

  // As vagas são contadas aqui, e não em `modeloParaConta`, para a contagem ser
  // o mais recente possível antes da escrita. Quem chega com as vagas
  // esgotadas fica em standard, mesmo tendo-se registado dentro do prazo — foi
  // o que se anunciou: acaba no que vier primeiro.
  //
  // Quem chama em série (o script de marcação) passa a contagem que já tem, em
  // vez de mandar varrer os utilizadores a cada conta.
  if (modelo === 'fundador') {
    const vagas = vagasFundador();
    const ocupadas =
      typeof opcoes.jaMarcados === 'number' ? opcoes.jaMarcados : await contarFundadores(sdk);
    if (ocupadas >= vagas) {
      console.log(`[comissão] vagas de fundador esgotadas (${ocupadas}/${vagas}) — ${uid} fica standard`);
      modelo = 'standard';
    }
  }

  await sdk.users.updateProfile({
    id: uid,
    metadata: { commissionModel: modelo, commissionModelSetAt: new Date().toISOString() },
  });
  console.log(`[comissão] ${uid} marcado como ${modelo}`);
  return modelo;
};

module.exports = {
  MODELS,
  ENTERPRISE_MIN,
  ENTERPRISE_MAX,
  commissionModelFor,
  resolveCommission,
  hostMetadataFrom,
  limiteFundador,
  vagasFundador,
  contarFundadores,
  modeloParaConta,
  ensureCommissionModel,
};
