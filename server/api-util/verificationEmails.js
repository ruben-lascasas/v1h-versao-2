/**
 * Transactional email for the anunciante verification flow.
 *
 * Every message goes out bilingual: Portuguese first, English below a divider.
 * We don't reliably know the recipient's interface language from the server
 * (the locale lives in a client-side context, not on the user record), and a
 * verification email is exactly the wrong place to guess wrong — so both
 * versions travel together rather than risking an unreadable one.
 *
 * Sending is best-effort: a failed email must never fail the request that
 * triggered it. The document state is already saved by then.
 *
 * Env:
 *   RESEND_API_KEY            required for anything to be sent
 *   VERIFICATION_EMAIL_FROM   defaults to the shared Resend sender
 *   ADMIN_EMAILS              recipients of the "new submission" notice
 *   REACT_APP_MARKETPLACE_ROOT_URL
 */

const { Resend } = require('resend');

const FROM = () =>
  process.env.VERIFICATION_EMAIL_FROM || 'Venue1Hub <onboarding@resend.dev>';

const rootUrl = () =>
  (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');

const escapeHtml = str =>
  String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const layout = (title, blocks) => `<!DOCTYPE html>
<html lang="pt">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px;">
    ${blocks}
    <p style="margin:32px 0 0;font-size:12px;color:#9a938a;line-height:1.6;">
      Venue1Hub · esta mensagem foi enviada automaticamente.<br />
      Venue1Hub · this message was sent automatically.
    </p>
  </div>
</body>
</html>`;

const h1 = text =>
  `<h1 style="margin:0 0 16px;font-size:20px;color:#2E2E2E;">${escapeHtml(text)}</h1>`;
const p = text =>
  `<p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.65;">${text}</p>`;
const divider = () =>
  `<hr style="border:none;border-top:1px solid #E4D9CB;margin:28px 0;" />`;
const button = (href, label) =>
  `<p style="margin:24px 0 0;">
     <a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;background:#2E2E2E;
        color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">
       ${escapeHtml(label)}
     </a>
   </p>`;
const quote = text =>
  `<p style="margin:0 0 14px;padding:12px 14px;background:#FCF2EE;border-left:3px solid #C98C7A;
      font-size:14px;color:#8E3220;line-height:1.6;">${escapeHtml(text)}</p>`;

const send = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[verification-email] RESEND_API_KEY not set — skipping', subject);
    return false;
  }
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return false;

  try {
    await new Resend(apiKey).emails.send({ from: FROM(), to: recipients, subject, html });
    return true;
  } catch (e) {
    console.error('[verification-email] send failed:', e?.message || e);
    return false;
  }
};

/**
 * To the anunciante: we received a document and review has started.
 */
const documentSubmitted = ({ to, displayName, docLabel, docLabelEN }) =>
  send({
    to,
    subject: 'Documento recebido · Document received',
    html: layout(
      'Documento recebido',
      h1('Recebemos o seu documento') +
        p(`Olá${displayName ? ' ' + escapeHtml(displayName) : ''}, recebemos o documento
           <strong>${escapeHtml(docLabel)}</strong>.`) +
        p('A análise é feita por uma pessoa e demora <strong>até 48 horas</strong>. Avisamos assim que estiver concluída.') +
        button(`${rootUrl()}/verificacao`, 'Ver estado da verificação') +
        divider() +
        h1('We received your document') +
        p(`Hello${displayName ? ' ' + escapeHtml(displayName) : ''}, we received your
           <strong>${escapeHtml(docLabelEN)}</strong>.`) +
        p('Review is done by a person and takes <strong>up to 48 hours</strong>. We will let you know as soon as it is done.') +
        button(`${rootUrl()}/verificacao`, 'Check verification status')
    ),
  });

/**
 * To the anunciante: one document was rejected, with the reason.
 */
const documentRejected = ({ to, displayName, docLabel, docLabelEN, reason }) =>
  send({
    to,
    subject: 'Documento por corrigir · Document needs fixing',
    html: layout(
      'Documento por corrigir',
      h1('Precisamos que reenvie um documento') +
        p(`Olá${displayName ? ' ' + escapeHtml(displayName) : ''}, o documento
           <strong>${escapeHtml(docLabel)}</strong> não pôde ser aceite.`) +
        quote(reason) +
        p('Só precisa de reenviar <strong>este</strong> documento. Os restantes mantêm-se como estavam.') +
        button(`${rootUrl()}/verificacao`, 'Reenviar documento') +
        divider() +
        h1('We need one document again') +
        p(`Hello${displayName ? ' ' + escapeHtml(displayName) : ''}, your
           <strong>${escapeHtml(docLabelEN)}</strong> could not be accepted.`) +
        quote(reason) +
        p('You only need to re-submit <strong>this</strong> document. The others stay as they were.') +
        button(`${rootUrl()}/verificacao`, 'Re-submit document')
    ),
  });

/**
 * To the anunciante: everything is approved and publishing is unlocked.
 */
const accountApproved = ({ to, displayName }) =>
  send({
    to,
    subject: 'Conta verificada · Account verified',
    html: layout(
      'Conta verificada',
      h1('A sua conta está verificada') +
        p(`Boas notícias${displayName ? ', ' + escapeHtml(displayName) : ''}: os seus documentos foram aprovados.`) +
        p('Já pode publicar anúncios na Venue1Hub.') +
        button(`${rootUrl()}/l/new`, 'Publicar um anúncio') +
        divider() +
        h1('Your account is verified') +
        p(`Good news${displayName ? ', ' + escapeHtml(displayName) : ''}: your documents have been approved.`) +
        p('You can now publish listings on Venue1Hub.') +
        button(`${rootUrl()}/l/new`, 'Publish a listing')
    ),
  });

/**
 * To the operators: something is waiting for review. Internal, so PT only.
 */
const adminNewSubmission = ({ displayName, email, docLabel }) => {
  const to = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim())
    .filter(Boolean);
  return send({
    to,
    subject: `Verificação pendente · ${displayName || email || 'anunciante'}`,
    html: layout(
      'Verificação pendente',
      h1('Novo documento para rever') +
        p(`<strong>${escapeHtml(displayName || '(sem nome)')}</strong> (${escapeHtml(email || '—')})
           submeteu <strong>${escapeHtml(docLabel)}</strong>.`) +
        p('O prazo comunicado ao anunciante é de 48 horas.') +
        button(`${rootUrl()}/verificacoes`, 'Abrir painel de verificações')
    ),
  });
};

module.exports = {
  documentSubmitted,
  documentRejected,
  accountApproved,
  adminNewSubmission,
};
