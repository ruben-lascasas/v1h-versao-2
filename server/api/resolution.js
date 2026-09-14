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
  abrir,
  juntarProva,
  responder,
} = require('../api-util/resolutionCase');

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
const carregar = async (req, res) => {
  const caller = await quemChama(req, res);
  if (!caller) return { erro: [401, 'not-authenticated'] };

  const sdk = getIntegrationSdk();
  if (!sdk) return { erro: [500, 'integration-sdk-not-configured'] };

  const resposta = await sdk.transactions.show({ id: req.params.id });
  const transaction = resposta?.data?.data;
  if (!transaction) return { erro: [404, 'reserva-nao-encontrada'] };

  const papel = papelDe(transaction, caller.id.uuid);
  if (!papel) return { erro: [403, 'nao-e-parte-desta-reserva'] };

  return { sdk, caller, transaction, papel };
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
    const ctx = await carregar(req, res);
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
    console.log(`[resolução] resposta em ${req.params.id} por ${ctx.papel}`);
    return res.json({ caso: await comUrls(caso) });
  } catch (e) {
    console.error('[resolução] falha a responder:', e?.message || e);
    return res.status(400).json({ error: e?.message || 'nao-foi-possivel-responder' });
  }
};

module.exports = { ver, abrirCaso, prova, responderCaso };
