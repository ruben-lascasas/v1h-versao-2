/**
 * O calendário de SAÍDA de um anúncio: as reservas aceites, em iCalendar.
 *
 * É o sentido contrário de icalSync.js. Lá lemos a agenda do anfitrião para
 * bloquear horas aqui; aqui damos-lhe um endereço que o Google, o Outlook ou o
 * PMS do hotel subscrevem, para as reservas feitas na Venue1Hub aparecerem lá.
 *
 * Só entram reservas no estado `accepted`. Uma reserva à espera de resposta
 * ainda pode ser recusada, e pô-la na agenda do anfitrião era dizer-lhe que a
 * sala está ocupada quando pode não estar. As canceladas e recusadas saem na
 * leitura seguinte, porque deixam de vir no ficheiro.
 *
 * O UID de cada evento termina em UID_SUFIXO. A importação (ical.js) ignora
 * esses eventos: se o anfitrião juntar este calendário à agenda que nós lemos,
 * não queremos bloquear as horas de uma reserva que já é nossa.
 */

const UID_SUFIXO = '-reserva@venue1hub.com';
const DIA_MS = 24 * 60 * 60 * 1000;
// Reservas que acabaram há mais do que isto já não interessam a ninguém, e
// mantê-las tornava o ficheiro cada vez maior.
const PASSADO_DIAS = 60;

const doisDigitos = n => String(n).padStart(2, '0');

const dataHoraUtc = d =>
  `${d.getUTCFullYear()}${doisDigitos(d.getUTCMonth() + 1)}${doisDigitos(d.getUTCDate())}T` +
  `${doisDigitos(d.getUTCHours())}${doisDigitos(d.getUTCMinutes())}${doisDigitos(d.getUTCSeconds())}Z`;

const dataUtc = d =>
  `${d.getUTCFullYear()}${doisDigitos(d.getUTCMonth() + 1)}${doisDigitos(d.getUTCDate())}`;

/** Escapes de TEXT do RFC 5545. */
const escapar = s =>
  String(s == null ? '' : s)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');

/**
 * Linhas com mais de 75 octetos são dobradas (RFC 5545, 3.1). Conta-se em
 * bytes UTF-8 e nunca se parte um carácter a meio.
 */
const dobrar = linha => {
  const partes = [];
  let atual = '';
  let bytes = 0;
  for (const ch of linha) {
    const n = Buffer.byteLength(ch, 'utf8');
    const limite = partes.length === 0 ? 75 : 74; // a continuação começa com um espaço
    if (bytes + n > limite) {
      partes.push(atual);
      atual = '';
      bytes = 0;
    }
    atual += ch;
    bytes += n;
  }
  partes.push(atual);
  return partes.join('\r\n ');
};

/**
 * Data e hora de um instante no fuso do espaço. Uma reserva ao dia começa à
 * meia-noite *do espaço*: em Lisboa, no verão, isso são 23:00 UTC da véspera.
 */
