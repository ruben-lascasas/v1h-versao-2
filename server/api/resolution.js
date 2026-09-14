/**
 * Centro de Resolução — os endpoints do dossier.
 *
 *   GET  /api/resolution/:id         o caso desta reserva (só as partes)
 *   POST /api/resolution/:id/abrir   abre o caso
 *   POST /api/resolution/:id/prova   junta uma prova
 *   POST /api/resolution/:id/responder  direito de resposta da outra parte
 *
 * Quem escreve é a Integration API, nunca a sessão de quem chama: as duas
 * partes leem o dossier, mas nenhuma consegue alterar o que a outra escreveu.
 */

const { getSdk, getIntegrationSdk } = require('../api-util/sdk');
const r2 = require('../api-util/r2');
const {
  TIPOS,
  MAX_BYTES,
  MIME_ACEITES,
  casoDe,
  papelDe,
  partesDe,
  contraparte,
  abrir,
  juntarProva,
  responder,
  decidir,
  marcarExecutada,
} = require('../api-util/resolutionCase');
const { avisarCasoAberto, avisarResposta, avisarDecisao } = require('../api-util/resolutionEmails');

const quemChama = async (req, res) => {
  try {
    const sdk = getSdk(req, res);
    const r = await sdk.currentUser.show();
    const u = r?.data?.data;
    return u?.id?.uuid ? u : null;
  } catch (_) {
    return null;
  }
};

/** Carrega a reserva e confirma que quem chama é parte dela. */
const carregar = async (req, res, permitirAdmin = false) => {
  const caller = await quemChama(req, res);
  if (!caller) return { erro: [401, 'not-authenticated'] };

  const sdk = getIntegrationSdk();
  if (!sdk) return { erro: [500, 'integration-sdk-not-configured'] };

  const resposta = await sdk.transactions.show({ id: req.params.id });
  const transaction = resposta?.data?.data;
  if (!transaction) return { erro: [404, 'reserva-nao-encontrada'] };

  const papel = papelDe(transaction, caller.id.uuid);
  if (papel) return { sdk, caller, transaction, papel };

  // Um administrador não é parte na reserva, mas tem de conseguir ver o caso —
  // senão criavam-se os endpoints de decisão e não havia forma de lá chegar
  // sem ser por linha de comandos. O papel "venue1hub" lê e decide; não abre
  // casos nem responde em nome de ninguém.
  if (permitirAdmin && (await ehAdmin(req, res))) {
    return { sdk, caller, transaction, papel: 'venue1hub' };
  }

  return { erro: [403, 'nao-e-parte-desta-reserva'] };
};

/** Está esta sessão na lista de administradores? */
const ehAdmin = async (req, res) => {
  const permitidos = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  if (permitidos.length === 0) return false;
  try {
    const sdk = getSdk(req, res);
    const u = (await sdk.currentUser.show())?.data?.data;
    const email = u?.attributes?.email?.toLowerCase();
    return !!email && permitidos.includes(email);
  } catch (_) {
    return false;
  }
};

/** Provas são ficheiros privados: o URL é assinado e expira. */
const comUrls = async caso => {
  if (!caso || !r2.isConfigured()) return caso;
  const provas = await Promise.all(
    caso.provas.map(async p => ({ ...p, url: r2.getSignedUrl(p.chave, 300) }))
  );
  return { ...caso, provas };
};

const ver = async (req, res) => {
  try {
    // Só a leitura aceita administradores. Abrir um caso, juntar prova e
    // responder continuam a exigir ser parte da reserva.
    const ctx = await carregar(req, res, true);
    if (ctx.erro) return res.status(ctx.erro[0]).json({ error: ctx.erro[1] });

    return res.json({
      papel: ctx.papel,
      tipos: TIPOS,
      caso: await comUrls(casoDe(ctx.transaction)),
    });
  } catch (e) {
    console.error('[resolução] falha a ler o caso:', e?.message || e);
    return res.status(500).json({ error: 'internal-error' });
  }
};

const abrirCaso = async (req, res) => {
  try {
    const ctx = await carregar(req, res);
    if (ctx.erro) return res.status(ctx.erro[0]).json({ error: ctx.erro[1] });

    const { tipo, descricao, valorCents } = req.body || {};
    const r = await abrir(ctx.sdk, ctx.transaction, {
      autor: ctx.caller.id.uuid,
      papel: ctx.papel,
      tipo,
      descricao,
      valorCents,
    });

    if (!r.aberto) return res.status(409).json({ error: r.motivo, caso: r.caso });

    // A página promete que a outra parte é notificada. Sem isto era mentira —
    // o caso ficava à espera de que ela passasse por lá por acaso, e o prazo
    // de sete dias corria contra alguém que não sabia de nada.
    const partes = partesDe(ctx.transaction);
    const outro = partes[contraparte(ctx.papel)];
    avisarCasoAberto(ctx.sdk, { destinatarioId: outro, txId: req.params.id, caso: r.caso }).catch(e =>
      console.error('[resolução] aviso de caso aberto falhou:', e?.message || e)
    );

    console.log(`[resolução] caso aberto em ${req.params.id} por ${ctx.papel} (${tipo})`);
    return res.json({ caso: r.caso });
  } catch (e) {
    // Erros de validação e falhas de infraestrutura dão respostas diferentes:
    // a primeira é do utilizador e tem de ser mostrada, a segunda é nossa.
    console.error('[resolução] falha a abrir:', e?.message || e);
    return res.status(400).json({ error: e?.message || 'nao-foi-possivel-abrir' });
  }
};

