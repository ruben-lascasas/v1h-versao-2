/**
 * Centro de Resolução — o dossier de uma reclamação.
 *
 * O PORQUÊ
 *
 * A Política de Resolução de Conflitos (documento n.º 9) descreve um Centro de
 * Resolução: abrir caso, apresentar prova, direito de resposta da outra parte,
 * intervenção da Venue1Hub. Nada disso existia. Uma política que descreve um
 * mecanismo inexistente é uma promessa por cumprir, escrita e assinada.
 *
 * O QUE ESTE DESENHO NÃO FAZ — e a interface tem de o dizer
 *
 * Nenhum valor se move sozinho. O processo de reserva em uso (`default-booking`)
 * não tem uma única transição de disputa; um reembolso automático obrigava a
 * publicar uma versão nova do processo na Sharetribe e a migrar as reservas em
 * curso. A decisão fica registada aqui; a devolução do dinheiro é executada à
 * mão na Stripe.
 *
 * Deixar isto implícito seria a pior coisa que este módulo podia fazer: alguém
 * abria um caso a pensar que o dinheiro voltava sozinho.
 *
 * ONDE FICA
 *
 * Em `transaction.metadata.resolucao`, escrita só pela Integration API. As duas
 * partes leem; nenhuma delas consegue alterar o que a outra escreveu.
 */

/** Onde o caso vive, dentro da metadata da transacção. */
const CHAVE = 'resolucao';

/**
 * Os tipos de caso que a Política prevê.
 *
 * Lista fechada de propósito: um campo livre daria mil formulações do mesmo
 * problema e tornaria impossível tratar casos por categoria.
 */
const TIPOS = [
  { chave: 'danos', label: 'Danos no espaço', labelEN: 'Damage to the space' },
  { chave: 'espaco_indisponivel', label: 'Espaço indisponível', labelEN: 'Space unavailable' },
  {
    chave: 'divergencia',
    label: 'Divergência entre o anúncio e a realidade',
    labelEN: 'Listing does not match reality',
  },
  {
    chave: 'incumprimento_regras',
    label: 'Incumprimento das regras do espaço',
    labelEN: 'Space rules not followed',
  },
  { chave: 'pagamento', label: 'Problema de pagamento', labelEN: 'Payment problem' },
  { chave: 'outro', label: 'Outro', labelEN: 'Other' },
];

const TIPOS_VALIDOS = TIPOS.map(t => t.chave);

const ESTADOS = {
  ABERTO: 'aberto',
  RESPONDIDO: 'respondido',
  EM_ANALISE: 'em_analise',
  DECIDIDO: 'decidido',
  FECHADO: 'fechado',
};

/** Quanto tempo a outra parte tem para responder, antes de o caso subir. */
const DIAS_PARA_RESPONDER = 7;

/** Limites do que se pode anexar. Os mesmos do envio de documentos. */
const MAX_PROVAS = 10;
const MAX_BYTES = 8 * 1024 * 1024;
const MIME_ACEITES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

const casoDe = transaction => {
  const c = transaction?.attributes?.metadata?.[CHAVE];
  return c && typeof c === 'object' ? c : null;
};

/** Quem são as partes desta reserva. */
const partesDe = transaction => ({
  cliente: transaction?.relationships?.customer?.data?.id?.uuid || null,
  anfitriao: transaction?.relationships?.provider?.data?.id?.uuid || null,
});

/** Que papel tem este utilizador nesta reserva — ou null se não for parte. */
const papelDe = (transaction, userId) => {
  const p = partesDe(transaction);
  if (userId && userId === p.cliente) return 'cliente';
  if (userId && userId === p.anfitriao) return 'anfitriao';
  return null;
};

/** Quem tem de responder a um caso aberto por este papel. */
const contraparte = papel => (papel === 'cliente' ? 'anfitriao' : 'cliente');

const prazoDeResposta = (abertoEm, dias = DIAS_PARA_RESPONDER) => {
  const d = new Date(abertoEm);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + dias);
  return d.toISOString();
};

/**
 * Abre um caso.
 *
 * Um caso por reserva: um segundo pedido sobre a mesma reserva é um
 * acrescento ao dossier existente, não um dossier novo. Dois dossiers sobre os
 * mesmos factos dão duas decisões possíveis, o que é o oposto de resolver.
 */
const abrir = async (sdk, transaction, { autor, papel, tipo, descricao, valorCents }) => {
  const txId = transaction?.id?.uuid;
  if (!txId) throw new Error('transacção sem id');
  if (!papel) throw new Error('quem abre tem de ser parte da reserva');
  if (!TIPOS_VALIDOS.includes(tipo)) throw new Error('tipo de caso desconhecido');
  if (typeof descricao !== 'string' || descricao.trim().length < 20) {
    throw new Error('a descrição tem de explicar o que aconteceu');
  }
  if (casoDe(transaction)) return { aberto: false, motivo: 'ja-existe', caso: casoDe(transaction) };

  const agora = new Date().toISOString();
  const caso = {
    tipo,
    estado: ESTADOS.ABERTO,
    abertoPor: { userId: autor, papel },
    abertoEm: agora,
    descricao: descricao.trim(),
    valorCents: Number.isInteger(valorCents) && valorCents > 0 ? valorCents : null,
    respondePor: contraparte(papel),
    prazoResposta: prazoDeResposta(agora),
    provas: [],
    resposta: null,
    decisao: null,
    // A cronologia é o que dá valor de prova ao dossier: sem ela, fica-se com
    // o estado final e sem saber como lá se chegou.
    cronologia: [{ em: agora, quem: papel, acto: 'abriu-o-caso' }],
  };

  await sdk.transactions.updateMetadata({ id: txId, metadata: { [CHAVE]: caso } });
  return { aberto: true, caso };
};

