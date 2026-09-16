// O prefixo "mock" tem de estar no INÍCIO do nome: a fábrica de jest.mock só
// pode tocar em variáveis assim.
const mockSdk = {
  transactions: { query: jest.fn(), updateMetadata: jest.fn(async () => ({})) },
};
const mockEmails = {
  novaReservaAoAnfitriao: jest.fn(async () => true),
  pedidoAoCliente: jest.fn(async () => true),
  confirmadaAoCliente: jest.fn(async () => true),
  naoAvancouAoCliente: jest.fn(async () => true),
  alertaAoAdmin: jest.fn(async () => true),
  intervalo: jest.requireActual('../api-util/bookingEmails').intervalo,
  dinheiro: jest.requireActual('../api-util/bookingEmails').dinheiro,
  isEnglish: () => false,
};

const mockRecibo = jest.fn(async () => true);

jest.mock('../api-util/sdk', () => ({ getIntegrationSdk: () => mockSdk }));
jest.mock('../api-util/stripeReceipts', () => ({ pedirReciboDaReserva: mockRecibo }));
jest.mock('../api-util/bookingEmails', () => mockEmails);

const { runOnce, emFalta, reunir, marcar } = require('./bookingNotifyJob');

const CLIENTE = {
  id: { uuid: 'u-cliente' },
  type: 'user',
  attributes: { email: 'cliente@exemplo.pt', profile: { firstName: 'Rafael' } },
};
const ANFITRIAO = {
  id: { uuid: 'u-anfitriao' },
  type: 'user',
  attributes: { email: 'anfitriao@exemplo.pt', profile: { firstName: 'Lídia' } },
};
const ANUNCIO = {
  id: { uuid: 'l-1' },
  type: 'listing',
  attributes: { title: 'TESTE', publicData: { location: { address: 'Coimbra' } } },
};
const RESERVA = {
  id: { uuid: 'b-1' },
  type: 'booking',
  // Um dia só: a Sharetribe guarda o dia seguinte como fim.
  attributes: { start: '2026-09-16T23:00:00.000Z', end: '2026-09-17T23:00:00.000Z' },
};

const tx = (lastTransition, metadata = {}, id = 'tx-1') => ({
  id: { uuid: id },
  attributes: {
    lastTransition,
    metadata,
    protectedData: { unitType: 'day' },
    payinTotal: { amount: 500, currency: 'EUR' },
    payoutTotal: { amount: 475, currency: 'EUR' },
  },
  relationships: {
    customer: { data: { id: { uuid: 'u-cliente' } } },
    provider: { data: { id: { uuid: 'u-anfitriao' } } },
    listing: { data: { id: { uuid: 'l-1' } } },
    booking: { data: { id: { uuid: 'b-1' } } },
  },
});

const pagina = itens => ({
  data: { data: itens, included: [CLIENTE, ANFITRIAO, ANUNCIO, RESERVA], meta: { totalPages: 1 } },
});

beforeEach(() => {
  mockSdk.transactions.query.mockReset();
  mockSdk.transactions.updateMetadata.mockClear().mockResolvedValue({});
  Object.values(mockEmails).forEach(f => f.mockClear && f.mockClear());
  mockRecibo.mockClear().mockResolvedValue(true);
});

describe('o que falta avisar', () => {
  it('uma reserva paga e ainda não avisada dá os três avisos', () => {
    expect(emFalta(tx('transition/confirm-payment')).map(x => x[0])).toEqual([
      'anfitriao-nova-reserva',
      'cliente-pedido',
      'admin-nova-reserva',
      'stripe-recibo',
    ]);
  });

  // A marca na metadata é o que impede o reenvio; sem ela, cada passagem do
  // job mandava tudo outra vez.
  it('o que já foi enviado não volta a sair', () => {
    const jaFeito = { avisos: { 'anfitriao-nova-reserva': '2026-09-16T19:00:00.000Z' } };
    expect(emFalta(tx('transition/confirm-payment', jaFeito)).map(x => x[0])).toEqual([
      'cliente-pedido',
      'admin-nova-reserva',
      'stripe-recibo',
    ]);
  });

  it('uma transição que não interessa não gera nada', () => {
    expect(emFalta(tx('transition/review-1-by-customer'))).toEqual([]);
  });
});

describe('os dados que vão no email', () => {
  it('junta pessoas, anúncio e reserva', () => {
    const d = reunir(tx('transition/accept'), [CLIENTE, ANFITRIAO, ANUNCIO, RESERVA]);

    expect(d.customer).toMatchObject({ email: 'cliente@exemplo.pt', nome: 'Rafael' });
    expect(d.provider).toMatchObject({ email: 'anfitriao@exemplo.pt', nome: 'Lídia' });
    expect(d.listingTitle).toBe('TESTE');
    expect(d.morada).toBe('Coimbra');
    expect(d.payin).toBe('5,00 €');
    expect(d.payout).toBe('4,75 €');
    expect(d.comissao).toBe('0,25 €');
  });

  /**
   * O fim é exclusivo na Sharetribe: uma reserva de um dia guarda o dia
   * seguinte. Escrever isso em bruto dizia ao cliente que tinha o espaço dois
   * dias — e era com esse email na mão que ele apareceria lá.
   */
  it('uma reserva de um dia mostra um dia, não dois', () => {
    const d = reunir(tx('transition/accept'), [CLIENTE, ANFITRIAO, ANUNCIO, RESERVA]);
    expect(d.quando).toBe('17/09/2026');
  });

  // O mesmo anúncio aceita reservas por hora. Aí a data não chega: quem vai
  // lá estar precisa da hora a que entra.
  it('uma reserva por hora mostra as horas', () => {
    const porHora = {
      ...RESERVA,
      attributes: { start: '2026-09-28T11:00:00.000Z', end: '2026-09-28T12:00:00.000Z' },
    };
    const t = tx('transition/accept');
    t.attributes.protectedData = { unitType: 'hour' };

    const d = reunir(t, [CLIENTE, ANFITRIAO, ANUNCIO, porHora]);

    expect(d.quando).toContain('12:00');
    expect(d.quando).toContain('13:00');
  });

  it('aguenta uma transacção sem anúncio nem reserva incluídos', () => {
    const d = reunir(tx('transition/accept'), []);
    expect(d.txId).toBe('tx-1');
    expect(d.listingTitle).toBeNull();
    expect(d.quando).toBeNull();
  });
});

