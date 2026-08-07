/**
 * Relatório mensal por email — benefício do plano Pro (§8.3).
 *
 * Corre no dia 1 de cada mês e envia a cada anfitrião com plano elegível o
 * resumo do mês que acabou: reservas, receita, ticket médio, taxa de
 * cancelamento e receita por espaço.
 *
 * Quem não teve actividade nenhuma no mês não recebe nada. Um relatório de
 * zeros todos os meses é a forma mais rápida de acabar no spam, e não diz ao
 * anfitrião nada que ele não saiba.
 *
 * Env:
 *   RESEND_API_KEY          sem ela o job não corre
 *   MONTHLY_REPORT_CRON     (por omissão "0 7 1 * *" — dia 1 às 07:00)
 *   DISABLE_MONTHLY_REPORT  "true" desliga
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { getIntegrationSdk } = require('../api-util/sdk');
const { allows } = require('../api-util/planFeatures');
const { buildReport, renderEmail } = require('../api-util/monthlyReport');

const PER_PAGE = 100;
const FROM = 'Venue1Hub <onboarding@resend.dev>';

/** Anfitriões cujo plano inclui relatórios mensais. */
const fetchEligibleHosts = async sdk => {
  const result = [];
  let page = 1;
  while (true) {
    const res = await sdk.users.query({ page, perPage: PER_PAGE });
    const items = res?.data?.data || [];
    items.forEach(u => {
      const plan = u?.attributes?.profile?.metadata?.plan;
      if (allows(plan, 'monthlyReports')) result.push(u);
    });
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return result;
};

/** Transações de um anfitrião, com os anúncios incluídos. */
const fetchTransactions = async (sdk, providerId) => {
  const res = await sdk.transactions.query({
    providerId,
    perPage: PER_PAGE,
    include: ['listing'],
    'fields.transaction': ['lastTransition', 'payinTotal', 'createdAt'],
    'fields.listing': ['title'],
  });
  const listingsMap = {};
  (res?.data?.included || []).forEach(item => {
    if (item.type === 'listing') listingsMap[item.id.uuid] = item;
  });
  return { transactions: res?.data?.data || [], listingsMap };
};

const runOnce = async (reference = new Date()) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[monthlyReport] skipped (RESEND_API_KEY missing)');
    return { sent: 0, skipped: 0 };
  }
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.warn('[monthlyReport] skipped (Integration SDK not configured)');
    return { sent: 0, skipped: 0 };
  }
  const resend = new Resend(apiKey);

  const hosts = await fetchEligibleHosts(sdk);
  let sent = 0;
  let skipped = 0;

  for (const host of hosts) {
    const uid = host.id?.uuid;
    const email = host?.attributes?.email;
    if (!uid || !email) continue;

    const profile = host?.attributes?.profile || {};
    const locale = profile.publicData?.locale || 'pt';
    const name = profile.firstName || null;

    try {
      const { transactions, listingsMap } = await fetchTransactions(sdk, uid);
      const report = buildReport(transactions, listingsMap, reference);

      if (!report) {
        skipped += 1;
        continue;
      }

      const { subject, html } = renderEmail(report, locale, name);
      await resend.emails.send({ from: FROM, to: [email], subject, html });
      sent += 1;
      console.log(`[monthlyReport] sent → ${email}`);
    } catch (e) {
      // Uma falha num anfitrião não pode parar os restantes.
      console.error(`[monthlyReport] failed for ${uid}:`, e?.message || e);
    }
  }

  console.log(`[monthlyReport] tick done. sent=${sent} skipped=${skipped}`);
  return { sent, skipped };
};

const start = () => {
  if (process.env.DISABLE_MONTHLY_REPORT === 'true') {
    console.log('[monthlyReport] disabled via env');
    return;
  }
  const expr = process.env.MONTHLY_REPORT_CRON || '0 7 1 * *';
  try {
    cron.schedule(expr, () => {
      runOnce().catch(e => console.error('[monthlyReport] tick failed:', e?.message || e));
    });
    console.log(`[monthlyReport] scheduled (cron: "${expr}")`);
  } catch (e) {
    console.error('[monthlyReport] invalid cron expression:', expr, e?.message || e);
  }
};

module.exports = { start, runOnce, fetchEligibleHosts };
