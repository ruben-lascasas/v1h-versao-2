/**
 * O LEITOR DE CALENDÁRIOS.
 *
 * O que se verifica aqui tem quase todo a mesma forma: **não bloquear a menos**.
 * Um período lido a mais faz o anfitrião perder uma reserva, o que é chato; um
 * período lido a menos vende a mesma sala duas vezes e põe um cliente à porta
 * sem entrar. Os dois erros não custam o mesmo, e os testes refletem isso.
 */

const { lerCalendario, juntarPeriodos, desdobrar, lerDuracao } = require('./ical');

const AGORA = Date.parse('2026-11-11T00:00:00Z');

const cal = (...linhas) =>
  ['BEGIN:VCALENDAR', 'VERSION:2.0', ...linhas, 'END:VCALENDAR'].join('\r\n');

const evento = (...linhas) => cal('BEGIN:VEVENT', ...linhas, 'END:VEVENT');

const iso = ms => new Date(ms).toISOString();

describe('o básico', () => {
  it('lê um evento com horas em UTC', () => {
    const { ocupacoes, avisos } = lerCalendario(
      evento('UID:a@x', 'SUMMARY:Reunião', 'DTSTART:20261112T140000Z', 'DTEND:20261112T160000Z'),
      { agora: AGORA }
    );

    expect(avisos).toEqual([]);
    expect(ocupacoes).toHaveLength(1);
    expect(iso(ocupacoes[0].inicio)).toBe('2026-11-12T14:00:00.000Z');
    expect(iso(ocupacoes[0].fim)).toBe('2026-11-12T16:00:00.000Z');
  });

  it('o que não é um calendário não produz ocupações nem silêncio', () => {
    const r = lerCalendario('<html>página de erro do servidor</html>');

    expect(r.ocupacoes).toEqual([]);
    expect(r.avisos).toEqual(['não parece um calendário iCalendar']);
  });

  /**
   * O RFC manda partir linhas longas e continuá-las com um espaço. Quem lê
   * linha a linha sem as juntar primeiro parte um DTSTART ao meio e perde o
   * evento inteiro.
   */
  it('junta linhas dobradas antes de as interpretar', () => {
    const texto = cal(
      'BEGIN:VEVENT',
      'UID:dobrado@x',
      'DTSTART:2026111',
      ' 2T090000Z',
      'DTEND:20261112T100000Z',
      'END:VEVENT'
    );

    const { ocupacoes } = lerCalendario(texto, { agora: AGORA });

    expect(ocupacoes).toHaveLength(1);
    expect(iso(ocupacoes[0].inicio)).toBe('2026-11-12T09:00:00.000Z');
  });

  it('desdobrar aceita espaço e tabulação', () => {
    expect(desdobrar('A:1\r\n 2\r\nB:3').join('|')).toBe('A:12|B:3');
    expect(desdobrar('A:1\n\t2').join('|')).toBe('A:12');
  });
});

describe('dias inteiros', () => {
  /**
   * O DTEND de um dia inteiro é EXCLUSIVO. 10→11 é só o dia 10. Tratá-lo como
   * inclusivo bloqueia um dia a mais todas as vezes.
   */
  it('o fim é exclusivo: 12→13 ocupa só o dia 12', () => {
    const { ocupacoes } = lerCalendario(
      evento('UID:d@x', 'DTSTART;VALUE=DATE:20261112', 'DTEND;VALUE=DATE:20261113'),
      { agora: AGORA }
    );

    expect(iso(ocupacoes[0].inicio)).toBe('2026-11-12T00:00:00.000Z');
    expect(iso(ocupacoes[0].fim)).toBe('2026-11-13T00:00:00.000Z');
  });

  it('sem DTEND, um dia inteiro ocupa esse dia', () => {
    const { ocupacoes } = lerCalendario(evento('UID:d2@x', 'DTSTART;VALUE=DATE:20261112'), {
      agora: AGORA,
    });

    expect(ocupacoes[0].fim - ocupacoes[0].inicio).toBe(24 * 3600 * 1000);
  });
});

