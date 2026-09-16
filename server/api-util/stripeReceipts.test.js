/**
 * Quem paga o destaque recebe recibo do Stripe; quem paga uma reserva não
 * recebia nada. A diferença era um campo vazio, não uma decisão.
 */

const mockStripe = {
  charges: {
    search: jest.fn(),
    list: jest.fn(),
    update: jest.fn(async () => ({})),
  },
};

jest.mock('stripe', () => jest.fn(() => mockStripe));

const { pedirReciboDaReserva, acharCobranca } = require('./stripeReceipts');

const cobranca = (over = {}) => ({
  id: 'ch_1',
  receipt_email: null,
  metadata: { 'sharetribe-transaction-id': 'tx-1' },
  ...over,
});

const OLD_ENV = process.env;

beforeEach(() => {
  process.env = { ...OLD_ENV, STRIPE_SECRET_KEY: 'sk_test_x' };
  mockStripe.charges.search.mockReset().mockResolvedValue({ data: [] });
  mockStripe.charges.list.mockReset().mockResolvedValue({ data: [] });
  mockStripe.charges.update.mockClear().mockResolvedValue({});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  process.env = OLD_ENV;
  jest.restoreAllMocks();
});

describe('encontrar a cobrança da reserva', () => {
  it('pela procura indexada, quando ela a conhece', async () => {
    mockStripe.charges.search.mockResolvedValue({ data: [cobranca()] });

    const c = await acharCobranca(mockStripe, 'tx-1');

    expect(c.id).toBe('ch_1');
    expect(mockStripe.charges.list).not.toHaveBeenCalled();
  });

  /**
   * O índice do Stripe demora até um minuto a ver uma cobrança acabada de
   * nascer — e é exactamente aí que o job chega. Desistir seria deixar a
   * reserva mais recente sem recibo.
   */
  it('pela lista recente, quando a procura ainda não a indexou', async () => {
    mockStripe.charges.search.mockResolvedValue({ data: [] });
    mockStripe.charges.list.mockResolvedValue({
      data: [cobranca({ id: 'ch_outra', metadata: {} }), cobranca()],
    });

    expect((await acharCobranca(mockStripe, 'tx-1')).id).toBe('ch_1');
  });

  it('a procura em erro não impede a lista', async () => {
    mockStripe.charges.search.mockRejectedValue(new Error('search em baixo'));
    mockStripe.charges.list.mockResolvedValue({ data: [cobranca()] });

    expect((await acharCobranca(mockStripe, 'tx-1')).id).toBe('ch_1');
  });
});

describe('pedir o recibo', () => {
  it('preenche o email em falta na cobrança', async () => {
    mockStripe.charges.search.mockResolvedValue({ data: [cobranca()] });

    expect(await pedirReciboDaReserva({ txId: 'tx-1', email: 'quem@pagou.pt' })).toBe(true);
    expect(mockStripe.charges.update).toHaveBeenCalledWith('ch_1', {
      receipt_email: 'quem@pagou.pt',
    });
  });

  // Reescrever o endereço faz o Stripe mandar outro recibo. Uma vez chega.
  it('não mexe numa cobrança que já tem endereço', async () => {
    mockStripe.charges.search.mockResolvedValue({
      data: [cobranca({ receipt_email: 'ja@tinha.pt' })],
    });

    expect(await pedirReciboDaReserva({ txId: 'tx-1', email: 'outro@email.pt' })).toBe(true);
    expect(mockStripe.charges.update).not.toHaveBeenCalled();
  });

  it('sem cobrança encontrada, diz que não e não inventa', async () => {
    expect(await pedirReciboDaReserva({ txId: 'tx-desconhecida', email: 'a@b.pt' })).toBe(false);
    expect(mockStripe.charges.update).not.toHaveBeenCalled();
  });

  it('sem email não faz nada', async () => {
    expect(await pedirReciboDaReserva({ txId: 'tx-1', email: null })).toBe(false);
    expect(mockStripe.charges.update).not.toHaveBeenCalled();
  });

  it('sem chave do Stripe fica inerte', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    expect(await pedirReciboDaReserva({ txId: 'tx-1', email: 'a@b.pt' })).toBe(false);
  });
});
