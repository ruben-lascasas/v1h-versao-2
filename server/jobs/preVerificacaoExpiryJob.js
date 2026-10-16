/**
 * Anúncios que ficaram demasiado tempo por verificar.
 *
 * A PRÉ-PUBLICAÇÃO TEM DE TER FIM
 *
 * Publicar deixou de exigir documentos. Isso tira a barreira à entrada, mas
 * abre outra porta: um catálogo a encher-se de espaços que nunca vão poder
 * ser reservados. Quem procura clica, descobre que não reserva, e aprende a
 * desconfiar da plataforma inteira.
 *
 * Por isso há um prazo. Aos 60 dias sem verificação, o anfitrião é avisado e
 * tem 7 dias para concluir. Se não o fizer, o anúncio é fechado.
 *
 * PORQUE NÃO SE CONTA DESDE A CRIAÇÃO
 *
 * O óbvio seria usar o `createdAt` do anúncio. Está errado: esse é o instante
 * em que o rascunho nasceu, e um rascunho pode ter ficado meses numa gaveta
 * antes de ser publicado. Fechar-se-ia, no primeiro dia de vida pública, um
 * anúncio que acabou de aparecer.
 *
 * Conta-se desde a primeira vez que este trabalho viu o anúncio publicado e
 * por verificar — `publicData.preVerificacaoDesde`, carimbado nessa passagem.
 * É mais tarde do que a verdade para os anúncios que já existem quando isto
 * entrar, e isso é o lado certo para errar.
 *
 * FECHAR NÃO É APAGAR
 *
 * `listings.close` esconde o anúncio das pesquisas e impede reservas, mas não
 * destrói nada: o anfitrião que apareça passados três meses com os documentos
 * encontra o espaço como o deixou. A Sharetribe nem sequer tem forma de
 * apagar um anúncio por API.
 *
 * Horário por omissão: 05:00. Variáveis:
 *   PRE_VERIFICACAO_CRON        (por omissão "0 5 * * *")
 *   PRE_VERIFICACAO_DIAS        (por omissão 60)
 *   PRE_VERIFICACAO_AVISO_DIAS  (por omissão 7)
 *   DISABLE_PRE_VERIFICACAO_EXPIRY=true  → não agenda
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { mailFrom, isEnglish, t } = require('../api-util/emailSender');
const { getIntegrationSdk } = require('../api-util/sdk');

const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';

const PER_PAGE = 100;
const DIAS_ATE_AVISO = 60;
const DIAS_DE_PRAZO = 7;
const DIA_MS = 24 * 60 * 60 * 1000;

const inteiroDoAmbiente = (nome, omissao) => {
  const bruto = process.env[nome];
  const n = bruto != null ? parseInt(bruto, 10) : NaN;
  return Number.isNaN(n) ? omissao : n;
};

const diasAteAviso = () => inteiroDoAmbiente('PRE_VERIFICACAO_DIAS', DIAS_ATE_AVISO);
const diasDePrazo = () => inteiroDoAmbiente('PRE_VERIFICACAO_AVISO_DIAS', DIAS_DE_PRAZO);

/**
 * O anfitrião deste anúncio já pode receber reservas?
 *
 * Lê-se dos dados incluídos na própria consulta — não vale a pena uma chamada
 * por anúncio. Quando a marca não existe, trata-se como verificado, pelo mesmo
 * motivo de sempre: as contas anteriores a esta regra nunca a tiveram escrita,
 * e fechar-lhes os anúncios seria uma avaria, não uma limpeza.
 */
const autorDe = (anuncio, porId) => {
  const autorId = anuncio?.relationships?.author?.data?.id?.uuid;
  return autorId ? porId[autorId] || null : null;
};

const autorPorVerificar = (anuncio, porId) =>
  autorDe(anuncio, porId)?.attributes?.profile?.metadata?.podeReceberReservas === false;

const anunciosPublicados = async sdk => {
  const anuncios = [];
  const autoresPorId = {};
  let pagina = 1;
  while (true) {
    const res = await sdk.listings.query({
      states: 'published',
      page: pagina,
      perPage: PER_PAGE,
      include: ['author'],
      'fields.listing': ['title', 'publicData', 'createdAt', 'state'],
    });
    anuncios.push(...(res?.data?.data || []));
    for (const r of res?.data?.included || []) {
      if (r.type === 'user') autoresPorId[r.id.uuid] = r;
    }
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || pagina >= meta.totalPages) break;
    pagina += 1;
  }
  return { anuncios, autoresPorId };
};

