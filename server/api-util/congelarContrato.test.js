// O prefixo "mock" tem de estar no INÍCIO do nome da variável: a fábrica de
// jest.mock só pode tocar em variáveis assim. "sdkMock" não serve; "mockSdk"
// serve. É uma regra do Jest, não uma preferência.
const mockSdk = { users: {}, transactions: { updateMetadata: jest.fn(async () => ({})) } };
jest.mock('./sdk', () => ({ getIntegrationSdk: () => mockSdk }));

const { prenderVersoes, prenderVersoesSemFalhar } = require('./congelarContrato');
const { CHAVE } = require('./bookingContract');

const resposta = (metadata = {}) => ({
  data: { id: { uuid: 'tx-9' }, attributes: { metadata } },
});

beforeEach(() => mockSdk.transactions.updateMetadata.mockClear());

describe('prender as versões quando a reserva nasce', () => {
  // A razão de ser desta mudança: antes isto só acontecia quando alguém abria
  // o contrato, e nessa altura as versões já podiam ser outras.
  it('prende as versões a uma reserva nova', async () => {
    const ponteiro = await prenderVersoes(resposta());

    expect(mockSdk.transactions.updateMetadata).toHaveBeenCalledTimes(1);
    const escrito = mockSdk.transactions.updateMetadata.mock.calls[0][0];
    expect(escrito.id).toBe('tx-9');
    expect(escrito.metadata[CHAVE].versoes['contrato-de-reserva']).toBeTruthy();
    expect(ponteiro.versoes['termos-de-servico']).toBeTruthy();
  });

  // Idempotente: a criação, a transição e a abertura do contrato chamam todas
  // isto, e só a primeira pode contar.
  it('não mexe numa reserva que já tem as versões presas', async () => {
    const antigo = { versoes: { 'termos-de-servico': '0.9' }, em: '2026-01-01T00:00:00.000Z' };
    const r = await prenderVersoes(resposta({ [CHAVE]: antigo }));

    expect(r).toBeNull();
    expect(mockSdk.transactions.updateMetadata).not.toHaveBeenCalled();
  });

  it('ignora uma resposta sem transacção', async () => {
    expect(await prenderVersoes({})).toBeNull();
    expect(await prenderVersoes(null)).toBeNull();
    expect(mockSdk.transactions.updateMetadata).not.toHaveBeenCalled();
  });

  // Falhar a prender as versões não pode fazer falhar uma reserva: o cliente
  // acabou de pagar, e recusar-lhe a reserva por causa de metadata seria
  // absurdo.
  it('a variante que não falha engole o erro', async () => {
    mockSdk.transactions.updateMetadata.mockImplementationOnce(async () => {
      throw new Error('a API está em baixo');
    });
    await expect(prenderVersoesSemFalhar(resposta())).resolves.toBeUndefined();
  });
});
