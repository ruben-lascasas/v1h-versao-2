/**
 * Emails do Centro de Resolução.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * A página do Centro de Resolução dizia, antes de se abrir um caso: "A outra
 * parte é notificada e tem sete dias para responder." Não era verdade —
 * ninguém era notificado. O caso ficava guardado à espera de que a outra parte
 * passasse por lá por acaso, e o prazo de sete dias corria contra alguém que
 * não sabia que tinha um caso aberto.
 *
 * Uma interface que promete uma notificação inexistente é pior do que uma que
 * não promete nada: alguém confia nela e fica à espera.
 */

const { Resend } = require('resend');
const { mailFrom, isEnglish, t } = require('./emailSender');
const { TIPOS } = require('./resolutionCase');

const ROOT = () => (process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.eu').replace(/\/$/, '');

const rotuloTipo = (chave, en) => {
  const tipo = TIPOS.find(x => x.chave === chave);
  if (!tipo) return chave;
  return en ? tipo.labelEN : tipo.label;
};

const moldura = (titulo, corpo, botaoTexto, botaoUrl) => `
<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#2E2E2E">
  <h1 style="font-size:20px;margin:0 0 16px">${titulo}</h1>
  ${corpo}
  <p style="margin:26px 0 0">
    <a href="${botaoUrl}" style="display:inline-block;padding:12px 22px;background:#2E2E2E;color:#fff;text-decoration:none;border-radius:6px;font-size:14px;font-weight:bold">${botaoTexto}</a>
  </p>
  <p style="margin-top:28px;font-size:12px;color:#8a8178">
    Venue1Hub — Centro de Resolução
  </p>
</div>`;

/**
 * Carrega a outra parte da reserva, para lhe escrever.
 *
 * @returns {Promise<{email: string, nome: string, en: boolean}|null>}
 */
const carregarDestinatario = async (sdk, userId) => {
  if (!sdk || !userId) return null;
  try {
    const res = await sdk.users.show({ id: userId });
    const attrs = res?.data?.data?.attributes;
    if (!attrs?.email) return null;
    return {
      email: attrs.email,
      nome: attrs.profile?.firstName || attrs.profile?.displayName || null,
      en: isEnglish(attrs.profile),
    };
  } catch (e) {
    console.error('[resolução-email] users.show falhou:', e?.message || e);
    return null;
  }
};

const enviar = async ({ para, assunto, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[resolução-email] RESEND_API_KEY não configurada — nada enviado');
    return false;
  }
  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      // mailFrom acrescenta a etiqueta ao nome já configurado: 'Venue1Hub' aqui
      // dava "Venue1Hub Venue1Hub <...>" no remetente.
      from: mailFrom('Resolução'),
      to: para,
      subject: assunto,
      html,
    });
    return true;
  } catch (e) {
    // Falhar o email não pode desfazer o caso, que já está gravado. Fica
    // registado para se poder reenviar.
    console.error('[resolução-email] envio falhou:', e?.message || e);
    return false;
  }
};

/** Avisa a outra parte de que foi aberto um caso sobre a reserva dela. */
const avisarCasoAberto = async (sdk, { destinatarioId, txId, caso }) => {
  const d = await carregarDestinatario(sdk, destinatarioId);
  if (!d) return false;

  const url = `${ROOT()}/reserva/${txId}/resolucao`;
  const ola = d.nome ? `${t(d.en, 'Olá', 'Hi')} ${d.nome},` : `${t(d.en, 'Olá', 'Hi')},`;
  const prazo = new Date(caso.prazoResposta).toLocaleDateString(d.en ? 'en-GB' : 'pt-PT');

  const corpo = `
    <p>${ola}</p>
    <p>${t(
      d.en,
      'Foi aberto um caso no Centro de Resolução sobre uma reserva em que participa.',
      'A case has been opened in the Resolution Centre about a booking you are part of.'
    )}</p>
    <p><strong>${t(d.en, 'Motivo', 'Reason')}:</strong> ${rotuloTipo(caso.tipo, d.en)}</p>
    <p>${t(
      d.en,
      `Tem até <strong>${prazo}</strong> para apresentar a sua versão dos factos e juntar prova. Sem resposta dentro do prazo, o caso segue com a informação disponível.`,
      `You have until <strong>${prazo}</strong> to give your account of what happened and provide evidence. Without a reply, the case proceeds on the information available.`
    )}</p>
    <p style="font-size:13px;color:#6b645c">${t(
      d.en,
      'Abrir um caso não movimenta dinheiro. Se houver lugar a reembolso, é processado à parte depois de o caso ser decidido.',
      'Opening a case does not move any money. If a refund is due, it is processed separately once the case is decided.'
    )}</p>`;

  return enviar({
    para: d.email,
    assunto: t(d.en, 'Foi aberto um caso sobre a sua reserva', 'A case has been opened about your booking'),
    html: moldura(
      t(d.en, 'Caso aberto no Centro de Resolução', 'Case opened in the Resolution Centre'),
      corpo,
      t(d.en, 'Ver o caso e responder', 'View the case and reply'),
      url
    ),
  });
};

