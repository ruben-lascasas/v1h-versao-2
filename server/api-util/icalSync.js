/**
 * Sincronização de disponibilidade a partir de calendários iCal.
 *
 * O QUE FAZ
 *
 * O anfitrião guarda no anúncio um ou mais endereços iCal — a agenda do
 * Google, do Outlook, do PMS do hotel, de outra plataforma de aluguer. Este
 * módulo lê-os e cria no Sharetribe `availabilityExceptions` com `seats: 0`
 * nas horas ocupadas, para o espaço deixar de poder ser reservado aqui.
 *
 * A REGRA QUE MANDA EM TUDO: FALHAR FECHADO
 *
 * Se um calendário não puder ser lido — a rede falhou, o endereço mudou, o
 * servidor devolveu uma página de erro — **não se apaga nada**. Os bloqueios
 * que já lá estão ficam.
 *
 * A tentação é a inversa: sem dados, limpar. Mas um anúncio que perde os
 * bloqueios por causa de um timeout fica à venda numas horas em que o hotel
 * já tem a sala ocupada, e isso acaba com um cliente à porta sem entrar. Uma
 * hora bloqueada a mais é uma reserva perdida; uma hora bloqueada a menos é
 * uma reserva dupla. Não custam o mesmo.
 *
 * O QUE É NOSSO E O QUE NÃO SE TOCA
 *
 * O anfitrião também cria excepções à mão no formulário do anúncio, e essas
 * não nos pertencem. Por isso guarda-se em `privateData.icalSync.excepcoes` o
 * id de cada excepção que este módulo criou, e só esses são apagados. Nada
 * aqui mexe no que foi posto à mão.
 */

const { lerCalendario, juntarPeriodos } = require('./ical');

const DIA_MS = 24 * 60 * 60 * 1000;

// O Sharetribe não deixa consultar excepções para lá de 366 dias, por isso
// bloquear mais longe não servia de nada.
const HORIZONTE_DIAS = 365;

const TEMPO_LIMITE_MS = 15000;
const TAMANHO_MAXIMO = 5 * 1024 * 1024;

// Teto por passagem e por anúncio. Um calendário com milhares de eventos não
// pode consumir a quota de pedidos à API de toda a gente.
const MAX_ESCRITAS = 200;

/**
 * Vai buscar um calendário.
 *
 * @returns {Promise<{ok: true, texto: string} | {ok: false, motivo: string}>}
 */
const buscarCalendario = async url => {
  let controlo;
  try {
    controlo = new AbortController();
  } catch (_) {
    controlo = null;
  }
  const relogio = controlo ? setTimeout(() => controlo.abort(), TEMPO_LIMITE_MS) : null;

  try {
    const res = await fetch(url, {
      signal: controlo ? controlo.signal : undefined,
      redirect: 'follow',
      headers: { Accept: 'text/calendar, text/plain;q=0.9, */*;q=0.8' },
    });
    if (!res.ok) return { ok: false, motivo: `o servidor respondeu ${res.status}` };

    const texto = await res.text();
    if (texto.length > TAMANHO_MAXIMO) {
      return { ok: false, motivo: 'calendário demasiado grande' };
    }
    return { ok: true, texto };
  } catch (e) {
    const nome = e?.name === 'AbortError' ? 'demorou demasiado' : e?.message || 'erro de rede';
    return { ok: false, motivo: nome };
  } finally {
    if (relogio) clearTimeout(relogio);
  }
};

/** Dois períodos são o mesmo bloqueio? */
const mesmoPeriodo = (a, b) => a.inicio === b.inicio && a.fim === b.fim;

/**
 * Sincroniza um anúncio com os calendários que ele tem configurados.
 *
 * @param {Object} args
 * @param {Object} args.sdk Integration SDK
 * @param {Object} args.anuncio recurso do anúncio, com privateData
 * @param {Function} [args.buscar] para os testes; por omissão `buscarCalendario`
 * @param {number} [args.agora]
 * @returns {Promise<{criadas:number, removidas:number, avisos:string[], erros:string[], saltado?:string}>}
 */
