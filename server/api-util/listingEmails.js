/**
 * Emails ao anfitrião sobre o estado do seu anúncio.
 *
 * Faltavam por completo. Um anfitrião percorria o assistente todo, carregava em
 * publicar, e o anúncio era fechado à espera de aprovação — sem email, sem
 * aviso no site, sem nada. Do lado dele o anúncio simplesmente desaparecia. E
 * quando o administrador o aprovava, voltava a aparecer com o mesmo silêncio.
 *
 * O `listingPending` era escrito em publicData e ninguém o lia.
 *
 * Tudo aqui é best-effort: o estado do anúncio já está gravado quando estas
 * funções correm, e uma falha de correio não pode desfazer uma aprovação.
 */

const { Resend } = require('resend');
const { mailFrom, isEnglish, t } = require('./emailSender');

const ROOT_URL = () => (process.env.REACT_APP_MARKETPLACE_ROOT_URL || '').replace(/\/$/, '');

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

const citar = texto =>
  `<p style="margin:0 0 14px;padding:12px 14px;background:#FCF2EE;border-left:3px solid #C98C7A;
      font-size:14px;color:#8E3220;line-height:1.6;">${escapeHtml(texto)}</p>`;

const enviar = async ({ to, subject, html }) => {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn('[listing-email] RESEND_API_KEY não configurada — saltado:', subject);
    return false;
  }
  if (!to) {
    console.error('[listing-email] sem destinatário:', subject);
    return false;
  }
  try {
    await new Resend(apiKey).emails.send({ from: mailFrom(), to: [to], subject, html });
    console.log(`[listing-email] enviado → ${to}: ${subject}`);
    return true;
  } catch (e) {
    console.error('[listing-email] envio falhou:', e?.message || e);
    return false;
  }
};

/**
 * Vai buscar quem publicou o anúncio, para saber o email e a língua.
 * @returns {Promise<{email, nome, en, titulo}|null>}
 */
const carregarAnfitriao = async (sdk, listingId) => {
  if (!sdk || !listingId) return null;
  try {
    const res = await sdk.listings.show({ id: listingId, include: ['author'] });
    const listing = res?.data?.data;
    const autor = (res?.data?.included || []).find(x => x.type === 'user');
    const perfil = autor?.attributes?.profile;
    return {
      email: autor?.attributes?.email || null,
      nome: perfil?.firstName || null,
      en: isEnglish(perfil),
      titulo: listing?.attributes?.title || null,
    };
  } catch (e) {
    console.error('[listing-email] não foi possível carregar o anfitrião:', e?.message || e);
    return null;
  }
};

const saudacao = (nome, en) =>
  t(en, `Olá${nome ? ' ' + escapeHtml(nome) : ''},`, `Hello${nome ? ' ' + escapeHtml(nome) : ''},`);

/** O anúncio foi publicado e está fechado à espera de revisão. */
const listingPendingReview = async ({ sdk, listingId, listingTitle }) => {
  const a = await carregarAnfitriao(sdk, listingId);
  if (!a?.email) return false;
  const { en, nome } = a;
  const titulo = escapeHtml(listingTitle || a.titulo || t(en, 'o seu anúncio', 'your listing'));

  return enviar({
    to: a.email,
    subject: t(en, `Anúncio em análise — ${titulo}`, `Listing under review — ${titulo}`),
    html: envolver(
      en,
      t(en, 'Recebemos o seu anúncio', 'We received your listing'),
      p(saudacao(nome, en)) +
        p(
          t(
            en,
            `O anúncio <strong>${titulo}</strong> foi submetido e está a ser revisto por uma pessoa da nossa equipa.`,
            `Your listing <strong>${titulo}</strong> has been submitted and is being reviewed by someone on our team.`
          )
        ) +
        p(
          t(
            en,
            'Enquanto essa revisão decorre, o anúncio <strong>não está visível</strong> na plataforma e não pode receber reservas. Avisamos assim que estiver publicado — normalmente em menos de 48 horas.',
            "While that's happening the listing is <strong>not visible</strong> on the platform and cannot take bookings. We'll let you know as soon as it's live — usually within 48 hours."
          )
        ) +
        p(
          t(
            en,
            'Não precisa de fazer nada. Se quiser rever ou alterar alguma coisa entretanto, pode fazê-lo nos seus anúncios.',
            "There's nothing you need to do. If you'd like to review or change anything in the meantime, you can do so in your listings."
          )
        ) +
        botao(`${ROOT_URL()}/anuncios`, t(en, 'Ver os meus anúncios', 'View my listings'))
    ),
  });
};

/** O anúncio foi aprovado e está publicado. */
const listingApproved = async ({ sdk, listingId }) => {
  const a = await carregarAnfitriao(sdk, listingId);
  if (!a?.email) return false;
  const { en, nome } = a;
  const titulo = escapeHtml(a.titulo || t(en, 'o seu anúncio', 'your listing'));

  return enviar({
    to: a.email,
    subject: t(en, `Anúncio publicado — ${titulo}`, `Listing published — ${titulo}`),
    html: envolver(
      en,
      t(en, 'O seu anúncio está no ar', 'Your listing is live'),
      p(saudacao(nome, en)) +
        p(
          t(
            en,
            `<strong>${titulo}</strong> foi aprovado e já está visível na plataforma. A partir de agora pode receber reservas.`,
            `<strong>${titulo}</strong> has been approved and is now visible on the platform. It can take bookings from now on.`
          )
        ) +
        p(
          t(
            en,
            'Se quiser dar-lhe mais visibilidade, pode destacá-lo na página principal.',
            'If you want more visibility, you can feature it on the home page.'
          )
        ) +
        botao(`${ROOT_URL()}/l/${listingId}`, t(en, 'Ver o anúncio', 'View listing'))
    ),
  });
};

/** O anúncio foi recusado e mantém-se fechado. */
const listingRejected = async ({ sdk, listingId, reason }) => {
  const a = await carregarAnfitriao(sdk, listingId);
  if (!a?.email) return false;
  const { en, nome } = a;
  const titulo = escapeHtml(a.titulo || t(en, 'o seu anúncio', 'your listing'));

  return enviar({
    to: a.email,
    subject: t(en, `Anúncio por rever — ${titulo}`, `Listing needs changes — ${titulo}`),
    html: envolver(
      en,
      t(en, 'O seu anúncio precisa de alterações', 'Your listing needs changes'),
      p(saudacao(nome, en)) +
        p(
          t(
            en,
            `Analisámos <strong>${titulo}</strong> e, tal como está, não pode ser publicado.`,
            `We reviewed <strong>${titulo}</strong> and it can't be published as it stands.`
          )
        ) +
        (reason ? citar(reason) : '') +
        p(
          t(
            en,
            'Pode editar o anúncio e voltar a submetê-lo — não precisa de criar um novo. Se tiver dúvidas sobre o que corrigir, responda a este email.',
            "You can edit the listing and submit it again — there's no need to create a new one. If you're unsure what to change, just reply to this email."
          )
        ) +
        botao(`${ROOT_URL()}/anuncios`, t(en, 'Editar o anúncio', 'Edit listing'))
    ),
  });
};

module.exports = { listingPendingReview, listingApproved, listingRejected };
