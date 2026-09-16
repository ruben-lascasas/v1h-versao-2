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

/**
 * Valor monetário para o modelo.
 *
 * Sem a moeda: o modelo já escreve o símbolo ("Preço do Espaço: €[SPACE_PRICE]"),
 * e devolver "5.00 EUR" dava "€5.00 EUR" no contrato. Vírgula decimal, que é
 * como se escreve um valor em português.
 */
const dinheiro = money => {
  if (!money || typeof money.amount !== 'number') return null;
  const valor = (money.amount / 100).toFixed(2).replace('.', ',');
  return money.currency && money.currency !== 'EUR' ? `${valor} ${money.currency}` : valor;
};

/** Zero escrito. Distingue-se de "não há dado": o encargo existe e é nenhum. */
const ZERO = '0,00';

/**
 * Quantidade de uma linha, que vem como BigDecimal do SDK.
 *
 * Sem isto o contrato dizia "Duração total: [object Object] day".
 */
const quantidade = q => {
  if (q == null) return null;
  const n = typeof q === 'object' ? Number(q.value) : Number(q);
  return Number.isFinite(n) ? n : null;
};

const UNIDADES = {
  day: ['dia', 'dias'],
  night: ['noite', 'noites'],
  hour: ['hora', 'horas'],
};

/** "1 dia", "2 horas" — e não "1 day". O contrato está em português. */
const duracao = linha => {
  const n = quantidade(linha?.quantity);
  if (n == null) return null;
  const unidade = UNIDADES[linha.code.split('/')[1]];
  if (!unidade) return String(n);
  return `${n} ${n === 1 ? unidade[0] : unidade[1]}`;
};

/** "casa-banho" não é como se escreve numa cláusula: fica "Casa banho". */
const legivel = chave =>
  String(chave)
    .replace(/[-_]+/g, ' ')
    .replace(/^./, c => c.toUpperCase());

/**
 * Data e hora como se lêem em Portugal.
 *
 * Usava a hora do servidor. Em produção o servidor está em UTC, por isso uma
 * reserva que começa à meia-noite de Lisboa aparecia no contrato como sendo do
 * dia anterior às 23:00 — a data errada, num documento que é prova.
 */