const sincronizarAnuncio = async ({ sdk, anuncio, buscar = buscarCalendario, agora = Date.now() }) => {
  const resultado = { criadas: 0, removidas: 0, avisos: [], erros: [] };

  const pd = anuncio?.attributes?.privateData || {};
  const feeds = Array.isArray(pd.icalFeeds) ? pd.icalFeeds.filter(f => f && f.url) : [];
  if (feeds.length === 0) return { ...resultado, saltado: 'sem calendários' };

  // ── 1. Ler todos os calendários ──────────────────────────────────────────
  const periodos = [];
  let algumFalhou = false;

  for (const feed of feeds) {
    const r = await buscar(feed.url);
    if (!r.ok) {
      algumFalhou = true;
      resultado.erros.push(`${feed.nome || feed.url}: ${r.motivo}`);
      continue;
    }
    const { ocupacoes, avisos } = lerCalendario(r.texto, { agora });
    for (const a of avisos) resultado.avisos.push(`${feed.nome || feed.url}: ${a}`);
    periodos.push(...ocupacoes.map(o => ({ inicio: o.inicio, fim: o.fim })));
  }

  // A regra que manda: sem conseguir ler tudo, não se apaga nada. Pode-se
  // acrescentar o que se leu, mas remover às cegas é que não.
  if (algumFalhou) {
    resultado.avisos.push('nem todos os calendários foram lidos — nada foi removido');
  }

  // ── 2. O que devia estar bloqueado ───────────────────────────────────────
  const limite = agora + HORIZONTE_DIAS * DIA_MS;
  const desejados = juntarPeriodos(periodos)
    // O que já passou não se bloqueia, e um período a meio corta-se no "agora".
    .map(p => ({ inicio: Math.max(p.inicio, agora), fim: p.fim }))
    .filter(p => p.fim > p.inicio && p.inicio < limite)
    .map(p => ({ inicio: p.inicio, fim: Math.min(p.fim, limite) }));

  // ── 3. O que já lá está, posto por nós ───────────────────────────────────
  const anteriores = Array.isArray(pd.icalSync?.excepcoes) ? pd.icalSync.excepcoes : [];

  const paraRemover = algumFalhou
    ? []
    : anteriores.filter(a => !desejados.some(d => mesmoPeriodo(d, a)));
  const paraCriar = desejados.filter(d => !anteriores.some(a => mesmoPeriodo(d, a)));

  if (paraCriar.length + paraRemover.length > MAX_ESCRITAS) {
    resultado.avisos.push(
      `demasiadas alterações (${paraCriar.length + paraRemover.length}) — feitas as primeiras ${MAX_ESCRITAS}`
    );
  }

  // ── 4. Aplicar: remover primeiro ─────────────────────────────────────────
  // Primeiro as remoções, porque o Sharetribe recusa excepções sobrepostas e
  // um período que encolheu tem de libertar o espaço antes de se recriar.
  const mantidos = anteriores.filter(a => !paraRemover.includes(a));
  let escritas = 0;

  for (const velho of paraRemover) {
    if (escritas >= MAX_ESCRITAS) break;
    try {
      await sdk.availabilityExceptions.delete({ id: velho.id });
      resultado.removidas += 1;
      escritas += 1;
    } catch (e) {
      // Já não existir é o resultado que queríamos; o resto fica registado.
      const msg = e?.data?.errors?.[0]?.code || e?.message || 'erro';
      if (!/not-found|404/i.test(String(msg))) {
        resultado.erros.push(`não foi possível remover um bloqueio: ${msg}`);
        mantidos.push(velho);
      }
      escritas += 1;
    }
  }

  // ── 5. Aplicar: criar ────────────────────────────────────────────────────
  for (const novo of paraCriar) {
    if (escritas >= MAX_ESCRITAS) break;
    try {
      const res = await sdk.availabilityExceptions.create(
        {
          listingId: anuncio.id,
          start: new Date(novo.inicio),
          end: new Date(novo.fim),
          seats: 0,
        },
        { expand: true }
      );
      const criado = res?.data?.data;
      mantidos.push({
        id: criado?.id?.uuid || criado?.id,
        inicio: novo.inicio,
        fim: novo.fim,
      });
      resultado.criadas += 1;
      escritas += 1;
    } catch (e) {
      const msg = e?.data?.errors?.[0]?.code || e?.message || 'erro';
      resultado.erros.push(`não foi possível bloquear ${new Date(novo.inicio).toISOString()}: ${msg}`);
      escritas += 1;
    }
  }

  // ── 6. Guardar o que ficou ───────────────────────────────────────────────
  const mudou =
    resultado.criadas > 0 || resultado.removidas > 0 || !pd.icalSync?.ultimaSincronizacao;

  if (mudou) {
    try {
      await sdk.listings.update({
        id: anuncio.id,
        privateData: {
          icalSync: {
            ultimaSincronizacao: new Date(agora).toISOString(),
            excepcoes: mantidos.filter(m => m && m.id),
            ultimoErro: resultado.erros.length > 0 ? resultado.erros.join(' · ') : null,
          },
        },
      });
    } catch (e) {
      resultado.erros.push(`não foi possível guardar o estado: ${e?.message || 'erro'}`);
    }
  }

  return resultado;
};

module.exports = {
  sincronizarAnuncio,
  buscarCalendario,
  HORIZONTE_DIAS,
  MAX_ESCRITAS,
};
