/**
 * As recusas por falta de configuração são as que o operador vai encontrar
 * primeiro, e as duas dão a mesma mensagem no ecrã. Estes testes fixam que cada
 * uma se distingue no código de erro e deixa rasto no log.
 */

const mockCurrentUserShow = jest.fn();
const mockOwnListingsShow = jest.fn();

jest.mock('../api-util/sdk', () => ({
  ...jest.requireActual('../api-util/sdk'),
  getSdk: () => ({
    currentUser: { show: mockCurrentUserShow },
    ownListings: { show: mockOwnListingsShow },
  }),
}));

const { checkout } = require('./destaque-billing');

const USER = {
  id: { uuid: 'user-1' },
  attributes: { email: 'anfitriao@exemplo.pt', profile: { firstName: 'Rúben' } },
};

const mockRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const OLD_ENV = process.env;
let errorLog;

beforeEach(() => {
  process.env = { ...OLD_ENV };
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_PRICE_DESTAQUE;
  mockCurrentUserShow.mockResolvedValue({ data: { data: USER } });
  mockOwnListingsShow.mockResolvedValue({ data: { data: { id: { uuid: 'listing-1' } } } });
  errorLog = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  process.env = OLD_ENV;
  errorLog.mockRestore();
});

const call = (body = { listingId: 'listing-1' }) => {
  const res = mockRes();
  return checkout({ body }, res).then(() => res);
};

describe('recusas de configuração', () => {
  it('sem chave do Stripe: 503 e diz qual falta no log', async () => {
    const res = await call();

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'billing-not-configured' });
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('STRIPE_SECRET_KEY'));
  });

  it('com chave mas sem Price: distingue-se da anterior', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    const res = await call();

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ error: 'price-not-configured' });
    expect(errorLog).toHaveBeenCalledWith(expect.stringContaining('STRIPE_PRICE_DESTAQUE'));
  });
});

describe('autorização', () => {
  // A posse é verificada antes de se falar com o Stripe, mas depois da
  // configuração: sem chaves nem se chega aqui.
  it('sem sessão devolve 401 e não olha para a configuração', async () => {
    mockCurrentUserShow.mockRejectedValue(new Error('sem sessão'));
    const res = await call();

    expect(res.status).toHaveBeenCalledWith(401);
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('anúncio de outro anfitrião é recusado', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_DESTAQUE = 'price_x';
    // ownListings.show só devolve anúncios da sessão em curso; para o de outro
    // dá erro, e é isso que nos protege.
    mockOwnListingsShow.mockRejectedValue(new Error('404'));

    const res = await call({ listingId: 'listing-de-outro' });

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'not-your-listing' });
  });

  it('pedido sem anúncio é recusado', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_PRICE_DESTAQUE = 'price_x';

    const res = await call({});

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: 'missing-listing' });
  });
});
