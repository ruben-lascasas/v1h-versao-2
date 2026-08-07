/**
 * A verificação da assinatura do Stripe depende dos bytes exactos do corpo. Se
 * um bodyParser.json() correr antes da rota, o corpo chega como objecto já
 * desserializado e a assinatura deixa de bater — e o sintoma é um webhook que
 * responde 400 a tudo, em produção, sem erro nenhum nos testes unitários.
 *
 * Este teste levanta um Express com a mesma ordem de middleware do apiRouter e
 * envia pedidos assinados a sério, com a biblioteca do Stripe a gerar o
 * cabeçalho. Não precisa de conta Stripe: a assinatura é HMAC com o segredo.
 */

const http = require('http');
const express = require('express');
const bodyParser = require('body-parser');
const Stripe = require('stripe');

const mockListingsUpdate = jest.fn();
jest.mock('../api-util/sdk', () => ({
  ...jest.requireActual('../api-util/sdk'),
  getIntegrationSdk: () => ({ listings: { update: mockListingsUpdate } }),
}));

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

const sessionEvent = (over = {}) =>
  JSON.stringify({
    id: 'evt_1',
    type: 'checkout.session.completed',
    data: {
      object: {
        id: 'cs_1',
        payment_status: 'paid',
        metadata: { sharetribeUserId: 'user-1', kind: 'destaque', listingId: 'listing-1' },
        ...over,
      },
    },
  });

describe('webhook do destaque', () => {
  let server;
  const OLD_ENV = process.env;

  beforeAll(done => {
    const app = express();
    // Mesma ordem do apiRouter: rota do webhook com raw, e só depois o json.
    app.post('/api/stripe/webhook', bodyParser.raw({ type: 'application/json' }), webhook.handler);
    app.use(bodyParser.json());
    server = http.createServer(app).listen(0, done);
  });

  afterAll(done => {
    server.close(() => done());
  });

  beforeEach(() => {
    mockListingsUpdate.mockReset();
    mockListingsUpdate.mockResolvedValue({});
    process.env = { ...OLD_ENV, STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET };
  });
  afterEach(() => {
    process.env = OLD_ENV;
  });

  const sign = body => Stripe.webhooks.generateTestHeaderString({ payload: body, secret: SECRET });

  it('activa o destaque quando o pagamento está concluído', async () => {
    const body = sessionEvent();
    const res = await post(server, '/api/stripe/webhook', body, { 'stripe-signature': sign(body) });

    expect(res.status).toBe(200);
    expect(mockListingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'listing-1',
        publicData: expect.objectContaining({ featured: 'true', featuredPending: null }),
      })
    );
  });

  // Um Checkout em modo payment pode ficar pendente (multibanco, por exemplo).
  it('não activa nada enquanto o pagamento não estiver pago', async () => {
    const body = sessionEvent({ payment_status: 'unpaid' });
    const res = await post(server, '/api/stripe/webhook', body, { 'stripe-signature': sign(body) });

    expect(res.status).toBe(200);
    expect(mockListingsUpdate).not.toHaveBeenCalled();
  });

  it('ignora pagamentos que não sejam destaques', async () => {
    const body = sessionEvent({ metadata: { sharetribeUserId: 'user-1' } });
    const res = await post(server, '/api/stripe/webhook', body, { 'stripe-signature': sign(body) });

    expect(res.status).toBe(200);
    expect(mockListingsUpdate).not.toHaveBeenCalled();
  });

  it('recusa o mesmo corpo com a assinatura de outro segredo', async () => {
    const body = sessionEvent();
    const wrong = Stripe.webhooks.generateTestHeaderString({ payload: body, secret: 'whsec_outro' });
    const res = await post(server, '/api/stripe/webhook', body, { 'stripe-signature': wrong });

    expect(res.status).toBe(400);
    expect(mockListingsUpdate).not.toHaveBeenCalled();
  });

  // O caso que a assinatura existe para apanhar: alguém intercepta e troca o
  // anúncio a destacar, mantendo a assinatura original.
  it('recusa um corpo adulterado depois de assinado', async () => {
    const body = sessionEvent();
    const signature = sign(body);
    const tampered = body.replace('"listing-1"', '"listing-do-atacante"');
    const res = await post(server, '/api/stripe/webhook', tampered, {
      'stripe-signature': signature,
    });

    expect(res.status).toBe(400);
    expect(mockListingsUpdate).not.toHaveBeenCalled();
  });

  it('recusa um pedido sem assinatura nenhuma', async () => {
    const res = await post(server, '/api/stripe/webhook', sessionEvent(), {});
    expect(res.status).toBe(400);
    expect(mockListingsUpdate).not.toHaveBeenCalled();
  });

  it('devolve 500 quando a escrita falha, para o Stripe repetir', async () => {
    mockListingsUpdate.mockRejectedValue(new Error('integration api em baixo'));
    const body = sessionEvent();
    const res = await post(server, '/api/stripe/webhook', body, { 'stripe-signature': sign(body) });
    expect(res.status).toBe(500);
  });
});
