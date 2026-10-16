/**
 * "Houve gente a ver o seu espaço" — o incentivo para concluir a verificação.
 *
 * A IDEIA, E PORQUE É QUE ELA FUNCIONA
 *
 * Um anfitrião que publicou sem documentos não tem pressa nenhuma: o anúncio
 * já está no ar e, do lado dele, parece estar tudo feito. O que o faz voltar
 * ao formulário da verificação não é um lembrete seco — é saber que houve
 * pessoas a olhar para o espaço dele e que ele não as pode receber.
 *
 * Por isso este email só existe quando há procura para contar. Sem visitas
 * nem favoritos novos não se envia nada: um "ninguém viu o seu espaço" seria
 * pior do que o silêncio.
 *
 * UM RESUMO POR DIA, NÃO UM EMAIL POR VISITA
 *
 * A proposta falava em avisar "sempre que alguém visitar". Em cada visita
 * seriam dezenas de emails por semana a quem tem um espaço procurado, e o
 * efeito inverte-se: deixa de ser um incentivo e passa a ser motivo para
 * marcar como spam. É também o que protege quem visita — o anfitrião fica a
 * saber que houve interesse, nunca quem o teve.
 *
 * O QUE CONTA COMO NOVO
 *
 * Guarda-se em `publicData.ultimoInteresseComunicado` o que já foi contado.
 * É essa comparação, e não a data, que decide: um anúncio parado não recebe
 * nada, por muitos dias que passem.
 *
 * Horário por omissão: 09:00, depois do digest de favoritos das 08:00, para
 * os dois não chegarem ao mesmo tempo. Variáveis:
 *   INTERESSE_PRE_VERIFICACAO_CRON  (por omissão "0 9 * * *")
 *   DISABLE_INTERESSE_PRE_VERIFICACAO=true  → não agenda
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { enviarEmail, isEnglish, t } = require('../api-util/emailSender');
const { getIntegrationSdk } = require('../api-util/sdk');
const { contagemDe } = require('../api/listing-views');

const PER_PAGE = 100;
const ROOT_URL = process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';

const escapar = v => String(v || '').replace(/</g, '&lt;');

const anunciosPorVerificar = async sdk => {
  const anuncios = [];
  const autoresPorId = {};
  let pagina = 1;
  while (true) {
    const res = await sdk.listings.query({
      states: 'published',
      page: pagina,
      perPage: PER_PAGE,
      include: ['author'],
      'fields.listing': ['title', 'publicData'],
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

/**
 * A frase que descreve a procura, em linguagem de gente.
 *
 * Separada do email para poder ser testada sem montar HTML nenhum — é aqui
 * que mora o singular/plural e o caso de haver só uma das duas coisas.
 *
 * @param {Object} args
 * @param {number} args.vistas
 * @param {number} args.favoritos
 * @param {boolean} args.en
 * @returns {string}
 */
const frasePro = ({ vistas, favoritos, en }) => {
  const partes = [];
  if (vistas > 0) {
    partes.push(
      vistas === 1
        ? t(en, '1 pessoa viu o seu espaço', '1 person viewed your space')
        : t(en, `${vistas} pessoas viram o seu espaço`, `${vistas} people viewed your space`)
    );
  }
  if (favoritos > 0) {
    partes.push(
      favoritos === 1
        ? t(en, '1 guardou-o nos favoritos', '1 saved it to their favourites')
        : t(
            en,
            `${favoritos} guardaram-no nos favoritos`,
            `${favoritos} saved it to their favourites`
          )
    );
  }
  return partes.join(t(en, ' e ', ' and '));
};

const emailDeInteresse = ({ nome, anuncio, vistas, favoritos, en }) => ({
  subject: t(
    en,
    `Houve interesse em "${anuncio}" — falta a verificação`,
    `There was interest in "${anuncio}" — verification pending`
  ),
  html: `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;line-height:1.6;">
    <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;margin-bottom:24px;">
      ${t(en, 'Há quem esteja a ver o seu espaço', 'People are looking at your space')}
    </h2>
    <p style="margin:0 0 16px;">${t(en, `Olá ${nome},`, `Hi ${nome},`)}</p>
    <p style="margin:0 0 16px;">
      ${t(en, 'Desde o último aviso,', 'Since we last wrote,')}
      <strong>${frasePro({ vistas, favoritos, en })}</strong>
      ${t(en, 'em', 'on')} <strong>${anuncio}</strong>.
    </p>
    <p style="margin:0 0 16px;">
      ${t(
        en,
        'Neste momento não podem reservar nem enviar-lhe mensagem: isso só abre quando a conta estiver verificada. São alguns documentos, e demora o tempo de os fotografar.',
        'Right now they cannot book it or message you: that only opens once your account is verified. It is a few documents, and it takes as long as photographing them.'
      )}
    </p>
    <p style="margin:24px 0;">
      <a href="${ROOT_URL.replace(
        /\/$/,
        ''
      )}/verificacao" style="background:#2E2E2E;color:#fff;padding:12px 22px;border-radius:6px;text-decoration:none;display:inline-block;">
        ${t(en, 'Concluir verificação', 'Complete verification')}
      </a>
    </p>
    <p style="margin:32px 0 0;font-size:13px;color:#7C6350;">Venue1Hub</p>
  </div>`,
});