/** Junta uma prova ao dossier. A chave é a do ficheiro já colocado no R2. */
const juntarProva = async (sdk, transaction, { papel, chave, nome, contentType }) => {
  const caso = casoDe(transaction);
  if (!caso) throw new Error('não há caso aberto');
  if (!papel) throw new Error('quem junta prova tem de ser parte da reserva');
  if (caso.provas.length >= MAX_PROVAS) throw new Error('limite de provas atingido');

  const agora = new Date().toISOString();
  const atualizado = {
    ...caso,
    provas: [...caso.provas, { chave, nome, contentType, porPapel: papel, em: agora }],
    cronologia: [...caso.cronologia, { em: agora, quem: papel, acto: 'juntou-prova', nome }],
  };

  await sdk.transactions.updateMetadata({
    id: transaction.id.uuid,
    metadata: { [CHAVE]: atualizado },
  });
  return atualizado;
};

/**
 * Resposta da outra parte.
 *
 * Só a contraparte responde. Sem esta verificação, quem abriu o caso podia
 * escrever a resposta da outra parte — e um dossier onde isso é possível não
 * serve de prova para nada.
 */
const responder = async (sdk, transaction, { papel, texto, aceita }) => {
  const caso = casoDe(transaction);
  if (!caso) throw new Error('não há caso aberto');
  if (papel !== caso.respondePor) throw new Error('esta resposta não é sua');
  if (caso.resposta) throw new Error('já respondeu');
  if (typeof texto !== 'string' || texto.trim().length < 10) throw new Error('resposta demasiado curta');

  const agora = new Date().toISOString();
  const atualizado = {
    ...caso,
    estado: ESTADOS.RESPONDIDO,
    resposta: { porPapel: papel, texto: texto.trim(), aceita: aceita === true, em: agora },
    cronologia: [...caso.cronologia, { em: agora, quem: papel, acto: 'respondeu' }],
  };

  await sdk.transactions.updateMetadata({
    id: transaction.id.uuid,
    metadata: { [CHAVE]: atualizado },
  });
  return atualizado;
};

/**
 * Decisão da Venue1Hub.
 *
 * `executada` fica sempre a false: o que aqui se regista é a decisão, não o
 * movimento do dinheiro. Quem devolver o valor na Stripe marca-a depois. Ter os
 * dois campos separados evita a confusão entre "foi decidido" e "foi feito".
 */
const decidir = async (sdk, transaction, { porUserId, sentido, fundamentacao, valorCents }) => {
  const caso = casoDe(transaction);
  if (!caso) throw new Error('não há caso aberto');
  if (!['a-favor-de-quem-abriu', 'a-favor-da-outra-parte', 'solucao-intermedia', 'sem-decisao'].includes(sentido)) {
    throw new Error('sentido de decisão desconhecido');
  }
  if (typeof fundamentacao !== 'string' || fundamentacao.trim().length < 20) {
    throw new Error('a decisão tem de ser fundamentada');
  }

  const agora = new Date().toISOString();
  const atualizado = {
    ...caso,
    estado: ESTADOS.DECIDIDO,
    decisao: {
      porUserId,
      sentido,
      fundamentacao: fundamentacao.trim(),
      valorCents: Number.isInteger(valorCents) && valorCents > 0 ? valorCents : null,
      em: agora,
      executada: false,
    },
    cronologia: [...caso.cronologia, { em: agora, quem: 'venue1hub', acto: 'decidiu', sentido }],
  };

  await sdk.transactions.updateMetadata({
    id: transaction.id.uuid,
    metadata: { [CHAVE]: atualizado },
  });
  return atualizado;
};

/** Marca que o valor decidido foi mesmo movimentado na Stripe. */
const marcarExecutada = async (sdk, transaction, { porUserId, nota }) => {
  const caso = casoDe(transaction);
  if (!caso?.decisao) throw new Error('não há decisão para executar');

  const agora = new Date().toISOString();
  const atualizado = {
    ...caso,
    estado: ESTADOS.FECHADO,
    decisao: { ...caso.decisao, executada: true, executadaEm: agora, executadaPor: porUserId, nota: nota || null },
    cronologia: [...caso.cronologia, { em: agora, quem: 'venue1hub', acto: 'executou-a-decisao' }],
  };

  await sdk.transactions.updateMetadata({
    id: transaction.id.uuid,
    metadata: { [CHAVE]: atualizado },
  });
  return atualizado;
};

module.exports = {
  CHAVE,
  TIPOS,
  TIPOS_VALIDOS,
  ESTADOS,
  DIAS_PARA_RESPONDER,
  MAX_PROVAS,
  MAX_BYTES,
  MIME_ACEITES,
  casoDe,
  partesDe,
  papelDe,
  contraparte,
  prazoDeResposta,
  abrir,
  juntarProva,
  responder,
  decidir,
  marcarExecutada,
};
