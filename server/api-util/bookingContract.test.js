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
    expect(m.TOTAL_PRICE).toBe('100.00 EUR');
    expect(m.SPACE_PRICE).toBe('100.00 EUR');
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

  // Um contrato com `[DEPOSIT_AMOUNT]` à vista não parece um contrato.
  it('um campo sem dado fica "não aplicável", não fica o marcador', () => {
    const t = substituirEm('Caução: [DEPOSIT_AMOUNT]', mapa());
    expect(t).toBe(`Caução: ${SEM_DADO}`);
    expect(t).not.toContain('[');
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