describe('fusos horários', () => {
  /**
   * 14:00 em Lisboa em Novembro (sem horário de verão) são 14:00 UTC; em Julho
   * são 13:00 UTC. Se isto estiver errado, bloqueia-se a hora errada — e em
   * Agosto, que é quando os espaços se alugam.
   */
  it('converte TZID para UTC, com e sem horário de verão', () => {
    const inverno = lerCalendario(
      evento(
        'UID:inv@x',
        'DTSTART;TZID=Europe/Lisbon:20261112T140000',
        'DTEND;TZID=Europe/Lisbon:20261112T150000'
      ),
      { agora: AGORA }
    );
    expect(iso(inverno.ocupacoes[0].inicio)).toBe('2026-11-12T14:00:00.000Z');

    const verao = lerCalendario(
      evento(
        'UID:ver@x',
        'DTSTART;TZID=Europe/Lisbon:20260712T140000',
        'DTEND;TZID=Europe/Lisbon:20260712T150000'
      ),
      { agora: AGORA }
    );
    expect(iso(verao.ocupacoes[0].inicio)).toBe('2026-07-12T13:00:00.000Z');
  });

  it('uma zona mais distante também', () => {
    const { ocupacoes } = lerCalendario(
      evento(
        'UID:ny@x',
        'DTSTART;TZID=America/New_York:20261112T090000',
        'DTEND;TZID=America/New_York:20261112T100000'
      ),
      { agora: AGORA }
    );

    expect(iso(ocupacoes[0].inicio)).toBe('2026-11-12T14:00:00.000Z');
  });
});

describe('o que não ocupa', () => {
  it('um evento cancelado', () => {
    const { ocupacoes } = lerCalendario(
      evento('UID:c@x', 'STATUS:CANCELLED', 'DTSTART:20261112T140000Z', 'DTEND:20261112T160000Z'),
      { agora: AGORA }
    );

    expect(ocupacoes).toEqual([]);
  });

  /**
   * TRANSPARENT quer dizer "isto está na minha agenda mas não me ocupa" — um
   * aniversário, um lembrete. Bloquear a sala por causa disso fazia o
   * anfitrião perder reservas sem perceber porquê.
   */
  it('um evento marcado como livre', () => {
    const { ocupacoes } = lerCalendario(
      evento('UID:t@x', 'TRANSP:TRANSPARENT', 'DTSTART:20261112T140000Z', 'DTEND:20261112T160000Z'),
      { agora: AGORA }
    );

    expect(ocupacoes).toEqual([]);
  });

  it('um evento de duração zero ou negativa', () => {
    const { ocupacoes } = lerCalendario(
      evento('UID:z@x', 'DTSTART:20261112T140000Z', 'DTEND:20261112T140000Z'),
      { agora: AGORA }
    );

    expect(ocupacoes).toEqual([]);
  });
});

describe('DURATION em vez de DTEND', () => {
  it('soma a duração ao início', () => {
    const { ocupacoes } = lerCalendario(
      evento('UID:dur@x', 'DTSTART:20261112T140000Z', 'DURATION:PT1H30M'),
      { agora: AGORA }
    );

    expect(ocupacoes[0].fim - ocupacoes[0].inicio).toBe(90 * 60 * 1000);
  });

  it('lerDuracao entende semanas, dias e horas', () => {
    expect(lerDuracao('PT2H')).toBe(2 * 3600000);
    expect(lerDuracao('P1D')).toBe(86400000);
    expect(lerDuracao('P1W')).toBe(7 * 86400000);
    expect(lerDuracao('P1DT2H30M')).toBe(86400000 + 2 * 3600000 + 30 * 60000);
    expect(lerDuracao('disparate')).toBe(null);
  });
});

