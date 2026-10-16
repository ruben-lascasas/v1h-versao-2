/**
 * UM ANÚNCIO POR VERIFICAR NÃO RECEBE RESERVAS
 *
 * A pré-publicação deixa qualquer anunciante publicar antes de entregar
 * documentos. O anúncio aparece, pode ser visto e guardado nos favoritos — mas
 * não se reserva enquanto a conta não estiver verificada.
 *
 * Na página do anúncio isso vê-se: o painel de reserva não aparece. Isso é
 * cortesia, não é o portão. O portão é esta recusa, do lado do servidor, e é
 * ela que aguenta um pedido montado à mão. Se este ficheiro ficar a passar
 * com o portão removido, a regra deixa de existir sem que nada pareça estar
 * partido — por isso o que se verifica aqui não é só a resposta de erro, é
 * que **nada foi enviado à Sharetribe**.
 */

const { types } = require('sharetribe-flex-sdk');
const { Money, UUID } = types;

const mockListingsShow = jest.fn();
const mockInitiate = jest.fn();

jest.mock('../api-util/sdk', () => ({
  ...jest.requireActual('../api-util/sdk'),
  getSdk: () => ({ listings: { show: mockListingsShow } }),
  getTrustedSdk: () => Promise.resolve({ transactions: { initiate: (...a) => mockInitiate(...a) } }),
  getIntegrationSdk: () => null,
  fetchCommission: () =>
    Promise.resolve({ data: { data: [{ type: 'jsonAsset', attributes: { data: {} } }] } }),
}));

const handler = require('./initiate-privileged');

const AUTOR = '6aa29295-50a6-4773-b462-cf0316e63e20';

const anuncioDe = podeReceberReservas => ({
  data: {
    data: {
      id: new UUID('6ab26393-df34-4967-a956-f79c19198bd0'),
      attributes: {
        title: 'Espaço acabado de publicar',
        price: new Money(12000, 'EUR'),
        availabilityPlan: { type: 'availability-plan/time', timezone: 'Europe/Lisbon' },
        publicData: {
          listingType: 'espaco',
          unitType: 'day',
          transactionProcessAlias: 'default-booking/release-1',
        },
      },
      relationships: { author: { data: { id: new UUID(AUTOR) } } },
    },
    included:
      podeReceberReservas === undefined
        ? []
        : [{ id: new UUID(AUTOR), type: 'user', attributes: { profile: { metadata: { podeReceberReservas } } } }],
  },
});

const resposta = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.set = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.end = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const reservar = async anuncio => {
  mockListingsShow.mockResolvedValue(anuncio);
  mockInitiate.mockResolvedValue({
    status: 200,
    statusText: 'OK',
    data: { data: { id: new UUID('tx-1'), attributes: {} } },
  });

  const req = {
    body: {
      isSpeculative: false,
      orderData: {},
      bodyParams: {
        processAlias: 'default-booking/release-1',
        transition: 'transition/request-payment',
        params: {
          listingId: new UUID('6ab26393-df34-4967-a956-f79c19198bd0'),
          bookingStart: new Date('2026-07-09T23:00:00.000Z'),
          bookingEnd: new Date('2026-07-11T23:00:00.000Z'),
        },
      },
      queryParams: {},
    },
  };

  const res = resposta();
  await handler(req, res);
  await new Promise(r => setImmediate(r));
  return res;
};

beforeEach(() => {
  mockListingsShow.mockReset();
  mockInitiate.mockReset();
});

describe('reservar um espaço de um anfitrião por verificar', () => {
  it('não chega a ser enviado nada à Sharetribe', async () => {
    await reservar(anuncioDe(false));

    expect(mockInitiate).not.toHaveBeenCalled();
  });

  it('e responde com um conflito, não com um erro interno', async () => {
    const res = await reservar(anuncioDe(false));

    expect(res.status).toHaveBeenCalledWith(409);
  });
});

describe('reservar um espaço de um anfitrião verificado', () => {
  it('segue como sempre seguiu', async () => {
    const res = await reservar(anuncioDe(true));

    expect(mockInitiate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

/**
 * As contas verificadas ao abrigo da regra antiga nunca tiveram esta marca
 * escrita. Se a ausência dela bloqueasse, o anúncio que está publicado hoje
 * deixava de aceitar reservas no instante do deploy — uma avaria a sério, por
 * causa de uma funcionalidade que nem sequer lhes diz respeito.
 */
describe('uma conta sem a marca ainda escrita', () => {
  it('não fica bloqueada', async () => {
    const res = await reservar(anuncioDe(undefined));

    expect(mockInitiate).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(200);
  });
});
