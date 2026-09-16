/**
 * Avisar quem tem de saber que houve uma reserva.
 *
 * PORQUE É QUE ISTO É UM TRABALHO AGENDADO
 *
 * O servidor só vê duas transições da reserva: as privilegiadas, que são as de
 * pedir o pagamento. A confirmação do pagamento, a aceitação do anfitrião, a
 * recusa e a expiração acontecem entre o browser e a Sharetribe — o nosso lado
 * nunca é chamado. Sem alguém a perguntar, não há como saber que aconteceram.
 *
 * Por isso se varre: de poucos em poucos minutos, olha-se para as transacções
 * que mexeram há pouco e envia-se o que falta enviar.
 *
 * COMO É QUE NÃO SE REPETE
 *
 * Cada aviso enviado fica marcado em `metadata.avisos`. É a mesma transacção
 * que guarda a prova de que já foi avisada, por isso reiniciar o servidor,
 * correr o job duas vezes ou alargar a janela não manda nada duas vezes.
 *
 * A metadata é lida antes de se escrever e volta inteira: a chave `contrato`,
 * que prende as versões dos documentos à reserva, não pode ser perdida por uma
 * escrita nossa.
 *
 * Ambiente:
 *   BOOKING_NOTIFY_CRON      por omissão "*\/5 * * * *"
 *   BOOKING_NOTIFY_HOURS     janela varrida, por omissão 2 horas
 *   DISABLE_BOOKING_NOTIFY   'true' salta o agendamento
 */

const cron = require('node-cron');
const { getIntegrationSdk } = require('../api-util/sdk');
const emails = require('../api-util/bookingEmails');
const { pedirReciboDaReserva } = require('../api-util/stripeReceipts');

const PER_PAGE = 100;
const MAX_PAGINAS = 10;

