/**
 * Remetente e língua partilhados por todos os emails do servidor.
 *
 * Porque é que isto existe:
 *
 * 1. REMETENTE — quase todos os ficheiros de email tinham
 *    `from: 'Venue1Hub <onboarding@resend.dev>'` escrito à mão. Esse é o
 *    domínio de testes do Resend, que só entrega ao dono da conta: qualquer
 *    outro destinatário devolve 403 com "You can only send testing emails to
 *    your own email address". Em produção isso significa que a confirmação de
 *    newsletter, a lista de espera, os avisos de favoritos, o relatório mensal
 *    e tudo o resto eram aceites pelo código e nunca chegavam ao utilizador.
 *    O remetente passa a vir do ambiente, num sítio só.
 *
 * 2. LÍNGUA — vários emails liam `profile.publicData.locale`, mas nada escrevia
 *    esse campo, por isso o `|| 'pt'` ganhava sempre e as versões inglesas eram
 *    código morto. O cliente passou a gravá-lo (ver `saveUserLocale` em
 *    src/ducks/user.duck.js); `isEnglish` é a leitura correspondente.
 *
 * Variáveis de ambiente:
 *   EMAIL_FROM               remetente base, ex.: "Venue1Hub <noreply@venue1hub.eu>"
 *   VERIFICATION_EMAIL_FROM  usado se EMAIL_FROM não existir (retrocompatível —
 *                            é o que já está configurado no Render)
 */

const FALLBACK = 'Venue1Hub <onboarding@resend.dev>';

/** Separa "Nome <a@b.c>" em { nome, endereco }. Aceita também só o endereço. */
const parseFrom = raw => {
  const valor = String(raw || '').trim();
  const m = valor.match(/^\s*(.*?)\s*<\s*([^>]+)\s*>\s*$/);
  if (m) return { nome: m[1].replace(/^"|"$/g, '') || 'Venue1Hub', endereco: m[2] };
  return { nome: 'Venue1Hub', endereco: valor };
};

/**
 * Remetente a usar no campo `from`.
 *
 * @param {string} [etiqueta] sufixo do nome visível, ex.: 'Newsletter' dá
 *   "Venue1Hub Newsletter <noreply@venue1hub.eu>". O endereço nunca muda —
 *   só o nome — para não partir a verificação de domínio.
 */
const mailFrom = etiqueta => {
  const configurado = process.env.EMAIL_FROM || process.env.VERIFICATION_EMAIL_FROM || FALLBACK;
  const { nome, endereco } = parseFrom(configurado);
  if (!endereco) return FALLBACK;
  const visivel = etiqueta ? `${nome} ${etiqueta}` : nome;
  return `${visivel} <${endereco}>`;
};

/** Endereço do administrador que recebe as notificações internas. */
const adminEmail = () => process.env.CONTACT_RECIPIENT || 'admin@v1h.net';

/**
 * A língua guardada no perfil, normalizada para uma decisão booleana.
 * Aceita o perfil, o utilizador inteiro, ou a string do locale.
 */
const isEnglish = origem => {
  const locale =
    typeof origem === 'string'
      ? origem
      : origem?.publicData?.locale ||
        origem?.attributes?.profile?.publicData?.locale ||
        origem?.profile?.publicData?.locale;
  return !!locale && String(locale).toLowerCase().startsWith('en');
};

/** Escolhe entre duas variantes conforme a língua do destinatário. */
const t = (emIngles, pt, en) => (emIngles ? en : pt);

module.exports = { mailFrom, adminEmail, isEnglish, t };
