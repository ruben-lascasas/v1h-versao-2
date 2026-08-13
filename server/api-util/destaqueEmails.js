/**
 * Confirmação de compra de um destaque.
 *
 * Até aqui, o único sinal de que os 9,99 € tinham servido para alguma coisa era
 * o recibo do Stripe. O anfitrião pagava e não recebia nada nosso a dizer o que
 * comprou, de que anúncio, nem por quanto tempo.
 *
 * Enviado pelo webhook, depois de o pagamento estar confirmado — nunca a partir
 * do regresso do Checkout, que não prova pagamento nenhum.
 *
 * Best-effort: o destaque já está activo quando isto corre, por isso uma falha
 * de correio não pode fazer o Stripe repetir o evento.
 */

const { Resend } = require('resend');
const { mailFrom, isEnglish, t } = require('./emailSender');

const ROOT_URL = () => (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');

const DIAS = () => {
  const raw = parseInt(process.env.FEATURED_EXPIRY_DAYS, 10);
  return Number.isNaN(raw) ? 30 : raw;
};

const escapeHtml = str =>
  String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Valor pago, formatado a partir do que o Stripe cobrou mesmo. */
const formatarTotal = (session, en) => {
  const cents = session?.amount_total;
  if (cents == null) return null;
  const moeda = (session.currency || 'eur').toUpperCase();
  try {
    return new Intl.NumberFormat(en ? 'en-GB' : 'pt-PT', {
      style: 'currency',
      currency: moeda,
    }).format(cents / 100);
  } catch (_) {
    return `${(cents / 100).toFixed(2)} ${moeda}`;
  }
};

const construir = ({ nome, titulo, total, en }) => {
  const dias = DIAS();
  const safeNome = nome ? escapeHtml(nome) : null;
  const safeTitulo = escapeHtml(titulo || t(en, 'o seu anúncio', 'your listing'));
  const saudacao = t(
    en,
    `Olá${safeNome ? ' ' + safeNome : ''},`,
    `Hello${safeNome ? ' ' + safeNome : ''},`
  );

  const subject = t(
    en,
    `Destaque activo — ${safeTitulo}`,
    `Feature active — ${safeTitulo}`
  );

  const html = `<!DOCTYPE html>
<html lang="${en ? 'en' : 'pt'}">
<head><meta charset="UTF-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:#F5F0EB;font-family:Arial,Helvetica,sans-serif;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:10px;padding:32px;">
    <h1 style="margin:0 0 16px;font-size:20px;color:#2E2E2E;">
      ${t(en, 'O seu anúncio está em destaque', 'Your listing is now featured')}
    </h1>
    <p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.65;">${saudacao}</p>
    <p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.65;">
      ${t(
        en,
        `O pagamento foi confirmado e <strong>${safeTitulo}</strong> já aparece na secção de destaques da página principal.`,
        `Your payment went through and <strong>${safeTitulo}</strong> now appears in the featured section on the home page.`
      )}
    </p>
    <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px;color:#555;">
      <tr>
        <td style="padding:8px 12px;background:#F5F0EB;font-weight:bold;width:45%;">
          ${t(en, 'Anúncio', 'Listing')}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${safeTitulo}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;background:#F5F0EB;font-weight:bold;">
          ${t(en, 'Duração', 'Duration')}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">
          ${dias} ${t(en, 'dias', 'days')}
        </td>
      </tr>
      ${
        total
          ? `<tr>
        <td style="padding:8px 12px;background:#F5F0EB;font-weight:bold;">
          ${t(en, 'Valor pago', 'Amount paid')}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(total)}</td>
      </tr>`
          : ''
      }
    </table>
    <p style="margin:0 0 14px;font-size:15px;color:#555;line-height:1.65;">
      ${t(
        en,
        `É um pagamento único — não há renovação automática. Avisamos por email três dias antes de o destaque terminar.`,
        `This is a one-off payment — there is no automatic renewal. We'll email you three days before the feature ends.`
      )}
    </p>
    <p style="margin:24px 0 0;">
      <a href="${ROOT_URL()}/" style="display:inline-block;padding:12px 22px;background:#2E2E2E;
         color:#ffffff;text-decoration:none;border-radius:4px;font-size:14px;font-weight:bold;">
        ${t(en, 'Ver o meu anúncio', 'View my listing')}
      </a>
    </p>
    <p style="margin:32px 0 0;font-size:12px;color:#9a938a;line-height:1.6;">
      Venue1Hub · ${t(
        en,
        'esta mensagem foi enviada automaticamente. O recibo do pagamento é enviado pelo Stripe.',
        'this message was sent automatically. Your payment receipt comes from Stripe.'
      )}
    </p>
  </div>
</body>
</html>`;

  return { subject, html };
};

/**
 * @param {Object} params
 * @param {Object} params.sdk        Integration SDK já criado pelo webhook
 * @param {string} params.userId     UUID Sharetribe de quem pagou
 * @param {string} params.listingId
 * @param {Object} params.session    sessão de Checkout, para o valor cobrado
 */
const sendDestaqueConfirmation = async ({ sdk, userId, listingId, session }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[destaque-email] RESEND_API_KEY não está configurada — nada enviado');
    return false;
  }

  // O email do Checkout serve de recurso quando não há utilizador identificado,
  // mas o do perfil é o que importa: é para lá que vai tudo o resto.
  let email = session?.customer_details?.email || null;
  let nome = null;
  let en = false;

  if (sdk && userId) {
    try {
      const res = await sdk.users.show({ id: userId });
      const attrs = res?.data?.data?.attributes;
      email = attrs?.email || email;
      nome = attrs?.profile?.firstName || null;
      en = isEnglish(attrs?.profile);
    } catch (e) {
      console.error('[destaque-email] users.show falhou:', e?.message || e);
    }
  }

  if (!email) {
    console.error('[destaque-email] sem destinatário para', listingId);
    return false;
  }

  let titulo = null;
  if (sdk && listingId) {
    try {
      const res = await sdk.listings.show({ id: listingId });
      titulo = res?.data?.data?.attributes?.title || null;
    } catch (e) {
      console.error('[destaque-email] listings.show falhou:', e?.message || e);
    }
  }

  const { subject, html } = construir({
    nome,
    titulo,
    total: formatarTotal(session, en),
    en,
  });

  try {
    await new Resend(apiKey).emails.send({ from: mailFrom(), to: [email], subject, html });
    console.log(`[destaque-email] confirmação enviada → ${email}`);
    return true;
  } catch (e) {
    console.error('[destaque-email] envio falhou:', e?.message || e);
    return false;
  }
};

module.exports = { sendDestaqueConfirmation, construir };
