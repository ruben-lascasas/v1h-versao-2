const {
  CAMPOS,
  CHAVE,
  CHAVE_METADATA,
  declaracaoDe,
  problemas,
  estaCompleta,
  emFaltaParaPublicar,
  podePublicar,
  gravar,
} = require('./hostDeclaration');
const { CHAVE: CHAVE_ACEITACOES } = require('./legalAcceptance');
const { exigidosPara } = require('./legalAcceptance');
const CATALOGO = require('../../src/config/legalDocuments.json');

const versao = slug => CATALOGO.find(d => d.slug === slug).versao;

const DECLARACAO_VALIDA = {
  titulo: 'proprietario',
  classificacao: 'particular',
  nif: '503004561',
  residenciaFiscal: 'Portugal',
  legitimidade: true,
  conformidade: true,
  veracidade: true,
};

const conta = ({ declaracao, aceites, userType = 'anunciante' } = {}) => ({
  id: { uuid: 'u-1' },
  attributes: {
    profile: {
      publicData: { userType },
      privateData: declaracao ? { [CHAVE]: declaracao } : {},
      metadata: aceites ? { [CHAVE_ACEITACOES]: aceites } : {},
    },
  },
});

const tudoAceite = userType =>
  exigidosPara(userType).map(slug => ({ slug, versao: versao(slug), em: '2026-09-14T10:00:00.000Z' }));

const sdkQueGrava = () => {
  const escrito = [];
  return { escrito, users: { updateProfile: async p => (escrito.push(p), {}) } };
};

describe('validação da declaração', () => {
  it('uma conta sem declaração tem todos os campos em falta', () => {
    expect(problemas({})).toHaveLength(CAMPOS.length);
    expect(estaCompleta(conta())).toBe(false);
  });

  it('uma declaração completa não tem problemas', () => {
    expect(problemas(DECLARACAO_VALIDA)).toEqual([]);
    expect(estaCompleta(conta({ declaracao: DECLARACAO_VALIDA }))).toBe(true);
  });

  // Uma caixa por marcar não é uma declaração meio feita: é uma declaração que
  // não existe. O campo tem de aparecer identificado, para a página o poder
  // apontar.
  it('uma confirmação por marcar é apontada pelo nome', () => {
    const p = problemas({ ...DECLARACAO_VALIDA, legitimidade: false });
    expect(p).toEqual([{ campo: 'legitimidade', motivo: 'por-confirmar' }]);
  });

  it('não aceita "sim" em vez de verdadeiro numa confirmação', () => {
    const p = problemas({ ...DECLARACAO_VALIDA, conformidade: 'sim' });
    expect(p).toHaveLength(1);
  });

  it('rejeita um título que não está na lista', () => {
    const p = problemas({ ...DECLARACAO_VALIDA, titulo: 'dono-mais-ou-menos' });
    expect(p).toEqual([{ campo: 'titulo', motivo: 'por-escolher' }]);
  });

  it('rejeita um NIF vazio ou com um caractere', () => {
    expect(problemas({ ...DECLARACAO_VALIDA, nif: '' })).toHaveLength(1);
    expect(problemas({ ...DECLARACAO_VALIDA, nif: ' ' })).toHaveLength(1);
  });
});

describe('o portão jurídico', () => {
  it('sem declaração e sem aceitações, não publica', () => {
    expect(podePublicar(conta())).toBe(false);
  });

  // As duas metades têm de estar feitas. Uma só não chega.
  it('com declaração mas sem aceitar os documentos, não publica', () => {
    expect(podePublicar(conta({ declaracao: DECLARACAO_VALIDA }))).toBe(false);
  });

  it('com os documentos aceites mas sem declarar, não publica', () => {
    expect(podePublicar(conta({ aceites: tudoAceite('anunciante') }))).toBe(false);
  });

  it('com as duas metades feitas, publica', () => {
    const u = conta({ declaracao: DECLARACAO_VALIDA, aceites: tudoAceite('anunciante') });
    expect(podePublicar(u)).toBe(true);
  });

  // A página tem de conseguir dizer o que falta, e não só que falta alguma
  // coisa: quem tem os documentos aprovados e continua bloqueado precisa de
  // saber porquê.
  it('diz separadamente o que falta em cada metade', () => {
    const f = emFaltaParaPublicar(conta({ aceites: tudoAceite('anunciante') }));
    expect(f.documentos).toEqual([]);
    expect(f.declaracao.length).toBe(CAMPOS.length);
    expect(f.exigidos).toEqual(exigidosPara('anunciante'));
  });

  // Se os Termos do Anfitrião mudarem de versão, o portão volta a fechar.
  it('uma aceitação numa versão antiga volta a fechar o portão', () => {
    const antigas = tudoAceite('anunciante').map(a =>
      a.slug === 'termos-do-anfitriao' ? { ...a, versao: '0.9' } : a
    );
    const u = conta({ declaracao: DECLARACAO_VALIDA, aceites: antigas });
    expect(podePublicar(u)).toBe(false);
    expect(emFaltaParaPublicar(u).documentos.map(d => d.slug)).toContain('termos-do-anfitriao');
  });
});

describe('gravar', () => {
  it('grava os campos, a data, e o espelho público sem dados', async () => {
    const sdk = sdkQueGrava();
    const r = await gravar(sdk, conta(), DECLARACAO_VALIDA);

    expect(r.gravada).toBe(true);
    const p = sdk.escrito[0];
    expect(p.privateData[CHAVE].nif).toBe('503004561');
    expect(Date.parse(p.privateData[CHAVE].em)).not.toBeNaN();
    // O NIF é pessoal e metadata é pública em Sharetribe: só lá pode ir a
    // indicação de que está completa.
    expect(p.metadata).toEqual({ [CHAVE_METADATA]: true });
    expect(JSON.stringify(p.metadata)).not.toContain('503004561');
  });

  it('não grava uma declaração incompleta', async () => {
    const sdk = sdkQueGrava();
    const r = await gravar(sdk, conta(), { ...DECLARACAO_VALIDA, veracidade: false });
    expect(r.gravada).toBe(false);
    expect(r.problemas).toHaveLength(1);
    expect(sdk.escrito).toHaveLength(0);
  });

  // O corpo do pedido não pode semear privateData com o que lhe apetecer.
  it('ignora campos que não fazem parte da declaração', async () => {
    const sdk = sdkQueGrava();
    await gravar(sdk, conta(), { ...DECLARACAO_VALIDA, comissao: 0, admin: true });
    const guardada = sdk.escrito[0].privateData[CHAVE];
    expect(guardada.comissao).toBeUndefined();
    expect(guardada.admin).toBeUndefined();
  });
});

describe('declaracaoDe', () => {
  it('devolve vazio quando não há nada guardado', () => {
    expect(declaracaoDe(conta())).toEqual({});
    expect(declaracaoDe(null)).toEqual({});
  });
});
