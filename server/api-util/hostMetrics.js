/**
 * Métricas detalhadas do anfitrião — o que o Pro acrescenta ao painel.
 *
 * Funções puras sobre as transações que o host-stats já traz, para poderem ser
 * testadas sem rede. Os montantes ficam em subunidades (cêntimos), como o resto
 * do painel, e é o frontend que formata.
 *
 * O que o painel mostrava antes — receita do mês, reservas da semana, ocupação,
 * sazonalidade e próximas reservas — continua a ser calculado onde estava e
 * continua a ser de toda a gente. Isto é só o acrescento.
 */

/**
 * Uma transação cancelada é qualquer uma cuja última transição contenha
 * "cancel". Os quatro processos (booking, purchase, inquiry, negotiation) têm
 * nomes diferentes para o mesmo acto — customer-cancel, provider-cancel,
 * operator-cancel-long-term-pending — e todos partilham essa raiz. Preferimos
 * isso a uma lista fixa que se desactualiza sempre que um processo muda.
 */
const isCancelled = tx => /cancel/i.test(tx?.attributes?.lastTransition || '');

const amountOf = tx => tx?.attributes?.payinTotal?.amount || 0;

const sum = ns => ns.reduce((a, b) => a + b, 0);

/** Divisão que devolve null em vez de NaN ou Infinity quando não há base. */
const safeRatio = (part, whole) => (whole > 0 ? part / whole : null);

const inMonth = (tx, year, month) => {
  const d = new Date(tx?.attributes?.createdAt);
  return !isNaN(d) && d.getFullYear() === year && d.getMonth() === month;
};

/**
 * @param {Array} transactions transações como vêm da Marketplace API
 * @param {Object} listingsMap uuid → recurso de anúncio incluído
 * @param {Date} now
 * @returns {Object} métricas detalhadas
 */
const detailedMetrics = (transactions = [], listingsMap = {}, now = new Date()) => {
  const all = Array.isArray(transactions) ? transactions : [];
  const cancelled = all.filter(isCancelled);
  // O ticket médio e a receita por espaço só contam o que não foi cancelado:
  // incluir cancelamentos inflaciona os dois e dá ao anfitrião um número que
  // nunca viu na conta bancária.
  const effective = all.filter(tx => !isCancelled(tx));

  const revenue = sum(effective.map(amountOf));

  // Receita por espaço, do maior para o menor.
  const byListing = new Map();
  effective.forEach(tx => {
    const uuid = tx?.relationships?.listing?.data?.id?.uuid;
    if (!uuid) return;
    const current = byListing.get(uuid) || { listingId: uuid, title: null, bookings: 0, revenue: 0 };
    current.title = current.title || listingsMap[uuid]?.attributes?.title || null;
    current.bookings += 1;
    current.revenue += amountOf(tx);
    byListing.set(uuid, current);
  });

  // Mês corrente contra o anterior, para o anfitrião saber se está a subir.
  const thisMonth = { y: now.getFullYear(), m: now.getMonth() };
  const previous = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const currentRevenue = sum(
    effective.filter(tx => inMonth(tx, thisMonth.y, thisMonth.m)).map(amountOf)
  );
  const previousRevenue = sum(
    effective.filter(tx => inMonth(tx, previous.getFullYear(), previous.getMonth())).map(amountOf)
  );
  const change = safeRatio(currentRevenue - previousRevenue, previousRevenue);

  return {
    // Média por reserva concretizada.
    avgTicket: effective.length > 0 ? Math.round(revenue / effective.length) : 0,
    // Percentagem, arredondada à unidade. null quando não houve reservas —
    // é diferente de 0%, que quer dizer "nenhuma foi cancelada".
    cancellationRate:
      all.length > 0 ? Math.round((cancelled.length / all.length) * 100) : null,
    cancelledCount: cancelled.length,
    totalCount: all.length,
    revenueByListing: [...byListing.values()].sort((a, b) => b.revenue - a.revenue),
    currentMonthRevenue: currentRevenue,
    previousMonthRevenue: previousRevenue,
    // Variação em percentagem face ao mês anterior. null quando não há mês
    // anterior com que comparar; nesse caso o frontend não mostra seta nenhuma.
    revenueChangePercent: change === null ? null : Math.round(change * 100),
  };
};

module.exports = { detailedMetrics, isCancelled };
