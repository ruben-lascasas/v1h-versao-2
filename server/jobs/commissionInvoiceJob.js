/**
 * Facturação automática da comissão.
 *
 * Duas tarefas, com ritmos diferentes:
 *
 *   diária  — percorre as reservas concluídas e acrescenta a comissão de cada
 *             uma à conta do anfitrião no Stripe, como linha pendente
 *   mensal  — fecha uma factura por anfitrião com o que estiver pendente
 *
 * Separadas de propósito. Se o fecho mensal falhar, as linhas ficam à espera e
 * entram no mês seguinte; nada se perde. Se fosse tudo no mesmo passo, uma
 * falha a meio deixava reservas por facturar sem forma simples de as encontrar.
 *
 * Ambiente:
 *   COMMISSION_INVOICE_CRON        diária, por omissão "0 5 * * *"
 *   COMMISSION_INVOICE_CLOSE_CRON  mensal, por omissão "0 6 1 * *" (dia 1)
 *   COMMISSION_INVOICE_LOOKBACK_DAYS  quanto tempo atrás procurar (padrão 45)
 *   DISABLE_COMMISSION_INVOICES=true  desliga as duas
 */

const cron = require('node-cron');
const billing = require('../api-util/stripeBilling');
const { getIntegrationSdk } = require('../api-util/sdk');
const {
  TRANSICOES_CONCLUIDAS,
  registarComissao,
  fecharFacturaDe,
  jaFacturada,
  comissaoDe,
} = require('../api-util/commissionInvoices');

const PER_PAGE = 100;

const diasParaTras = () => {
  const raw = parseInt(process.env.COMMISSION_INVOICE_LOOKBACK_DAYS, 10);
  return Number.isNaN(raw) ? 45 : raw;
};

/**
 * Reservas concluídas na janela de tempo, com o anfitrião e o anúncio juntos.
 *
 * A janela existe para a varredura não crescer para sempre. É folgada de
 * propósito: se o job estiver em baixo alguns dias, ao voltar ainda apanha o
 * que ficou para trás.
 */
const buscarConcluidas = async sdk => {
  const desde = new Date(Date.now() - diasParaTras() * 24 * 60 * 60 * 1000).toISOString();
  const todas = [];
  let page = 1;

  while (true) {
    const res = await sdk.transactions.query({
      lastTransitions: TRANSICOES_CONCLUIDAS,
      lastTransitionedAtStart: desde,
      page,
      perPage: PER_PAGE,
      include: ['provider', 'listing'],
    });
    const itens = res?.data?.data || [];
    todas.push({ itens, incluidos: res?.data?.included || [] });
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages || itens.length === 0) break;
    page += 1;
  }

  const incluidos = todas.flatMap(t => t.incluidos);
  const itens = todas.flatMap(t => t.itens);
  const acharIncluido = (tipo, id) => incluidos.find(x => x.type === tipo && x.id?.uuid === id);

  return itens.map(tx => ({
    transaction: tx,
    provider: acharIncluido('user', tx.relationships?.provider?.data?.id?.uuid),
    listing: acharIncluido('listing', tx.relationships?.listing?.data?.id?.uuid),
  }));
};

/**
 * Passagem diária: regista as comissões que ainda não estavam registadas.
 * @param {Object} [opts]
 * @param {boolean} [opts.dryRun] calcula e mostra, sem escrever no Stripe
 */
const registarPendentes = async ({ dryRun = false } = {}) => {
  if (!billing.isConfigured()) {
    console.warn('[comissões] STRIPE_SECRET_KEY não configurada — saltado');
    return { analisadas: 0, registadas: 0 };
  }
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.warn('[comissões] Integration SDK não configurado — saltado');
    return { analisadas: 0, registadas: 0 };
  }

  let linhas;
  try {
    linhas = await buscarConcluidas(sdk);
  } catch (e) {
    console.error('[comissões] varredura falhou:', e?.message || e);
    return { analisadas: 0, registadas: 0 };
  }

  let registadas = 0;
  const saltadas = {};

  for (const { transaction, provider, listing } of linhas) {
    let r;
    try {
      r = await registarComissao({ sdk, transaction, provider, listing, dryRun });
    } catch (e) {
      // Uma reserva problemática não pode travar as restantes: a próxima
      // passagem volta a tentar, porque a marcação só é escrita em caso de
      // sucesso.
      console.error(`[comissões] ${transaction?.id?.uuid} falhou:`, e?.message || e);
      saltadas.erro = (saltadas.erro || 0) + 1;
      continue;
    }
    if (r.estado === 'registada' || r.estado === 'seria-registada') {
      registadas += 1;
      console.log(`[comissões] ${r.estado} — ${transaction.id.uuid} ${r.detalhe || ''}`);
    } else {
      saltadas[r.estado] = (saltadas[r.estado] || 0) + 1;
    }
  }

  console.log(
    `[comissões] analisadas=${linhas.length} registadas=${registadas} ` +
      `saltadas=${JSON.stringify(saltadas)}${dryRun ? ' (dry-run)' : ''}`
  );
  return { analisadas: linhas.length, registadas, saltadas };
};

/**
 * Fecho mensal: uma factura por anfitrião com linhas pendentes.
 *
 * Percorre os Customers do Stripe em vez dos utilizadores da Sharetribe —
 * quem não tem linhas pendentes é saltado sem custo, e evita-se uma segunda
 * varredura de utilizadores.
 */
const fecharFacturas = async ({ dryRun = false } = {}) => {
  if (!billing.isConfigured()) {
    console.warn('[comissões] STRIPE_SECRET_KEY não configurada — saltado');
    return { fechadas: 0 };
  }

  const stripe = billing.client();
  let fechadas = 0;
  let analisados = 0;

  for await (const customer of stripe.customers.list({ limit: 100 })) {
    analisados += 1;
    let r;
    try {
      r = await fecharFacturaDe({ customerId: customer.id, dryRun });
    } catch (e) {
      console.error(`[comissões] fecho falhou para ${customer.id}:`, e?.message || e);
      continue;
    }
    if (r.estado === 'fechada' || r.estado === 'seria-fechada') {
      fechadas += 1;
      console.log(`[comissões] ${r.estado} — ${customer.email || customer.id}: ${r.detalhe}`);
    }
  }

  console.log(
    `[comissões] fecho mensal: clientes=${analisados} facturas=${fechadas}${dryRun ? ' (dry-run)' : ''}`
  );
  return { analisados, fechadas };
};

const start = () => {
  if (process.env.DISABLE_COMMISSION_INVOICES === 'true') {
    console.log('[comissões] desligado por DISABLE_COMMISSION_INVOICES');
    return null;
  }

  const diaria = process.env.COMMISSION_INVOICE_CRON || '0 5 * * *';
  const mensal = process.env.COMMISSION_INVOICE_CLOSE_CRON || '0 6 1 * *';

  for (const [nome, expr] of [['diária', diaria], ['mensal', mensal]]) {
    if (!cron.validate(expr)) {
      console.error(`[comissões] expressão cron inválida (${nome}): ${expr}`);
      return null;
    }
  }

  console.log(`[comissões] agendado — registo ${diaria}, fecho ${mensal}`);
  cron.schedule(diaria, () => {
    registarPendentes().catch(e => console.error('[comissões] tick diário:', e?.message || e));
  });
  cron.schedule(mensal, () => {
    fecharFacturas().catch(e => console.error('[comissões] tick mensal:', e?.message || e));
  });
  return true;
};

module.exports = { start, registarPendentes, fecharFacturas, buscarConcluidas };
