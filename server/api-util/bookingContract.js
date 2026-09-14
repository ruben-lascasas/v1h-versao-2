/**
 * Contrato de cada reserva.
 *
 * O PORQUÊ
 *
 * Os Termos dizem que o contrato relativo ao Espaço se celebra directamente
 * entre Anfitrião e Cliente, e que a Venue1Hub é intermediária. Até aqui isso
 * era uma afirmação sem objecto: não existia contrato nenhum que as partes
 * conseguissem ver.
 *
 * O documento n.º 4 é o modelo, com 50 campos entre parênteses rectos. Isto é o
 * motor que os preenche com os dados reais da reserva.
 *
 * O QUE SE CONGELA, E O QUE NÃO
 *
 * Não se guarda o texto do contrato. Guarda-se, na metadata da transacção, que
 * versões estavam em vigor no momento em que a reserva se formou. O texto é
 * renderizado a pedido a partir do modelo dessa versão.
 *
 * É a mesma razão de não duplicar os documentos por utilizador: com o ponteiro
 * sabe-se sempre que texto se aplicava, sem guardar milhares de cópias que
 * depois ninguém sabe se pode corrigir.
 *
 * CAMPOS SEM DADOS
 *
 * Vários campos do modelo dependem de decisões que ainda não estão fechadas —
 * caução, seguro, serviços complementares. Quando não há dado, escreve-se
 * "não aplicável" em vez de deixar `[DEPOSIT_AMOUNT]` à vista. Um contrato com
 * marcadores por preencher não parece um contrato.
 */

const CATALOGO = require('../../src/config/legalDocuments.json');

/** Onde o ponteiro das versões vive, dentro da metadata da transacção. */
const CHAVE = 'contrato';

/** Os documentos cuja versão fica presa a cada reserva. */
const DOCUMENTOS_DA_RESERVA = [
  'contrato-de-reserva',
  'termos-de-servico',
  'termos-do-cliente',
  'termos-do-anfitriao',
  'termos-de-pagamento',
  'cancelamento-e-reembolso',
];

const versaoDe = slug => {
  const doc = CATALOGO.find(d => d.slug === slug);
  return doc ? doc.versao : null;
};

/** As versões em vigor agora, para congelar numa reserva nova. */
const versoesEmVigor = () => {
  const v = {};
  for (const slug of DOCUMENTOS_DA_RESERVA) {
    const versao = versaoDe(slug);
    if (versao) v[slug] = versao;
  }
  return v;
};

/** O ponteiro guardado nesta transacção, ou null se ainda não tiver. */
const ponteiroDe = transaction => {
  const p = transaction?.attributes?.metadata?.[CHAVE];
  return p && typeof p === 'object' ? p : null;
};

/**
 * Prende as versões em vigor a esta reserva.
 *
 * Idempotente: uma reserva que já tem ponteiro mantém o que tinha. Se as
 * versões mudassem a meio, o contrato de uma reserva antiga passava a citar um
 * texto que não estava em vigor quando ela se formou.
 */
const congelar = async (sdk, transaction) => {
  const txId = transaction?.id?.uuid;
  if (!txId) throw new Error('transacção sem id');
  const existente = ponteiroDe(transaction);
  if (existente) return { congelado: false, ponteiro: existente };

  const ponteiro = { versoes: versoesEmVigor(), em: new Date().toISOString() };
  await sdk.transactions.updateMetadata({ id: txId, metadata: { [CHAVE]: ponteiro } });
  return { congelado: true, ponteiro };
};

// ─── Preenchimento ───────────────────────────────────────────────────────────

const dinheiro = money =>
  money && typeof money.amount === 'number'
    ? `${(money.amount / 100).toFixed(2)} ${money.currency || 'EUR'}`
    : null;

const dataHora = valor => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const pad = n => String(n).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
};

const soData = valor => {
  const dh = dataHora(valor);
  return dh ? dh.split(' ')[0] : null;
};

const linhaDe = (transaction, codigo) =>
  (transaction?.attributes?.lineItems || []).find(l => l.code === `line-item/${codigo}`);

/**
 * Os valores para cada marcador do modelo.
 *
 * Devolve null nos campos sem dado; quem substitui é que decide o que escrever
 * no lugar, para a regra ficar num sítio só.
 */
