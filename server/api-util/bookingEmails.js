/**
 * Emails de reserva.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * A primeira reserva verdadeira da marketplace correu toda bem — o cartão foi
 * cobrado, a comissão saiu, o anfitrião aceitou, o contrato prendeu as versões
 * — e ninguém foi avisado de nada. Nem o cliente, nem o anfitrião, nem o
 * operador. Isso estava tudo entregue às notificações internas da Sharetribe,
 * que não chegaram.
 *
 * Passa a ser nosso. Uma reserva silenciosa é uma reserva que ninguém aparece
 * a cumprir.
 *
 * E o recibo: a cobrança da reserva é criada pela Sharetribe, que deixa o
 * `receipt_email` do Stripe vazio — por isso o Stripe não envia recibo nenhum.
 * Quem pagou fica sem papel absolutamente nenhum. O email de confirmação leva
 * os valores e a ligação para o contrato, que é onde está o documento.
 *
 * Tudo aqui é best-effort: a reserva já existe quando estas funções correm, e
 * uma falha de correio não pode desfazê-la.
 */

const { Resend } = require('resend');
const { mailFrom, adminEmail, isEnglish, t } = require('./emailSender');

const ROOT_URL = () =>
  (process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.eu').replace(/\/$/, '');

const escapeHtml = str =>
  String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const envolver = (en, titulo, blocos) => `<!DOCTYPE html>
<html lang="${en ? 'en' : 'pt'}">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px;">
    <h1 style="margin:0 0 16px;font-size:20px;color:#2E2E2E;">${escapeHtml(titulo)}</h1>
    ${blocos}
    <p style="margin:32px 0 0;font-size:12px;color:#9a938a;line-height:1.6;">
      Venue1Hub · ${t(
        en,
        'esta mensagem foi enviada automaticamente.',
        'this message was sent automatically.'
      )}
    </p>
  </div>
</body>
</html>`;

const p = texto =>
  `<p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.65;">${texto}</p>`;

const botao = (href, texto) =>
  `<p style="margin:24px 0 0;">
     <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;background:#2E2E2E;
        color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">
       ${escapeHtml(texto)}
     </a>
   </p>`;

/** Quadro com os dados da reserva. É o que a pessoa vai reler daqui a um mês. */
const ficha = linhas => `
  <table style="width:100%;border-collapse:collapse;margin:0 0 14px;font-size:14px;color:#2E2E2E;">
    ${linhas
      .filter(l => l[1])
      .map(
        ([rotulo, valor]) => `<tr>
          <td style="padding:7px 0;color:#8a8178;width:40%;">${escapeHtml(rotulo)}</td>
          <td style="padding:7px 0;font-weight:bold;">${escapeHtml(valor)}</td>
        </tr>`
      )
      .join('')}
  </table>`;

const dinheiro = money =>
  money && typeof money.amount === 'number'
    ? `${(money.amount / 100).toFixed(2).replace('.', ',')} ${
        money.currency === 'EUR' ? '€' : money.currency
      }`
    : null;

const dia = (iso, en) =>
  new Date(iso).toLocaleDateString(en ? 'en-GB' : 'pt-PT', { timeZone: 'Europe/Lisbon' });

const horas = (iso, en) =>
  new Date(iso).toLocaleString(en ? 'en-GB' : 'pt-PT', {
    timeZone: 'Europe/Lisbon',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * O intervalo reservado, escrito como a pessoa o entende.
 *
 * O fim de uma reserva por dias é exclusivo na Sharetribe: uma reserva de um
 * único dia guarda o dia seguinte como fim. Mostrar isso em bruto dizia à
 * pessoa que tinha o espaço dois dias.
 */
const intervalo = (start, end, unitType, en) => {
  if (!start || !end) return null;
  // O mesmo anúncio aceita reservas por dia e por hora. A regra do fim
  // exclusivo é das que duram dias: aplicá-la a uma reserva de uma hora dava
  // como data o dia anterior.
  const duracao = new Date(end).getTime() - new Date(start).getTime();
  if (unitType === 'hour' || duracao < 24 * 60 * 60 * 1000) {
    return `${horas(start, en)} → ${horas(end, en)}`;
  }

  const ultimo = new Date(new Date(end).getTime() - 24 * 60 * 60 * 1000).toISOString();
  const de = dia(start, en);
  const a = dia(ultimo, en);
  return de === a ? de : `${de} ${t(en, 'a', 'to')} ${a}`;
};

const enviar = async ({ para, assunto, html, etiqueta }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[reserva-email] RESEND_API_KEY não configurada — saltado:', assunto);
    return false;
  }
  if (!para) {
    console.error('[reserva-email] sem destinatário:', assunto);
    return false;
  }
  try {
    await new Resend(apiKey).emails.send({
      from: mailFrom(etiqueta || 'Reservas'),
      to: [para],
      subject: assunto,
      html,
    });
    console.log(`[reserva-email] enviado → ${para}: ${assunto}`);
    return true;
  } catch (e) {
    console.error('[reserva-email] envio falhou:', e?.message || e);
    return false;
  }
};

const urlReserva = txId => `${ROOT_URL()}/order/${txId}`;
const urlVenda = txId => `${ROOT_URL()}/sale/${txId}`;
const urlContrato = txId => `${ROOT_URL()}/reserva/${txId}/contrato`;

const saudacao = (en, nome) =>
  nome ? `${t(en, 'Olá', 'Hi')} ${escapeHtml(nome)},` : `${t(en, 'Olá', 'Hi')},`;

/** Ao anfitrião: há uma reserva à espera de resposta. */
const novaReservaAoAnfitriao = async d => {
  const en = d.provider.en;
  const corpo =
    p(
      `${saudacao(en, d.provider.nome)} ${t(
        en,
        'tem uma reserva à espera da sua resposta.',
        'you have a booking waiting for your reply.'
      )}`
    ) +
    ficha([
      [t(en, 'Espaço', 'Space'), d.listingTitle],
      [t(en, 'Quando', 'When'), d.quando],
      [t(en, 'Cliente', 'Guest'), d.customer.nome],
      [t(en, 'Vai receber', 'You receive'), d.payout],
    ]) +
    p(
      t(
        en,
        'O pagamento já está autorizado e só é cobrado quando aceitar. Se não responder, o pedido expira sozinho e o cliente não paga nada.',
        'Payment is already authorised and is only charged once you accept. If you do not reply, the request expires on its own and the guest pays nothing.'
      )
    ) +
    botao(urlVenda(d.txId), t(en, 'Aceitar ou recusar', 'Accept or decline'));

  return enviar({
    para: d.provider.email,
    assunto: t(en, 'Tem uma reserva nova', 'You have a new booking'),
    html: envolver(en, t(en, 'Reserva nova', 'New booking'), corpo),
  });
};

/** Ao cliente: o pedido foi feito, e o dinheiro está retido, não cobrado. */
const pedidoAoCliente = async d => {
  const en = d.customer.en;
  const corpo =
    p(
      `${saudacao(en, d.customer.nome)} ${t(
        en,
        'o seu pedido de reserva foi enviado ao anfitrião.',
        'your booking request has been sent to the host.'
      )}`
    ) +
    ficha([
      [t(en, 'Espaço', 'Space'), d.listingTitle],
      [t(en, 'Quando', 'When'), d.quando],
      [t(en, 'Anfitrião', 'Host'), d.provider.nome],
      [t(en, 'Total', 'Total'), d.payin],
      [t(en, 'Referência', 'Reference'), d.txId],
    ]) +
    p(
      t(
        en,
        'O valor está <strong>autorizado mas ainda não cobrado</strong>: só sai do seu cartão quando o anfitrião aceitar. Se recusar ou não responder, a retenção cai sozinha.',
        'The amount is <strong>authorised but not yet charged</strong>: it only leaves your card once the host accepts. If they decline or do not reply, the hold is released on its own.'
      )
    ) +
    botao(urlReserva(d.txId), t(en, 'Ver a reserva', 'View the booking'));

  return enviar({
    para: d.customer.email,
    assunto: t(en, 'Pedido de reserva enviado', 'Booking request sent'),
    html: envolver(en, t(en, 'Pedido enviado', 'Request sent'), corpo),
  });
};

/** Ao cliente: está confirmada, e aqui está o comprovativo. */
const confirmadaAoCliente = async d => {
  const en = d.customer.en;
  const corpo =
    p(
      `${saudacao(en, d.customer.nome)} ${t(
        en,
        'a sua reserva foi confirmada pelo anfitrião.',
        'your booking has been confirmed by the host.'
      )}`
    ) +
    ficha([
      [t(en, 'Espaço', 'Space'), d.listingTitle],
      [t(en, 'Morada', 'Address'), d.morada],
      [t(en, 'Quando', 'When'), d.quando],
      [t(en, 'Anfitrião', 'Host'), d.provider.nome],
      [t(en, 'Pago', 'Paid'), d.payin],
      [t(en, 'Referência', 'Reference'), d.txId],
    ]) +
    p(
      t(
        en,
        'Este email serve de comprovativo do pagamento. O contrato desta reserva, com as condições em vigor no momento em que reservou, está aqui:',
        'This email serves as proof of payment. The contract for this booking, with the terms in force when you booked, is here:'
      )
    ) +
    botao(urlContrato(d.txId), t(en, 'Ver o contrato', 'View the contract'));

  return enviar({
    para: d.customer.email,
    assunto: t(en, 'Reserva confirmada', 'Booking confirmed'),
    html: envolver(en, t(en, 'Reserva confirmada', 'Booking confirmed'), corpo),
  });
};

/**
 * Ao cliente: não avançou.
 *
 * O que esta pessoa quer saber primeiro é se ficou sem dinheiro. É por isso que
 * isso vai escrito em todas as variantes, e não só implícito.
 */
const MOTIVOS = {
  recusada: [
    'O anfitrião não pôde aceitar esta reserva.',
    'The host could not accept this booking.',
  ],
  expirou: [
    'O anfitrião não respondeu dentro do prazo, e o pedido expirou.',
    'The host did not reply in time, and the request expired.',
  ],
  cancelada: ['Esta reserva foi cancelada.', 'This booking was cancelled.'],
};

const naoAvancouAoCliente = async (d, motivo) => {
  const en = d.customer.en;
  const explicacao = MOTIVOS[motivo] || [
    'Esta reserva não avançou.',
    'This booking did not go ahead.',
  ];

  const corpo =
    p(`${saudacao(en, d.customer.nome)} ${t(en, explicacao[0], explicacao[1])}`) +
    ficha([
      [t(en, 'Espaço', 'Space'), d.listingTitle],
      [t(en, 'Quando', 'When'), d.quando],
      [t(en, 'Referência', 'Reference'), d.txId],
    ]) +
    p(
      motivo === 'cancelada'
        ? t(
            en,
            'Se já tinha sido cobrado, a devolução é tratada por nós e aparece no seu extrato dentro de alguns dias úteis.',
            'If you had already been charged, the refund is handled by us and appears on your statement within a few working days.'
          )
        : t(
            en,
            'Não foi cobrado nada: a retenção no seu cartão cai sozinha.',
            'Nothing was charged: the hold on your card is released on its own.'
          )
    ) +
    botao(`${ROOT_URL()}/s`, t(en, 'Procurar outro espaço', 'Find another space'));

  return enviar({
    para: d.customer.email,
    assunto: t(en, 'A sua reserva não avançou', 'Your booking did not go ahead'),
    html: envolver(en, t(en, 'Reserva sem efeito', 'Booking not confirmed'), corpo),
  });
};

/** Ao operador: houve uma reserva. Sem isto, sabe-se pelo Stripe ou por acaso. */
const alertaAoAdmin = async d => {
  const para = adminEmail();
  if (!para) return false;

  const corpo =
    ficha([
      ['Espaço', d.listingTitle],
      ['Quando', d.quando],
      ['Cliente', `${d.customer.nome || '—'} (${d.customer.email || '—'})`],
      ['Anfitrião', `${d.provider.nome || '—'} (${d.provider.email || '—'})`],
      ['Cliente paga', d.payin],
      ['Anfitrião recebe', d.payout],
      ['Comissão', d.comissao],
      ['Transacção', d.txId],
    ]) + p('O anfitrião ainda tem de aceitar. Até lá não é cobrado nada.');

  return enviar({
    para,
    assunto: `Reserva nova: ${d.listingTitle || 'anúncio'}${d.payin ? ` — ${d.payin}` : ''}`,
    html: envolver(false, 'Reserva nova na Venue1Hub', corpo),
    etiqueta: 'Admin',
  });
};

module.exports = {
  novaReservaAoAnfitriao,
  pedidoAoCliente,
  confirmadaAoCliente,
  naoAvancouAoCliente,
  alertaAoAdmin,
  intervalo,
  dinheiro,
  isEnglish,
};
