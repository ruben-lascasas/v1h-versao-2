/**
 * Declaração do Anfitrião — o Legal Gate antes de publicar um espaço.
 *
 * O PORQUÊ
 *
 * A Declaração de Conformidade do Host (documento n.º 15) diz que o Host declara,
 * antes de publicar, que tem legitimidade sobre o espaço e que a utilização
 * anunciada é legal. Até aqui, o documento dizia-o e o produto não pedia nada:
 * publicava-se sem declarar seja o que for.
 *
 * Isto é o que torna defensável a posição de intermediário. A Venue1Hub não
 * visita os espaços; o que a protege é ter pedido — e guardado — a declaração de
 * quem os publica.
 *
 * COMO SE LIGA AO QUE JÁ EXISTIA
 *
 * Não é um portão novo. `verification.js` já punha `postListings` em
 * `permission/deny` até os documentos de identificação estarem aprovados. Isto
 * acrescenta condições a esse mesmo portão.
 *
 * ONDE FICA
 *
 * Em `privateData.hostDeclaration`. Os dados fiscais são pessoais e metadata é
 * PÚBLICA em Sharetribe — um NIF em metadata ficava à vista de qualquer pessoa.
 * Só o estado resumido, sem dados, é espelhado em `metadata`.
 */

const { exigidosPara, emFalta } = require('./legalAcceptance');

/** Onde vive, dentro de privateData. */
const CHAVE = 'hostDeclaration';

/** Espelho público: só diz se está completa, nunca o conteúdo. */
const CHAVE_METADATA = 'hostDeclarationComplete';

/**
 * A que título o anfitrião disponibiliza o espaço.
 *
 * Não basta perguntar "tem legitimidade?" e receber um sim: se um dia houver
 * uma reclamação do senhorio, o que interessa é a que título a pessoa declarou
 * agir. Um arrendatário sem autorização escrita é um problema diferente de um
 * proprietário.
 */
const TITULOS = ['proprietario', 'arrendatario_com_autorizacao', 'mandatario', 'outro'];

/** Particular ou profissional — a DECISÃO 9 do guia interno. */
const CLASSIFICACOES = ['particular', 'profissional'];

/**
 * Os campos da declaração e o que cada um exige.
 *
 * `tipo: 'confirmacao'` é uma caixa que tem de ficar marcada; nenhuma delas tem
 * valor por omissão, de propósito — uma declaração pré-marcada não é declaração
 * nenhuma.
 */
const CAMPOS = [
  {
    chave: 'titulo',
    tipo: 'escolha',
    opcoes: TITULOS,
    label: 'A que título disponibiliza o espaço',
    labelEN: 'On what basis you make the space available',
  },
  {
    chave: 'classificacao',
    tipo: 'escolha',
    opcoes: CLASSIFICACOES,
    label: 'Atua como particular ou como profissional',
    labelEN: 'You act as a private individual or as a professional',
  },
  {
    chave: 'nif',
    tipo: 'texto',
    label: 'NIF / VAT',
    labelEN: 'Tax number / VAT',
  },
  {
    chave: 'residenciaFiscal',
    tipo: 'texto',
    label: 'País de residência fiscal',
    labelEN: 'Country of tax residence',
  },
  {
    chave: 'legitimidade',
    tipo: 'confirmacao',
    label: 'Declaro ter legitimidade para disponibilizar o espaço anunciado.',
    labelEN: 'I declare that I am entitled to make the advertised space available.',
  },
  {
    chave: 'conformidade',
    tipo: 'confirmacao',
    label:
      'Declaro que o espaço e a utilização anunciada cumprem a legislação aplicável, incluindo licenciamento, segurança e regras de utilização.',
    labelEN:
      'I declare that the space and the advertised use comply with applicable law, including licensing, safety and rules of use.',
  },
  {
    chave: 'veracidade',
    tipo: 'confirmacao',
    label:
      'Declaro que a informação prestada é verdadeira e comprometo-me a mantê-la atualizada.',
    labelEN: 'I declare the information given is true and undertake to keep it up to date.',
  },
];

const CHAVES = CAMPOS.map(c => c.chave);

/** A declaração guardada nesta conta, ou um objeto vazio. */
const declaracaoDe = user => {
  const d = user?.attributes?.profile?.privateData?.[CHAVE];
  return d && typeof d === 'object' ? d : {};
};

/**
 * Valida uma declaração submetida.
 *
 * Devolve a lista de problemas em vez de um booleano: a interface tem de poder
 * dizer o que falta, campo a campo, em vez de um "inválido" que não ajuda
 * ninguém.
 */
const problemas = valores => {
  const encontrados = [];
  for (const campo of CAMPOS) {
    const v = valores?.[campo.chave];
    if (campo.tipo === 'confirmacao') {
      if (v !== true) encontrados.push({ campo: campo.chave, motivo: 'por-confirmar' });
    } else if (campo.tipo === 'escolha') {
      if (!campo.opcoes.includes(v)) encontrados.push({ campo: campo.chave, motivo: 'por-escolher' });
    } else if (typeof v !== 'string' || v.trim().length < 2) {
      encontrados.push({ campo: campo.chave, motivo: 'por-preencher' });
    }
  }
  return encontrados;
};

/** A declaração desta conta está completa? */
const estaCompleta = user => problemas(declaracaoDe(user)).length === 0;

/**
 * Tudo o que falta a esta conta para poder publicar, do lado jurídico.
 *
 * Junta as duas metades — declaração e aceitação dos documentos — porque para
 * quem está à espera de publicar isto é um problema só, e não dois.
 */
const emFaltaParaPublicar = user => {
  const userType = user?.attributes?.profile?.publicData?.userType || null;
  return {
    declaracao: problemas(declaracaoDe(user)),
    documentos: emFalta(user, userType),
    exigidos: exigidosPara(userType),
  };
};

/** Nada em falta em nenhuma das metades. */
const podePublicar = user => {
  const f = emFaltaParaPublicar(user);
  return f.declaracao.length === 0 && f.documentos.length === 0;
};

/**
 * Grava a declaração.
 *
 * Só grava se estiver completa: uma declaração meio preenchida não é uma
 * declaração, e guardá-la dava a impressão de que alguma coisa foi declarada.
 * O rascunho, se um dia fizer falta, vive no formulário e não aqui.
 */
const gravar = async (sdk, user, valores) => {
  const uid = user?.id?.uuid;
  if (!uid) throw new Error('utilizador sem id');

  const encontrados = problemas(valores);
  if (encontrados.length > 0) return { gravada: false, problemas: encontrados };

  // Só os campos que conhecemos: o corpo do pedido não pode semear privateData
  // com o que lhe apetecer.
  const limpa = {};
  for (const chave of CHAVES) limpa[chave] = valores[chave];
  limpa.em = new Date().toISOString();

  await sdk.users.updateProfile({
    id: uid,
    privateData: { [CHAVE]: limpa },
    // Espelho público sem dados nenhuns: serve para a interface e para os
    // filtros do painel de administração, sem expor o NIF.
    metadata: { [CHAVE_METADATA]: true },
  });

  return { gravada: true, problemas: [] };
};

module.exports = {
  CHAVE,
  CHAVE_METADATA,
  CAMPOS,
  CHAVES,
  TITULOS,
  CLASSIFICACOES,
  declaracaoDe,
  problemas,
  estaCompleta,
  emFaltaParaPublicar,
  podePublicar,
  gravar,
};
