const {
  CHAVE,
  ESTADOS,
  casoDe,
  papelDe,
  contraparte,
  abrir,
  juntarProva,
  responder,
  decidir,
  marcarExecutada,
  MAX_PROVAS,
} = require('./resolutionCase');

const CLIENTE = 'u-cliente';
const ANFITRIAO = 'u-anfitriao';

const transacao = (caso = null) => ({
  id: { uuid: 'tx-1' },
  attributes: { metadata: caso ? { [CHAVE]: caso } : {} },
  relationships: {
    customer: { data: { id: { uuid: CLIENTE } } },
    provider: { data: { id: { uuid: ANFITRIAO } } },
  },
});

const sdkQueGrava = () => {
  const escrito = [];
  return { escrito, transactions: { updateMetadata: async p => (escrito.push(p), {}) } };
};

const DESCRICAO = 'A sala tinha duas cadeiras partidas e a mesa riscada quando chegámos.';

const abrirCaso = async (sdk, tx = transacao()) =>
  abrir(sdk, tx, {
    autor: ANFITRIAO,
    papel: 'anfitriao',
    tipo: 'danos',
    descricao: DESCRICAO,
    valorCents: 12000,
  });

describe('quem é parte da reserva', () => {
  it('reconhece o cliente e o anfitrião', () => {
    expect(papelDe(transacao(), CLIENTE)).toBe('cliente');
    expect(papelDe(transacao(), ANFITRIAO)).toBe('anfitriao');
  });

  // Um terceiro não pode abrir nem ver um caso que não é dele.
  it('não reconhece quem não é parte', () => {
    expect(papelDe(transacao(), 'u-estranho')).toBeNull();
    expect(papelDe(transacao(), undefined)).toBeNull();
  });

  it('a contraparte é sempre a outra', () => {
    expect(contraparte('cliente')).toBe('anfitriao');
    expect(contraparte('anfitriao')).toBe('cliente');
  });
});

describe('abrir um caso', () => {
  it('grava o tipo, a descrição, o valor e quem tem de responder', async () => {
    const sdk = sdkQueGrava();
    const { aberto, caso } = await abrirCaso(sdk);

    expect(aberto).toBe(true);
    expect(caso.estado).toBe(ESTADOS.ABERTO);
    expect(caso.tipo).toBe('danos');
    expect(caso.valorCents).toBe(12000);
    expect(caso.respondePor).toBe('cliente');
    expect(caso.prazoResposta).toBeTruthy();
    expect(caso.cronologia).toHaveLength(1);
    expect(sdk.escrito[0].metadata[CHAVE].descricao).toBe(DESCRICAO);
  });

  it('exige uma descrição que explique alguma coisa', async () => {
    const sdk = sdkQueGrava();
    await expect(
      abrir(sdk, transacao(), { autor: ANFITRIAO, papel: 'anfitriao', tipo: 'danos', descricao: 'partiu' })
    ).rejects.toThrow();
  });

  it('recusa um tipo que não está na lista', async () => {
    const sdk = sdkQueGrava();
    await expect(
      abrir(sdk, transacao(), { autor: ANFITRIAO, papel: 'anfitriao', tipo: 'chatice', descricao: DESCRICAO })
    ).rejects.toThrow();
  });

  it('recusa quem não é parte da reserva', async () => {
    const sdk = sdkQueGrava();
    await expect(
      abrir(sdk, transacao(), { autor: 'u-estranho', papel: null, tipo: 'danos', descricao: DESCRICAO })
    ).rejects.toThrow();
  });

  // Dois dossiers sobre os mesmos factos dão duas decisões possíveis, que é o
  // oposto de resolver.
  it('não abre um segundo caso sobre a mesma reserva', async () => {
    const sdk = sdkQueGrava();
    const { caso } = await abrirCaso(sdk);
    const r = await abrirCaso(sdkQueGrava(), transacao(caso));
    expect(r.aberto).toBe(false);
    expect(r.motivo).toBe('ja-existe');
  });
});

