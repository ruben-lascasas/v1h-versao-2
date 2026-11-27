/**
 * Painel SEO — o lado do servidor.
 *
 *   GET  /api/seo-admin          o que está gravado e onde fica guardado
 *   POST /api/seo-admin/pagina   grava os textos de uma página
 *
 * O acesso é o mesmo do painel de verificações: sessão iniciada e email em
 * ADMIN_EMAILS.
 */

const { requireAdmin } = require('./verification-admin');
const seoSettings = require('../api-util/seoSettings');

const deny = res => res.status(403).json({ error: 'forbidden' });

const listar = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return deny(res);

  // Relê antes de mostrar, para o painel nunca partir de uma cópia antiga.
  await seoSettings.recarregar();
  return res.json({
    paginas: seoSettings.obterPaginas(),
    armazenamento: seoSettings.armazenamento(),
  });
};

const gravar = async (req, res) => {
  const admin = await requireAdmin(req, res);
  if (!admin) return deny(res);

  const { caminho, valores } = req.body || {};
  try {
    const resultado = await seoSettings.gravarPagina(caminho, valores, admin.email);
    if (!resultado.ok) return res.status(400).json({ error: resultado.erro });
    console.log(`[seo-admin] ${admin.email} gravou ${caminho}`);
    return res.json({ paginas: resultado.paginas });
  } catch (e) {
    console.error('[seo-admin] gravação falhou:', e?.message || e);
    return res.status(500).json({ error: 'gravacao-falhou' });
  }
};

module.exports = { listar, gravar };
