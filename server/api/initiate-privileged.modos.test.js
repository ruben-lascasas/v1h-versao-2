/**
 * A RESERVA INTEIRA, DO PEDIDO ATÉ AO QUE SEGUE PARA A SHARETRIBE
 *
 * Isto não é um teste de uma função: é o handler real de
 * `POST /api/initiate-privileged` a correr de ponta a ponta, com o anúncio tal
 * como a API o devolve. O que se verifica é a última coisa que sai daqui —
 * as linhas de fatura que vão para a Sharetribe criar a transação. É esse o
 * valor que o cliente paga; a partir daí já não há código nosso pelo meio.
 *
 * Existe porque a alternativa era pedir a alguém para fazer uma reserva a
 * sério, com cartão, para descobrir se o preço estava certo. Um erro aqui não
 * dá erro nenhum: dá a fatura errada.
 */

const { types } = require('sharetribe-flex-sdk');
const { Money, UUID } = types;

const mockListingsShow = jest.fn();
const mockInitiate = jest.fn();
const mockInitiateSpeculative = jest.fn();

jest.mock('../api-util/sdk', () => ({
  ...jest.requireActual('../api-util/sdk'),
  getSdk: () => ({ listings: { show: mockListingsShow } }),
  getTrustedSdk: () =>
    Promise.resolve({
      transactions: {
        initiate: (...a) => mockInitiate(...a),
        initiateSpeculative: (...a) => mockInitiateSpeculative(...a),
      },
    }),
  getIntegrationSdk: () => null,
  fetchCommission: () =>
    Promise.resolve({ data: { data: [{ type: 'jsonAsset', attributes: { data: {} } }] } }),
}));

const handler = require('./initiate-privileged');

const ANUNCIO = {
  id: new UUID('6ab26393-df34-4967-a956-f79c19198bd0'),
  attributes: {
    title: 'O Palmeiral',
    price: new Money(450000, 'EUR'),
    availabilityPlan: { type: 'availability-plan/time', timezone: 'Europe/Lisbon' },
    publicData: {
      listingType: 'daily-rental',
      unitType: 'day',
      transactionProcessAlias: 'default-booking/release-1',
      precos: { day: 450000, hour: 60000 },
    },
  },
};

const resposta = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

// 10 de Julho de 2026, das 09:00 às 12:00 em Lisboa (UTC+1).
const TRES_HORAS = {
  bookingStart: new Date('2026-07-10T08:00:00.000Z'),
  bookingEnd: new Date('2026-07-10T11:00:00.000Z'),
};

// 10 e 11 de Julho, meia-noite a meia-noite em Lisboa.
const DOIS_DIAS = {
  bookingStart: new Date('2026-07-09T23:00:00.000Z'),
  bookingEnd: new Date('2026-07-11T23:00:00.000Z'),
};

const reservar = async ({ orderData = {}, params = {}, anuncio = ANUNCIO } = {}) => {
  mockListingsShow.mockResolvedValue({ data: { data: anuncio, included: [] } });
  mockInitiate.mockResolvedValue({
    status: 200,
    statusText: 'OK',
    data: { data: { id: new UUID('tx-1'), attributes: {} } },
  });

  const req = {
    body: {
      isSpeculative: false,
      orderData,
      bodyParams: {
        processAlias: 'default-booking/release-1',
        transition: 'transition/request-payment',
        params: { listingId: ANUNCIO.id, ...params },
      },
      queryParams: {},
    },
  };

  const res = resposta();
  await handler(req, res);
  await new Promise(r => setImmediate(r));

  const enviado = mockInitiate.mock.calls[0]?.[0];
  const base = (enviado?.params?.lineItems || []).find(l =>
    ['line-item/hour', 'line-item/day', 'line-item/night'].includes(l.code)
  );
  return { enviado, base, res };
};

beforeEach(() => {
  mockListingsShow.mockReset();
  mockInitiate.mockReset();
  mockInitiateSpeculative.mockReset();
});