const janelaHorasPorOmissao = () => {
  const n = Number(process.env.BOOKING_NOTIFY_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 2;
};

/**
 * Que avisos pertencem a cada transição.
 *
 * A chave à esquerda é o que fica marcado na metadata; é ela que impede o
 * reenvio, por isso nunca deve mudar depois de estar em uso.
 */
const recibo = d => pedirReciboDaReserva({ txId: d.txId, email: d.customer.email });

const AVISOS = {
  'transition/confirm-payment': [
    ['anfitriao-nova-reserva', d => emails.novaReservaAoAnfitriao(d)],
    ['cliente-pedido', d => emails.pedidoAoCliente(d)],
    ['admin-nova-reserva', d => emails.alertaAoAdmin(d)],
    // A cobrança da reserva é criada pela Sharetribe sem `receipt_email`, e sem
    // esse campo o Stripe não envia recibo nenhum. Quem paga o destaque recebe
    // recibo e factura; quem paga uma reserva não recebia nada.
    ['stripe-recibo', recibo],
  ],
  // Também aqui, para as reservas que só vemos depois de aceites.
  'transition/accept': [
    ['cliente-confirmada', d => emails.confirmadaAoCliente(d)],
    ['stripe-recibo', recibo],
  ],
  'transition/operator-accept': [
    ['cliente-confirmada', d => emails.confirmadaAoCliente(d)],
    ['stripe-recibo', recibo],
  ],
  'transition/decline': [['cliente-recusada', d => emails.naoAvancouAoCliente(d, 'recusada')]],
  'transition/operator-decline': [
    ['cliente-recusada', d => emails.naoAvancouAoCliente(d, 'recusada')],
  ],
  'transition/expire': [['cliente-expirou', d => emails.naoAvancouAoCliente(d, 'expirou')]],
  'transition/cancel': [['cliente-cancelada', d => emails.naoAvancouAoCliente(d, 'cancelada')]],
};

const TRANSICOES = Object.keys(AVISOS);

const pessoa = recurso => {
  const attrs = recurso?.attributes || {};
  const perfil = attrs.profile || {};
  return {
    email: attrs.email || null,
    nome: perfil.firstName || perfil.displayName || null,
    en: emails.isEnglish(perfil),
  };
};

/** Junta a transacção aos recursos que vieram em `included`. */
const reunir = (tx, incluidos) => {
  const achar = (tipo, id) => incluidos.find(x => x.type === tipo && x.id?.uuid === id);
  const rel = tx.relationships || {};
  const customer = achar('user', rel.customer?.data?.id?.uuid);
  const provider = achar('user', rel.provider?.data?.id?.uuid);
  const listing = achar('listing', rel.listing?.data?.id?.uuid);
  const booking = achar('booking', rel.booking?.data?.id?.uuid);

  const at = tx.attributes || {};
  const unitType = at.protectedData?.unitType || listing?.attributes?.publicData?.unitType;
  const payin = at.payinTotal;
  const payout = at.payoutTotal;
  const comissao =
    payin && payout && typeof payin.amount === 'number' && typeof payout.amount === 'number'
      ? { amount: payin.amount - payout.amount, currency: payin.currency }
      : null;

  const c = pessoa(customer);
  const p = pessoa(provider);

  return {
    txId: tx.id.uuid,
    customer: c,
    provider: p,
    listingTitle: listing?.attributes?.title || null,
    morada: listing?.attributes?.publicData?.location?.address || null,
    // Cada um lê na sua língua, e a data escreve-se na dele.
    quando: emails.intervalo(
      booking?.attributes?.start,
      booking?.attributes?.end,
      unitType,
      c.en && p.en
    ),
    payin: emails.dinheiro(payin),
    payout: emails.dinheiro(payout),
    comissao: emails.dinheiro(comissao),
  };
};

/** O que falta enviar nesta transacção. */
const emFalta = tx => {
  const at = tx.attributes || {};
  const jaAvisado = at.metadata?.avisos || {};
  return (AVISOS[at.lastTransition] || []).filter(([chave]) => !jaAvisado[chave]);
};

/**
 * Marca os avisos como enviados, sem perder o resto da metadata.
 *
 * Lê-se o que lá está e devolve-se tudo: uma escrita que só mandasse `avisos`
 * arriscava levar à frente a chave `contrato`, que é a prova de que versões dos
 * documentos valiam quando a reserva nasceu.
 */
const marcar = async (sdk, tx, chaves) => {
  const agora = new Date().toISOString();
  const metadata = { ...(tx.attributes?.metadata || {}) };
  metadata.avisos = { ...(metadata.avisos || {}) };
  chaves.forEach(chave => {
    metadata.avisos[chave] = agora;
  });
  await sdk.transactions.updateMetadata({ id: tx.id.uuid, metadata });
  return metadata;
};

const runOnce = async ({ dryRun = false, janelaHoras } = {}) => {
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('[reserva-aviso] Integration SDK não configurado');
    return { verificados: 0, enviados: [] };
  }

  const horas = janelaHoras || janelaHorasPorOmissao();
  const desde = new Date(Date.now() - horas * 60 * 60 * 1000).toISOString();

  const transaccoes = [];
  const incluidos = [];
  for (let page = 1; page <= MAX_PAGINAS; page++) {
    const res = await sdk.transactions.query({
      lastTransitions: TRANSICOES,
      lastTransitionedAtStart: desde,
      page,
      perPage: PER_PAGE,
      include: ['customer', 'provider', 'listing', 'booking'],
    });
    const batch = res?.data?.data || [];
    transaccoes.push(...batch);
    incluidos.push(...(res?.data?.included || []));
    const totalPages = res?.data?.meta?.totalPages || 1;
    if (batch.length === 0 || page >= totalPages) break;
  }

  const enviados = [];

  for (const tx of transaccoes) {
    const pendentes = emFalta(tx);
    if (pendentes.length === 0) continue;

    const dados = reunir(tx, incluidos);
    const chaves = pendentes.map(([chave]) => chave);
    console.log(
      `[reserva-aviso] ${dados.txId} (${tx.attributes.lastTransition}): ${chaves.join(', ')}` +
        (dryRun ? ' (simulação)' : '')
    );
    if (dryRun) {
      enviados.push({ txId: dados.txId, chaves });
      continue;
    }

    const feitas = [];
    for (const [chave, enviar] of pendentes) {
      try {
        await enviar(dados);
        feitas.push(chave);
      } catch (e) {
        // Um email que falha não pode impedir os outros nem fazer com que a
        // transacção fique marcada como avisada: sem a marca, a passagem
        // seguinte tenta outra vez.
        console.error(`[reserva-aviso] ${chave} falhou:`, e?.message || e);
      }
    }

    if (feitas.length) {
      await marcar(sdk, tx, feitas);
      enviados.push({ txId: dados.txId, chaves: feitas });
    }
  }

  return { verificados: transaccoes.length, enviados };
};

const start = () => {
  if (process.env.DISABLE_BOOKING_NOTIFY === 'true') {
    console.log('[reserva-aviso] desligado por DISABLE_BOOKING_NOTIFY');
    return null;
  }
  const expr = process.env.BOOKING_NOTIFY_CRON || '*/5 * * * *';
  if (!cron.validate(expr)) {
    console.error(`[reserva-aviso] expressão cron inválida: ${expr}`);
    return null;
  }
  console.log(`[reserva-aviso] agendado (${expr})`);
  return cron.schedule(expr, () => {
    runOnce().catch(e => console.error('[reserva-aviso] tick falhou:', e?.message || e));
  });
};

module.exports = { start, runOnce, emFalta, reunir, marcar, AVISOS };
