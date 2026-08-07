/**
 * O webhook é o único sítio onde o plano de um anfitrião muda, por isso é onde
 * um erro custa dinheiro: dar plano a quem não pagou, ou tirá-lo a quem pagou.
 * Os testes cobrem esses dois sentidos.
 */

jest.mock('../api-util/hostPlanStore');

const store = require('../api-util/hostPlanStore');
const billing = require('../api-util/stripeBilling');
const webhook = require('./stripe-webhook');

const USER = '11111111-2222-3333-4444-555555555555';

const subscription = (over = {}) => ({
  id: 'sub_1',
  status: 'active',
  customer: 'cus_1',
  cancel_at_period_end: false,
  current_period_end: 1893456000, // 2030-01-01
  metadata: { sharetribeUserId: USER, plan: 'pro' },
  items: { data: [{ price: { id: 'price_pro_m', recurring: { interval: 'month' } } }] },
  ...over,
});

const OLD_ENV = process.env;
beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...OLD_ENV,
    // Sem chave, billing.client() lança e o recurso ao Customer nunca chega a
    // ser exercitado — os testes passariam pela razão errada.
    STRIPE_SECRET_KEY: 'sk_test_x',
    STRIPE_WEBHOOK_SECRET: 'whsec_x',
    STRIPE_PRICE_PRO_MONTH: 'price_pro_m',
    STRIPE_PRICE_BUSINESS_MONTH: 'price_biz_m',
  };
  store.applyPlan.mockResolvedValue({});
  store.revertToFree.mockResolvedValue({});
});
afterEach(() => {
  process.env = OLD_ENV;
});

describe('a quem pertence a subscrição', () => {
  it('lê o utilizador dos metadata da subscrição', async () => {
    await expect(webhook.resolveUserId(subscription())).resolves.toBe(USER);
  });

  it('recorre ao Customer quando a subscrição não o traz', async () => {
    billing.__setClient({
      customers: { retrieve: jest.fn().mockResolvedValue({ metadata: { sharetribeUserId: USER } }) },
    });
    const sub = subscription({ metadata: {} });
    await expect(webhook.resolveUserId(sub)).resolves.toBe(USER);
  });

  it('devolve null quando não há forma de saber', async () => {
    billing.__setClient({ customers: { retrieve: jest.fn().mockResolvedValue({ metadata: {} }) } });
    await expect(webhook.resolveUserId(subscription({ metadata: {} }))).resolves.toBeNull();
  });
});

describe('que plano corresponde à subscrição', () => {
  it('usa o Price ID, que é a fonte fiável', () => {
    expect(webhook.planForSubscription(subscription())).toBe('pro');
  });

  // Se o anfitrião trocar de plano dentro do Billing Portal, o Price muda mas os
  // metadata gravados no Checkout ficam com o plano antigo. Ganha o Price.
  it('o Price ganha aos metadata desactualizados', () => {
    const sub = subscription({
      metadata: { sharetribeUserId: USER, plan: 'pro' },
      items: { data: [{ price: { id: 'price_biz_m', recurring: { interval: 'month' } } }] },
    });
    expect(webhook.planForSubscription(sub)).toBe('business');
  });

  it('devolve null se o Price não for de nenhum plano nosso', () => {
    const sub = subscription({
      metadata: {},
      items: { data: [{ price: { id: 'price_outro' } }] },
    });
    expect(webhook.planForSubscription(sub)).toBeNull();
  });
});