describe('direito de resposta', () => {
  it('a contraparte responde e o estado avança', async () => {
    const sdk = sdkQueGrava();
    const { caso } = await abrirCaso(sdk);

    const depois = await responder(sdkQueGrava(), transacao(caso), {
      papel: 'cliente',
      texto: 'As cadeiras já estavam assim quando entrámos, temos fotografias.',
      aceita: false,
    });

    expect(depois.estado).toBe(ESTADOS.RESPONDIDO);
    expect(depois.resposta.porPapel).toBe('cliente');
    expect(depois.resposta.aceita).toBe(false);
    expect(depois.cronologia).toHaveLength(2);
  });

  // Sem isto, quem abriu o caso escrevia a resposta da outra parte — e um
  // dossier onde isso é possível não prova nada.
  it('quem abriu o caso não pode responder por si próprio', async () => {
    const sdk = sdkQueGrava();
    const { caso } = await abrirCaso(sdk);
    await expect(
      responder(sdkQueGrava(), transacao(caso), { papel: 'anfitriao', texto: 'Tenho razão, obviamente.' })
    ).rejects.toThrow();
  });

  it('não se responde duas vezes', async () => {
    const sdk = sdkQueGrava();
    const { caso } = await abrirCaso(sdk);
    const depois = await responder(sdkQueGrava(), transacao(caso), {
      papel: 'cliente',
      texto: 'Não concordo com o que foi dito.',
    });
    await expect(
      responder(sdkQueGrava(), transacao(depois), { papel: 'cliente', texto: 'Afinal mudei de ideias.' })
    ).rejects.toThrow();
  });
});

describe('provas', () => {
  it('junta uma prova e regista quem a juntou', async () => {
    const sdk = sdkQueGrava();
    const { caso } = await abrirCaso(sdk);
    const depois = await juntarProva(sdkQueGrava(), transacao(caso), {
      papel: 'anfitriao',
      chave: 'resolucao/tx-1/foto.jpg',
      nome: 'foto.jpg',
      contentType: 'image/jpeg',
    });
    expect(depois.provas).toHaveLength(1);
    expect(depois.provas[0].porPapel).toBe('anfitriao');
    expect(depois.cronologia[1].acto).toBe('juntou-prova');
  });

  it('não deixa juntar provas sem fim', async () => {
    const { caso } = await abrirCaso(sdkQueGrava());
    const cheio = { ...caso, provas: Array.from({ length: MAX_PROVAS }, (_, i) => ({ chave: `p${i}` })) };
    await expect(
      juntarProva(sdkQueGrava(), transacao(cheio), { papel: 'cliente', chave: 'mais.jpg' })
    ).rejects.toThrow();
  });
});

describe('decisão da Venue1Hub', () => {
  it('regista o sentido, a fundamentação e o valor', async () => {
    const { caso } = await abrirCaso(sdkQueGrava());
    const depois = await decidir(sdkQueGrava(), transacao(caso), {
      porUserId: 'u-admin',
      sentido: 'solucao-intermedia',
      fundamentacao: 'As fotografias mostram desgaste anterior, mas uma cadeira foi partida durante a reserva.',
      valorCents: 6000,
    });

    expect(depois.estado).toBe(ESTADOS.DECIDIDO);
    expect(depois.decisao.sentido).toBe('solucao-intermedia');
    expect(depois.decisao.valorCents).toBe(6000);
  });

  // "Decidido" e "pago" são coisas diferentes. Confundi-las era deixar alguém a
  // pensar que o dinheiro já tinha voltado.
  it('uma decisão nasce por executar', async () => {
    const { caso } = await abrirCaso(sdkQueGrava());
    const depois = await decidir(sdkQueGrava(), transacao(caso), {
      porUserId: 'u-admin',
      sentido: 'a-favor-de-quem-abriu',
      fundamentacao: 'As provas apresentadas sustentam o pedido, e a outra parte não respondeu.',
    });
    expect(depois.decisao.executada).toBe(false);
    expect(depois.estado).not.toBe(ESTADOS.FECHADO);
  });

  it('exige fundamentação', async () => {
    const { caso } = await abrirCaso(sdkQueGrava());
    await expect(
      decidir(sdkQueGrava(), transacao(caso), { porUserId: 'u-admin', sentido: 'sem-decisao', fundamentacao: 'não' })
    ).rejects.toThrow();
  });

  it('só fecha quando o valor é mesmo movimentado', async () => {
    const { caso } = await abrirCaso(sdkQueGrava());
    const decidido = await decidir(sdkQueGrava(), transacao(caso), {
      porUserId: 'u-admin',
      sentido: 'a-favor-de-quem-abriu',
      fundamentacao: 'As provas apresentadas sustentam o pedido apresentado pelo anfitrião.',
      valorCents: 12000,
    });
    const fechado = await marcarExecutada(sdkQueGrava(), transacao(decidido), {
      porUserId: 'u-admin',
      nota: 'Reembolso parcial na Stripe, re_123',
    });
    expect(fechado.estado).toBe(ESTADOS.FECHADO);
    expect(fechado.decisao.executada).toBe(true);
    expect(fechado.decisao.nota).toContain('re_123');
  });
});

describe('casoDe', () => {
  it('devolve null quando não há caso', () => {
    expect(casoDe(transacao())).toBeNull();
    expect(casoDe(null)).toBeNull();
  });
});
