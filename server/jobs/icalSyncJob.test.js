/**
 * O TRABALHO AGENDADO.
 *
 * O que se verifica aqui é sobretudo o trinco contra passagens sobrepostas.
 * A 15 minutos isso era quase teórico; a 5 deixa de o ser — uma passagem é
 * sequencial e, com calendários lentos ou muitos anúncios, arrasta-se para lá
 * do intervalo. Duas passagens em paralelo veem ambas o mesmo estado "antes",
 * criam os mesmos bloqueios duas vezes, e a segunda deixa órfãos que ninguém
 * volta a apagar — porque deixam de constar da lista de ids guardada.
 */

let tarefaAgendada = null;
jest.mock('node-cron', () => ({
  schedule: (_expressao, fn) => {
    tarefaAgendada = fn;
    return { stop: () => {} };
  },
}));

const mockSdk = jest.fn();
jest.mock('../api-util/sdk', () => ({ getIntegrationSdk: () => mockSdk() }));

const mockSincronizar = jest.fn();
jest.mock('../api-util/icalSync', () => ({
  sincronizarAnuncio: (...a) => mockSincronizar(...a),
}));

const { start, correr, anunciosComCalendario } = require('./icalSyncJob');

const anuncio = (id, privateData) => ({
  id: { uuid: id },
  attributes: { title: `Anúncio ${id}`, privateData },
});

const sdkCom = anuncios => ({
  listings: {
    query: async () => ({ data: { data: anuncios, meta: { totalPages: 1 } } }),
  },
});

beforeEach(() => {
  tarefaAgendada = null;
  mockSdk.mockReset();
  mockSincronizar.mockReset().mockResolvedValue({ criadas: 0, removidas: 0, avisos: [], erros: [] });
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  delete process.env.DISABLE_ICAL_SYNC;
  delete process.env.ICAL_SYNC_CRON;
});
afterEach(() => jest.restoreAllMocks());

describe('quem entra na passagem', () => {
  it('só os anúncios que têm calendários', async () => {
    const sdk = sdkCom([
      anuncio('com', { icalFeeds: [{ url: 'https://x/a.ics' }] }),
      anuncio('sem', {}),
      anuncio('vazio', { icalFeeds: [] }),
      anuncio('lixo', { icalFeeds: [{ nome: 'sem url' }] }),
    ]);

    const lista = await anunciosComCalendario(sdk);

    expect(lista.map(l => l.id.uuid)).toEqual(['com']);
  });

  it('e conta o que cada um fez', async () => {
    mockSincronizar
      .mockResolvedValueOnce({ criadas: 3, removidas: 1, avisos: [], erros: [] })
      .mockResolvedValueOnce({ criadas: 2, removidas: 0, avisos: [], erros: ['falhou'] });
    const sdk = sdkCom([
      anuncio('a', { icalFeeds: [{ url: 'https://x/a.ics' }] }),
      anuncio('b', { icalFeeds: [{ url: 'https://x/b.ics' }] }),
    ]);

    const r = await correr(sdk);

    expect(r).toEqual({ anuncios: 2, criadas: 5, removidas: 1, comErro: 1 });
  });

  /**
   * Um anúncio que rebenta não pode levar os outros atrás: se o primeiro
   * calendário da lista tiver um problema, os restantes ficavam todos por
   * sincronizar sem ninguém perceber porquê.
   */
  it('um anúncio que rebenta não trava os seguintes', async () => {
    mockSincronizar
      .mockRejectedValueOnce(new Error('rebentou'))
      .mockResolvedValueOnce({ criadas: 1, removidas: 0, avisos: [], erros: [] });
    const sdk = sdkCom([
      anuncio('mau', { icalFeeds: [{ url: 'https://x/a.ics' }] }),
      anuncio('bom', { icalFeeds: [{ url: 'https://x/b.ics' }] }),
    ]);

    const r = await correr(sdk);

    expect(r.comErro).toBe(1);
    expect(r.criadas).toBe(1);
  });
});

describe('o trinco contra passagens sobrepostas', () => {
  const esperar = ms => new Promise(r => setTimeout(r, ms));

  it('uma passagem a decorrer faz a seguinte ser saltada', async () => {
    let aLibertar;
    const presa = new Promise(r => {
      aLibertar = r;
    });
    mockSincronizar.mockImplementation(async () => {
      await presa;
      return { criadas: 0, removidas: 0, avisos: [], erros: [] };
    });
    mockSdk.mockReturnValue(sdkCom([anuncio('a', { icalFeeds: [{ url: 'https://x/a.ics' }] })]));

    start();
    expect(typeof tarefaAgendada).toBe('function');

    const primeira = tarefaAgendada(); // fica presa
    await esperar(10);
    await tarefaAgendada(); // esta tem de ser saltada

    expect(mockSincronizar).toHaveBeenCalledTimes(1);

    aLibertar();
    await primeira;
  });

  it('e depois de terminar, a seguinte já corre', async () => {
    mockSdk.mockReturnValue(sdkCom([anuncio('a', { icalFeeds: [{ url: 'https://x/a.ics' }] })]));

    start();
    await tarefaAgendada();
    await tarefaAgendada();

    expect(mockSincronizar).toHaveBeenCalledTimes(2);
  });

  /**
   * O caso que transformaria uma avaria numa morte silenciosa: se o trinco
   * ficasse preso depois de uma passagem rebentar, a sincronização parava
   * para sempre sem nenhum erro novo a aparecer nos registos.
   */
  it('uma passagem que rebenta não deixa o trinco preso', async () => {
    mockSdk.mockImplementationOnce(() => {
      throw new Error('o SDK rebentou');
    });

    start();
    await tarefaAgendada();

    mockSdk.mockReturnValue(sdkCom([anuncio('a', { icalFeeds: [{ url: 'https://x/a.ics' }] })]));
    await tarefaAgendada();

    expect(mockSincronizar).toHaveBeenCalledTimes(1);
  });
});

describe('o agendamento', () => {
  it('não agenda nada quando está desligado', () => {
    process.env.DISABLE_ICAL_SYNC = 'true';

    start();

    expect(tarefaAgendada).toBe(null);
  });

  it('sem Integration SDK não tenta sincronizar nada', async () => {
    mockSdk.mockReturnValue(null);

    start();
    await tarefaAgendada();

    expect(mockSincronizar).not.toHaveBeenCalled();
  });
});
