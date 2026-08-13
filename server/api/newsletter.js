const { Resend } = require('resend');
const { mailFrom, isEnglish, t, adminEmail: adminAddress } = require('../api-util/emailSender');

// O logótipo dos emails tem de ser um URL absoluto. Deriva do domínio
// configurado em vez de estar escrito à mão: com o domínio novo, o valor fixo
// devolvia uma imagem partida.
const LOGO_URL = `${(process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(
  /\/$/,
  ''
)}/static/media/V1H-LOGO-WHITE.png`;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/newsletter
 * Stores a newsletter subscription and notifies admin.
 * Required env var:
 *   RESEND_API_KEY
 * Optional:
 *   CONTACT_RECIPIENT  destinatário das notificações internas
 */
module.exports = async (req, res) => {
  const { email, locale } = req.body || {};

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = adminAddress();
  const en = isEnglish(locale);

  if (!apiKey) {
    console.log(`[Newsletter] New subscriber (RESEND_API_KEY not configured): ${email}`);
    return res.status(200).json({ success: true });
  }

  try {
    const resend = new Resend(apiKey);

    await Promise.all([
      // Confirmation to subscriber
      resend.emails.send({
        from: mailFrom(),
        to: [email],
        subject: t(en, 'Subscrição confirmada — Venue1Hub', 'Subscription confirmed — Venue1Hub'),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2E2E2E;">
            <div style="background: #2E2E2E; padding: 32px 24px; text-align: center;">
              <img src="${LOGO_URL}" alt="Venue1Hub" style="height: 48px;" />
            </div>
            <div style="padding: 40px 24px;">
              <h2 style="color: #2E2E2E; margin: 0 0 16px;">
                ${t(en, 'Obrigado por subscrever!', 'Thanks for subscribing!')}
              </h2>
              <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                ${t(
                  en,
                  'Está agora na lista de newsletters da <strong>Venue1Hub</strong>. Irá receber novidades sobre novos espaços e serviços, promoções exclusivas e dicas para o seu próximo evento.',
                  "You're now on the <strong>Venue1Hub</strong> newsletter list. You'll get news about new venues and services, exclusive offers and tips for your next event."
                )}
              </p>
              <p style="color: #888; font-size: 13px; margin: 0;">
                ${t(
                  en,
                  'Pode cancelar a subscrição a qualquer momento entrando em contacto connosco em',
                  'You can unsubscribe at any time by contacting us at'
                )}
                <a href="mailto:${adminEmail}" style="color: #BAA38A;">${adminEmail}</a>.
              </p>
            </div>
            <div style="background: #f5f0eb; padding: 16px 24px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} Venue1Hub.
                ${t(en, 'Todos os direitos reservados.', 'All rights reserved.')}
              </p>
            </div>
          </div>
        `,
      }),
      // Notification to admin
      resend.emails.send({
        from: mailFrom('Newsletter'),
        to: [adminEmail],
        subject: '[Venue1Hub] Nova subscrição de newsletter',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a; border-bottom: 2px solid #BAA38A; padding-bottom: 12px;">Nova subscrição</h2>
            <p style="color: #555;">Um novo utilizador subscreveu a newsletter:</p>
            <p style="background: #f5f0eb; padding: 12px 16px; border-radius: 4px; font-size: 16px;">
              <strong>${email}</strong>
            </p>
            <p style="font-size: 12px; color: #999; margin-top: 24px;">
              Enviado automaticamente pelo formulário de newsletter da Venue1Hub.
            </p>
          </div>
        `,
      }),
    ]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Newsletter] Resend error:', err.message);
    return res.status(500).json({ error: 'Erro ao processar subscrição. Tente novamente.' });
  }
};