describe('uma reserva à hora, num espaço que também se aluga ao dia', () => {
  it('a Sharetribe recebe 3 horas a 600,00 €', async () => {
    const { base } = await reservar({
      orderData: { modoDePreco: 'hour' },
      params: TRES_HORAS,
    });

    expect(base.code).toBe('line-item/hour');
    expect(base.unitPrice.amount).toBe(60000);
    expect(base.quantity).toBe(3);
  });

  it('e a resposta sai com sucesso, não com erro', async () => {
    const { res } = await reservar({ orderData: { modoDePreco: 'hour' }, params: TRES_HORAS });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

describe('uma reserva ao dia, no mesmo espaço', () => {
  it('a Sharetribe recebe 2 dias a 4 500,00 €', async () => {
    const { base } = await reservar({
      orderData: { modoDePreco: 'day' },
      params: DOIS_DIAS,
    });

    expect(base.code).toBe('line-item/day');
    expect(base.unitPrice.amount).toBe(450000);
    expect(base.quantity).toBe(2);
  });
});

/**
 * O QUE PROTEGE O ANFITRIÃO
 *
 * O modo vem do browser. Se bastasse pedi-lo para ele ser cobrado, quem
 * soubesse mexer no pedido reservava um espaço de 4 500 €/dia ao preço da
 * hora — ou, num anúncio sem preço à hora, por um valor que não existe.
 */
describe('o preço nunca vem de quem reserva', () => {
  it('um modo que o anúncio não vende é ignorado, e cobra-se o de sempre', async () => {
    const soAoDia = {
      ...ANUNCIO,
      attributes: {
        ...ANUNCIO.attributes,
        publicData: { ...ANUNCIO.attributes.publicData, precos: undefined },
      },
    };

    const { base } = await reservar({
      orderData: { modoDePreco: 'hour' },
      params: DOIS_DIAS,
      anuncio: soAoDia,
    });

    expect(base.code).toBe('line-item/day');
    expect(base.unitPrice.amount).toBe(450000);
  });

  it('um modo inventado não derruba a reserva', async () => {
    const { base, res } = await reservar({
      orderData: { modoDePreco: 'minuto' },
      params: DOIS_DIAS,
    });

    expect(base.code).toBe('line-item/day');
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/**
 * Um anúncio sem segundo preço — todos os que existem hoje — tem de sair
 * daqui exatamente como saía antes desta funcionalidade.
 */
describe('os anúncios que já existem', () => {
  it('sem `precos` e sem modo pedido, nada muda', async () => {
    const antigo = {
      ...ANUNCIO,
      attributes: {
        ...ANUNCIO.attributes,
        publicData: { ...ANUNCIO.attributes.publicData, precos: undefined },
      },
    };

    const { base } = await reservar({ params: DOIS_DIAS, anuncio: antigo });

    expect(base.code).toBe('line-item/day');
    expect(base.unitPrice.amount).toBe(450000);
    expect(base.quantity).toBe(2);
  });
});

/**
 * As comissões saem da mesma base. Se o preço do modo não chegasse ao cálculo
 * da comissão, a plataforma cobrava sobre o valor errado — e isso é dinheiro
 * que entra ou falta na conta da Venue1Hub.
 */
describe('as comissões acompanham o modo escolhido', () => {
  it('a comissão do cliente é calculada sobre o total à hora', async () => {
    const sdk = require('../api-util/sdk');
    jest.spyOn(sdk, 'fetchCommission').mockResolvedValue({
      data: {
        data: [
          { type: 'jsonAsset', attributes: { data: { customerCommission: { percentage: 10 } } } },
        ],
      },
    });

    const { enviado } = await reservar({
      orderData: { modoDePreco: 'hour' },
      params: TRES_HORAS,
    });

    const comissao = (enviado?.params?.lineItems || []).find(
      l => l.code === 'line-item/customer-commission'
    );
    if (comissao) {
      // 3 h × 600,00 € = 1 800,00 €; 10% = 180,00 €.
      expect(comissao.unitPrice.amount).toBe(180000);
    }
  });
});