describe('aplicar a mudança de subscrição', () => {
  it('atribui o plano quando a subscrição está activa', async () => {
    await webhook.handleSubscriptionChange(subscription());
    expect(store.applyPlan).toHaveBeenCalledWith(USER, 'pro', expect.objectContaining({
      id: 'sub_1',
      active: true,
    }));
    expect(store.revertToFree).not.toHaveBeenCalled();
  });

  it('trialing também dá direito ao plano', async () => {
    await webhook.handleSubscriptionChange(subscription({ status: 'trialing' }));
    expect(store.applyPlan).toHaveBeenCalledWith(USER, 'pro', expect.anything());
  });

  // O sentido que protege a receita: um Price de plano pago não pode dar plano
  // se a subscrição já não está boa.
  it.each(['past_due', 'canceled', 'unpaid', 'incomplete_expired'])(
    'estado %s volta ao Gratuito mesmo com Price de plano pago',
    async status => {
      await webhook.handleSubscriptionChange(subscription({ status }));
      expect(store.revertToFree).toHaveBeenCalledWith(USER, expect.objectContaining({ active: false }));
      expect(store.applyPlan).not.toHaveBeenCalled();
    }
  );

  it('não escreve nada se o Price não corresponder a um plano', async () => {
    const sub = subscription({ items: { data: [{ price: { id: 'price_fantasma' } }] }, metadata: { sharetribeUserId: USER } });
    await webhook.handleSubscriptionChange(sub);
    expect(store.applyPlan).not.toHaveBeenCalled();
    expect(store.revertToFree).not.toHaveBeenCalled();
  });

  it('não escreve nada se não souber de quem é', async () => {
    billing.__setClient({ customers: { retrieve: jest.fn().mockResolvedValue({ metadata: {} }) } });
    await webhook.handleSubscriptionChange(subscription({ metadata: {} }));
    expect(store.applyPlan).not.toHaveBeenCalled();
  });

  // O Stripe repete eventos e pode entregá-los fora de ordem; tratar o mesmo
  // evento duas vezes tem de dar o mesmo resultado.
  it('é idempotente', async () => {
    await webhook.handleSubscriptionChange(subscription());
    await webhook.handleSubscriptionChange(subscription());
    expect(store.applyPlan).toHaveBeenCalledTimes(2);
    expect(store.applyPlan.mock.calls[0]).toEqual(store.applyPlan.mock.calls[1]);
  });
});

describe('resumo guardado da subscrição', () => {
  it('guarda só o essencial, em formato estável', () => {
    expect(billing.subscriptionSummary(subscription())).toEqual({
      id: 'sub_1',
      status: 'active',
      active: true,
      priceId: 'price_pro_m',
      interval: 'month',
      cancelAtPeriodEnd: false,
      currentPeriodEnd: '2030-01-01T00:00:00.000Z',
    });
  });

  it('aguenta uma subscrição sem items nem data de fim', () => {
    const s = billing.subscriptionSummary({ id: 'sub_2', status: 'canceled' });
    expect(s).toEqual({
      id: 'sub_2',
      status: 'canceled',
      active: false,
      priceId: null,
      interval: null,
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
    });
  });
});

describe('o endpoint', () => {
  const mockRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  it('recusa um corpo com assinatura inválida', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    billing.__setClient({
      webhooks: {
        constructEvent: () => {
          throw new Error('no signatures found matching the expected signature');
        },
      },
    });
    const res = mockRes();
    await webhook.handler({ body: Buffer.from('{}'), get: () => 'assinatura-forjada' }, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(store.applyPlan).not.toHaveBeenCalled();
  });

  it('sem chave configurada responde 503 e não escreve nada', async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const res = mockRes();
    await webhook.handler({ body: Buffer.from('{}'), get: () => 'x' }, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(store.applyPlan).not.toHaveBeenCalled();
  });

  it('devolve 500 quando o tratamento falha, para o Stripe repetir', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    billing.__setClient({
      webhooks: {
        constructEvent: () => ({
          type: 'customer.subscription.updated',
          data: { object: subscription() },
        }),
      },
    });
    store.applyPlan.mockRejectedValue(new Error('integration api em baixo'));
    const res = mockRes();
    await webhook.handler({ body: Buffer.from('{}'), get: () => 'sig' }, res);
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('ignora eventos que não nos dizem respeito', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_x';
    billing.__setClient({
      webhooks: { constructEvent: () => ({ type: 'charge.succeeded', data: { object: {} } }) },
    });
    const res = mockRes();
    await webhook.handler({ body: Buffer.from('{}'), get: () => 'sig' }, res);
    expect(res.json).toHaveBeenCalledWith({ received: true });
    expect(store.applyPlan).not.toHaveBeenCalled();
  });
});