const local = (d, timeZone) => {
  try {
    const partes = new Intl.DateTimeFormat('en-GB', {
      timeZone: timeZone || 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(d)
      .reduce((acc, p) => ({ ...acc, [p.type]: p.value }), {});
    return {
      data: `${partes.year}${partes.month}${partes.day}`,
      meiaNoite: partes.hour === '00' && partes.minute === '00',
    };
  } catch (_) {
    return local(d, 'UTC');
  }
};

/**
 * As reservas ao dia vão como eventos de dia inteiro, com as datas do fuso do
 * espaço; as outras com a hora exata. Conta como "ao dia" o que começa e
 * acaba à meia-noite local e dura pelo menos 23 horas (a mudança de hora pode
 * encurtar um dia).
 */
const eDiaInteiro = (inicio, fim, timeZone) =>
  fim - inicio >= 23 * 60 * 60 * 1000 &&
  local(inicio, timeZone).meiaNoite &&
  local(fim, timeZone).meiaNoite;

const paraData = v => (v instanceof Date ? v : v ? new Date(v) : null);

/**
 * As reservas aceites de um anúncio, a partir do que a Integration API
 * devolve em `transactions.query` com `include: ['booking', 'customer']`.
 *
 * @returns {Array<{txId: string, inicio: Date, fim: Date, cliente: string|null}>}
 */
const reservasDoAnuncio = (transacoes, incluidos, listingId, agora = Date.now()) => {
  const porChave = new Map(
    (incluidos || []).map(e => [`${e.type}/${e.id?.uuid || e.id}`, e])
  );
  const limitePassado = agora - PASSADO_DIAS * DIA_MS;

  return (transacoes || []).reduce((acc, tx) => {
    const rel = tx.relationships || {};
    const anuncioId = rel.listing?.data?.id?.uuid || rel.listing?.data?.id;
    if (anuncioId !== listingId) return acc;

    const bookingId = rel.booking?.data?.id?.uuid || rel.booking?.data?.id;
    const booking = bookingId ? porChave.get(`booking/${bookingId}`) : null;
    if (!booking || booking.attributes?.state !== 'accepted') return acc;

    const inicio = paraData(booking.attributes.start);
    const fim = paraData(booking.attributes.end);
    if (!inicio || !fim || !(fim > inicio) || fim.getTime() < limitePassado) return acc;

    const clienteId = rel.customer?.data?.id?.uuid || rel.customer?.data?.id;
    const cliente = clienteId ? porChave.get(`user/${clienteId}`) : null;

    acc.push({
      txId: tx.id?.uuid || tx.id,
      inicio,
      fim,
      cliente: cliente?.attributes?.profile?.displayName || null,
    });
    return acc;
  }, []);
};

/**
 * @param {Object} p
 * @param {string} p.titulo título do anúncio
 * @param {Array} p.reservas saída de reservasDoAnuncio
 * @param {string} p.raiz endereço do site, para os links das reservas
 * @param {string} [p.timeZone] fuso do espaço (availabilityPlan.timezone)
 * @param {Date} [p.agora]
 * @returns {string} o ficheiro .ics
 */
const gerarCalendario = ({ titulo, reservas, raiz, timeZone, agora = new Date() }) => {
  const base = String(raiz || '').replace(/\/$/, '');
  const carimbo = dataHoraUtc(agora);
  const nome = `Venue1Hub · ${titulo || 'Reservas'}`;

  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Venue1Hub//Reservas//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapar(nome)}`,
    // Pedidos (não ordens) para voltar a ler de hora a hora. O Outlook e o
    // Apple costumam respeitar; o Google decide sozinho.
    'REFRESH-INTERVAL;VALUE=DURATION:PT1H',
    'X-PUBLISHED-TTL:PT1H',
  ];

  [...(reservas || [])]
    .sort((a, b) => a.inicio - b.inicio)
    .forEach(r => {
      const link = base ? `${base}/sale/${r.txId}` : null;
      const resumo = r.cliente ? `Reserva Venue1Hub · ${r.cliente}` : 'Reserva Venue1Hub';
      const descricao = [
        `Reserva aceite na Venue1Hub para ${titulo || 'este espaço'}.`,
        r.cliente ? `Cliente: ${r.cliente}` : null,
        link ? `Detalhes: ${link}` : null,
      ]
        .filter(Boolean)
        .join('\n');

      linhas.push('BEGIN:VEVENT');
      linhas.push(`UID:${r.txId}${UID_SUFIXO}`);
      linhas.push(`DTSTAMP:${carimbo}`);
      if (eDiaInteiro(r.inicio, r.fim, timeZone)) {
        linhas.push(`DTSTART;VALUE=DATE:${local(r.inicio, timeZone).data}`);
        linhas.push(`DTEND;VALUE=DATE:${local(r.fim, timeZone).data}`);
      } else {
        linhas.push(`DTSTART:${dataHoraUtc(r.inicio)}`);
        linhas.push(`DTEND:${dataHoraUtc(r.fim)}`);
      }
      linhas.push(`SUMMARY:${escapar(resumo)}`);
      linhas.push(`DESCRIPTION:${escapar(descricao)}`);
      if (link) linhas.push(`URL:${link}`);
      linhas.push('STATUS:CONFIRMED');
      linhas.push('TRANSP:OPAQUE');
      linhas.push('END:VEVENT');
    });

  linhas.push('END:VCALENDAR');
  return `${linhas.map(dobrar).join('\r\n')}\r\n`;
};

module.exports = {
  UID_SUFIXO,
  reservasDoAnuncio,
  gerarCalendario,
  // para os testes
  escapar,
  dobrar,
  eDiaInteiro,
};
