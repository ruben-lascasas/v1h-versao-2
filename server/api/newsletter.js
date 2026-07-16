const { Resend } = require('resend');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * POST /api/newsletter
 * Stores a newsletter subscription and notifies admin.
 * Required env var:
 *   RESEND_API_KEY
 * Optional:
 *   CONTACT_RECIPIENT  (defaults to admin@v1h.net)
 */
module.exports = async (req, res) => {
  const { email } = req.body || {};

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = process.env.CONTACT_RECIPIENT || 'admin@v1h.net';

  if (!apiKey) {
    console.log(`[Newsletter] New subscriber (RESEND_API_KEY not configured): ${email}`);
    return res.status(200).json({ success: true });
  }

  try {
    const resend = new Resend(apiKey);

    await Promise.all([
      // Confirmation to subscriber
      resend.emails.send({
        from: 'Venue1Hub <onboarding@resend.dev>',
        to: [email],
        subject: 'Subscrição confirmada — Venue1Hub',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2E2E2E;">
            <div style="background: #2E2E2E; padding: 32px 24px; text-align: center;">
              <img src="https://venue1hub.com/static/media/V1H-LOGO-WHITE.png" alt="Venue1Hub" style="height: 48px;" />
            </div>
            <div style="padding: 40px 24px;">
              <h2 style="color: #2E2E2E; margin: 0 0 16px;">Obrigado por subscrever!</h2>
              <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                Está agora na lista de newsletters da <strong>Venue1Hub</strong>.
                Irá receber novidades sobre novos espaços, promoções exclusivas e dicas para o seu próximo evento.
              </p>
              <p style="color: #888; font-size: 13px; margin: 0;">
                Pode cancelar a subscrição a qualquer momento entrando em contacto connosco em
                <a href="mailto:${adminEmail}" style="color: #BAA38A;">${adminEmail}</a>.
              </p>
            </div>
            <div style="background: #f5f0eb; padding: 16px 24px; text-align: center;">
              <p style="margin: 0; font-size: 12px; color: #999;">
                © ${new Date().getFullYear()} Venue1Hub. Todos os direitos reservados.
              </p>
            </div>
          </div>
        `,
      }),
      // Notification to admin
      resend.emails.send({
        from: 'Venue1Hub Newsletter <onboarding@resend.dev>',
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
