const { Resend } = require('resend');

/**
 * POST /api/feedback
 * Sends a feedback email using Resend.
 * Required env var:
 *   RESEND_API_KEY     — get it at resend.com
 * Optional:
 *   REPORTS_TO_EMAIL   (defaults to admin@v1h.net)
 */
module.exports = async (req, res) => {
  const {
    name = '',
    email = '',
    subject = '',
    message = '',
    satisfaction = '',
    category = '',
    rating = 0,
  } = req.body || {};

  if (!email || !message) {
    return res.status(400).json({ error: 'Por favor preencha o email e a mensagem.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const recipient = process.env.REPORTS_TO_EMAIL || 'admin@venue1hub.com';

  if (!apiKey) {
    console.log('[Feedback] New feedback (RESEND_API_KEY not configured):');
    console.log(`  From: ${name} <${email}>`);
    console.log(`  Subject: ${subject}`);
    console.log(`  Message: ${message}`);
    return res.status(200).json({ success: true });
  }

  try {
    const resend = new Resend(apiKey);

    const safeName = (name || '(anónimo)').replace(/</g, '&lt;');
    const safeSubject = (subject || '(sem assunto)').replace(/</g, '&lt;');
    const safeMessage = (message || '').replace(/</g, '&lt;');

    const safeEmail = (email || '').replace(/</g, '&lt;');
    const safeSatisfaction = (satisfaction || '').replace(/</g, '&lt;');
    const safeCategory = (category || '').replace(/</g, '&lt;');
    const ratingStars = Number.isFinite(Number(rating)) && Number(rating) > 0
      ? `${Number(rating)}/5 ★`
      : '—';

    await resend.emails.send({
      from: 'Venue1Hub Feedback <onboarding@resend.dev>',
      reply_to: email,
      to: [recipient],
      subject: `[Venue1Hub - Feedback] ${safeSubject}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #BAA38A; border-bottom: 2px solid #BAA38A; padding-bottom: 12px;">Novo feedback recebido</h2>
          <table style="width:100%; border-collapse:collapse; margin-top:16px;">
            <tr><td style="padding:8px 0; color:#666; width:140px;"><strong>Satisfação:</strong></td><td style="padding:8px 0;">${safeSatisfaction || '—'}</td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Categoria:</strong></td><td style="padding:8px 0;">${safeCategory || '—'}</td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Recomendação (NPS):</strong></td><td style="padding:8px 0;">${ratingStars}</td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Email:</strong></td><td style="padding:8px 0;"><a href="mailto:${safeEmail}" style="color:#BAA38A;">${safeEmail}</a></td></tr>
            <tr><td style="padding:8px 0; color:#666;"><strong>Data:</strong></td><td style="padding:8px 0;">${new Date().toLocaleString('pt-PT')}</td></tr>
          </table>
          <div style="margin-top:24px; padding:16px; background:#faf6f0; border-left:4px solid #BAA38A; border-radius:2px;">
            <p style="margin:0 0 8px 0; color:#666; font-size:13px;"><strong>Mensagem:</strong></p>
            <p style="margin:0; color:#2E2E2E; line-height:1.6; white-space:pre-wrap;">${safeMessage}</p>
          </div>
          <p style="margin-top:24px; font-size:12px; color:#999;">Pode responder diretamente a este email para contactar o utilizador.</p>
        </div>
      `,
    });

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Feedback] Resend error:', err.message);
    return res.status(500).json({ error: 'Erro ao enviar o feedback. Tente novamente.' });
  }
};
