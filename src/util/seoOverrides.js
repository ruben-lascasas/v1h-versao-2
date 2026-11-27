/**
 * Títulos e descrições para o Google, definidos no painel SEO (/seo).
 *
 * As páginas editáveis e os textos sugeridos estão em src/config/seoPages.json,
 * que o servidor também lê para validar o que se grava. O que foi gravado no
 * painel chega pelo estado inicial do Redux (ducks/seo.duck.js) e vale por cima
 * da sugestão, campo a campo: um campo vazio no painel volta à sugestão.
 *
 * Isto corre no servidor, que é o que o Google lê, e no browser.
 */
import PAGINAS from '../config/seoPages.json';

export const PAGINAS_SEO = PAGINAS;
export const LINGUAS_SEO = ['pt', 'en'];
export const CAMPOS_SEO = [
  'focusKeyword',
  'title',
  'description',
  'keywords',
  'socialTitle',
  'socialDescription',
];

/** "/como-funciona/" e "/como-funciona" são a mesma página. */
export const normalizarCaminho = pathname => {
  const p = String(pathname || '/').split(/[?#]/)[0];
  return p.length > 1 ? p.replace(/\/+$/, '') : '/';
};

export const paginaSeo = pathname => {
  const caminho = normalizarCaminho(pathname);
  return PAGINAS.find(p => p.path === caminho) || null;
};

const texto = v => (typeof v === 'string' ? v.trim() : '');

/**
 * Os valores em vigor de uma página numa língua: o que foi gravado, e a
 * sugestão onde não houver nada gravado.
 *
 * @param {Object} pagina entrada de seoPages.json
 * @param {Object} [gravado] o que o painel guardou para essa página
 * @param {string} lingua 'pt' ou 'en'
 */
export const valoresEmVigor = (pagina, gravado, lingua) => {
  const l = LINGUAS_SEO.includes(lingua) ? lingua : 'pt';
  const sugestao = pagina?.sugestao?.[l] || {};
  const guardado = gravado?.[l] || {};
  return CAMPOS_SEO.reduce(
    (acc, campo) => ({ ...acc, [campo]: texto(guardado[campo]) || texto(sugestao[campo]) }),
    { noIndex: Boolean(gravado?.noIndex) }
  );
};

/**
 * A meta tag "keywords": a palavra-chave principal e as outras, sem repetidos.
 * O Google ignora-a; fica porque foi pedida e porque não faz mal.
 */
export const metaKeywords = valores => {
  const todas = [valores.focusKeyword, ...String(valores.keywords || '').split(',')]
    .map(k => texto(k))
    .filter(Boolean);
  const vistas = new Set();
  return todas
    .filter(k => {
      const chave = k.toLowerCase();
      if (vistas.has(chave)) return false;
      vistas.add(chave);
      return true;
    })
    .join(', ');
};

/**
 * O que o componente Page deve usar para este endereço, ou null quando a
 * página não é gerida pelo painel (anúncios, perfis, páginas privadas…).
 *
 * @param {string} pathname
 * @param {string} lingua
 * @param {Object} [paginasGravadas] estado `seo.paginas` do Redux
 */
export const seoParaEndereco = (pathname, lingua, paginasGravadas) => {
  const pagina = paginaSeo(pathname);
  if (!pagina) return null;
  const valores = valoresEmVigor(pagina, paginasGravadas?.[pagina.path], lingua);
  return { ...valores, keywords: metaKeywords(valores) };
};