const carimbar = async (sdk, id, publicData) => {
  await sdk.listings.update({ id, publicData });
};

const escapar = v => String(v || '').replace(/</g, '&lt;');

const moldura = (titulo, corpo) => `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;line-height:1.6;">
    <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;margin-bottom:24px;">${titulo}</h2>
    ${corpo}
    <p style="margin:32px 0 0;font-size:13px;color:#7C6350;">Venue1Hub</p>
  </div>`;

const emailDeAviso = ({ nome, anuncio, prazo, en }) => ({
  subject: t(
    en,
    `"${anuncio}" sai da plataforma dentro de ${prazo} dias — Venue1Hub`,
    `"${anuncio}" will be removed in ${prazo} days — Venue1Hub`
  ),
  html: moldura(
    t(en, 'Falta concluir a verificação', 'Your verification is still pending'),
    `<p style="margin:0 0 16px;">${t(en, `Olá ${nome},`, `Hi ${nome},`)}</p>
     <p style="margin:0 0 16px;">${t(
       en,
       `O anúncio <strong>${anuncio}</strong> está publicado há dois meses, mas a conta ainda não está verificada — por isso ele aparece na plataforma sem poder receber reservas nem contactos.`,
       `Your listing <strong>${anuncio}</strong> has been published for two months, but your account is not verified yet — so it appears on the platform without being able to take bookings or messages.`
     )}</p>
     <p style="margin:0 0 16px;">${t(
       en,
       `Tem <strong>${prazo} dias</strong> para concluir a verificação. Se não o fizer, retiramos o anúncio da plataforma — não o apagamos, fica guardado como está e volta a aparecer assim que a verificação estiver feita.`,
       `You have <strong>${prazo} days</strong> to complete it. If you do not, we will take the listing down — we will not delete it: it stays as you left it and comes back as soon as you are verified.`
     )}</p>
     <p style="margin:24px 0;"><a href="${ROOT_URL.replace(/\/$/, '')}/verificacao" style="background:#2E2E2E;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block;">${t(en, 'Concluir verificação', 'Complete verification')}</a></p>`
  ),
});

const emailDeFecho = ({ nome, anuncio, en }) => ({
  subject: t(
    en,
    `"${anuncio}" foi retirado da plataforma — Venue1Hub`,
    `"${anuncio}" has been taken down — Venue1Hub`
  ),
  html: moldura(
    t(en, 'O anúncio foi retirado', 'Your listing has been taken down'),
    `<p style="margin:0 0 16px;">${t(en, `Olá ${nome},`, `Hi ${nome},`)}</p>
     <p style="margin:0 0 16px;">${t(
       en,
       `Como a verificação não foi concluída dentro do prazo, retirámos o anúncio <strong>${anuncio}</strong> da plataforma.`,
       `As the verification was not completed in time, we have taken <strong>${anuncio}</strong> down.`
     )}</p>
     <p style="margin:0 0 16px;">${t(
       en,
       'Não foi apagado. Está guardado exactamente como o deixou e volta a aparecer assim que a conta estiver verificada.',
       'It has not been deleted. It is saved exactly as you left it and comes back as soon as your account is verified.'
     )}</p>
     <p style="margin:24px 0;"><a href="${ROOT_URL.replace(/\/$/, '')}/verificacao" style="background:#2E2E2E;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block;">${t(en, 'Concluir verificação', 'Complete verification')}</a></p>`
  ),
});

/**
 * Envia, e nunca deixa uma falha de email travar a passagem.
 *
 * Um erro do Resend não pode impedir que o resto dos anúncios seja tratado —
 * mas também não pode passar despercebido, senão fecharíamos anúncios a quem
 * nunca chegou o aviso. Fica registado e devolve-se se foi ou não.
 */
const enviar = async (resend, para, { subject, html }) => {
  if (!resend || !para) return false;
  try {
    await resend.emails.send({ from: mailFrom('Venue1Hub'), to: para, subject, html });
    return true;
  } catch (e) {
    console.error('[pre-verificacao] email falhou para', para, e?.message || e);
    return false;
  }
};