describe('repetições', () => {
  it('semanal com COUNT dá o número certo de ocorrências', () => {
    const { ocupacoes, avisos } = lerCalendario(
      evento(
        'UID:sem@x',
        'DTSTART:20261112T140000Z',
        'DTEND:20261112T160000Z',
        'RRULE:FREQ=WEEKLY;COUNT=3'
      ),
      { agora: AGORA }
    );

    expect(avisos).toEqual([]);
    expect(ocupacoes).toHaveLength(3);
    expect(ocupacoes.map(o => iso(o.inicio))).toEqual([
      '2026-11-12T14:00:00.000Z',
      '2026-11-19T14:00:00.000Z',
      '2026-11-26T14:00:00.000Z',
    ]);
  });

  it('todas mantêm a mesma duração', () => {
    const { ocupacoes } = lerCalendario(
      evento(
        'UID:dur2@x',
        'DTSTART:20261112T140000Z',
        'DTEND:20261112T163000Z',
        'RRULE:FREQ=DAILY;COUNT=4'
      ),
      { agora: AGORA }
    );

    for (const o of ocupacoes) expect(o.fim - o.inicio).toBe(150 * 60 * 1000);
  });

  it('UNTIL trava a expansão', () => {
    const { ocupacoes } = lerCalendario(
      evento(
        'UID:ate@x',
        'DTSTART:20261112T140000Z',
        'DTEND:20261112T150000Z',
        'RRULE:FREQ=DAILY;UNTIL=20261114T235959Z'
      ),
      { agora: AGORA }
    );

    expect(ocupacoes).toHaveLength(3);
  });

  it('EXDATE tira a ocorrência excluída', () => {
    const { ocupacoes } = lerCalendario(
      evento(
        'UID:ex@x',
        'DTSTART:20261112T140000Z',
        'DTEND:20261112T150000Z',
        'RRULE:FREQ=DAILY;COUNT=3',
        'EXDATE:20261113T140000Z'
      ),
      { agora: AGORA }
    );

    expect(ocupacoes.map(o => iso(o.inicio))).toEqual([
      '2026-11-12T14:00:00.000Z',
      '2026-11-14T14:00:00.000Z',
    ]);
  });

  it('não expande para lá do horizonte', () => {
    const { ocupacoes } = lerCalendario(
      evento('UID:inf@x', 'DTSTART:20261112T140000Z', 'DTEND:20261112T150000Z', 'RRULE:FREQ=DAILY'),
      { agora: AGORA }
    );

    expect(ocupacoes.length).toBeGreaterThan(300);
    expect(ocupacoes.length).toBeLessThanOrEqual(1000);
    const ultimo = Math.max(...ocupacoes.map(o => o.inicio));
    expect(ultimo).toBeLessThanOrEqual(AGORA + 401 * 24 * 3600 * 1000);
  });

  /**
   * O CASO QUE DECIDE A CONFIANÇA NISTO.
   *
   * Uma regra que o leitor não sabe expandir não pode passar por lida. Se
   * passasse, o calendário dizia "ocupado todas as terças" e nós bloqueávamos
   * uma terça só — e as outras vendiam-se em cima da reserva do hotel.
   */
  it('uma regra não suportada avisa, em vez de fingir que a cumpriu', () => {
    const { ocupacoes, avisos } = lerCalendario(
      evento(
        'UID:raro@x',
        'DTSTART:20261112T140000Z',
        'DTEND:20261112T150000Z',
        'RRULE:FREQ=MONTHLY;BYSETPOS=2;BYDAY=TU'
      ),
      { agora: AGORA }
    );

    expect(ocupacoes).toHaveLength(1);
    expect(avisos.join(' ')).toMatch(/não suportada/i);
  });

  it('uma ocorrência alterada individualmente também avisa', () => {
    const { avisos } = lerCalendario(
      evento(
        'UID:alt@x',
        'RECURRENCE-ID:20261119T140000Z',
        'DTSTART:20261119T150000Z',
        'DTEND:20261119T160000Z'
      ),
      { agora: AGORA }
    );

    expect(avisos.join(' ')).toMatch(/RECURRENCE-ID/);
  });
});

describe('juntarPeriodos', () => {
  it('funde o que se sobrepõe', () => {
    expect(juntarPeriodos([{ inicio: 10, fim: 20 }, { inicio: 15, fim: 30 }])).toEqual([
      { inicio: 10, fim: 30 },
    ]);
  });

  it('funde o que se toca', () => {
    expect(juntarPeriodos([{ inicio: 10, fim: 20 }, { inicio: 20, fim: 30 }])).toEqual([
      { inicio: 10, fim: 30 },
    ]);
  });

  it('deixa em paz o que está separado', () => {
    expect(juntarPeriodos([{ inicio: 30, fim: 40 }, { inicio: 10, fim: 20 }])).toEqual([
      { inicio: 10, fim: 20 },
      { inicio: 30, fim: 40 },
    ]);
  });

  it('um período contido noutro desaparece dentro dele', () => {
    expect(juntarPeriodos([{ inicio: 10, fim: 50 }, { inicio: 20, fim: 30 }])).toEqual([
      { inicio: 10, fim: 50 },
    ]);
  });

  it('sem períodos, nada', () => {
    expect(juntarPeriodos([])).toEqual([]);
  });
});
