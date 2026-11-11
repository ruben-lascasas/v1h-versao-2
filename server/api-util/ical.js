/**
 * Leitor de calendários iCalendar (RFC 5545).
 *
 * PARA QUE SERVE
 *
 * Um anfitrião que já gere a agenda do espaço noutro sítio — Google Calendar,
 * Outlook, o PMS do hotel, outra plataforma de aluguer — publica normalmente
 * um endereço iCal com a ocupação. Lendo esse endereço, a Venue1Hub consegue
 * bloquear as horas ocupadas sem o anfitrião ter de as repetir à mão, e sem
 * integração à medida com cada sistema.
 *
 * PORQUE É ESCRITO À MÃO E NÃO COM UMA BIBLIOTECA
 *
 * Não havia nenhuma instalada, e o que precisamos é uma fatia pequena do
 * formato. Mais importante: o modo de falhar interessa-nos mais do que a
 * cobertura. Uma biblioteca que ignora em silêncio o que não percebe
 * devolveria "livre" onde está ocupado — e isso, neste contexto, é uma sala
 * vendida duas vezes e um cliente à porta sem entrar.
 *
 * Por isso este leitor **nunca ignora em silêncio**: o que não consegue
 * interpretar sai em `avisos`, e quem o chama decide o que fazer. Mais vale
 * recusar uma sincronização do que bloquear a menos.
 *
 * O QUE SUPORTA
 *
 *   VEVENT, com DTSTART/DTEND em UTC (Z), com TZID, ou em dia inteiro
 *   DURATION, quando não há DTEND
 *   STATUS:CANCELLED e TRANSP:TRANSPARENT — não ocupam
 *   RRULE FREQ=DAILY|WEEKLY|MONTHLY|YEARLY, com INTERVAL, COUNT, UNTIL, BYDAY
 *   EXDATE
 *   Dobragem de linhas (RFC 5545 §3.1) e caracteres escapados
 *
 * O QUE NÃO SUPORTA (e avisa)
 *
 *   RRULE por segundo/minuto/hora, BYSETPOS, BYMONTHDAY e afins
 *   RECURRENCE-ID (ocorrências alteradas individualmente)
 *   VTIMEZONE próprio do ficheiro — usam-se as zonas do sistema
 */

const DIA_MS = 24 * 60 * 60 * 1000;

// Até onde se expandem as repetições. Um ano e pouco: o Sharetribe não aceita
// consultar excepções para lá de 366 dias, por isso bloquear mais longe não
// traria nada e só faria crescer o trabalho a cada passagem.
const HORIZONTE_DIAS = 400;
const MAX_OCORRENCIAS = 1000;

const DIAS_SEMANA = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };

/**
 * Desdobra as linhas continuadas e devolve-as uma a uma.
 *
 * O RFC manda partir linhas longas e continuar a seguinte com um espaço ou
 * tabulação. Quem ler linha a linha sem juntar primeiro parte endereços e
 * descrições ao meio — e, pior, pode partir um DTSTART.
 */
const desdobrar = texto => {
  const linhas = String(texto).split(/\r\n|\n|\r/);
  const saida = [];
  for (const linha of linhas) {
    if (/^[ \t]/.test(linha) && saida.length > 0) {
      saida[saida.length - 1] += linha.slice(1);
    } else {
      saida.push(linha);
    }
  }
  return saida;
};

/** Separa "DTSTART;TZID=Europe/Lisbon:20261110T140000" nas três partes. */
const partirLinha = linha => {
  const doisPontos = linha.indexOf(':');
  if (doisPontos === -1) return null;
  const esquerda = linha.slice(0, doisPontos);
  const valor = linha.slice(doisPontos + 1);
  const [nome, ...paramsCruas] = esquerda.split(';');
  const params = {};
  for (const p of paramsCruas) {
    const igual = p.indexOf('=');
    if (igual === -1) continue;
    params[p.slice(0, igual).toUpperCase()] = p.slice(igual + 1).replace(/^"|"$/g, '');
  }
  return { nome: nome.toUpperCase(), params, valor };
};

const desescapar = v =>
  String(v)
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\');

