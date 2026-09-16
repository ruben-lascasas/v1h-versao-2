const {
  CHAVE,
  SEM_DADO,
  versoesEmVigor,
  ponteiroDe,
  congelar,
  valores,
  substituirEm,
  preencherBlocos,
} = require('./bookingContract');
const modelo = require('../../src/containers/LegalPage/documentos/contrato-de-reserva.json');
const CATALOGO = require('../../src/config/legalDocuments.json');

// O modelo vem em JSON, e não do módulo .js: o servidor é CommonJS e não
// consegue importar um módulo ESM. É por isso que o conversor emite as duas
// formas para os documentos marcados como modelo.
const BLOCOS = modelo.blocos;

const sdkQueGrava = () => {
  const escrito = [];
  return { escrito, transactions: { updateMetadata: async p => (escrito.push(p), {}) } };
};

const transacao = (over = {}) => ({
  id: { uuid: 'tx-7' },
  attributes: {
    createdAt: '2026-10-01T09:30:00.000Z',
    lastTransitionedAt: '2026-10-01T09:31:00.000Z',
    payinTotal: { amount: 10000, currency: 'EUR' },
    lineItems: [
      { code: 'line-item/day', quantity: 1, lineTotal: { amount: 10000, currency: 'EUR' } },
    ],
    metadata: {},
    protectedData: {},
    ...over,
  },
});

const anfitriao = {
  id: { uuid: 'u-host' },
  attributes: {
    email: 'anfitriao@exemplo.pt',
    profile: {
      displayName: 'Lídia F.',
      privateData: { hostDeclaration: { nif: '503004561', residenciaFiscal: 'Portugal' } },
    },
  },
};

const cliente = {
  id: { uuid: 'u-guest' },
  attributes: { email: 'cliente@exemplo.pt', profile: { displayName: 'Ana S.' } },
};

const anuncio = {
  id: { uuid: 'l-1' },
  attributes: {
    title: 'Quinta do Sol',
    createdAt: '2026-08-01T00:00:00.000Z',
    publicData: { location: { address: 'Rua das Flores 12, Lisboa' }, capacidade: 40 },
  },
};

const mapa = () => valores({ transaction: transacao(), listing: anuncio, host: anfitriao, guest: cliente });

describe('versões em vigor', () => {
  it('inclui todos os documentos que se prendem a uma reserva', () => {
    const v = versoesEmVigor();
    expect(v['contrato-de-reserva']).toBeTruthy();
    expect(v['termos-de-servico']).toBeTruthy();
    expect(v['cancelamento-e-reembolso']).toBeTruthy();
  });

  it('as versões são as do catálogo, não inventadas', () => {
    const doCatalogo = CATALOGO.find(d => d.slug === 'termos-de-servico').versao;
    expect(versoesEmVigor()['termos-de-servico']).toBe(doCatalogo);
  });
});

describe('congelar as versões numa reserva', () => {
  it('grava as versões e o instante', async () => {
    const sdk = sdkQueGrava();
    const r = await congelar(sdk, transacao());

    expect(r.congelado).toBe(true);
    const guardado = sdk.escrito[0].metadata[CHAVE];
    expect(guardado.versoes['contrato-de-reserva']).toBeTruthy();
    expect(Date.parse(guardado.em)).not.toBeNaN();
  });

  // Se as versões mudassem a meio, o contrato de uma reserva antiga passava a
  // citar um texto que não estava em vigor quando ela se formou.
  it('não volta a congelar uma reserva que já tem ponteiro', async () => {
    const antigo = { versoes: { 'termos-de-servico': '0.9' }, em: '2026-01-01T00:00:00.000Z' };
    const sdk = sdkQueGrava();
    const r = await congelar(sdk, transacao({ metadata: { [CHAVE]: antigo } }));

    expect(r.congelado).toBe(false);
    expect(r.ponteiro).toEqual(antigo);
    expect(sdk.escrito).toHaveLength(0);
  });

  it('ponteiroDe devolve null quando ainda não há', () => {
    expect(ponteiroDe(transacao())).toBeNull();
  });
});