const prova = async (req, res) => {
  try {
    const ctx = await carregar(req, res);
    if (ctx.erro) return res.status(ctx.erro[0]).json({ error: ctx.erro[1] });
    if (!r2.isConfigured()) return res.status(500).json({ error: 'armazenamento-nao-configurado' });

    const { filename, contentType, data } = req.body || {};
    if (!MIME_ACEITES.includes(contentType)) return res.status(400).json({ error: 'tipo-nao-aceite' });

    const buffer = Buffer.from(data || '', 'base64');
    if (buffer.length === 0) return res.status(400).json({ error: 'ficheiro-vazio' });
    if (buffer.length > MAX_BYTES) return res.status(413).json({ error: 'too-large' });

    // A chave inclui a transacção e um aleatório: nomes de ficheiro repetidos
    // não se sobrepõem, e o nome original não vai para o caminho.
    const ext = (filename || '').split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const chave = `resolucao/${req.params.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    await r2.putObject(chave, buffer, contentType);

    const caso = await juntarProva(ctx.sdk, ctx.transaction, {
      papel: ctx.papel,
      chave,
      nome: filename || 'prova',
      contentType,
    });
    return res.json({ caso: await comUrls(caso) });
  } catch (e) {
    console.error('[resolução] falha a juntar prova:', e?.message || e);
    return res.status(400).json({ error: e?.message || 'nao-foi-possivel-juntar' });
  }
};

const responderCaso = async (req, res) => {
  try {
    const ctx = await carregar(req, res);
    if (ctx.erro) return res.status(ctx.erro[0]).json({ error: ctx.erro[1] });

    const { texto, aceita } = req.body || {};
    const caso = await responder(ctx.sdk, ctx.transaction, { papel: ctx.papel, texto, aceita });

    const partes = partesDe(ctx.transaction);
    avisarResposta(ctx.sdk, {
      destinatarioId: partes[caso.abertoPor.papel],
      txId: req.params.id,
    }).catch(e => console.error('[resolução] aviso de resposta falhou:', e?.message || e));

    console.log(`[resolução] resposta em ${req.params.id} por ${ctx.papel}`);
    return res.json({ caso: await comUrls(caso) });
  } catch (e) {
    console.error('[resolução] falha a responder:', e?.message || e);
    return res.status(400).json({ error: e?.message || 'nao-foi-possivel-responder' });
  }
};

/**
 * A decisão da Venue1Hub.
 *
 * Sem isto, o Centro de Resolução recebia casos e não resolvia nenhum: as
 * funções existiam e estavam testadas, mas não havia forma de lhes chegar. Um
 * dossier que só acumula reclamações não é um centro de resolução.
 *
 * Só administradores. A competência para decidir vem dos Termos, não de ser
 * parte na reserva — e quem é parte tem, por definição, um lado.
 */
const requireAdmin = async (req, res) => {
  if (!(await ehAdmin(req, res))) return null;
  try {
    const sdk = getSdk(req, res);
    const u = (await sdk.currentUser.show())?.data?.data;
    return { email: u.attributes.email.toLowerCase(), id: u.id.uuid };
  } catch (_) {
    return null;
  }
};

const carregarComoAdmin = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return { erro: [403, 'forbidden'] };

  const sdk = getIntegrationSdk();
  if (!sdk) return { erro: [500, 'integration-sdk-not-configured'] };

  const transaction = (await sdk.transactions.show({ id: req.params.id }))?.data?.data;
  if (!transaction) return { erro: [404, 'reserva-nao-encontrada'] };

  return { sdk, admin, transaction };
};

const decidirCaso = async (req, res) => {
  try {
    const ctx = await carregarComoAdmin(req, res);
    if (ctx.erro) return res.status(ctx.erro[0]).json({ error: ctx.erro[1] });

    const { sentido, fundamentacao, valorCents } = req.body || {};
    const caso = await decidir(ctx.sdk, ctx.transaction, {
      porUserId: ctx.admin.id,
      sentido,
      fundamentacao,
      valorCents,
    });

    // As duas partes são avisadas. Uma decisão que só a plataforma conhece não
    // resolve nada.
    const partes = partesDe(ctx.transaction);
    for (const id of [partes.cliente, partes.anfitriao]) {
      avisarDecisao(ctx.sdk, { destinatarioId: id, txId: req.params.id, caso }).catch(e =>
        console.error('[resolução] aviso de decisão falhou:', e?.message || e)
      );
    }

    console.log(`[resolução] ${req.params.id} decidido por ${ctx.admin.email}: ${sentido}`);
    return res.json({ caso });
  } catch (e) {
    console.error('[resolução] falha a decidir:', e?.message || e);
    return res.status(400).json({ error: e?.message || 'nao-foi-possivel-decidir' });
  }
};

/**
 * Marca que o valor decidido foi mesmo movimentado na Stripe.
 *
 * "Decidido" e "pago" são estados diferentes, e este endpoint é o que os
 * separa: quem devolve o dinheiro regista aqui que o fez, com a referência.
 */
const executarDecisao = async (req, res) => {
  try {
    const ctx = await carregarComoAdmin(req, res);
    if (ctx.erro) return res.status(ctx.erro[0]).json({ error: ctx.erro[1] });

    const caso = await marcarExecutada(ctx.sdk, ctx.transaction, {
      porUserId: ctx.admin.id,
      nota: req.body?.nota,
    });
    console.log(`[resolução] ${req.params.id} executado por ${ctx.admin.email}`);
    return res.json({ caso });
  } catch (e) {
    console.error('[resolução] falha a marcar como executada:', e?.message || e);
    return res.status(400).json({ error: e?.message || 'nao-foi-possivel-executar' });
  }
};

module.exports = { ver, abrirCaso, prova, responderCaso, decidirCaso, executarDecisao };
