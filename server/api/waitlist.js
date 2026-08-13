const { Resend } = require('resend');
const { mailFrom, isEnglish, t, adminEmail: adminAddress } = require('../api-util/emailSender');

// O logótipo dos emails tem de ser um URL absoluto. Deriva do domínio
// configurado em vez de estar escrito à mão: com o domínio novo, o valor fixo
// devolvia uma imagem partida.
const LOGO_URL = `${(process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(
  /\/$/,
  ''
)}/static/media/V1H-LOGO-WHITE.png`;
const fs = require('fs');
const path = require('path');

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const WAITLIST_FILE = path.join(__dirname, '../data/waitlist.json');

const saveToFile = entry => {
  try {
    let list = [];
    if (fs.existsSync(WAITLIST_FILE)) {
      list = JSON.parse(fs.readFileSync(WAITLIST_FILE, 'utf8'));
    }
    list.push(entry);
    fs.writeFileSync(WAITLIST_FILE, JSON.stringify(list, null, 2));
  } catch (e) {
    console.error('[Waitlist] Failed to save to file:', e.message);
  }
};

const formatDate = (iso, en) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleString(en ? 'en-GB' : 'pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/Lisbon',
  });
};

/**
 * POST /api/waitlist
 * Registers interest in a listing for specific dates.
 * Sends confirmation to the user + notification to admin.
 *
 * Body: { email, listingId, listingTitle, listingUrl, startDate, endDate }
 */
module.exports = async (req, res) => {
  const { email, listingId, listingTitle, listingUrl, startDate, endDate, locale } =
    req.body || {};

  if (!email || !EMAIL_REGEX.test(email)) {
    return res.status(400).json({ error: 'Email inválido.' });
  }
  if (!listingId || !listingTitle) {
    return res.status(400).json({ error: 'Dados do anúncio em falta.' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const adminEmail = adminAddress();
  const en = isEnglish(locale);

  // Duas versões das datas: a do utilizador segue a língua dele, a do
  // administrador fica sempre em português para o painel ser consistente.
  const dateInfo = startDate
    ? `${formatDate(startDate, en)} → ${formatDate(endDate, en)}`
    : t(en, 'Datas não especificadas', 'No dates specified');
  const dateInfoAdmin = startDate
    ? `${formatDate(startDate, false)} → ${formatDate(endDate, false)}`
    : 'Datas não especificadas';

  saveToFile({ email, listingId, listingTitle, listingUrl: listingUrl || null, startDate: startDate || null, endDate: endDate || null, at: new Date().toISOString() });

  if (!apiKey) {
    console.log(`[Waitlist] ${email} → "${listingTitle}" | ${dateInfo}`);
    return res.status(200).json({ success: true });
  }

  try {
    const resend = new Resend(apiKey);

    await Promise.all([
      // Confirmation to the person who joined the waitlist
      resend.emails.send({
        from: mailFrom(),
        to: [email],
        subject: t(en, `Lista de espera — ${listingTitle}`, `Waiting list — ${listingTitle}`),
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #2E2E2E;">
            <div style="background: #2E2E2E; padding: 32px 24px; text-align: center;">
              <img src="${LOGO_URL}" alt="Venue1Hub" style="height: 48px;" />
            </div>
            <div style="padding: 40px 24px;">
              <h2 style="color: #2E2E2E; margin: 0 0 8px;">
                ${t(en, 'Entrou na lista de espera!', "You're on the waiting list!")}
              </h2>
              <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                ${t(
                  en,
                  `Ficou registado(a) na lista de espera para o anúncio <strong>${listingTitle}</strong>${
                    startDate ? ` para o período <strong>${dateInfo}</strong>` : ''
                  }.`,
                  `You've been added to the waiting list for <strong>${listingTitle}</strong>${
                    startDate ? ` for <strong>${dateInfo}</strong>` : ''
                  }.`
                )}
              </p>
              <p style="color: #555; line-height: 1.7; margin: 0 0 24px;">
                ${t(
                  en,
                  'Assim que uma vaga ficar disponível, entraremos em contacto imediatamente.',
                  "As soon as a slot opens up, we'll get in touch right away."
                )}
              </p>
              ${listingUrl ? `
              <div style="text-align: center; margin: 32px 0;">
                <a href="${listingUrl}" style="background: #BAA38A; color: #ffffff; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 14px; letter-spacing: 0.05em;">
                  ${t(en, 'VER ANÚNCIO', 'VIEW LISTING')}
                </a>
              </div>` : ''}
              <p style="color: #888; font-size: 13px; margin: 0;">
                ${t(
                  en,
                  'Se já não precisar da vaga, não precisa de fazer nada — o seu registo expira automaticamente. Para qualquer dúvida contacte-nos em',
                  "If you no longer need the slot there's nothing to do — your entry expires automatically. Any questions, contact us at"
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

      // Notification to admin with all details
      resend.emails.send({
        from: mailFrom('Waitlist'),
        to: [adminEmail],
        subject: `[Waitlist] ${email} → "${listingTitle}"`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #1a1a1a; border-bottom: 2px solid #BAA38A; padding-bottom: 12px;">
              Nova entrada na lista de espera
            </h2>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px 12px; background: #f5f0eb; font-weight: 700; width: 140px;">Email</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${email}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f5f0eb; font-weight: 700;">Anúncio</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${listingTitle}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f5f0eb; font-weight: 700;">ID do anúncio</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #eee; font-size: 12px; color: #999;">${listingId}</td>
              </tr>
              <tr>
                <td style="padding: 8px 12px; background: #f5f0eb; font-weight: 700;">Período</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">${dateInfoAdmin}</td>
              </tr>
              ${listingUrl ? `
              <tr>
                <td style="padding: 8px 12px; background: #f5f0eb; font-weight: 700;">Link</td>
                <td style="padding: 8px 12px; border-bottom: 1px solid #eee;">
                  <a href="${listingUrl}" style="color: #BAA38A;">${listingUrl}</a>
                </td>
              </tr>` : ''}
            </table>
            <p style="font-size: 12px; color: #999; margin-top: 24px;">
              Enviado automaticamente pela Venue1Hub — ${new Date().toLocaleString('pt-PT')}.
            </p>
          </div>
        `,
      }),
    ]);

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[Waitlist] Resend error:', err.message);
    return res.status(500).json({ error: 'Erro ao processar pedido. Tente novamente.' });
  }
};
