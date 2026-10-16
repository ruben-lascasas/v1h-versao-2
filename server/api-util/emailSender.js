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

/**
 * Endereço que recebe as notificações internas.
 *
 * Havia quatro variáveis para isto (CONTACT_RECIPIENT, REPORTS_TO_EMAIL,
 * ADMIN_NOTIFY_RECIPIENT, ADMIN_EMAILS) e cada ficheiro tinha o seu endereço de
 * recurso escrito à mão — uns 'admin@v1h.net', outros 'admin@venue1hub.com',
 * nenhum deles uma caixa a sério. Quem configurasse uma das variáveis ficava a
 * pensar que estava tudo encaminhado, e as denúncias continuavam a cair num
 * endereço morto.
 *
 * Agora CONTACT_RECIPIENT é a base: as variáveis específicas continuam a valer
 * quando existem, e sem elas tudo converge para aqui. ADMIN_EMAILS é outra
 * coisa — é quem tem acesso ao painel de verificações — e mantém-se à parte.
 */
const adminEmail = () =>
  process.env.CONTACT_RECIPIENT || process.env.ADMIN_EMAILS?.split(',')[0]?.trim() || '';

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

/**
 * ENVIAR, E SABER SE CHEGOU.
 *
 * O SDK do Resend **não lança exceção** quando a API recusa o envio: devolve
 * `{ data: null, error }` e a promessa resolve com sucesso. Todas as chamadas
 * deste projeto faziam `await resend.emails.send(...)` dentro de um try/catch e
 * davam o envio por feito — por isso um domínio não verificado (403) era
 * indistinguível de uma entrega. Descoberto a 2026-10-16, com a conta Resend
 * sem nenhum domínio registado: 26 chamadas a registar sucesso, zero emails
 * entregues.
 *
 * E não é só um registo errado. Nos trabalhos da pré-verificação o valor de
 * retorno decide se se carimba o anúncio: um falso "enviado" marcava o aviso
 * como dado e fechava o anúncio sete dias depois de um email que ninguém
 * recebeu. O comentário do `preVerificacaoExpiryJob` prometia precisamente o
 * contrário do que o código fazia.
 *
 * Daqui em diante o resultado vem da resposta, não da ausência de exceção.
 *
 * @param {Object} resend instância do Resend, ou null/undefined
 * @param {Object} args
 * @param {string} args.para destinatário
 * @param {string} args.subject
 * @param {string} args.html
 * @param {string} [args.etiqueta] sufixo do nome do remetente (ver mailFrom)
 * @param {string} [args.contexto] prefixo dos registos, ex.: '[pre-verificacao]'
 * @returns {Promise<boolean>} true só quando o Resend aceitou o envio
 */
const enviarEmail = async (resend, { para, subject, html, etiqueta, contexto = '[email]' }) => {
  if (!resend || !para) return false;
  try {
    const resposta = await resend.emails.send({
      from: mailFrom(etiqueta),
      to: para,
      subject,
      html,
    });
    const erro = resposta?.error;
    if (erro) {
      console.error(
        `${contexto} o Resend recusou o envio para ${para}:`,
        erro.message || JSON.stringify(erro)
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error(`${contexto} email falhou para ${para}:`, e?.message || e);
    return false;
  }
};

module.exports = { mailFrom, adminEmail, isEnglish, t, enviarEmail };
