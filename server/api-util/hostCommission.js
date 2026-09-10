/**
 * Comissão por conta.
 *
 * Só existem dois modelos, e são estes:
 *
 *   fundador  — 5% ao anfitrião. Quem se registou dentro do prazo da campanha
 *                de lançamento e dentro das vagas anunciadas. É vitalício.
 *   standard  — 12,5% ao anfitrião. Toda a gente a partir daí.
 *
 * Aplica-se a `anunciante` e a `prestador_de_servicos`, que são as contas que
 * publicam e recebem dinheiro. Não há mais planos, escalões ou percentagens
 * negociadas.
 *
 * O modelo vive em `profile.metadata` do anfitrião, e não em `publicData`,
 * porque metadata só é escrita pela Integration API. Um anfitrião não pode
 * baixar a sua própria comissão editando o perfil.
 *
 * A CONSOLE NÃO MANDA AQUI
 *
 * A Console tem um campo de comissão único para todo o marketplace, e não sabe
 * distinguir um fundador de um standard. Este módulo é que decide: sem modelo
 * gravado aplica-se o standard, não o valor da Console. Assim há um só sítio
 * onde a percentagem vive, e não existe janela nenhuma — entre o registo e a
 * primeira marcação do modelo — em que uma reserva sairia à taxa errada.
 *
 * Da Console aproveita-se o resto do objecto, em particular `minimum_amount`:
 * um mínimo continua a ser um mínimo seja qual for o modelo.
 */

// O hóspede não paga taxa nenhuma. O preço que vê no anúncio é o preço que
// paga; a comissão sai toda do lado de quem recebe. Foi assim decidido em
// 2026-09-10 — até aí cobravam-se 5% ao hóspede.
//
// `customer: 0` faz o template não criar sequer a linha de comissão do cliente
// (`isValidCommission` exige percentagem > 0), por isso o detalhe do preço não
// mostra uma linha de 0,00 €.
const MODELS = {
  // Condição de fundador: quem se registou até à data limite da campanha de
  // lançamento. É vitalícia — foi o que se prometeu — e por isso fica gravada na
  // conta em vez de ser recalculada a cada reserva. Se um dia a data limite
  // mudar, quem já a tem não a perde.
  fundador: { provider: 5, customer: 0 },
  // Standard subiu de 10% para 12,5% em 2026-09-10. Não é retroactivo no
  // sentido que interessa: quem tem `standard` gravado passa a pagar 12,5% na
  // reserva seguinte, porque só o *nome* do modelo fica preso à conta e a
  // percentagem é lida daqui a cada cálculo.
  standard: { provider: 12.5, customer: 0 },
};

/** O modelo de quem ainda não tem nenhum gravado. */
const MODELO_POR_OMISSAO = 'standard';

/**
 * Lê o modelo de comissão da metadata de um anfitrião.
 *
 * Sem modelo gravado — ou com um nome que não reconhecemos, que é sempre um erro
 * de escrita — devolve o standard. Nunca devolve nada que se pareça com um
 * desconto que ninguém concedeu.
 *
 * @param {Object} metadata `profile.metadata` do anfitrião
 * @returns {{key: string, provider: number, customer: number}}
 */
const commissionModelFor = metadata => {
  const escrito =
    typeof metadata?.commissionModel === 'string'
      ? metadata.commissionModel.trim().toLowerCase()
      : null;

  if (escrito && !MODELS[escrito]) {
    console.error(`[comissão] modelo desconhecido "${escrito}" — aplicado ${MODELO_POR_OMISSAO}`);
  }

  const key = escrito && MODELS[escrito] ? escrito : MODELO_POR_OMISSAO;
  return { key, ...MODELS[key] };
};

/**
 * Aplica o modelo do anfitrião à comissão que a Console devolveu.
 *
 * As percentagens vêm sempre daqui — a da Console é descartada, mesmo quando o
 * anfitrião não tem modelo gravado. Tudo o resto que a Console traga, em
 * particular `minimum_amount`, é preservado.
 *
 * @param {Object} base `{ providerCommission, customerCommission }` da Console
 * @param {Object} hostMetadata `profile.metadata` do anfitrião
 * @returns {Object} `{ providerCommission, customerCommission, appliedModel }`
 */
const resolveCommission = (base, hostMetadata) => {
  const { providerCommission, customerCommission } = base || {};
  const model = commissionModelFor(hostMetadata);

  // Com o hóspede a 0%, o objecto da Console é deitado fora por inteiro em vez
  // de ser copiado. Se lá estiver um `minimum_amount`, esse mínimo sobreviveria
  // à percentagem zero e cobraria ao hóspede uma taxa fixa — o contrário do que
  // ficou decidido. Do lado do anfitrião o mínimo faz sentido e mantém-se.
  const doCliente =
    model.customer > 0 ? { ...(customerCommission || {}), percentage: model.customer } : { percentage: 0 };

  return {
    providerCommission: { ...(providerCommission || {}), percentage: model.provider },
    customerCommission: doCliente,
    appliedModel: model.key,
  };
};

/**
 * Encontra a metadata do anfitrião numa resposta que tenha vindo com
 * `include: ['author']` (ou `['listing.author']`).
 *
 * Devolve `{}` quando o autor não vem incluído — e aí `resolveCommission`
 * aplica o standard. Um anfitrião com condição de fundador cujo autor não venha
 * incluído seria cobrado a mais, mas isso não é uma hipótese real: os três
 * endpoints que chamam isto pedem sempre `include: ['author']`. Se algum dia
 * deixar de vir, é sinal de que a chamada mudou de forma.
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
 * fundador e toda a gente paga o standard. Preferimos isso a assumir uma data —
 * dar 5% por engano é dinheiro que não se recupera.
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
 * Nunca sobrepõe um modelo existente: um fundador não é despromovido no dia
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
  MODELO_POR_OMISSAO,
  commissionModelFor,
  resolveCommission,
  hostMetadataFrom,
  limiteFundador,
  vagasFundador,
  contarFundadores,
  modeloParaConta,
  ensureCommissionModel,
};
