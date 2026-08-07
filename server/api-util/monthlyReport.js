/**
 * Relatório mensal do anfitrião — o resumo que o plano Pro envia por email.
 *
 * Separado do job por a decisão do que se conta e do que se escreve não ter
 * nada a ver com ir buscar dados e enviar emails: assim testa-se sem rede e sem
 * caixa de correio.
 *
 * O relatório é sempre do mês *anterior* completo. Enviar o mês a decorrer daria
 * um número que muda depois de o anfitrião o ler.
 */

const { detailedMetrics, isCancelled } = require('./hostMetrics');

const MONTHS_PT = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];
const MONTHS_EN = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Primeiro e último instante do mês anterior ao de referência. */
const previousMonthRange = (reference = new Date()) => {
  const start = new Date(reference.getFullYear(), reference.getMonth() - 1, 1);
  const end = new Date(reference.getFullYear(), reference.getMonth(), 1);
  return { start, end };
};

const within = (tx, start, end) => {
  const d = new Date(tx?.attributes?.createdAt);
  return !isNaN(d) && d >= start && d < end;
};

const money = (cents, isEN) =>
  `${((cents || 0) / 100).toLocaleString(isEN ? 'en-GB' : 'pt-PT', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })} €`;

/**
 * Constrói os números do relatório.
 *
 * @param {Array} transactions todas as transações do anfitrião
 * @param {Object} listingsMap uuid → anúncio incluído
 * @param {Date} reference data a partir da qual se calcula "o mês anterior"
 * @returns {Object|null} null quando não houve actividade nenhuma no mês —
 *   nesse caso não se envia email, porque um relatório de zeros todos os meses
 *   é a forma mais rápida de ser marcado como spam.
 */
const buildReport = (transactions = [], listingsMap = {}, reference = new Date()) => {
  const { start, end } = previousMonthRange(reference);
  const ofMonth = (transactions || []).filter(tx => within(tx, start, end));

  if (ofMonth.length === 0) return null;

  // As métricas correm sobre o mês, com a referência posta no fim do período
  // para a comparação olhar para o mês anterior a esse.
  const metrics = detailedMetrics(ofMonth, listingsMap, new Date(end.getTime() - 1));
  const effective = ofMonth.filter(tx => !isCancelled(tx));

  return {
    monthIndex: start.getMonth(),
    year: start.getFullYear(),
    bookings: effective.length,
    cancelled: metrics.cancelledCount,
    revenue: effective.reduce((s, tx) => s + (tx.attributes?.payinTotal?.amount || 0), 0),
    avgTicket: metrics.avgTicket,
    cancellationRate: metrics.cancellationRate,
    byListing: metrics.revenueByListing,
  };
};

/** Assunto e corpo, bilingues conforme o locale do anfitrião. */
const renderEmail = (report, locale = 'pt', name = null) => {
  const isEN = String(locale).toLowerCase().startsWith('en');
  const monthName = (isEN ? MONTHS_EN : MONTHS_PT)[report.monthIndex];
  const greeting = name ? `${isEN ? 'Hi' : 'Olá'} ${name},` : isEN ? 'Hi,' : 'Olá,';

  const subject = isEN
    ? `Your ${monthName} ${report.year} summary`
    : `O seu resumo de ${monthName} de ${report.year}`;

  const row = (label, value) => `
    <tr>
      <td style="padding:8px 0;color:#6B6B6B;font-size:14px;">${label}</td>
      <td style="padding:8px 0;text-align:right;color:#3F3131;font-size:14px;font-weight:bold;">${value}</td>
    </tr>`;

  const listingRows = (report.byListing || [])
    .map(
      l => `
      <tr>
        <td style="padding:6px 0;color:#3F3131;font-size:13px;">${l.title || (isEN ? 'Removed listing' : 'Anúncio removido')}</td>
        <td style="padding:6px 0;text-align:right;color:#6B6B6B;font-size:13px;">${l.bookings}</td>
        <td style="padding:6px 0;text-align:right;color:#3F3131;font-size:13px;font-weight:bold;">${money(l.revenue, isEN)}</td>
      </tr>`
    )
    .join('');

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="color:#3F3131;font-size:20px;margin:0 0 4px 0;">
        ${isEN ? `${monthName} ${report.year}` : `${monthName.charAt(0).toUpperCase()}${monthName.slice(1)} de ${report.year}`}
      </h2>
      <p style="color:#6B6B6B;font-size:14px;margin:0 0 20px 0;">${greeting}</p>

      <table style="width:100%;border-collapse:collapse;border-bottom:1px solid #EDE6DD;margin-bottom:20px;">
        ${row(isEN ? 'Bookings' : 'Reservas', report.bookings)}
        ${row(isEN ? 'Revenue' : 'Receita', money(report.revenue, isEN))}
        ${row(isEN ? 'Average booking' : 'Ticket médio', money(report.avgTicket, isEN))}
        ${row(
          isEN ? 'Cancellation rate' : 'Taxa de cancelamento',
          report.cancellationRate == null ? '—' : `${report.cancellationRate}%`
        )}
      </table>

      ${
        listingRows
          ? `<h3 style="color:#3F3131;font-size:15px;margin:0 0 8px 0;">${
              isEN ? 'By venue' : 'Por espaço'
            }</h3>
             <table style="width:100%;border-collapse:collapse;">${listingRows}</table>`
          : ''
      }

      <p style="color:#6B6B6B;font-size:12px;margin:24px 0 0 0;">
        ${
          isEN
            ? 'You receive this because your plan includes monthly reports.'
            : 'Recebe isto porque o seu plano inclui relatórios mensais.'
        }
      </p>
    </div>`;

  return { subject, html };
};

module.exports = { buildReport, renderEmail, previousMonthRange };