describe('os valores do contrato', () => {
  it('tira as partes, o espaço e o preço dos dados reais', () => {
    const m = mapa();
    expect(m.BOOKING_ID).toBe('tx-7');
    expect(m.HOST_NAME).toBe('Lídia F.');
    expect(m.GUEST_NAME).toBe('Ana S.');
    expect(m['HOST_TAX_ID / COMPANY_ID']).toBe('503004561');
    expect(m.LISTING_TITLE).toBe('Quinta do Sol');
    expect(m.LISTING_ADDRESS).toBe('Rua das Flores 12, Lisboa');
    // Sem a moeda: o modelo escreve "Preço do Espaço: €[SPACE_PRICE]", e
    // devolver "100.00 EUR" dava "€100.00 EUR" no contrato.
    expect(m.TOTAL_PRICE).toBe('100,00');
    expect(m.SPACE_PRICE).toBe('100,00');
  });

  // O NIF do anfitrião vem da Declaração de Conformidade — é a ligação entre o
  // Legal Gate e o contrato.
  it('o NIF vem da declaração do anfitrião', () => {
    const semDeclaracao = { ...anfitriao, attributes: { ...anfitriao.attributes, profile: { displayName: 'X' } } };
    const m = valores({ transaction: transacao(), listing: anuncio, host: semDeclaracao, guest: cliente });
    expect(m['HOST_TAX_ID / COMPANY_ID']).toBeNull();
  });

  it('usa as versões congeladas quando existem, e não as de hoje', () => {
    const ponteiro = { versoes: { 'termos-de-servico': '0.9' }, em: '2026-01-01T00:00:00.000Z' };
    const m = valores({ transaction: transacao(), listing: anuncio, host: anfitriao, guest: cliente, ponteiro });
    expect(m.TOS_VERSION).toBe('0.9');
  });
});

describe('substituição no texto', () => {
  it('troca os marcadores pelos valores', () => {
    expect(substituirEm('Reserva [BOOKING_ID] de [HOST_NAME]', mapa())).toBe('Reserva tx-7 de Lídia F.');
  });

  // Um contrato com `[ACCESS_INSTRUCTIONS]` à vista não parece um contrato.
  it('um campo sem dado fica "não aplicável", não fica o marcador', () => {
    const t = substituirEm('Acesso: [ACCESS_INSTRUCTIONS]', mapa());
    expect(t).toBe(`Acesso: ${SEM_DADO}`);
    expect(t).not.toContain('[');
  });

  // Os encargos são outra coisa: existem e são zero. "não aplicável" no meio de
  // uma soma deixava as contas do contrato sem fechar.
  it('os encargos que são nenhum escrevem-se a zero', () => {
    const m = mapa();
    expect(m.GUEST_FEE).toBe('0,00');
    expect(m.TAXES).toBe('0,00');
    expect(m.OTHER_FEES).toBe('0,00');
    expect(substituirEm('Impostos: €[TAXES]', m)).toBe('Impostos: €0,00');
  });

  // Estes são exemplos de formato dentro dos documentos, não campos nossos.
  it('marcadores que não são nossos ficam intactos', () => {
    expect(substituirEm('Exemplo: N&A-V1H-[ANO]-[NUMERO]', mapa())).toContain('[ANO]');
  });
});

describe('preencher o modelo inteiro', () => {
  it('não sobra nenhum marcador conhecido no contrato final', () => {
    const preenchido = preencherBlocos(BLOCOS, mapa());
    const texto = JSON.stringify(preenchido);
    for (const campo of ['HOST_NAME', 'GUEST_NAME', 'BOOKING_ID', 'LISTING_ADDRESS', 'TOTAL_PRICE']) {
      expect(texto).not.toContain(`[${campo}]`);
    }
  });

  it('o contrato preenchido tem os nomes reais das duas partes', () => {
    const texto = JSON.stringify(preencherBlocos(BLOCOS, mapa()));
    expect(texto).toContain('Lídia F.');
    expect(texto).toContain('Ana S.');
  });

  it('mantém a estrutura de blocos do modelo', () => {
    const preenchido = preencherBlocos(BLOCOS, mapa());
    expect(preenchido).toHaveLength(BLOCOS.length);
    expect(preenchido.map(b => b.tipo)).toEqual(BLOCOS.map(b => b.tipo));
  });
});