/** Avisa quem abriu o caso de que a outra parte respondeu. */
const avisarResposta = async (sdk, { destinatarioId, txId }) => {
  const d = await carregarDestinatario(sdk, destinatarioId);
  if (!d) return false;

  const url = `${ROOT()}/reserva/${txId}/resolucao`;
  const ola = d.nome ? `${t(d.en, 'Olá', 'Hi')} ${d.nome},` : `${t(d.en, 'Olá', 'Hi')},`;

  const corpo = `
    <p>${ola}</p>
    <p>${t(
      d.en,
      'A outra parte respondeu ao caso que abriu no Centro de Resolução.',
      'The other party has replied to the case you opened in the Resolution Centre.'
    )}</p>`;

  return enviar({
    para: d.email,
    assunto: t(d.en, 'Houve resposta ao seu caso', 'Your case has a reply'),
    html: moldura(
      t(d.en, 'Resposta recebida', 'Reply received'),
      corpo,
      t(d.en, 'Ver a resposta', 'View the reply'),
      url
    ),
  });
};

/** Avisa as duas partes de que a Venue1Hub decidiu. */
const avisarDecisao = async (sdk, { destinatarioId, txId, caso }) => {
  const d = await carregarDestinatario(sdk, destinatarioId);
  if (!d) return false;

  const url = `${ROOT()}/reserva/${txId}/resolucao`;
  const ola = d.nome ? `${t(d.en, 'Olá', 'Hi')} ${d.nome},` : `${t(d.en, 'Olá', 'Hi')},`;

  const corpo = `
    <p>${ola}</p>
    <p>${t(
      d.en,
      'A Venue1Hub analisou o caso e tomou uma decisão.',
      'Venue1Hub has reviewed the case and reached a decision.'
    )}</p>
    <p style="background:#F9F6F2;border-left:3px solid #BAA38A;padding:12px 14px;margin:16px 0">
      ${caso.decisao.fundamentacao}
    </p>
    ${
      caso.decisao.valorCents
        ? `<p><strong>${t(d.en, 'Valor', 'Amount')}:</strong> ${(caso.decisao.valorCents / 100).toFixed(2)} €</p>`
        : ''
    }
    <p style="font-size:13px;color:#6b645c">${t(
      d.en,
      'Se houver valor a devolver, é processado à parte. Receberá indicação quando isso acontecer.',
      'If an amount is to be returned, it is processed separately. You will be told when that happens.'
    )}</p>`;

  return enviar({
    para: d.email,
    assunto: t(d.en, 'Decisão sobre o seu caso', 'Decision on your case'),
    html: moldura(
      t(d.en, 'Decisão do Centro de Resolução', 'Resolution Centre decision'),
      corpo,
      t(d.en, 'Ver a decisão', 'View the decision'),
      url
    ),
  });
};

/**
 * Avisa as duas partes de que o prazo de resposta passou em vazio.
 *
 * O email tem de dizer duas coisas com clareza: que o caso subiu para análise
 * da Venue1Hub, e que não foi decidido nada. Não responder pesa nos factos —
 * não é uma condenação automática, e um email que sugerisse o contrário
 * assustaria quem apenas não chegou a tempo.
 */
const avisarPrazoExpirado = async (sdk, { destinatarioId, txId, caso }) => {
  const d = await carregarDestinatario(sdk, destinatarioId);
  if (!d) return false;

  const url = `${ROOT()}/reserva/${txId}/resolucao`;
  const ola = d.nome ? `${t(d.en, 'Olá', 'Hi')} ${d.nome},` : `${t(d.en, 'Olá', 'Hi')},`;

  const corpo = `
    <p>${ola}</p>
    <p>${t(
      d.en,
      'O prazo de resposta ao caso aberto no Centro de Resolução terminou sem resposta. O caso passou para análise da Venue1Hub.',
      'The deadline to reply to the case in the Resolution Centre has passed with no reply. The case is now under review by Venue1Hub.'
    )}</p>
    <p><strong>${t(d.en, 'Motivo do caso', 'Reason for the case')}:</strong> ${rotuloTipo(
    caso.tipo,
    d.en
  )}</p>
    <p>${t(
      d.en,
      'Ainda pode juntar prova e apresentar a sua versão dos factos: enquanto não houver decisão, tudo o que estiver no dossier é ponderado.',
      'You can still add evidence and give your account of what happened: until a decision is made, everything in the file is taken into account.'
    )}</p>
    <p style="font-size:13px;color:#6b645c">${t(
      d.en,
      'Nada foi decidido e nenhum valor foi movimentado. A falta de resposta é um facto a ponderar, não uma decisão.',
      'Nothing has been decided and no money has moved. The absence of a reply is a fact to weigh, not a decision.'
    )}</p>`;

  return enviar({
    para: d.email,
    assunto: t(d.en, 'O prazo de resposta terminou', 'The reply deadline has passed'),
    html: moldura(
      t(d.en, 'Caso em análise pela Venue1Hub', 'Case under review by Venue1Hub'),
      corpo,
      t(d.en, 'Ver o caso', 'View the case'),
      url
    ),
  });
};

module.exports = { avisarCasoAberto, avisarResposta, avisarDecisao, avisarPrazoExpirado };
