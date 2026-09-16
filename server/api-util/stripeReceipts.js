/**
 * O recibo da reserva, que o Stripe não enviava a ninguém.
 *
 * PORQUE É QUE HAVIA ESTA DIFERENÇA
 *
 * O destaque é cobrado por nós: criamos a sessão de Checkout, pomos lá o email
 * do anfitrião, e o Stripe envia-lhe recibo e factura. Funciona.
 *
 * A reserva é cobrada pela Sharetribe, que cria a cobrança sem `receipt_email`.
 * Sem esse campo o Stripe não envia nada — não é uma regra do Stripe nem uma
 * decisão de ninguém: é um campo vazio. O resultado é que quem paga a reserva
 * fica sem recibo, enquanto quem paga o destaque recebe tudo.
 *
 * Isto preenche o campo em falta. O Stripe faz o resto: numa cobrança já
 * capturada envia o recibo na hora; numa cobrança ainda só autorizada guarda o
 * endereço e envia quando o anfitrião aceitar e o valor for capturado.
 *
 * O QUE ISTO É, E O QUE NÃO É
 *
 * É um recibo de pagamento, emitido por quem processou a cobrança. NÃO é a
 * factura do Espaço: essa é do Anfitrião, e o contrato di-lo na secção 35.
 */

const Stripe = require('stripe');

const cliente = () => {
  const chave = process.env.STRIPE_SECRET_KEY;
  if (!chave) return null;
  return new Stripe(chave, { apiVersion: '2024-06-20' });
};

/**
 * A cobrança da Sharetribe correspondente a esta reserva.
 *
 * A Sharetribe carimba as cobranças com `sharetribe-transaction-id`, e é por
 * aí que se encontra. A procura indexada é rápida mas demora até um minuto a
 * ver uma cobrança acabada de nascer — por isso, quando falha, percorre-se a
 * lista recente à mão em vez de desistir.
 */
const acharCobranca = async (stripe, txId) => {
  try {
    const achadas = await stripe.charges.search({
      query: `metadata['sharetribe-transaction-id']:'${txId}'`,
      limit: 1,
    });
    if (achadas?.data?.[0]) return achadas.data[0];
  } catch (e) {
    console.error('[recibo] procura falhou:', e?.message || e);
  }

  const recentes = await stripe.charges.list({ limit: 100 });
  return recentes.data.find(c => c.metadata?.['sharetribe-transaction-id'] === txId) || null;
};

/**
 * Pede ao Stripe que envie o recibo desta reserva a quem a pagou.
 *
 * @param {Object} params
 * @param {string} params.txId  id da transacção Sharetribe
 * @param {string} params.email de quem pagou
 * @returns {Promise<boolean>} true se o endereço ficou registado na cobrança
 */
const pedirReciboDaReserva = async ({ txId, email }) => {
  const stripe = cliente();
  if (!stripe) {
    console.warn('[recibo] STRIPE_SECRET_KEY não configurada — saltado');
    return false;
  }
  if (!txId || !email) {
    console.error('[recibo] falta a transacção ou o email');
    return false;
  }

  const cobranca = await acharCobranca(stripe, txId);
  if (!cobranca) {
    console.error(`[recibo] ${txId}: cobrança não encontrada no Stripe`);
    return false;
  }
  // Já tem endereço: o recibo está tratado, e reescrevê-lo mandava outro.
  if (cobranca.receipt_email) return true;

  await stripe.charges.update(cobranca.id, { receipt_email: email });
  console.log(`[recibo] ${txId}: recibo pedido para ${email} (${cobranca.id})`);
  return true;
};

module.exports = { pedirReciboDaReserva, acharCobranca };