/**
 * Envia e diz se chegou a ser aceite.
 *
 * O valor de retorno não é decorativo: é ele que decide se os números ficam
 * marcados como comunicados. Um falso "enviado" não se repara — aquele
 * interesse nunca volta a ser contado, e o anfitrião nunca soube dele.
 *
 * Por isso isto vive em `enviarEmail`, que lê a resposta do Resend em vez de
 * se fiar na ausência de exceção (o SDK recusa sem lançar nada).
 */
const enviar = (resend, para, { subject, html }) =>
  enviarEmail(resend, { para, subject, html, contexto: '[interesse]' });

/**
 * Uma passagem. Exportada à parte do agendamento para poder ser testada.
 *
 * @param {Object} sdk Integration SDK
 * @param {Object} [resend]
 * @returns {Promise<{avisados:number, semNovidade:number}>}
 */
const correr = async (sdk, resend = null) => {
  const { anuncios, autoresPorId } = await anunciosPorVerificar(sdk);
  const resultado = { avisados: 0, semNovidade: 0 };

  for (const anuncio of anuncios) {
    const autorId = anuncio?.relationships?.author?.data?.id?.uuid;
    const autor = autorId ? autoresPorId[autorId] : null;
    if (autor?.attributes?.profile?.metadata?.podeReceberReservas !== false) continue;

    const pd = anuncio.attributes?.publicData || {};
    const idDoAnuncio = anuncio.id?.uuid || anuncio.id;
    const vistasTotais = contagemDe(idDoAnuncio).allTimeCount || 0;
    const favoritosTotais = pd.favoritesCount || 0;

    const jaContado = pd.ultimoInteresseComunicado || {};
    const vistasNovas = Math.max(0, vistasTotais - (jaContado.vistas || 0));
    const favoritosNovos = Math.max(0, favoritosTotais - (jaContado.favoritos || 0));

    if (vistasNovas === 0 && favoritosNovos === 0) {
      resultado.semNovidade += 1;
      continue;
    }

    const perfil = autor?.attributes?.profile || {};
    const en = isEnglish(perfil);
    const enviado = await enviar(
      resend,
      autor?.attributes?.email,
      emailDeInteresse({
        nome: perfil.firstName || perfil.displayName || t(en, 'olá', 'there'),
        anuncio: escapar(anuncio.attributes?.title) || t(en, 'o seu anúncio', 'your listing'),
        vistas: vistasNovas,
        favoritos: favoritosNovos,
        en,
      })
    );

    // Só se marca como contado o que foi mesmo comunicado. Se o email falhar,
    // os números ficam por contar e entram no resumo de amanhã — em vez de se
    // perderem em silêncio.
    if (!enviado && resend) continue;

    await sdk.listings.update({
      id: anuncio.id,
      publicData: {
        ultimoInteresseComunicado: { vistas: vistasTotais, favoritos: favoritosTotais },
      },
    });
    resultado.avisados += 1;
  }

  return resultado;
};

const start = () => {
  if (process.env.DISABLE_INTERESSE_PRE_VERIFICACAO === 'true') {
    console.log('[interesse] desligado por variavel de ambiente');
    return;
  }
  const expressao = process.env.INTERESSE_PRE_VERIFICACAO_CRON || '0 9 * * *';
  cron.schedule(expressao, async () => {
    const sdk = getIntegrationSdk();
    if (!sdk) {
      console.error('[interesse] sem Integration SDK — passagem ignorada');
      return;
    }
    try {
      const chave = process.env.RESEND_API_KEY;
      const r = await correr(sdk, chave ? new Resend(chave) : null);
      console.log(`[interesse] avisados ${r.avisados}, sem novidade ${r.semNovidade}`);
    } catch (e) {
      console.error('[interesse] falhou:', e?.message || e);
    }
  });
  console.log(`[interesse] agendado (${expressao})`);
};

module.exports = { start, correr, frasePro };
