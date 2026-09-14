// O prefixo "mock" tem de estar no INÍCIO do nome: a fábrica de jest.mock só
// pode tocar em variáveis assim.
const mockSdk = {
  transactions: {
    query: jest.fn(),
    updateMetadata: jest.fn(async () => ({})),
  },
};
const mockAvisar = jest.fn(async () => true);

jest.mock('../api-util/sdk', () => ({ getIntegrationSdk: () => mockSdk }));
jest.mock('../api-util/resolutionEmails', () => ({ avisarPrazoExpirado: mockAvisar }));

const { runOnce, prazoExpirado, escalar } = require('./resolutionDeadlineJob');
const { CHAVE, ESTADOS } = require('../api-util/resolutionCase');

const ONTEM = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
const DAQUI_A_DIAS = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString();

const caso = (extra = {}) => ({
  tipo: 'danos',
  estado: ESTADOS.ABERTO,
  abertoPor: { userId: 'u-cliente', papel: 'cliente' },
  abertoEm: '2026-09-01T10:00:00.000Z',
  descricao: 'O espaço apareceu com a parede danificada no fim da reserva.',
  respondePor: 'anfitriao',
  prazoResposta: ONTEM,
  provas: [],
  resposta: null,
  decisao: null,
  cronologia: [{ em: '2026-09-01T10:00:00.000Z', quem: 'cliente', acto: 'abriu-o-caso' }],
  ...extra,
});

const tx = (metadata = {}, id = 'tx-1') => ({
  id: { uuid: id },
  attributes: { metadata },
  relationships: {
    customer: { data: { id: { uuid: 'u-cliente' } } },
    provider: { data: { id: { uuid: 'u-anfitriao' } } },
  },
});

const pagina = itens => ({ data: { data: itens, meta: { totalPages: 1 } } });

beforeEach(() => {
  mockSdk.transactions.query.mockReset();
  mockSdk.transactions.updateMetadata.mockClear().mockResolvedValue({});
  mockAvisar.mockClear().mockResolvedValue(true);
  process.env.ADMIN_EMAILS = '';
  delete process.env.RESEND_API_KEY;
});

describe('quando é que o prazo conta como expirado', () => {
  it('expirou: caso aberto, sem resposta, data passada', () => {
    expect(prazoExpirado(caso())).toBe(true);
  });

  it('não expirou: a data ainda não chegou', () => {
    expect(prazoExpirado(caso({ prazoResposta: DAQUI_A_DIAS }))).toBe(false);
  });

  // Quem respondeu cumpriu. O prazo deixa de correr no momento da resposta,
  // por muito que a data já tenha passado desde então.
  it('não expirou: já houve resposta', () => {
    const c = caso({ estado: ESTADOS.RESPONDIDO, resposta: { texto: 'não é verdade' } });
    expect(prazoExpirado(c)).toBe(false);
  });

  // Sem isto, o job voltava a escalar o mesmo caso todos os dias, a encher a
  // cronologia e a caixa de correio das partes.
  it('não expirou: o caso já subiu para análise', () => {
    expect(prazoExpirado(caso({ estado: ESTADOS.EM_ANALISE }))).toBe(false);
  });

  it('não expirou: caso decidido', () => {
    expect(prazoExpirado(caso({ estado: ESTADOS.DECIDIDO }))).toBe(false);
  });

  it('aguenta uma reserva sem caso nenhum e um prazo ilegível', () => {
    expect(prazoExpirado(null)).toBe(false);
    expect(prazoExpirado(caso({ prazoResposta: 'qualquer coisa' }))).toBe(false);
  });
});

