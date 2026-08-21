/**
 * Facturação da comissão da plataforma.
 *
 * O PORQUÊ DA FORMA
 *
 * A comissão nunca existe como cobrança autónoma no Stripe. Fica retida dentro
 * da transacção da Sharetribe, como uma linha do valor total: do lado do Stripe
 * há um pagamento do hóspede e uma transferência para o anfitrião, e a comissão
 * é apenas o que sobra. Não há nada que o Stripe possa facturar por iniciativa
 * própria — tem de ser este código a dizer-lhe o que aconteceu.
 *
 * A partir daí é o Stripe que trabalha: numera, gera o PDF, envia por email e
 * guarda o histórico. Por cada reserva concluída acrescenta-se uma linha à
 * conta do anfitrião; uma vez por mês fecha-se a factura com o que lá estiver.
 *
 * A factura sai já paga (`paid_out_of_band`) porque o dinheiro nunca chegou a
 * sair da plataforma — foi retido no momento do pagamento. Emiti-la como
 * pendente faria o Stripe cobrar outra vez ao anfitrião.
 *
 * IVA: a empresa é estónia e está isenta, para empresas e para particulares,
 * por indicação da contabilidade. Nada de cálculo automático; o motivo da
 * isenção vai escrito no rodapé.
 *
 * DUPLICADOS
 *
 * Duas defesas, porque facturar a mesma reserva duas vezes é um erro que se
 * paga a explicar a alguém:
 *   - a transacção fica marcada em metadata assim que a linha é criada;
 *   - a chamada ao Stripe leva uma idempotency key derivada do id da
 *     transacção, por isso mesmo que a marcação falhe a meio, o Stripe recusa a
 *     segunda linha.
 */

const billing = require('./stripeBilling');
const { getIntegrationSdk } = require('./sdk');

/** Transições que deixam a reserva concluída e a comissão ganha. */
const TRANSICOES_CONCLUIDAS = [
  'transition/complete',
  'transition/operator-complete',
  'transition/review-1-by-provider',
  'transition/review-1-by-customer',
  'transition/review-2-by-provider',
  'transition/review-2-by-customer',
  'transition/expire-review-period',
  'transition/expire-provider-review-period',
  'transition/expire-customer-review-period',
];

const CODIGO_COMISSAO = 'line-item/provider-commission';
const MARCA = 'commissionInvoicedAt';

const notaIsencao = () =>
  process.env.INVOICE_VAT_NOTE || 'IVA — isento / VAT exempt. Venue1Hub OÜ, Estónia.';

/**
 * Valor da comissão de uma transacção, em cêntimos e sempre positivo.
 *
 * A Sharetribe grava a comissão do fornecedor como valor negativo, porque é o
 * que se retira ao anfitrião. Para facturar interessa o valor absoluto.
 *
 * @returns {{cents: number, currency: string}|null} null quando não há comissão
 */
const comissaoDe = transaction => {
  const linhas = transaction?.attributes?.lineItems || [];
  const linha = linhas.find(l => l.code === CODIGO_COMISSAO);
  const bruto = linha?.lineTotal?.amount;
  if (bruto == null) return null;
  const cents = Math.abs(bruto);
  if (cents === 0) return null;
  return { cents, currency: (linha.lineTotal.currency || 'EUR').toLowerCase() };
};

/** true se esta reserva já foi facturada numa passagem anterior. */
const jaFacturada = transaction => Boolean(transaction?.attributes?.metadata?.[MARCA]);

/**
 * Texto da linha de factura. Diz de que reserva se trata, para o anfitrião
 * poder conferir sem ter de abrir o site.
 */
const descricaoLinha = ({ listingTitle, inicio, fim }) => {
  const periodo =
    inicio && fim
      ? ` (${new Date(inicio).toLocaleDateString('pt-PT')} – ${new Date(fim).toLocaleDateString(
          'pt-PT'
        )})`
      : '';
  return `Comissão Venue1Hub — ${listingTitle || 'reserva'}${periodo}`;
};

