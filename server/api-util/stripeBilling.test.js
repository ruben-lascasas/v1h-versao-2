/**
 * O destaque esteve a dar erro em produção durante horas e nada no ecrã dizia
 * porquê: a mensagem era "Não foi possível abrir a página de pagamento".
 *
 * A causa era esta chamada ao Stripe. Estes testes prendem as duas coisas que
 * correram mal, para não voltarem em silêncio.
 */

const billing = require('./stripeBilling');

const OLD_ENV = process.env;
let fake;

beforeEach(() => {
  process.env = { ...OLD_ENV, STRIPE_SECRET_KEY: 'sk_test_x' };
  fake = {
    customers: {
      create: jest.fn(async () => ({ id: 'cus_novo' })),
      search: jest.fn(async () => ({ data: [] })),
      retrieve: jest.fn(),
    },
    checkout: { sessions: { create: jest.fn(async () => ({ id: 'cs_1', url: 'https://pagar' })) } },
  };
  billing.__setClient(fake);
});

afterEach(() => {
  process.env = OLD_ENV;
});

describe('sessão de Checkout', () => {
  const criar = () =>
    billing.createCheckoutSession({
      customerId: 'cus_1',
      priceId: 'price_1',
      userId: 'user-1',
      successUrl: 'https://venue1hub.eu/ok',
      cancelUrl: 'https://venue1hub.eu/nao',
      locale: 'pt',
      extraMetadata: { kind: 'destaque', listingId: 'l-1' },
    });

  /**
   * O erro que o Rafael apanhou, palavra por palavra:
   *
   *   "Tax ID collection requires updating business name on the customer. To
   *    enable tax ID collection for an existing customer, please set
   *    `customer_update[name]` to `auto`."
   *
   * Pedir o NIF a um Customer que já existe obriga a deixar o Stripe gravar o
   * nome e a morada nele. Sem isto a sessão nem chega a nascer.
   */
  it('pede o NIF e deixa o Stripe actualizar nome e morada do cliente', async () => {
    await criar();

    const params = fake.checkout.sessions.create.mock.calls[0][0];
    expect(params.tax_id_collection).toEqual({ enabled: true });
    expect(params.customer_update).toEqual({ name: 'auto', address: 'auto' });
  });

  it('é pagamento único, não subscrição', async () => {
    await criar();
    expect(fake.checkout.sessions.create.mock.calls[0][0].mode).toBe('payment');
  });

  // O webhook é que activa o destaque, e sem estes dois campos não sabe de que
  // anúncio se trata nem de quem é o pagamento.
  it('leva o anúncio e o utilizador nos metadata', async () => {
    await criar();
    const params = fake.checkout.sessions.create.mock.calls[0][0];
    expect(params.metadata).toEqual({
      sharetribeUserId: 'user-1',
      kind: 'destaque',
      listingId: 'l-1',
    });
    expect(params.client_reference_id).toBe('user-1');
  });
});

describe('Customer do anfitrião', () => {
  const pedir = () =>
    billing.ensureCustomer({ userId: 'user-1', email: 'anfitriao@exemplo.pt', name: 'Rafael' });

  /**
   * Cinco cliques do mesmo anfitrião numa tarde deixaram cinco Customers com o
   * mesmo email na conta do Stripe: `customers.create` cria sempre um novo, e
   * ninguém procurava antes. O histórico de facturação dele ficava repartido.
   */
  it('reaproveita o Customer que já existe para aquele utilizador', async () => {
    fake.customers.search.mockResolvedValue({ data: [{ id: 'cus_existente' }] });

    expect(await pedir()).toBe('cus_existente');
    expect(fake.customers.create).not.toHaveBeenCalled();
    expect(fake.customers.search.mock.calls[0][0].query).toContain('user-1');
  });

  it('cria quando não há nenhum', async () => {
    expect(await pedir()).toBe('cus_novo');
    expect(fake.customers.create).toHaveBeenCalledTimes(1);
  });

  // A procura é uma optimização. Se a indexação do Stripe falhar ou estiver
  // atrasada, o anfitrião tem de conseguir pagar à mesma.
  it('se a procura falhar, cria em vez de rebentar', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    fake.customers.search.mockRejectedValue(new Error('search em baixo'));

    expect(await pedir()).toBe('cus_novo');
    console.error.mockRestore();
  });

  it('um Customer já conhecido é confirmado sem procurar nada', async () => {
    fake.customers.retrieve.mockResolvedValue({ id: 'cus_guardado', deleted: false });

    const id = await billing.ensureCustomer({
      userId: 'user-1',
      email: 'anfitriao@exemplo.pt',
      existingCustomerId: 'cus_guardado',
    });

    expect(id).toBe('cus_guardado');
    expect(fake.customers.search).not.toHaveBeenCalled();
    expect(fake.customers.create).not.toHaveBeenCalled();
  });
});