describe('escalar', () => {
  it('passa a em análise e regista o facto na cronologia', async () => {
    const atualizado = await escalar(mockSdk, tx(), caso());

    expect(atualizado.estado).toBe(ESTADOS.EM_ANALISE);
    const ultimo = atualizado.cronologia[atualizado.cronologia.length - 1];
    expect(ultimo).toMatchObject({ quem: 'sistema', acto: 'prazo-de-resposta-expirou' });
    // A cronologia é prova: o que já lá estava não se perde.
    expect(atualizado.cronologia[0].acto).toBe('abriu-o-caso');

    const escrito = mockSdk.transactions.updateMetadata.mock.calls[0][0];
    expect(escrito.id).toBe('tx-1');
    expect(escrito.metadata[CHAVE].estado).toBe(ESTADOS.EM_ANALISE);
  });

  // O job não decide nada: isso é de uma pessoa, com fundamentação.
  it('não inventa decisão nenhuma', async () => {
    const atualizado = await escalar(mockSdk, tx(), caso());
    expect(atualizado.decisao).toBeNull();
  });
});

describe('a passagem diária', () => {
  it('escala o caso expirado e avisa as duas partes', async () => {
    mockSdk.transactions.query.mockResolvedValue(pagina([tx({ [CHAVE]: caso() })]));

    const r = await runOnce();

    expect(r.escalados).toEqual([{ txId: 'tx-1', respondePor: 'anfitriao' }]);
    expect(mockSdk.transactions.updateMetadata).toHaveBeenCalledTimes(1);
    expect(mockAvisar).toHaveBeenCalledTimes(2);
    const destinatarios = mockAvisar.mock.calls.map(c => c[1].destinatarioId);
    expect(destinatarios).toEqual(['u-cliente', 'u-anfitriao']);
    // O email leva o caso já actualizado — dizer "em análise" e mandar o estado
    // antigo seria contradizer-se no mesmo minuto.
    expect(mockAvisar.mock.calls[0][1].caso.estado).toBe(ESTADOS.EM_ANALISE);
  });

  it('não toca em reservas sem caso, nem em casos dentro do prazo', async () => {
    mockSdk.transactions.query.mockResolvedValue(
      pagina([
        tx({}, 'tx-sem-caso'),
        tx({ [CHAVE]: caso({ prazoResposta: DAQUI_A_DIAS }) }, 'tx-a-tempo'),
      ])
    );

    const r = await runOnce();

    expect(r.verificados).toBe(2);
    expect(r.escalados).toEqual([]);
    expect(mockSdk.transactions.updateMetadata).not.toHaveBeenCalled();
    expect(mockAvisar).not.toHaveBeenCalled();
  });

  // Ver o que ia acontecer sem que aconteça: é assim que se corre isto pela
  // primeira vez contra dados reais.
  it('em simulação não escreve nada', async () => {
    mockSdk.transactions.query.mockResolvedValue(pagina([tx({ [CHAVE]: caso() })]));

    const r = await runOnce({ dryRun: true });

    expect(r.escalados).toHaveLength(1);
    expect(mockSdk.transactions.updateMetadata).not.toHaveBeenCalled();
    expect(mockAvisar).not.toHaveBeenCalled();
  });

  // Falhar um email não pode deixar o caso seguinte por escalar.
  it('um email que falha não trava o resto da varredura', async () => {
    mockAvisar.mockRejectedValueOnce(new Error('o Resend está em baixo'));
    mockSdk.transactions.query.mockResolvedValue(
      pagina([tx({ [CHAVE]: caso() }, 'tx-1'), tx({ [CHAVE]: caso() }, 'tx-2')])
    );

    const r = await runOnce();

    expect(r.escalados.map(e => e.txId)).toEqual(['tx-1', 'tx-2']);
    expect(mockSdk.transactions.updateMetadata).toHaveBeenCalledTimes(2);
  });

  it('percorre as páginas todas', async () => {
    mockSdk.transactions.query
      .mockResolvedValueOnce({ data: { data: [tx({}, 'a')], meta: { totalPages: 2 } } })
      .mockResolvedValueOnce({
        data: { data: [tx({ [CHAVE]: caso() }, 'b')], meta: { totalPages: 2 } },
      });

    const r = await runOnce();

    expect(mockSdk.transactions.query).toHaveBeenCalledTimes(2);
    expect(r.verificados).toBe(2);
    expect(r.escalados.map(e => e.txId)).toEqual(['b']);
  });
});