/**
 * Acrescenta a comissão de uma reserva à conta do anfitrião no Stripe.
 *
 * Não emite factura nenhuma: deixa a linha pendente, para ser recolhida no
 * fecho mensal. Assim o anfitrião recebe um documento por mês em vez de um por
 * reserva.
 *
 * @returns {Promise<{estado: string, detalhe?: string}>}
 */
const registarComissao = async ({ sdk, transaction, provider, listing, dryRun = false }) => {
  const txId = transaction?.id?.uuid;
  if (!txId) return { estado: 'sem-id' };
  if (jaFacturada(transaction)) return { estado: 'já-facturada' };

  const comissao = comissaoDe(transaction);
  if (!comissao) return { estado: 'sem-comissão' };

  const email = provider?.attributes?.email;
  if (!email) return { estado: 'anfitrião-sem-email' };

  const descricao = descricaoLinha({
    listingTitle: listing?.attributes?.title,
    inicio: transaction?.attributes?.metadata?.bookingStart,
    fim: transaction?.attributes?.metadata?.bookingEnd,
  });

  if (dryRun) {
    return {
      estado: 'seria-registada',
      detalhe: `${(comissao.cents / 100).toFixed(2)} ${comissao.currency.toUpperCase()} — ${descricao}`,
    };
  }

  const perfil = provider.attributes.profile || {};
  const customerId = await billing.ensureCustomer({
    userId: provider.id.uuid,
    email,
    name: perfil.displayName || perfil.firstName || null,
    existingCustomerId: perfil.privateData?.stripeCustomerId || null,
  });

  const stripe = billing.client();
  await stripe.invoiceItems.create(
    {
      customer: customerId,
      amount: comissao.cents,
      currency: comissao.currency,
      description: descricao,
      metadata: { sharetribeTransactionId: txId, sharetribeUserId: provider.id.uuid },
    },
    // Segunda defesa contra duplicados: mesmo que a marcação abaixo falhe, o
    // Stripe recusa uma segunda linha com esta mesma chave.
    { idempotencyKey: `comissao-${txId}` }
  );

  await sdk.transactions.updateMetadata({
    id: txId,
    metadata: { [MARCA]: new Date().toISOString() },
  });

  return {
    estado: 'registada',
    detalhe: `${(comissao.cents / 100).toFixed(2)} ${comissao.currency.toUpperCase()}`,
  };
};

/**
 * Fecha a factura mensal de um anfitrião com as linhas pendentes que tiver.
 *
 * Sai já paga: o dinheiro foi retido quando o hóspede pagou, e uma factura
 * pendente faria o Stripe tentar cobrá-la outra vez.
 */
const fecharFacturaDe = async ({ customerId, dryRun = false }) => {
  const stripe = billing.client();

  const pendentes = await stripe.invoiceItems.list({ customer: customerId, pending: true, limit: 100 });
  if (pendentes.data.length === 0) return { estado: 'sem-linhas' };

  const total = pendentes.data.reduce((s, i) => s + (i.amount || 0), 0);
  if (dryRun) {
    return {
      estado: 'seria-fechada',
      detalhe: `${pendentes.data.length} linha(s), ${(total / 100).toFixed(2)}`,
    };
  }

  const factura = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 30,
    auto_advance: false,
    footer: notaIsencao(),
    automatic_tax: { enabled: false },
    description: 'Comissões Venue1Hub do período',
  });

  const finalizada = await stripe.invoices.finalizeInvoice(factura.id);
  // Já recebido: a comissão foi retida no pagamento do hóspede.
  const paga = await stripe.invoices.pay(finalizada.id, { paid_out_of_band: true });

  return {
    estado: 'fechada',
    detalhe: `${paga.number || paga.id} — ${(total / 100).toFixed(2)}`,
    url: paga.hosted_invoice_url || null,
  };
};

module.exports = {
  TRANSICOES_CONCLUIDAS,
  CODIGO_COMISSAO,
  MARCA,
  comissaoDe,
  jaFacturada,
  descricaoLinha,
  registarComissao,
  fecharFacturaDe,
  notaIsencao,
};