describe('o que estava em branco no primeiro contrato verdadeiro', () => {
  const reserva = {
    id: { uuid: 'b-1' },
    type: 'booking',
    // Meia-noite de Lisboa, que em UTC é o dia anterior às 23:00.
    attributes: { start: '2026-09-16T23:00:00.000Z', end: '2026-09-17T23:00:00.000Z' },
  };
  const comReserva = extra =>
    valores({
      transaction: transacao(extra),
      listing: anuncio,
      host: anfitriao,
      guest: cliente,
      booking: reserva,
    });

  /**
   * A reserva vem em `included`, não dentro dos atributos da transacção. Lia-se
   * de `tx.booking`, que nunca existe: todas as reservas saíam com "Hora de
   * início: não aplicável".
   */
  it('as horas da reserva aparecem', () => {
    const m = comReserva();
    expect(m.START_TIME).toBeTruthy();
    expect(m.END_TIME).toBeTruthy();
  });

  /**
   * O servidor de produção está em UTC. A formatação usava a hora local do
   * processo, por isso a meia-noite de Lisboa saía como o dia anterior às
   * 23:00 — a data errada, num documento que é prova.
   */
  it('as horas são as de Lisboa, não as do servidor', () => {
    expect(comReserva().START_TIME).toBe('17-09-2026 00:00');
  });

  // Dizia "Duração total: [object Object] day": a quantidade vem como
  // BigDecimal do SDK, e a unidade vinha em inglês.
  it('a duração é legível e em português', () => {
    expect(comReserva().DURATION).toBe('1 dia');

    const tresDias = {
      lineItems: [
        {
          code: 'line-item/day',
          quantity: { _sdkType: 'BigDecimal', value: '3' },
          lineTotal: { amount: 30000, currency: 'EUR' },
        },
      ],
    };
    expect(comReserva(tresDias).DURATION).toBe('3 dias');
  });

  it('uma reserva por hora conta horas', () => {
    const porHora = {
      lineItems: [
        {
          code: 'line-item/hour',
          quantity: { _sdkType: 'BigDecimal', value: '2' },
          lineTotal: { amount: 1000, currency: 'EUR' },
        },
      ],
    };
    expect(comReserva(porHora).DURATION).toBe('2 horas');
  });

  // Os campos do anúncio nesta marketplace chamam-se `numero_pessoas` e
  // `comodidades`; procurava-se por nomes que não existem aqui.
  it('a capacidade e as comodidades do anúncio entram no contrato', () => {
    const real = {
      ...anuncio,
      attributes: {
        ...anuncio.attributes,
        publicData: {
          location: { address: 'Rua das Flores 12, Lisboa' },
          numero_pessoas: 20,
          comodidades: ['wifi', 'casa-banho'],
        },
      },
    };
    const m = valores({ transaction: transacao(), listing: real, host: anfitriao, guest: cliente });

    expect(m['CAPACITY / AREA']).toBe('20 pessoas');
    expect(m.LISTING_FEATURES).toBe('Wifi, Casa banho');
  });
});

describe('as opções que o modelo deixa por escolher', () => {
  const comClassificacao = classificacao => ({
    ...anfitriao,
    attributes: {
      ...anfitriao.attributes,
      profile: {
        displayName: 'Lídia F.',
        privateData: { hostDeclaration: { nif: '503004561', classificacao } },
      },
    },
  });
  const mapaCom = classificacao =>
    valores({
      transaction: transacao(),
      listing: anuncio,
      host: comClassificacao(classificacao),
      guest: cliente,
    });

  /**
   * Um contrato com opções por assinalar não é um contrato: é um formulário.
   * O estatuto é dado que já temos — vem da Declaração de Conformidade.
   */
  it('o estatuto do anfitrião vem da declaração dele', () => {
    expect(substituirEm('Estatuto: [Profissional / Particular]', mapaCom('particular'))).toBe(
      'Estatuto: Particular'
    );
    expect(substituirEm('Estatuto: [Profissional / Particular]', mapaCom('profissional'))).toBe(
      'Estatuto: Profissional'
    );
  });

  it('sem declaração, diz que não foi declarado em vez de escolher por ele', () => {
    expect(substituirEm('Estatuto: [Profissional / Particular]', mapaCom(undefined))).toBe(
      'Estatuto: não declarado'
    );
  });

  /**
   * Nenhuma destas respostas pode conceder o que ninguém concedeu: não há
   * seguro associado, não há caução, e o documento fiscal do Espaço é do
   * Anfitrião — a Venue1Hub cobra e transfere, não factura por ele.
   */
  it('responde às restantes com o que é verdade hoje', () => {
    const m = mapa();
    expect(substituirEm('Seguro Venue1Hub associado: [Sim / Não]', m)).toBe(
      'Seguro Venue1Hub associado: Não'
    );
    // O rótulo e a opção vivem em pedaços diferentes do parágrafo: a escolha
    // tem de funcionar sobre o parêntesis sozinho.
    expect(substituirEm('[Sim / Não / Não confirmado]', m)).toBe('Não confirmado');
    expect(substituirEm('[Sim / Não]', m)).toBe('Não');
    expect(substituirEm('Para esta Reserva:\n[Não aplicável / Aplicável]', m)).toContain(
      'Não aplicável'
    );
    expect(substituirEm('[HOST / mecanismo autorizado em nome do Host]', m)).toBe('Anfitrião (Host)');
    expect(substituirEm('[Permitida / Não permitida / Sujeita a autorização]', m)).toBe(
      'Sujeita a autorização do Anfitrião'
    );
  });
});
