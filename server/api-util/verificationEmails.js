/**
 * Transactional email for the anunciante verification flow.
 *
 * Each message goes out in ONE language, the recipient's own.
 *
 * These used to be sent bilingual — Portuguese, a divider, then English —
 * because the server had no way of knowing the recipient's interface language:
 * the locale lived only in a client-side context and was never written to the
 * user record. Guessing wrong on a verification email is worse than sending
 * both, so both travelled together.
 *
 * That constraint is gone. The client now mirrors the chosen language into
 * `publicData.locale` (see `saveUserLocale` in src/ducks/user.duck.js), so
 * `isEnglish(profile)` gives a real answer and the reader gets one clean
 * message instead of the same thing twice.
 *
 * Sending is best-effort: a failed email must never fail the request that
 * triggered it. The document state is already saved by then.
 *
 * Env:
 *   RESEND_API_KEY            required for anything to be sent
 *   EMAIL_FROM / VERIFICATION_EMAIL_FROM   sender (see emailSender.js)
 *   ADMIN_EMAILS              recipients of the "new submission" notice
 *   REACT_APP_MARKETPLACE_ROOT_URL
 */

const { Resend } = require('resend');
const { mailFrom, t } = require('./emailSender');

const FROM = () => mailFrom();

const rootUrl = () => (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');

const escapeHtml = str =>
  String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const layout = (title, blocks, en) => `<!DOCTYPE html>
<html lang="${en ? 'en' : 'pt'}">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:24px;background:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px;">
    ${blocks}
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

const h1 = text =>
  `<h1 style="margin:0 0 16px;font-size:20px;color:#2E2E2E;">${escapeHtml(text)}</h1>`;
const p = text =>
  `<p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.65;">${text}</p>`;
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

/** Saudação com o nome, quando o temos. */
const greet = (displayName, en) => {
  const nome = displayName ? ' ' + escapeHtml(displayName) : '';
  return t(en, `Olá${nome},`, `Hello${nome},`);
};

/**
 * To the anunciante: we received a document and review has started.
 */
const documentSubmitted = ({ to, displayName, docLabel, docLabelEN, en }) => {
  const label = escapeHtml(t(en, docLabel, docLabelEN || docLabel));
  return send({
    to,
    subject: t(en, 'Documento recebido', 'Document received'),
    html: layout(
      t(en, 'Documento recebido', 'Document received'),
      h1(t(en, 'Recebemos o seu documento', 'We received your document')) +
        p(
          t(
            en,
            `${greet(displayName, en)} recebemos o documento <strong>${label}</strong>.`,
            `${greet(displayName, en)} we received your <strong>${label}</strong>.`
          )
        ) +
        p(
          t(
            en,
            'A análise é feita por uma pessoa e demora <strong>até 48 horas</strong>. Avisamos assim que estiver concluída.',
            'Review is done by a person and takes <strong>up to 48 hours</strong>. We will let you know as soon as it is done.'
          )
        ) +
        button(
          `${rootUrl()}/verificacao`,
          t(en, 'Ver estado da verificação', 'Check verification status')
        ),
      en
    ),
  });
};

/**
 * To the anunciante: one document was rejected, with the reason.
 */
const documentRejected = ({ to, displayName, docLabel, docLabelEN, reason, en }) => {
  const label = escapeHtml(t(en, docLabel, docLabelEN || docLabel));
  return send({
    to,
    subject: t(en, 'Documento por corrigir', 'Document needs fixing'),
    html: layout(
      t(en, 'Documento por corrigir', 'Document needs fixing'),
      h1(t(en, 'Precisamos que reenvie um documento', 'We need one document again')) +
        p(
          t(
            en,
            `${greet(displayName, en)} o documento <strong>${label}</strong> não pôde ser aceite.`,
            `${greet(displayName, en)} your <strong>${label}</strong> could not be accepted.`
          )
        ) +
        quote(reason) +
        p(
          t(
            en,
            'Só precisa de reenviar <strong>este</strong> documento. Os restantes mantêm-se como estavam.',
            'You only need to re-submit <strong>this</strong> document. The others stay as they were.'
          )
        ) +
        button(`${rootUrl()}/verificacao`, t(en, 'Reenviar documento', 'Re-submit document')),
      en
    ),
  });
};

/**
 * To the anunciante: everything is approved and publishing is unlocked.
 */
const accountApproved = ({ to, displayName, en }) => {
  const nome = displayName ? ', ' + escapeHtml(displayName) : '';
  return send({
    to,
    subject: t(en, 'Conta verificada', 'Account verified'),
    html: layout(
      t(en, 'Conta verificada', 'Account verified'),
      h1(t(en, 'A sua conta está verificada', 'Your account is verified')) +
        p(
          t(
            en,
            `Boas notícias${nome}: os seus documentos foram aprovados.`,
            `Good news${nome}: your documents have been approved.`
          )
        ) +
        p(
          t(
            en,
            'Já pode publicar anúncios na Venue1Hub.',
            'You can now publish listings on Venue1Hub.'
          )
        ) +
        button(`${rootUrl()}/l/new`, t(en, 'Publicar um anúncio', 'Publish a listing')),
      en
    ),
  });
};

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
        button(`${rootUrl()}/verificacoes`, 'Abrir painel de verificações'),
      false
    ),
  });
};

module.exports = {
  documentSubmitted,
  documentRejected,
  accountApproved,
  adminNewSubmission,
};
