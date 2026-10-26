/**
 * A DECISÃO SOBRE UM ANÚNCIO — e o que não pode falhar nela.
 *
 * Esta lógica esteve até aqui dentro do handler dos links do email, sem teste
 * nenhum. Foi extraída quando o painel de administração passou a poder decidir
 * também: dois caminhos para a mesma decisão é exactamente o sítio onde as
 * coisas divergem em silêncio — um esquece-se de limpar `listingPending`, o
 * outro de avisar o anfitrião, e só se descobre meses depois.
 *
 * O que se verifica aqui é sobretudo o estado em que o anúncio fica, porque é
 * esse estado que o site inteiro lê para decidir o que mostrar.
 */

const mockAprovado = jest.fn();
const mockRecusado = jest.fn();
jest.mock('./listingEmails', () => ({
  listingApproved: (...a) => mockAprovado(...a),
  listingRejected: (...a) => mockRecusado(...a),
}));

const { aplicarDecisao } = require('./listingApproval');

const sdkFalso = () => {
  const chamadas = { open: [], update: [] };
  return {
    chamadas,
    listings: {
      open: async args => {
        chamadas.open.push(args);
      },
      update: async args => {
        chamadas.update.push(args);
      },
    },
  };
};

beforeEach(() => {
  mockAprovado.mockReset().mockResolvedValue(undefined);
  mockRecusado.mockReset().mockResolvedValue(undefined);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => jest.restoreAllMocks());

describe('aprovar', () => {
  it('reabre o anúncio e tira-lhe a marca de espera', async () => {
    const sdk = sdkFalso();

    await aplicarDecisao({ sdk, listingId: 'l-1', action: 'approve' });

    expect(sdk.chamadas.open).toEqual([{ id: 'l-1' }]);
    expect(sdk.chamadas.update).toEqual([{ id: 'l-1', publicData: { listingPending: null } }]);
  });

  /**
   * O anúncio reabria em silêncio: o anfitrião não tinha como saber que já
   * estava no ar.
   */
  it('avisa o anfitrião', async () => {
    const sdk = sdkFalso();

    await aplicarDecisao({ sdk, listingId: 'l-1', action: 'approve' });

    expect(mockAprovado).toHaveBeenCalledWith(expect.objectContaining({ listingId: 'l-1' }));
  });

  it('não marca como recusado', async () => {
    const sdk = sdkFalso();

    await aplicarDecisao({ sdk, listingId: 'l-1', action: 'approve' });

    const marcas = sdk.chamadas.update.map(u => u.publicData);
    expect(marcas.some(m => m.listingRejected)).toBe(false);
  });
});

describe('recusar', () => {
  it('deixa o anúncio fechado — não lhe chama open', async () => {
    const sdk = sdkFalso();

    await aplicarDecisao({ sdk, listingId: 'l-2', action: 'reject' });

    expect(sdk.chamadas.open).toHaveLength(0);
  });

  /**
   * As duas marcas têm de mudar na mesma passagem: fica recusado E deixa de
   * estar à espera. Se `listingPending` ficasse, o anúncio aparecia para sempre
   * na fila de quem decide.
   */
  it('marca como recusado e tira-o da fila', async () => {
    const sdk = sdkFalso();

    await aplicarDecisao({ sdk, listingId: 'l-2', action: 'reject' });

    expect(sdk.chamadas.update).toEqual([
      { id: 'l-2', publicData: { listingRejected: true, listingPending: null } },
    ]);
  });

  it('leva o motivo ao anfitrião, quando há um', async () => {
    const sdk = sdkFalso();

    await aplicarDecisao({ sdk, listingId: 'l-2', action: 'reject', reason: 'fotos ilegíveis' });

    expect(mockRecusado).toHaveBeenCalledWith(
      expect.objectContaining({ listingId: 'l-2', reason: 'fotos ilegíveis' })
    );
  });
});

describe('quando o email falha', () => {
  /**
   * A decisão já está tomada no Sharetribe quando o email é disparado. Falhar o
   * aviso não pode desfazê-la nem rebentar com quem chamou — ficaria um anúncio
   * aprovado com o painel a dizer que a aprovação falhou.
   */
  it('a decisão aguenta-se e não rebenta', async () => {
    mockAprovado.mockRejectedValue(new Error('sem rede'));
    const sdk = sdkFalso();

    await expect(aplicarDecisao({ sdk, listingId: 'l-3', action: 'approve' })).resolves.toEqual({
      ok: true,
      action: 'approve',
    });

    expect(sdk.chamadas.open).toEqual([{ id: 'l-3' }]);
  });
});

describe('o que não se aceita', () => {
  it('uma acção que não existe', async () => {
    await expect(
      aplicarDecisao({ sdk: sdkFalso(), listingId: 'l-4', action: 'talvez' })
    ).rejects.toThrow('invalid-action');
  });

  it('sem anúncio', async () => {
    await expect(aplicarDecisao({ sdk: sdkFalso(), action: 'approve' })).rejects.toThrow(
      'listingId-required'
    );
  });

  it('sem SDK', async () => {
    await expect(
      aplicarDecisao({ sdk: null, listingId: 'l-5', action: 'approve' })
    ).rejects.toThrow('integration-sdk-not-configured');
  });
});
