/**
 * O EMAIL QUE SÓ EXISTE QUANDO HÁ PROCURA
 *
 * Este é o incentivo para concluir a verificação, e vive ou morre de uma
 * coisa: só pode chegar quando há mesmo alguém interessado. Um "ninguém viu o
 * seu espaço" é pior do que o silêncio, e um email repetido com os mesmos
 * números todos os dias é motivo para marcar como spam — e aí perde-se o
 * canal todo.
 *
 * Por isso o que se verifica aqui é sobretudo quando é que **não** se envia.
 */

const mockVistas = jest.fn();
jest.mock('../api/listing-views', () => ({ contagemDe: (...a) => mockVistas(...a) }));

const { correr, frasePro } = require('./interessePreVerificacaoJob');

const AUTOR_POR_VERIFICAR = 'autor-por-verificar';
const AUTOR_VERIFICADO = 'autor-verificado';

const sdkFalso = anuncios => {
  const chamadas = { update: [] };
  return {
    chamadas,
    listings: {
      query: async () => ({
        data: {
          data: anuncios,
          included: [
            {
              id: { uuid: AUTOR_POR_VERIFICAR },
              type: 'user',
              attributes: {
                email: 'host@exemplo.pt',
                profile: { firstName: 'Rita', metadata: { podeReceberReservas: false } },
              },
            },
            {
              id: { uuid: AUTOR_VERIFICADO },
              type: 'user',
              attributes: {
                email: 'ok@exemplo.pt',
                profile: { firstName: 'Ana', metadata: { podeReceberReservas: true } },
              },
            },
          ],
          meta: { totalPages: 1 },
        },
      }),
      update: async args => {
        chamadas.update.push(args);
      },
    },
  };
};

const resendQueEnvia = () => {
  const enviados = [];
  return {
    enviados,
    emails: {
      send: async m => {
        enviados.push(m);
        return { id: 'e-1' };
      },
    },
  };
};

const anuncio = (publicData, autor = AUTOR_POR_VERIFICAR) => ({
  id: { uuid: 'l-1' },
  attributes: { title: 'Sala no Porto', publicData },
  relationships: { author: { data: { id: { uuid: autor } } } },
});

beforeEach(() => {
  mockVistas.mockReset();
  mockVistas.mockReturnValue({ todayCount: 0, totalCount: 0, allTimeCount: 0 });
});

describe('quando não há procura nenhuma', () => {
  it('não se envia nada', async () => {
    const sdk = sdkFalso([anuncio({})]);
    const resend = resendQueEnvia();

    const r = await correr(sdk, resend);

    expect(resend.enviados).toHaveLength(0);
    expect(sdk.chamadas.update).toHaveLength(0);
    expect(r.semNovidade).toBe(1);
  });
});

describe('quando há procura nova', () => {
  it('avisa, e diz quantos foram', async () => {
    mockVistas.mockReturnValue({ allTimeCount: 4 });
    const sdk = sdkFalso([anuncio({ favoritesCount: 2 })]);
    const resend = resendQueEnvia();

    const r = await correr(sdk, resend);

    expect(r.avisados).toBe(1);
    expect(resend.enviados[0].html).toContain('4 pessoas viram o seu espaço');
    expect(resend.enviados[0].html).toContain('2 guardaram-no nos favoritos');
  });

  it('conta só o que ainda não tinha sido comunicado', async () => {
    mockVistas.mockReturnValue({ allTimeCount: 10 });
    const sdk = sdkFalso([
      anuncio({ favoritesCount: 3, ultimoInteresseComunicado: { vistas: 7, favoritos: 3 } }),
    ]);
    const resend = resendQueEnvia();

    await correr(sdk, resend);

    // 10 - 7 = 3 visitas novas; favoritos iguais, não se mencionam.
    expect(resend.enviados[0].html).toContain('3 pessoas viram o seu espaço');
    expect(resend.enviados[0].html).not.toContain('favoritos');
  });

  /**
   * O caso que transforma um incentivo em spam: correr outra vez sem que nada
   * tenha mudado entretanto.
   */
  it('a passagem seguinte, sem nada de novo, fica calada', async () => {
    mockVistas.mockReturnValue({ allTimeCount: 4 });
    const primeira = sdkFalso([anuncio({ favoritesCount: 0 })]);
    const resend = resendQueEnvia();
    await correr(primeira, resend);

    const carimbado = primeira.chamadas.update[0].publicData.ultimoInteresseComunicado;
    const segunda = sdkFalso([
      anuncio({ favoritesCount: 0, ultimoInteresseComunicado: carimbado }),
    ]);
    const r = await correr(segunda, resend);

    expect(r.avisados).toBe(0);
    expect(resend.enviados).toHaveLength(1);
  });
});

describe('um anfitrião já verificado', () => {
  it('não recebe este email — já pode receber reservas', async () => {
    mockVistas.mockReturnValue({ allTimeCount: 50 });
    const sdk = sdkFalso([anuncio({ favoritesCount: 9 }, AUTOR_VERIFICADO)]);
    const resend = resendQueEnvia();

    const r = await correr(sdk, resend);

    expect(resend.enviados).toHaveLength(0);
    expect(r.avisados).toBe(0);
  });
});

describe('quando o email falha', () => {
  it('os números não se dão por contados', async () => {
    mockVistas.mockReturnValue({ allTimeCount: 4 });
    const sdk = sdkFalso([anuncio({})]);
    const partido = {
      emails: {
        send: async () => {
          throw new Error('sem rede');
        },
      },
    };

    const r = await correr(sdk, partido);

    expect(r.avisados).toBe(0);
    expect(sdk.chamadas.update).toHaveLength(0);
  });
});

describe('frasePro', () => {
  it('fala no singular quando é uma pessoa só', () => {
    expect(frasePro({ vistas: 1, favoritos: 0, en: false })).toBe('1 pessoa viu o seu espaço');
  });

  it('junta as duas coisas quando as há', () => {
    expect(frasePro({ vistas: 3, favoritos: 1, en: false })).toBe(
      '3 pessoas viram o seu espaço e 1 guardou-o nos favoritos'
    );
  });

  it('omite o que não houve', () => {
    expect(frasePro({ vistas: 0, favoritos: 2, en: false })).toBe('2 guardaram-no nos favoritos');
  });
});