/**
 * Quantos milissegundos é preciso somar a um instante UTC para que ele se leia,
 * naquela zona, como a hora que o calendário escreveu.
 *
 * Sem biblioteca de fusos, usa-se o `Intl` do próprio Node, que conhece a base
 * de dados IANA. Faz-se duas passagens porque a primeira estimativa pode cair
 * do lado errado de uma mudança de hora.
 */
const paraUtc = (ano, mes, dia, hora, minuto, segundo, zona) => {
  const alvo = Date.UTC(ano, mes - 1, dia, hora, minuto, segundo);
  if (!zona) return alvo;

  let palpite = alvo;
  for (let i = 0; i < 2; i++) {
    let partes;
    try {
      partes = new Intl.DateTimeFormat('en-US', {
        timeZone: zona,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      }).formatToParts(new Date(palpite));
    } catch (_) {
      // Zona desconhecida para este Node: trata-se como UTC e quem chamou que
      // decida — o aviso é dado em cima, onde se sabe de que evento se trata.
      return alvo;
    }
    const p = {};
    for (const x of partes) p[x.type] = x.value;
    const comoSeLe = Date.UTC(
      Number(p.year),
      Number(p.month) - 1,
      Number(p.day),
      Number(p.hour) === 24 ? 0 : Number(p.hour),
      Number(p.minute),
      Number(p.second)
    );
    const desvio = alvo - comoSeLe;
    if (desvio === 0) break;
    palpite += desvio;
  }
  return palpite;
};

/** Interpreta um DTSTART/DTEND/EXDATE. Devolve { ms, diaInteiro } ou null. */
const lerData = (valor, params) => {
  const v = String(valor).trim();
  const diaInteiro = params.VALUE === 'DATE' || /^\d{8}$/.test(v);

  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return null;

  const [, ano, mes, dia, hora, minuto, segundo, zulu] = m;
  if (diaInteiro) {
    return { ms: Date.UTC(+ano, +mes - 1, +dia), diaInteiro: true };
  }
  if (zulu) {
    return {
      ms: Date.UTC(+ano, +mes - 1, +dia, +hora, +minuto, +segundo),
      diaInteiro: false,
    };
  }
  // Sem Z e sem TZID é "hora local do leitor". Não havendo leitor, assume-se a
  // zona do calendário se vier, e UTC se não vier.
  // `paraUtc` recebe o mês como o calendário o escreve (1–12), não como o
  // Date o conta (0–11).
  return {
    ms: paraUtc(+ano, +mes, +dia, +hora, +minuto, +segundo, params.TZID),
    diaInteiro: false,
  };
};