/**
 * Uma passagem. Exportada à parte do agendamento para poder ser testada sem
 * esperar pelas 5 da manhã.
 *
 * @param {Object} sdk Integration SDK
 * @param {number} [agora] instante, para os testes poderem viajar no tempo
 * @returns {Promise<{carimbados:number, avisados:number, fechados:number, limpos:number}>}
 */
const correr = async (sdk, agora = Date.now(), resend = null) => {
  const { anuncios, autoresPorId } = await anunciosPublicados(sdk);
  const limiteAviso = diasAteAviso() * DIA_MS;
  const limiteFecho = diasDePrazo() * DIA_MS;
  const resultado = { carimbados: 0, avisados: 0, fechados: 0, limpos: 0 };

  for (const anuncio of anuncios) {
    const id = anuncio.id;
    const pd = anuncio.attributes?.publicData || {};
    const porVerificar = autorPorVerificar(anuncio, autoresPorId);

    // Deixou de estar por verificar: apagam-se os carimbos, senão um anfitrião
    // que se verifique e mais tarde volte a ficar pendente herdava um relógio
    // já quase no fim.
    if (!porVerificar) {
      if (pd.preVerificacaoDesde || pd.avisoPreVerificacao) {
        await carimbar(sdk, id, { preVerificacaoDesde: null, avisoPreVerificacao: null });
        resultado.limpos += 1;
      }
      continue;
    }

    if (!pd.preVerificacaoDesde) {
      await carimbar(sdk, id, { preVerificacaoDesde: new Date(agora).toISOString() });
      resultado.carimbados += 1;
      continue;
    }

    const desde = Date.parse(pd.preVerificacaoDesde);
    if (Number.isNaN(desde)) continue;

    const avisadoEm = pd.avisoPreVerificacao ? Date.parse(pd.avisoPreVerificacao) : NaN;

    const autor = autorDe(anuncio, autoresPorId);
    const perfil = autor?.attributes?.profile || {};
    const en = isEnglish(perfil);
    const nome = perfil.firstName || perfil.displayName || t(en, 'olá', 'there');
    const titulo = escapar(anuncio.attributes?.title) || t(en, 'o seu anúncio', 'your listing');
    const para = autor?.attributes?.email;

    if (!Number.isNaN(avisadoEm)) {
      if (agora - avisadoEm >= limiteFecho) {
        await sdk.listings.close({ id });
        await enviar(resend, para, emailDeFecho({ nome, anuncio: titulo, en }));
        resultado.fechados += 1;
      }
      continue;
    }

    if (agora - desde >= limiteAviso) {
      // O carimbo é posto depois do envio, de propósito. Se o email falhar, o
      // anúncio não fica marcado como avisado — e volta a tentar amanhã, em
      // vez de ficar sete dias a correr para um fecho que ninguém soube.
      const enviado = await enviar(resend, para, emailDeAviso({ nome, anuncio: titulo, prazo: diasDePrazo(), en }));
      if (!enviado && resend) {
        console.error(`[pre-verificacao] aviso nao enviado para ${id}; nao se carimba`);
        continue;
      }
      await carimbar(sdk, id, { avisoPreVerificacao: new Date(agora).toISOString() });
      resultado.avisados += 1;
    }
  }

  return resultado;
};

const start = () => {
  if (process.env.DISABLE_PRE_VERIFICACAO_EXPIRY === 'true') {
    console.log('[pre-verificacao] desligado por variavel de ambiente');
    return;
  }
  const expressao = process.env.PRE_VERIFICACAO_CRON || '0 5 * * *';
  cron.schedule(expressao, async () => {
    const sdk = getIntegrationSdk();
    if (!sdk) {
      console.error('[pre-verificacao] sem Integration SDK — passagem ignorada');
      return;
    }
    try {
      const chave = process.env.RESEND_API_KEY;
      const r = await correr(sdk, Date.now(), chave ? new Resend(chave) : null);
      console.log(
        `[pre-verificacao] carimbados ${r.carimbados}, avisados ${r.avisados}, ` +
          `fechados ${r.fechados}, limpos ${r.limpos}`
      );
    } catch (e) {
      console.error('[pre-verificacao] falhou:', e?.message || e);
    }
  });
  console.log(`[pre-verificacao] agendado (${expressao})`);
};

module.exports = { start, correr, autorPorVerificar };
