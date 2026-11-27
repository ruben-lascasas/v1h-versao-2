const {
  UID_SUFIXO,
  reservasDoAnuncio,
  gerarCalendario,
  dobrar,
  eDiaInteiro,
} = require('./icalExport');
const { lerCalendario } = require('./ical');

const LISTING = '11111111-1111-1111-1111-111111111111';
const OUTRO = '22222222-2222-2222-2222-222222222222';
const AGORA = new Date('2026-11-27T12:00:00Z').getTime();

const tx = (id, listingId, bookingId, customerId = 'c1') => ({
  id: { uuid: id },
  type: 'transaction',
  relationships: {
    listing: { data: { id: { uuid: listingId } } },
    booking: { data: { id: { uuid: bookingId } } },
    customer: { data: { id: { uuid: customerId } } },
  },
});
const booking = (id, state, start, end) => ({
  id: { uuid: id },
  type: 'booking',
  attributes: { state, start: new Date(start), end: new Date(end) },
});
const user = (id, displayName) => ({
  id: { uuid: id },
  type: 'user',
  attributes: { profile: { displayName } },
});

describe('icalExport', () => {
  const transacoes = [
    tx('t1', LISTING, 'b1'),
    tx('t2', LISTING, 'b2'),
    tx('t3', OUTRO, 'b3'),
    tx('t4', LISTING, 'b4'),
    tx('t5', LISTING, 'b5'),
  ];
  const incluidos = [
    booking('b1', 'accepted', '2026-12-03T09:00:00Z', '2026-12-03T12:00:00Z'),
    booking('b2', 'pending', '2026-12-04T09:00:00Z', '2026-12-04T12:00:00Z'),
    booking('b3', 'accepted', '2026-12-05T09:00:00Z', '2026-12-05T12:00:00Z'),
    booking('b4', 'cancelled', '2026-12-06T09:00:00Z', '2026-12-06T12:00:00Z'),
    booking('b5', 'accepted', '2026-12-10T00:00:00Z', '2026-12-12T00:00:00Z'),
    user('c1', 'Rafael L'),
  ];

  it('só entram as reservas aceites deste anúncio', () => {
    const r = reservasDoAnuncio(transacoes, incluidos, LISTING, AGORA);
    expect(r.map(x => x.txId)).toEqual(['t1', 't5']);
    expect(r[0].cliente).toBe('Rafael L');
  });

  it('deixa de fora o que acabou há mais de 60 dias', () => {
    const velho = [booking('b1', 'accepted', '2026-08-01T09:00:00Z', '2026-08-01T10:00:00Z')];
    expect(reservasDoAnuncio([tx('t1', LISTING, 'b1')], velho, LISTING, AGORA)).toEqual([]);
  });

  it('gera um calendário que o nosso próprio leitor entende, com horas e dias inteiros', () => {
    const texto = gerarCalendario({
      titulo: 'Sala, com vírgula; e ponto e vírgula',
      reservas: reservasDoAnuncio(transacoes, incluidos, LISTING, AGORA),
      raiz: 'https://venue1hub.com/',
      agora: new Date(AGORA),
    });
    expect(texto.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(texto.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(texto).toContain(`UID:t1${UID_SUFIXO}`);
    expect(texto).toContain('DTSTART:20261203T090000Z');
    expect(texto).toContain('DTSTART;VALUE=DATE:20261210');
    expect(texto).toContain('DTEND;VALUE=DATE:20261212');
    expect(texto).toContain('X-WR-CALNAME:Venue1Hub · Sala\\, com vírgula\\; e ponto e vírgula');
    expect(texto).toContain('URL:https://venue1hub.com/sale/t1');
    // Nenhuma linha passa dos 75 octetos.
    texto.split('\r\n').forEach(l => expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75));

    // Lido de volta como se fosse a agenda do anfitrião: as nossas reservas
    // são ignoradas, para não bloquearem as horas que já são delas.
    const lido = lerCalendario(texto, { agora: AGORA });
    expect(lido.ocupacoes).toEqual([]);
  });

  it('sem o UID nosso, o mesmo evento seria lido como ocupado', () => {
    const texto = gerarCalendario({
      titulo: 'Sala',
      reservas: reservasDoAnuncio(transacoes, incluidos, LISTING, AGORA),
      raiz: 'https://venue1hub.com',
      agora: new Date(AGORA),
    }).replace(new RegExp(UID_SUFIXO, 'g'), '@google.com');
    expect(lerCalendario(texto, { agora: AGORA }).ocupacoes.length).toBe(2);
  });

  it('dobra linhas longas sem partir caracteres', () => {
    const longa = `DESCRIPTION:${'ção'.repeat(60)}`;
    const dobrada = dobrar(longa);
    dobrada.split('\r\n').forEach(l => expect(Buffer.byteLength(l, 'utf8')).toBeLessThanOrEqual(75));
    expect(dobrada.split('\r\n ').join('')).toBe(longa);
  });

  it('reconhece reservas ao dia, à meia-noite do fuso do espaço', () => {
    const L = 'Europe/Lisbon';
    expect(eDiaInteiro(new Date('2026-12-10T00:00:00Z'), new Date('2026-12-11T00:00:00Z'), L)).toBe(true);
    expect(eDiaInteiro(new Date('2026-12-10T00:00:00Z'), new Date('2026-12-10T03:00:00Z'), L)).toBe(false);
    // Verão em Lisboa: a meia-noite local são 23:00 UTC da véspera.
    expect(eDiaInteiro(new Date('2026-07-09T23:00:00Z'), new Date('2026-07-10T23:00:00Z'), L)).toBe(true);
    expect(eDiaInteiro(new Date('2026-07-10T00:00:00Z'), new Date('2026-07-11T00:00:00Z'), L)).toBe(false);
  });

  it('no verão, o dia inteiro sai com as datas de Lisboa, não as UTC', () => {
    const texto = gerarCalendario({
      titulo: 'Sala',
      timeZone: 'Europe/Lisbon',
      reservas: [
        { txId: 't9', inicio: new Date('2026-07-09T23:00:00Z'), fim: new Date('2026-07-11T23:00:00Z'), cliente: null },
      ],
      raiz: 'https://venue1hub.com',
      agora: new Date(AGORA),
    });
    expect(texto).toContain('DTSTART;VALUE=DATE:20260710');
    expect(texto).toContain('DTEND;VALUE=DATE:20260712');
  });
});
