import '@testing-library/jest-dom';

import { types as sdkTypes } from '../../util/sdkLoader';

// As chamadas ao nosso servidor, guardadas para depois se verem.
const mockChamadas = [];

jest.mock('../../util/api', () => {
  const real = jest.requireActual('../../util/api');
  const resposta = () =>
    Promise.resolve({
      data: { data: { id: { uuid: 'tx-1' }, type: 'transaction', attributes: {} }, included: [] },
    });
  return {
    __esModule: true,
    ...real,
    initiatePrivileged: body => {
      mockChamadas.push(body);
      return resposta();
    },
    transitionPrivileged: body => {
      mockChamadas.push(body);
      return resposta();
    },
  };
});

const {
  initiateOrderPayloadCreator,
  speculateTransactionPayloadCreator,
} = require('./CheckoutPage.duck');
const { getOrderParams } = require('./CheckoutPageWithPayment');

const { UUID, Money } = sdkTypes;

const ANUNCIO = {
  id: new UUID('l-1'),
  attributes: {
    price: new Money(450000, 'EUR'),
    publicData: {
      listingType: 'daily-rental',
      unitType: 'day',
      transactionProcessAlias: 'default-booking/release-1',
      precos: { day: 450000, hour: 60000 },
    },
  },
};

const CONFIG = { listing: { listingTypes: [] } };

const pageData = modoDePreco => ({
  listing: ANUNCIO,
  orderData: {
    bookingDates: {
      bookingStart: new Date('2026-07-10T08:00:00.000Z'),
      bookingEnd: new Date('2026-07-10T11:00:00.000Z'),
    },
    ...(modoDePreco ? { modoDePreco } : {}),
  },
});

beforeEach(() => {
  mockChamadas.length = 0;
});

/**
 * O CAMINHO DO MODO DE ALUGUER ATÉ AO SERVIDOR
 *
 * Esta é a parte que quase me escapou. O checkout monta os parâmetros da
 * transação à mão, campo a campo: o que não for nomeado explicitamente é
 * deitado fora. O modo escolhido desaparecia pelo caminho e a reserva seguia
 * na mesma — cobrada ao preço do modo principal. Três horas pagas como três
 * dias, sem erro nenhum à vista.
 */
describe('getOrderParams — o modo escolhido vai com a reserva', () => {
  it('leva o modo nos parâmetros, para o servidor saber o que cobrar', () => {
    const p = getOrderParams(pageData('hour'), {}, {}, CONFIG);
    expect(p.modoDePreco).toBe('hour');
  });

  /**
   * Também fica guardado na transação. É de lá que o contrato e os emails
   * sabem dizer "à hora" ou "ao dia" meses depois — o anúncio, a essa altura,
   * já pode ter outros preços.
   */
  it('guarda na transação como foi reservada', () => {
    const p = getOrderParams(pageData('hour'), {}, {}, CONFIG);
    expect(p.protectedData.modoDePreco).toBe('hour');
  });

  it('num anúncio de um modo só, não acrescenta nada', () => {
    const p = getOrderParams(pageData(null), {}, {}, CONFIG);
    expect(p.modoDePreco).toBeUndefined();
    expect(p.protectedData.modoDePreco).toBeUndefined();
  });
});

/**
 * E ONDE ELE NÃO PODE IR
 *
 * `params` é o que segue para a API da Sharetribe. Ela não conhece
 * `modoDePreco`, e um parâmetro que não conhece faz a transição ser recusada —
 * ou seja, a reserva não acontece de todo. O modo tem de viajar no `orderData`,
 * que é o campo que só o nosso servidor lê.
 */
describe('o pedido ao servidor', () => {
  const chamar = async (criador, orderParams) => {
    await criador(
      {
        orderParams,
        processAlias: 'default-booking/release-1',
        transitionName: 'transition/request-payment',
        isPrivilegedTransition: true,
      },
      { dispatch: jest.fn(), extra: {}, rejectWithValue: v => v }
    );
  };

  it('manda o modo ao nosso servidor, e não à Sharetribe', async () => {
    await chamar(initiateOrderPayloadCreator, {
      listingId: ANUNCIO.id,
      bookingDates: {
        bookingStart: new Date('2026-07-10T08:00:00.000Z'),
        bookingEnd: new Date('2026-07-10T11:00:00.000Z'),
      },
      modoDePreco: 'hour',
    });

    const { orderData, bodyParams } = mockChamadas[0];
    expect(orderData.modoDePreco).toBe('hour');
    expect(bodyParams.params.modoDePreco).toBeUndefined();
  });

  // O mesmo para o cálculo prévio: é ele que mostra o total antes de pagar, e
  // se divergisse do real a pessoa via um preço e pagava outro.
  it('o mesmo no cálculo prévio do total', async () => {
    await chamar(speculateTransactionPayloadCreator, {
      listingId: ANUNCIO.id,
      bookingDates: {
        bookingStart: new Date('2026-07-10T08:00:00.000Z'),
        bookingEnd: new Date('2026-07-10T11:00:00.000Z'),
      },
      modoDePreco: 'hour',
    });

    const { orderData, bodyParams } = mockChamadas[0];
    expect(orderData.modoDePreco).toBe('hour');
    expect(bodyParams.params.modoDePreco).toBeUndefined();
  });
});
