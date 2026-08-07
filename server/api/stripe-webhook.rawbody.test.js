/**
 * A verificação da assinatura do Stripe depende dos bytes exactos do corpo. Se
 * um bodyParser.json() correr antes da rota, o corpo chega como objecto já
 * desserializado e a assinatura deixa de bater — e o sintoma é um webhook que
 * responde 400 a tudo, em produção, sem erro nenhum nos testes unitários.
 *
 * Este teste levanta um Express com a mesma ordem de middleware do apiRouter e
 * envia um pedido assinado a sério, com a biblioteca do Stripe a gerar o
 * cabeçalho. Não precisa de conta Stripe: a assinatura é HMAC com o segredo.
 */

const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');

jest.mock('../api-util/hostPlanStore');
const store = require('../api-util/hostPlanStore');
const webhook = require('./stripe-webhook');

const SECRET = 'whsec_teste_do_corpo_em_bruto';

const post = (server, path, body, headers) =>
  new Promise(resolve => {
    const { port } = server.address();
    const req = http.request(
      {
        port,
        path,
        method: 'POST',
        agent: false,
        headers: { 'Content-Type': 'application/json', Connection: 'close', ...headers },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      }
    );
    req.end(body);
  });

describe('o corpo em bruto chega intacto ao webhook', () => {
  let server;
  const OLD_ENV = process.env;

  const payload = JSON.stringify({
    id: 'evt_1',
    type: 'customer.subscription.updated',
    data: {
      object: {
        id: 'sub_1',
        status: 'active',
        customer: 'cus_1',
        metadata: { sharetribeUserId: 'user-1', plan: 'pro' },
        items: { data: [{ price: { id: 'price_pro_m', recurring: { interval: 'month' } } }] },
      },
    },
  });

  beforeAll(done => {
    const app = express();
    // Mesma ordem do apiRouter: rota do webhook com raw, e só depois o json.
    app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }), webhook.handler);
    app.use(bodyParser.json());
    server = http.createServer(app).listen(0, done);
  });

  // close() entrega um Error ao callback se ainda houver ligacoes abertas; o
  // teste ja terminou, por isso ignora-se em vez de o passar ao done.
  afterAll(done => {
    server.close(() => done());
  });

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = {
      ...OLD_ENV,
      STRIPE_SECRET_KEY: 'sk_test_x',
      STRIPE_WEBHOOK_SECRET: SECRET,
      STRIPE_PRICE_PRO_MONTH: 'price_pro_m',
    };
    store.applyPlan.mockResolvedValue({});
    store.revertToFree.mockResolvedValue({});
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  const signatureFor = body =>
    Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });

  it('aceita um pedido assinado e aplica o plano', async () => {
    const res = await post(server, '/api/stripe/webhook', payload, {
      'stripe-signature': signatureFor(payload),
    });

    expect(res.status).toBe(200);
    expect(store.applyPlan).toHaveBeenCalledWith('user-1', 'pro', expect.objectContaining({ active: true }));
  });

  it('recusa o mesmo corpo com a assinatura de outro segredo', async () => {
    const wrong = Stripe.webhooks.generateTestHeaderString({
      payload,
      secret: 'whsec_outro_segredo',
    });
    const res = await post(server, '/api/stripe/webhook', payload, { 'stripe-signature': wrong });

    expect(res.status).toBe(400);
    expect(store.applyPlan).not.toHaveBeenCalled();
  });

  // O caso que a assinatura existe para apanhar: alguém intercepta e muda o
  // plano de pro para business no corpo, mantendo a assinatura original.
  it('recusa um corpo adulterado depois de assinado', async () => {
    const signature = signatureFor(payload);
    const tampered = payload.replace('"plan":"pro"', '"plan":"business"');
    const res = await post(server, '/api/stripe/webhook', tampered, {
      'stripe-signature': signature,
    });

    expect(res.status).toBe(400);
    expect(store.applyPlan).not.toHaveBeenCalled();
  });

  it('recusa um pedido sem assinatura nenhuma', async () => {
    const res = await post(server, '/api/stripe/webhook', payload, {});
    expect(res.status).toBe(400);
    expect(store.applyPlan).not.toHaveBeenCalled();
  });
});
