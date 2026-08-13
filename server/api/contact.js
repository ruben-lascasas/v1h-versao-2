const { Resend } = require('resend');
const { mailFrom } = require('../api-util/emailSender');

/**
 * POST /api/contact
 * Sends a contact form email using Resend.
 * Required env var:
 *   RESEND_API_KEY   — get it at resend.com
 * Optional:
 *   CONTACT_RECIPIENT  (defaults to admin@venue1hub.com)
 */
module.exports = async (req, res) => {
  const { name, email, phonePrefix, phone, subject, message } = req.body || {};

  if (!name || !email || !subject || !message || !phone) {
    return res.status(400).json({ error: 'Por favor preencha os campos obrigatórios.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.CONTACT_RECIPIENT || 'admin@venue1hub.com';

  if (!apiKey) {
    console.log('[ContactForm] New message (RESEND_API_KEY not configured):');
    console.log(`  Name: ${name}`);
    console.log(`  Email: ${email}`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Message: ${message}`);
    return res.status(200).json({ success: true });
  }

  try {
    const resend = new Resend(apiKey);

    await resend.emails.send({
      from: mailFrom('Contacto'),
      reply_to: email,
      to: [recipient],
      subject: `[Venue1Hub - Contacto] ${subject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #1a1a1a; border-bottom: 2px solid #BAA38A; padding-bottom: 12px;">Nova mensagem de contacto</h2>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr><td style="padding:8px 0; color:#666; width:100px;"><strong>Nome:</strong></td><td style="padding:8px 0;">${name}</td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Email:</strong></td><td style="padding:8px 0;"><a href="mailto:${email}" style="color:#BAA38A;">${email}</a></td></tr>
            ${phone ? `<tr><td style="padding:8px 0; color:#666;"><strong>Telefone:</strong></td><td style="padding:8px 0;">${phonePrefix || '+351'} ${phone}</td></tr>` : ''}
            <tr><td style="padding:8px 0; color:#666;"><strong>Assunto:</strong></td><td style="padding:8px 0;">${subject}</td></tr>
          </table>
          <div style="margin-top:24px; padding:16px; background:#f9f7f5; border-left:4px solid #BAA38A; border-radius:2px;">
            <p style="margin:0; color:#2E2E2E; line-height:1.6; white-space:pre-wrap;">${message}</p>
          </div>
          <p style="margin-top:24px; font-size:12px; color:#999;">Mensagem enviada através do formulário de contacto da Venue1Hub</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[ContactForm] Resend error:', err.message);
    return res.status(500).json({ error: 'Erro ao enviar a mensagem. Tente novamente.' });
  }
};