describe('a passagem', () => {
  it('avisa as duas partes e o operador quando o pagamento é confirmado', async () => {
    mockSdk.transactions.query.mockResolvedValue(pagina([tx('transition/confirm-payment')]));

    const r = await runOnce();

    expect(mockEmails.novaReservaAoAnfitriao).toHaveBeenCalledTimes(1);
    expect(mockEmails.pedidoAoCliente).toHaveBeenCalledTimes(1);
    expect(mockEmails.alertaAoAdmin).toHaveBeenCalledTimes(1);
    expect(mockEmails.confirmadaAoCliente).not.toHaveBeenCalled();
    expect(r.enviados).toEqual([
      {
        txId: 'tx-1',
        chaves: ['anfitriao-nova-reserva', 'cliente-pedido', 'admin-nova-reserva', 'stripe-recibo'],
      },
    ]);
  });

  it('a aceitação avisa o cliente', async () => {
    mockSdk.transactions.query.mockResolvedValue(pagina([tx('transition/accept')]));
    await runOnce();
    expect(mockEmails.confirmadaAoCliente).toHaveBeenCalledTimes(1);
  });

  /**
   * A cobrança da reserva é criada pela Sharetribe sem `receipt_email`, e sem
   * esse campo o Stripe não envia recibo nenhum. Quem paga o destaque recebia
   * recibo e factura; quem paga uma reserva não recebia nada.
   */
  it('pede ao Stripe o recibo para quem pagou', async () => {
    mockSdk.transactions.query.mockResolvedValue(pagina([tx('transition/confirm-payment')]));

    await runOnce();

    expect(mockRecibo).toHaveBeenCalledWith({ txId: 'tx-1', email: 'cliente@exemplo.pt' });
  });

  it('a recusa diz ao cliente que não foi cobrado', async () => {
    mockSdk.transactions.query.mockResolvedValue(pagina([tx('transition/decline')]));
    await runOnce();
    expect(mockEmails.naoAvancouAoCliente).toHaveBeenCalledWith(expect.anything(), 'recusada');
  });

  /**
   * A metadata desta transacção guarda `contrato` — que versões dos documentos
   * valiam quando a reserva nasceu. Uma escrita que só mandasse `avisos`
   * arriscava levá-la à frente, e com ela a prova.
   */
  it('marcar os avisos não perde o contrato que já lá estava', async () => {
    const contrato = { versoes: { 'contrato-de-reserva': '1.0' }, em: '2026-09-16T19:28:39.829Z' };
    const t = tx('transition/confirm-payment', { contrato });

    const metadata = await marcar(mockSdk, t, ['cliente-pedido']);

    expect(metadata.contrato).toEqual(contrato);
    expect(metadata.avisos['cliente-pedido']).toBeTruthy();
    expect(mockSdk.transactions.updateMetadata.mock.calls[0][0].metadata.contrato).toEqual(contrato);
  });

  // Marcar um email que não saiu seria pior do que não marcar nada: ninguém
  // voltaria a tentar.
  it('um email que falha não fica marcado como enviado', async () => {
    mockEmails.pedidoAoCliente.mockRejectedValueOnce(new Error('Resend em baixo'));
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSdk.transactions.query.mockResolvedValue(pagina([tx('transition/confirm-payment')]));

    const r = await runOnce();

    expect(r.enviados[0].chaves).toEqual([
      'anfitriao-nova-reserva',
      'admin-nova-reserva',
      'stripe-recibo',
    ]);
    const escrito = mockSdk.transactions.updateMetadata.mock.calls[0][0].metadata.avisos;
    expect(escrito['cliente-pedido']).toBeUndefined();
    console.error.mockRestore();
  });

  it('em simulação não envia nem escreve nada', async () => {
    mockSdk.transactions.query.mockResolvedValue(pagina([tx('transition/confirm-payment')]));

    const r = await runOnce({ dryRun: true });

    expect(r.enviados).toHaveLength(1);
    expect(mockEmails.pedidoAoCliente).not.toHaveBeenCalled();
    expect(mockSdk.transactions.updateMetadata).not.toHaveBeenCalled();
  });

  it('não escreve nada quando não há nada a avisar', async () => {
    const jaFeito = {
      avisos: {
        'anfitriao-nova-reserva': 'x',
        'cliente-pedido': 'x',
        'admin-nova-reserva': 'x',
        'stripe-recibo': 'x',
      },
    };
    mockSdk.transactions.query.mockResolvedValue(
      pagina([tx('transition/confirm-payment', jaFeito)])
    );

    const r = await runOnce();

    expect(r.enviados).toEqual([]);
    expect(mockSdk.transactions.updateMetadata).not.toHaveBeenCalled();
  });
});