const valores = ({ transaction, listing, host, guest, ponteiro }) => {
  const tx = transaction?.attributes || {};
  const l = listing?.attributes || {};
  const perfilHost = host?.attributes?.profile || {};
  const perfilGuest = guest?.attributes?.profile || {};
  const declaracao = perfilHost.privateData?.hostDeclaration || {};
  const versoes = (ponteiro && ponteiro.versoes) || versoesEmVigor();

  const inicio = tx.booking?.attributes?.start || tx.metadata?.bookingStart;
  const fim = tx.booking?.attributes?.end || tx.metadata?.bookingEnd;
  const base =
    linhaDe(transaction, 'day') || linhaDe(transaction, 'night') || linhaDe(transaction, 'hour');
  const taxaCliente = linhaDe(transaction, 'customer-commission');

  return {
    BOOKING_ID: transaction?.id?.uuid || null,
    TRANSACTION_ID: transaction?.id?.uuid || null,
    'DATA/HORA': dataHora((ponteiro && ponteiro.em) || tx.createdAt),
    TIMESTAMP: dataHora((ponteiro && ponteiro.em) || tx.createdAt),
    BOOKING_DATE: soData(tx.createdAt),

    HOST_NAME: perfilHost.displayName || null,
    HOST_USER_ID: host?.id?.uuid || null,
    HOST_EMAIL: host?.attributes?.email || null,
    HOST_ADDRESS: declaracao.residenciaFiscal || null,
    'HOST_TAX_ID / COMPANY_ID': declaracao.nif || null,

    GUEST_NAME: perfilGuest.displayName || null,
    GUEST_USER_ID: guest?.id?.uuid || null,
    GUEST_EMAIL: guest?.attributes?.email || null,
    GUEST_ADDRESS: perfilGuest.privateData?.morada || null,

    LISTING_TITLE: l.title || null,
    LISTING_ADDRESS: l.publicData?.location?.address || null,
    'CAPACITY / AREA': l.publicData?.capacidade ? String(l.publicData.capacidade) : null,
    LISTING_FEATURES: (l.publicData?.amenities || []).join(', ') || null,
    LISTING_EQUIPMENT: (l.publicData?.equipamento || []).join(', ') || null,
    LISTING_VERSION: soData(l.createdAt),

    START_TIME: dataHora(inicio),
    END_TIME: dataHora(fim),
    DURATION: base?.quantity ? `${base.quantity} ${base.code.split('/')[1]}` : null,
    NUMBER_OF_GUESTS: tx.protectedData?.seats ? String(tx.protectedData.seats) : null,
    BOOKING_PURPOSE: tx.protectedData?.finalidade || null,

    SPACE_PRICE: dinheiro(base?.lineTotal),
    GUEST_FEE: dinheiro(taxaCliente?.lineTotal),
    TOTAL_PRICE: dinheiro(tx.payinTotal),
    TAXES: null,
    OTHER_FEES: null,
    PAYMENT_REFERENCE:
      tx.protectedData?.stripePaymentIntents?.default?.stripePaymentIntentId || null,

    CANCELLATION_POLICY_NAME: l.publicData?.politicaCancelamento || null,
    CANCELLATION_POLICY_VERSION: versoes['cancelamento-e-reembolso'] || null,
    CANCELLATION_VERSION: versoes['cancelamento-e-reembolso'] || null,
    CANCELLATION_POLICY_SNAPSHOT: null,
    SPACE_RULES_SNAPSHOT: l.publicData?.regras || null,
    SPACE_RULES_VERSION: soData(l.createdAt),
    SPECIAL_ACTIVITY_RULES: null,
    ACCESS_INSTRUCTIONS: null,
    INCLUDED_SERVICES: null,
    ADDITIONAL_SERVICES: null,
    ADDITIONAL_SERVICES_PRICE: null,

    // Estes dependem de decisões ainda por fechar no guia (caução, seguro).
    DEPOSIT_AMOUNT: null,
    DEPOSIT_TERMS: null,
    'PREAUTH / DEPOSIT / OTHER': null,

    TOS_VERSION: versoes['termos-de-servico'] || null,
    HOST_TERMS_VERSION: versoes['termos-do-anfitriao'] || null,
    GUEST_TERMS_VERSION: versoes['termos-do-cliente'] || null,
    PAYMENTS_VERSION: versoes['termos-de-pagamento'] || null,
    'TIMESTAMP / AUTO-ACCEPT LOGIC': dataHora(tx.lastTransitionedAt),
  };
};

const SEM_DADO = 'não aplicável';

/** Substitui os marcadores num texto. */
const substituirEm = (texto, mapa) =>
  texto.replace(/\[[A-Z][A-Z0-9_ /,.-]*\]/g, marcador => {
    const chave = marcador.slice(1, -1);
    // Um marcador que não conhecemos fica como está: é do modelo, não nosso.
    if (!Object.prototype.hasOwnProperty.call(mapa, chave)) return marcador;
    const v = mapa[chave];
    return v == null || v === '' ? SEM_DADO : String(v);
  });

/** Percorre os blocos do modelo e substitui em todo o lado onde há texto. */
const preencherBlocos = (blocos, mapa) => {
  const parte = p =>
    typeof p === 'string' ? substituirEm(p, mapa) : { ...p, t: substituirEm(p.t, mapa) };
  const conteudo = c => (typeof c === 'string' ? substituirEm(c, mapa) : c.map(parte));

  return blocos.map(b => {
    if (b.tipo === 'tabela') {
      return { ...b, linhas: b.linhas.map(l => l.map(c => substituirEm(c, mapa))) };
    }
    if (b.tipo === 'lista') {
      return { ...b, itens: b.itens.map(i => ({ ...i, c: conteudo(i.c) })) };
    }
    if (b.tipo === 'p') return { ...b, c: conteudo(b.c) };
    if (b.texto) return { ...b, texto: substituirEm(b.texto, mapa) };
    return b;
  });
};

module.exports = {
  CHAVE,
  DOCUMENTOS_DA_RESERVA,
  SEM_DADO,
  versaoDe,
  versoesEmVigor,
  ponteiroDe,
  congelar,
  valores,
  substituirEm,
  preencherBlocos,
};