/** ISO 8601 das durações, só o que aparece em calendários: P1DT2H30M. */
const lerDuracao = valor => {
  const m = String(valor)
    .trim()
    .match(/^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
  if (!m) return null;
  const [, sinal, semanas, dias, horas, minutos, segundos] = m;
  const ms =
    (Number(semanas || 0) * 7 + Number(dias || 0)) * DIA_MS +
    Number(horas || 0) * 3600000 +
    Number(minutos || 0) * 60000 +
    Number(segundos || 0) * 1000;
  return sinal === '-' ? -ms : ms;
};

/**
 * Expande uma repetição em instantes de início.
 *
 * Devolve `{ inicios, aviso }`. Quando a regra usa uma parte que não se sabe
 * interpretar, devolve-se um aviso e **só a primeira ocorrência** — nunca se
 * finge que a regra foi cumprida.
 */
const expandirRepeticao = (inicioMs, rrule, excluidos, agora) => {
  const partes = {};
  for (const p of String(rrule).split(';')) {
    const i = p.indexOf('=');
    if (i > 0) partes[p.slice(0, i).toUpperCase()] = p.slice(i + 1).toUpperCase();
  }

  const freq = partes.FREQ;
  const suportadas = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'];
  const conhecidas = ['FREQ', 'INTERVAL', 'COUNT', 'UNTIL', 'BYDAY', 'WKST'];
  const desconhecidas = Object.keys(partes).filter(k => !conhecidas.includes(k));

  if (!suportadas.includes(freq) || desconhecidas.length > 0) {
    return {
      inicios: [inicioMs],
      aviso: `repetição não suportada (${rrule}) — só a primeira ocorrência foi bloqueada`,
    };
  }

  const intervalo = Math.max(1, Number(partes.INTERVAL || 1));
  const conta = partes.COUNT ? Number(partes.COUNT) : null;
  const ate = partes.UNTIL ? lerData(partes.UNTIL, {})?.ms ?? null : null;
  const limite = agora + HORIZONTE_DIAS * DIA_MS;
  const porDia = partes.BYDAY
    ? partes.BYDAY.split(',')
        .map(d => DIAS_SEMANA[d.replace(/^[+-]?\d+/, '')])
        .filter(d => d !== undefined)
    : null;

  const inicios = [];
  // O COUNT conta o que a REGRA gera, não o que sobra: o EXDATE remove depois.
  // Contar só os que sobram gerava uma ocorrência a mais por cada exclusão —
  // bloqueava-se um dia que o calendário dava como livre.
  let gerados = 0;
  let n = 0;

  while (gerados < MAX_OCORRENCIAS && n < MAX_OCORRENCIAS * 4) {
    let candidato;
    if (freq === 'DAILY') {
      candidato = inicioMs + n * intervalo * DIA_MS;
    } else if (freq === 'WEEKLY') {
      candidato = inicioMs + n * intervalo * 7 * DIA_MS;
    } else if (freq === 'MONTHLY') {
      const d = new Date(inicioMs);
      candidato = Date.UTC(
        d.getUTCFullYear(),
        d.getUTCMonth() + n * intervalo,
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds()
      );
    } else {
      const d = new Date(inicioMs);
      candidato = Date.UTC(
        d.getUTCFullYear() + n * intervalo,
        d.getUTCMonth(),
        d.getUTCDate(),
        d.getUTCHours(),
        d.getUTCMinutes(),
        d.getUTCSeconds()
      );
    }
    n += 1;

    if (ate != null && candidato > ate) break;
    if (candidato > limite) break;

    // BYDAY numa regra semanal: a semana do candidato, nos dias pedidos.
    if (porDia && freq === 'WEEKLY') {
      const inicioSemana = candidato - ((new Date(candidato).getUTCDay() + 6) % 7) * DIA_MS;
      for (const d of porDia) {
        const desvio = (d + 6) % 7;
        const nesseDia = inicioSemana + desvio * DIA_MS;
        if (nesseDia < inicioMs) continue;
        if (ate != null && nesseDia > ate) continue;
        if (nesseDia > limite) continue;
        gerados += 1;
        if (!excluidos.has(nesseDia)) inicios.push(nesseDia);
        if (conta != null && gerados >= conta) break;
      }
    } else {
      gerados += 1;
      if (!excluidos.has(candidato)) inicios.push(candidato);
    }

    if (conta != null && gerados >= conta) break;
  }

  return { inicios: [...new Set(inicios)].sort((a, b) => a - b) };
};

/**
 * Lê um calendário e devolve os períodos ocupados.
 *
 * @param {string} texto conteúdo do ficheiro .ics
 * @param {Object} [opcoes]
 * @param {number} [opcoes.agora] instante de referência, para os testes
 * @returns {{ocupacoes: Array<{uid:string,inicio:number,fim:number,resumo:string}>, avisos: string[]}}
 */
const lerCalendario = (texto, { agora = Date.now() } = {}) => {
  const avisos = [];
  const ocupacoes = [];

  if (!texto || !/BEGIN:VCALENDAR/i.test(texto)) {
    return { ocupacoes: [], avisos: ['não parece um calendário iCalendar'] };
  }

  const linhas = desdobrar(texto);
  let dentro = false;
  let ev = null;

  const fechar = () => {
    if (!ev) return;
    const { uid, dtstart, dtend, duracao, resumo, cancelado, transparente, rrule, exdate } = ev;

    if (cancelado || transparente) return;
    if (!dtstart) {
      avisos.push(`evento sem DTSTART${uid ? ` (${uid})` : ''} — ignorado`);
      return;
    }

    let fimMs;
    if (dtend) {
      fimMs = dtend.ms;
    } else if (duracao != null) {
      fimMs = dtstart.ms + duracao;
    } else if (dtstart.diaInteiro) {
      fimMs = dtstart.ms + DIA_MS;
    } else {
      // Um evento sem fim nem duração não ocupa tempo nenhum.
      return;
    }

    const comprimento = fimMs - dtstart.ms;
    if (comprimento <= 0) return;

    const inicios = rrule
      ? (() => {
          const r = expandirRepeticao(dtstart.ms, rrule, exdate, agora);
          if (r.aviso) avisos.push(`${uid || 'evento'}: ${r.aviso}`);
          return r.inicios;
        })()
      : [dtstart.ms];

    for (const ini of inicios) {
      ocupacoes.push({
        uid: uid || `${ini}`,
        inicio: ini,
        fim: ini + comprimento,
        resumo: resumo || '',
      });
    }
  };

  for (const linha of linhas) {
    const t = linha.trim();
    if (/^BEGIN:VEVENT$/i.test(t)) {
      dentro = true;
      ev = { exdate: new Set() };
      continue;
    }
    if (/^END:VEVENT$/i.test(t)) {
      fechar();
      dentro = false;
      ev = null;
      continue;
    }
    if (!dentro || !ev) continue;

    const c = partirLinha(linha);
    if (!c) continue;

    switch (c.nome) {
      case 'UID':
        ev.uid = desescapar(c.valor).trim();
        break;
      case 'SUMMARY':
        ev.resumo = desescapar(c.valor).trim();
        break;
      case 'DTSTART':
        ev.dtstart = lerData(c.valor, c.params);
        if (!ev.dtstart) avisos.push(`DTSTART ilegível: ${c.valor}`);
        break;
      case 'DTEND':
        ev.dtend = lerData(c.valor, c.params);
        if (!ev.dtend) avisos.push(`DTEND ilegível: ${c.valor}`);
        break;
      case 'DURATION':
        ev.duracao = lerDuracao(c.valor);
        if (ev.duracao == null) avisos.push(`DURATION ilegível: ${c.valor}`);
        break;
      case 'STATUS':
        if (/CANCELLED/i.test(c.valor)) ev.cancelado = true;
        break;
      case 'TRANSP':
        if (/TRANSPARENT/i.test(c.valor)) ev.transparente = true;
        break;
      case 'RRULE':
        ev.rrule = c.valor.trim();
        break;
      case 'EXDATE': {
        for (const parte of String(c.valor).split(',')) {
          const d = lerData(parte, c.params);
          if (d) ev.exdate.add(d.ms);
        }
        break;
      }
      case 'RECURRENCE-ID':
        avisos.push(
          `${ev.uid || 'evento'}: ocorrência alterada individualmente (RECURRENCE-ID) — não suportado`
        );
        break;
      default:
        break;
    }
  }

  return { ocupacoes, avisos };
};

/**
 * Junta períodos que se tocam ou sobrepõem.
 *
 * Dois calendários do mesmo espaço, ou um evento repetido, produzem períodos
 * colados. Sem os juntar, criavam-se excepções a mais no Sharetribe — e cada
 * uma é um pedido à API, que tem limites.
 *
 * @param {Array<{inicio:number,fim:number}>} periodos
 * @returns {Array<{inicio:number,fim:number}>}
 */
const juntarPeriodos = periodos => {
  const ordenados = [...periodos].sort((a, b) => a.inicio - b.inicio);
  const saida = [];
  for (const p of ordenados) {
    const ultimo = saida[saida.length - 1];
    if (ultimo && p.inicio <= ultimo.fim) {
      ultimo.fim = Math.max(ultimo.fim, p.fim);
    } else {
      saida.push({ inicio: p.inicio, fim: p.fim });
    }
  }
  return saida;
};

module.exports = {
  lerCalendario,
  juntarPeriodos,
  // exportados para os testes
  desdobrar,
  lerData,
  lerDuracao,
  expandirRepeticao,
  HORIZONTE_DIAS,
};
