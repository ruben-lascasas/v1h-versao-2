/**
 * A SINCRONIZAÇÃO.
 *
 * Aqui o que se verifica é sobretudo o que NÃO se faz: não apagar bloqueios
 * quando um calendário não pôde ser lido, e não tocar nas excepções que o
 * anfitrião criou à mão.
 *
 * Os dois erros desta funcionalidade não custam o mesmo. Bloquear a mais faz
 * perder uma reserva. Bloquear a menos vende a mesma sala duas vezes e põe
 * alguém à porta de uma sala ocupada. Por isso, na dúvida, bloqueia-se.
 */

const { sincronizarAnuncio } = require('./icalSync');

const AGORA = Date.parse('2026-11-11T00:00:00Z');
const DIA = 24 * 3600 * 1000;

const calendarioCom = (...eventos) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...eventos, 'END:VCALENDAR'].join('\r\n');

const umEvento = (uid, inicioIso, fimIso) =>
  [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTART:${inicioIso}`,
    `DTEND:${fimIso}`,
    'END:VEVENT',
  ].join('\r\n');

const sdkFalso = () => {
  const chamadas = { criadas: [], removidas: [], updates: [] };
  let n = 0;
  return {
    chamadas,
    availabilityExceptions: {
      create: async (params, opcoes) => {
        chamadas.criadas.push({ params, opcoes });
        n += 1;
        return { data: { data: { id: { uuid: `exc-${n}` } } } };
      },
      delete: async args => {
        chamadas.removidas.push(args);
      },
    },
    listings: {
      update: async args => {
        chamadas.updates.push(args);
      },
    },
  };
};

const anuncioCom = privateData => ({
  id: { uuid: 'anuncio-1' },
  attributes: { title: 'Sala', privateData },
});

const buscarQueDevolve = texto => async () => ({ ok: true, texto });
const buscarQueFalha = motivo => async () => ({ ok: false, motivo });

describe('quando não há calendários configurados', () => {
  it('não faz nada e diz porquê', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({ sdk, anuncio: anuncioCom({}), agora: AGORA });

    expect(r.saltado).toBe('sem calendários');
    expect(sdk.chamadas.criadas).toHaveLength(0);
    expect(sdk.chamadas.updates).toHaveLength(0);
  });
});

describe('a primeira sincronização', () => {
  it('bloqueia as horas ocupadas', async () => {
    const sdk = sdkFalso();
    const anuncio = anuncioCom({ icalFeeds: [{ url: 'https://x/a.ics', nome: 'Hotel' }] });

    const r = await sincronizarAnuncio({
      sdk,
      anuncio,
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(umEvento('a@x', '20261112T140000Z', '20261112T160000Z'))
      ),
    });

    expect(r.criadas).toBe(1);
    const { params: criada, opcoes } = sdk.chamadas.criadas[0];
    expect(opcoes).toEqual({ expand: true });
    expect(criada.listingId).toEqual({ uuid: 'anuncio-1' });
    expect(criada.seats).toBe(0);
    expect(criada.start.toISOString()).toBe('2026-11-12T14:00:00.000Z');
    expect(criada.end.toISOString()).toBe('2026-11-12T16:00:00.000Z');
  });

  it('guarda os ids do que criou, para poder removê-los depois', async () => {
    const sdk = sdkFalso();

    await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom({ icalFeeds: [{ url: 'https://x/a.ics' }] }),
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(umEvento('a@x', '20261112T140000Z', '20261112T160000Z'))
      ),
    });

    const guardado = sdk.chamadas.updates[0].privateData.icalSync;
    expect(guardado.excepcoes).toEqual([
      { id: 'exc-1', inicio: Date.parse('2026-11-12T14:00:00Z'), fim: Date.parse('2026-11-12T16:00:00Z') },
    ]);
    expect(guardado.ultimaSincronizacao).toBe('2026-11-11T00:00:00.000Z');
  });

  it('junta eventos sobrepostos num bloqueio só', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom({ icalFeeds: [{ url: 'https://x/a.ics' }] }),
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(
          umEvento('a@x', '20261112T140000Z', '20261112T160000Z'),
          umEvento('b@x', '20261112T150000Z', '20261112T180000Z')
        )
      ),
    });

    expect(r.criadas).toBe(1);
    expect(sdk.chamadas.criadas[0].params.end.toISOString()).toBe('2026-11-12T18:00:00.000Z');
  });

  it('ignora o que já passou', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom({ icalFeeds: [{ url: 'https://x/a.ics' }] }),
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(umEvento('velho@x', '20260101T100000Z', '20260101T120000Z'))
      ),
    });

    expect(r.criadas).toBe(0);
  });

  it('um período a meio é cortado no presente, não deitado fora', async () => {
    const sdk = sdkFalso();

    await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom({ icalFeeds: [{ url: 'https://x/a.ics' }] }),
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(umEvento('meio@x', '20261110T100000Z', '20261112T100000Z'))
      ),
    });

    expect(sdk.chamadas.criadas[0].params.start.toISOString()).toBe('2026-11-11T00:00:00.000Z');
  });
});

describe('as sincronizações seguintes', () => {
  const jaTinha = (id, inicioIso, fimIso) => ({
    icalFeeds: [{ url: 'https://x/a.ics' }],
    icalSync: {
      ultimaSincronizacao: '2026-11-10T00:00:00.000Z',
      excepcoes: [{ id, inicio: Date.parse(inicioIso), fim: Date.parse(fimIso) }],
    },
  });

  it('não recria o que já está bloqueado', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom(jaTinha('exc-velha', '2026-11-12T14:00:00Z', '2026-11-12T16:00:00Z')),
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(umEvento('a@x', '20261112T140000Z', '20261112T160000Z'))
      ),
    });

    expect(r.criadas).toBe(0);
    expect(r.removidas).toBe(0);
    expect(sdk.chamadas.criadas).toHaveLength(0);
  });

  it('remove o bloqueio de um evento que desapareceu do calendário', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom(jaTinha('exc-velha', '2026-11-12T14:00:00Z', '2026-11-12T16:00:00Z')),
      agora: AGORA,
      buscar: buscarQueDevolve(calendarioCom()),
    });

    expect(r.removidas).toBe(1);
    expect(sdk.chamadas.removidas[0]).toEqual({ id: 'exc-velha' });
    expect(sdk.chamadas.updates[0].privateData.icalSync.excepcoes).toEqual([]);
  });

  it('um evento que mudou de hora remove o antigo e cria o novo', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom(jaTinha('exc-velha', '2026-11-12T14:00:00Z', '2026-11-12T16:00:00Z')),
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(umEvento('a@x', '20261112T170000Z', '20261112T190000Z'))
      ),
    });

    expect(r.removidas).toBe(1);
    expect(r.criadas).toBe(1);
    // A remoção tem de vir primeiro: o Sharetribe recusa excepções sobrepostas.
    expect(sdk.chamadas.removidas).toHaveLength(1);
  });
});

describe('quando um calendário não pode ser lido', () => {
  const comBloqueio = {
    icalFeeds: [{ url: 'https://x/a.ics', nome: 'Hotel' }],
    icalSync: {
      ultimaSincronizacao: '2026-11-10T00:00:00.000Z',
      excepcoes: [
        {
          id: 'exc-viva',
          inicio: Date.parse('2026-11-12T14:00:00Z'),
          fim: Date.parse('2026-11-12T16:00:00Z'),
        },
      ],
    },
  };

  /**
   * O CASO QUE DEFINE ESTA FUNCIONALIDADE.
   *
   * A tentação é limpar quando não há dados. Mas um anúncio que perde os
   * bloqueios por causa de um timeout fica à venda em horas que o hotel já
   * tem ocupadas.
   */
  it('não apaga os bloqueios que já lá estavam', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom(comBloqueio),
      agora: AGORA,
      buscar: buscarQueFalha('demorou demasiado'),
    });

    expect(r.removidas).toBe(0);
    expect(sdk.chamadas.removidas).toHaveLength(0);
  });

  it('e diz o que falhou, em vez de passar por bem-sucedida', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom(comBloqueio),
      agora: AGORA,
      buscar: buscarQueFalha('o servidor respondeu 404'),
    });

    expect(r.erros.join(' ')).toMatch(/Hotel.*404/);
    expect(r.avisos.join(' ')).toMatch(/nada foi removido/);
  });

  /**
   * Com dois calendários e um a falhar, ainda se pode acrescentar o que se
   * leu — o que não se pode é remover, porque não se sabe o que o outro dizia.
   */
  it('com dois calendários e um a falhar, acrescenta mas não remove', async () => {
    const sdk = sdkFalso();
    const anuncio = anuncioCom({
      icalFeeds: [{ url: 'https://bom/a.ics' }, { url: 'https://mau/b.ics' }],
      icalSync: comBloqueio.icalSync,
    });

    const r = await sincronizarAnuncio({
      sdk,
      anuncio,
      agora: AGORA,
      buscar: async url =>
        String(url).includes('bom')
          ? { ok: true, texto: calendarioCom(umEvento('n@x', '20261120T100000Z', '20261120T110000Z')) }
          : { ok: false, motivo: 'erro de rede' },
    });

    expect(r.criadas).toBe(1);
    expect(r.removidas).toBe(0);
  });
});

describe('o que não é nosso', () => {
  /**
   * O anfitrião também cria excepções à mão no formulário do anúncio. Só se
   * apaga o que está na nossa lista de ids — o resto não nos pertence.
   */
  it('só se apagam as excepções cujos ids guardámos', async () => {
    const sdk = sdkFalso();

    await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom({
        icalFeeds: [{ url: 'https://x/a.ics' }],
        icalSync: {
          ultimaSincronizacao: '2026-11-10T00:00:00.000Z',
          excepcoes: [
            { id: 'nossa', inicio: Date.parse('2026-11-12T14:00:00Z'), fim: Date.parse('2026-11-12T16:00:00Z') },
          ],
        },
      }),
      agora: AGORA,
      buscar: buscarQueDevolve(calendarioCom()),
    });

    expect(sdk.chamadas.removidas.map(c => c.id)).toEqual(['nossa']);
  });
});

describe('limites', () => {
  it('não bloqueia para lá do horizonte', async () => {
    const sdk = sdkFalso();
    const longe = new Date(AGORA + 500 * DIA).toISOString().replace(/[-:]|\.\d{3}/g, '');

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom({ icalFeeds: [{ url: 'https://x/a.ics' }] }),
      agora: AGORA,
      buscar: buscarQueDevolve(
        calendarioCom(umEvento('longe@x', longe, longe.replace('T', 'T')))
      ),
    });

    expect(r.criadas).toBe(0);
  });

  it('os avisos do calendário chegam a quem sincroniza', async () => {
    const sdk = sdkFalso();

    const r = await sincronizarAnuncio({
      sdk,
      anuncio: anuncioCom({ icalFeeds: [{ url: 'https://x/a.ics', nome: 'Agenda' }] }),
      agora: AGORA,
      buscar: buscarQueDevolve(
        [
          'BEGIN:VCALENDAR',
          'BEGIN:VEVENT',
          'UID:r@x',
          'DTSTART:20261112T140000Z',
          'DTEND:20261112T150000Z',
          'RRULE:FREQ=MONTHLY;BYSETPOS=2;BYDAY=TU',
          'END:VEVENT',
          'END:VCALENDAR',
        ].join('\r\n')
      ),
    });

    expect(r.avisos.join(' ')).toMatch(/Agenda.*não suportada/i);
  });
});