const dataHora = valor => {
  if (!valor) return null;
  const d = valor instanceof Date ? valor : new Date(valor);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat('pt-PT', {
    timeZone: 'Europe/Lisbon',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .formatToParts(d)
    .reduce((acc, x) => ({ ...acc, [x.type]: x.value }), {});
  return `${partes.day}-${partes.month}-${partes.year} ${partes.hour}:${partes.minute}`;
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
const valores = ({ transaction, listing, host, guest, ponteiro, booking }) => {
  const tx = transaction?.attributes || {};
  const l = listing?.attributes || {};
  const perfilHost = host?.attributes?.profile || {};
  const perfilGuest = guest?.attributes?.profile || {};
  const declaracao = perfilHost.privateData?.hostDeclaration || {};
  const versoes = (ponteiro && ponteiro.versoes) || versoesEmVigor();

  // A reserva vem em `included`, não dentro dos atributos da transacção. Lia-se
  // de `tx.booking`, que nunca existe — e o contrato dizia "Hora de início: não
  // aplicável" em todas as reservas.
  const inicio = booking?.attributes?.start || tx.booking?.attributes?.start || null;
  const fim = booking?.attributes?.end || tx.booking?.attributes?.end || null;
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
    // Não é um marcador do modelo: é o que responde à escolha "Estatuto:
    // [Profissional / Particular]". Começa por __ para nunca ser confundido
    // com um campo a substituir.
    __classificacao: declaracao.classificacao || null,

    GUEST_NAME: perfilGuest.displayName || null,
    GUEST_USER_ID: guest?.id?.uuid || null,
    GUEST_EMAIL: guest?.attributes?.email || null,
    GUEST_ADDRESS: perfilGuest.privateData?.morada || null,

    LISTING_TITLE: l.title || null,
    LISTING_ADDRESS: l.publicData?.location?.address || null,
    // Os campos do anúncio nesta marketplace chamam-se assim; os nomes antigos
    // ficam como recurso para anúncios criados antes.
    'CAPACITY / AREA': l.publicData?.numero_pessoas
      ? `${l.publicData.numero_pessoas} pessoas`
      : l.publicData?.capacidade
      ? String(l.publicData.capacidade)
      : null,
    LISTING_FEATURES:
      (l.publicData?.comodidades || l.publicData?.amenities || []).map(legivel).join(', ') || null,
    LISTING_EQUIPMENT: (l.publicData?.equipamento || []).join(', ') || null,
    LISTING_VERSION: soData(l.createdAt),

    START_TIME: dataHora(inicio),
    END_TIME: dataHora(fim),
    DURATION: duracao(base),
    NUMBER_OF_GUESTS: tx.protectedData?.seats ? String(tx.protectedData.seats) : null,
    BOOKING_PURPOSE: tx.protectedData?.finalidade || null,

    SPACE_PRICE: dinheiro(base?.lineTotal),
    // Zero, e não "não aplicável": o cliente não paga taxa nenhuma à
    // plataforma, e as contas do contrato têm de fechar — 5,00 + 0 + 0 = 5,00.
    GUEST_FEE: dinheiro(taxaCliente?.lineTotal) || ZERO,
    TOTAL_PRICE: dinheiro(tx.payinTotal),
    TAXES: ZERO,
    OTHER_FEES: ZERO,
    // O id da transacção é a referência do pagamento no nosso lado; é por ele
    // que se encontra a cobrança. Melhor isso do que um campo vazio.
    PAYMENT_REFERENCE:
      tx.protectedData?.stripePaymentIntents?.default?.stripePaymentIntentId ||
      transaction?.id?.uuid ||
      null,

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
    ADDITIONAL_SERVICES_PRICE: ZERO,

    // Estes dependem de decisões ainda por fechar no guia (caução, seguro).
    DEPOSIT_AMOUNT: ZERO,
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

/**
 * As opções que o modelo deixa por escolher.
 *
 * Não são marcadores de dados: são escolhas escritas à mão no documento, como
 * "Estatuto: [Profissional / Particular]". Ficavam no contrato tal e qual, e um
 * contrato com opções por assinalar não é um contrato — é um formulário.
 *
 * Cada uma destas respostas é o que é verdade hoje na plataforma. Onde não há
 * dado nem regra, escolhe-se a resposta conservadora — nunca uma que conceda
 * em nome do Anfitrião o que ele não concedeu.
 */
const ESCOLHAS = mapa => ({
  // O Anfitrião declarou isto na Declaração de Conformidade.
  '[Profissional / Particular]':
    mapa.__classificacao === 'profissional'
      ? 'Profissional'
      : mapa.__classificacao === 'particular'
      ? 'Particular'
      : 'não declarado',
  '[GUEST_TAX_ID, se aplicável]': SEM_DADO,
  '[SETUP_TIME, se aplicável]': SEM_DADO,
  '[TEARDOWN_TIME, se aplicável]': SEM_DADO,
  // Fornecedores externos: nada foi acordado, por isso decide o Anfitrião.
  '[Permitida / Não permitida / Sujeita a autorização]': 'Sujeita a autorização do Anfitrião',
  // Caução: a plataforma não tem mecanismo de caução nenhum.
  '[Não aplicável / Aplicável]': 'Não aplicável',
  // Seguros: a Venue1Hub não associa seguro, não exige seguro ao Cliente, e
  // não recolhe o do Anfitrião — dizer "Sim" a qualquer um seria inventar
  // cobertura que não existe.
  // A escolha é feita sobre o parêntesis sozinho: o rótulo e a opção podem
  // estar em pedaços diferentes do mesmo parágrafo, e uma chave que incluísse o
  // rótulo nunca chegava a bater certo no documento real.
  '[Sim / Não / Não confirmado]': 'Não confirmado',
  '[Sim / Não]': 'Não',
  // Facturação do Espaço: o documento fiscal do Espaço é do Anfitrião. A
  // Venue1Hub cobra e transfere, mas não factura o Espaço por ele.
  '[HOST / mecanismo autorizado em nome do Host]': 'Anfitrião (Host)',
});

/** Substitui os marcadores num texto. */
const substituirEm = (texto, mapa) => {
  let t = texto;
  const escolhas = ESCOLHAS(mapa);
  for (const [literal, resposta] of Object.entries(escolhas)) {
    if (t.includes(literal)) t = t.split(literal).join(resposta);
  }
  return substituirMarcadores(t, mapa);
};

const substituirMarcadores = (texto, mapa) =>
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
