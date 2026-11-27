/**
 * Onde vivem os títulos e descrições do painel SEO.
 *
 * NO R2, NÃO EM FICHEIRO
 *
 * O Render corre no plano gratuito, sem disco permanente: o que se escreve em
 * server/data desaparece no deploy seguinte. Por isso grava-se no mesmo bucket
 * R2 dos documentos de verificação, num único objeto JSON. Sem R2 configurado
 * (em desenvolvimento) grava-se em server/data/seo.json, e o painel avisa que
 * esse armazenamento é temporário.
 *
 * EM MEMÓRIA PARA RENDERIZAR
 *
 * Cada página renderizada no servidor precisa destes valores, e não pode ficar
 * à espera do R2. Lê-se ao arrancar e de 10 em 10 minutos, e a gravação
 * atualiza a memória de imediato. Se a leitura falhar, fica o que estava: um
 * R2 em baixo não pode deitar abaixo o site, só atrasa os títulos.
 */

const fs = require('fs');
const path = require('path');
const r2 = require('./r2');
const PAGINAS = require('../../src/config/seoPages.json');

const CHAVE_R2 = 'config/seo.json';
const FICHEIRO_LOCAL = path.join(__dirname, '..', 'data', 'seo.json');
const INTERVALO_MS = 10 * 60 * 1000;

const LINGUAS = ['pt', 'en'];
const LIMITES = {
  focusKeyword: 100,
  title: 200,
  description: 400,
  keywords: 400,
  socialTitle: 200,
  socialDescription: 400,
};

let paginas = {};
let temporizador = null;

const caminhosValidos = () => new Set(PAGINAS.map(p => p.path));

const limpar = v =>
  typeof v === 'string'
    ? v
        .replace(/[\u0000-\u001f\u007f]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    : '';

/**
 * Valida o que chega do painel para uma página. Campos desconhecidos são
 * ignorados; textos demasiado longos são recusados em vez de cortados, para
 * não se gravar outra coisa que não a que a pessoa escreveu.
 *
 * @returns {{ ok: true, valor: Object } | { ok: false, erro: string }}
 */
const validarPagina = entrada => {
  const valor = { noIndex: entrada?.noIndex === true };
  for (const lingua of LINGUAS) {
    valor[lingua] = {};
    for (const [campo, maximo] of Object.entries(LIMITES)) {
      const texto = limpar(entrada?.[lingua]?.[campo]);
      if (texto.length > maximo) {
        return { ok: false, erro: `${campo}-${lingua}-demasiado-longo` };
      }
      if (texto) valor[lingua][campo] = texto;
    }
  }
  return { ok: true, valor };
};

/** Só as páginas que existem em seoPages.json, já validadas. */
const filtrarGuardado = dados => {
  const validos = caminhosValidos();
  const origem = dados?.paginas || {};
  return Object.keys(origem).reduce((acc, caminho) => {
    if (!validos.has(caminho)) return acc;
    const v = validarPagina(origem[caminho]);
    if (v.ok) {
      acc[caminho] = {
        ...v.valor,
        updatedAt: typeof origem[caminho].updatedAt === 'string' ? origem[caminho].updatedAt : null,
        updatedBy: typeof origem[caminho].updatedBy === 'string' ? origem[caminho].updatedBy : null,
      };
    }
    return acc;
  }, {});
};

const armazenamento = () => (r2.isConfigured() ? 'r2' : 'local');

const lerDoArmazenamento = async () => {
  if (armazenamento() === 'r2') {
    const resposta = await fetch(r2.getSignedUrl(CHAVE_R2, 60));
    if (resposta.status === 404) return {};
    if (!resposta.ok) throw new Error(`seo-r2-get-${resposta.status}`);
    return resposta.json();
  }
  if (!fs.existsSync(FICHEIRO_LOCAL)) return {};
  return JSON.parse(fs.readFileSync(FICHEIRO_LOCAL, 'utf8'));
};

const escreverNoArmazenamento = async dados => {
  const corpo = Buffer.from(JSON.stringify(dados, null, 2), 'utf8');
  if (armazenamento() === 'r2') {
    await r2.putObject(CHAVE_R2, corpo, 'application/json');
    return;
  }
  fs.mkdirSync(path.dirname(FICHEIRO_LOCAL), { recursive: true });
  fs.writeFileSync(FICHEIRO_LOCAL, corpo);
};

/** Relê o armazenamento. Numa falha, mantém o que já estava em memória. */
const recarregar = async () => {
  try {
    paginas = filtrarGuardado(await lerDoArmazenamento());
    return true;
  } catch (e) {
    console.error('[seo] leitura falhou, fica o que estava:', e?.message || e);
    return false;
  }
};

/** Chamado uma vez, quando o servidor arranca. */
const iniciar = () => {
  recarregar();
  if (!temporizador) {
    temporizador = setInterval(recarregar, INTERVALO_MS);
    if (temporizador.unref) temporizador.unref();
  }
};

const obterPaginas = () => paginas;

/**
 * Grava uma página. Relê primeiro o armazenamento para não apagar o que outra
 * pessoa gravou noutra página entretanto.
 *
 * @returns {Promise<{ ok: true, paginas: Object } | { ok: false, erro: string }>}
 */
const gravarPagina = async (caminho, entrada, autor) => {
  if (!caminhosValidos().has(caminho)) return { ok: false, erro: 'pagina-desconhecida' };
  const v = validarPagina(entrada);
  if (!v.ok) return v;

  const atuais = filtrarGuardado(await lerDoArmazenamento());
  const novas = {
    ...atuais,
    [caminho]: { ...v.valor, updatedAt: new Date().toISOString(), updatedBy: autor || null },
  };
  await escreverNoArmazenamento({ versao: 1, paginas: novas });
  paginas = novas;
  return { ok: true, paginas: novas };
};

module.exports = {
  iniciar,
  recarregar,
  obterPaginas,
  gravarPagina,
  validarPagina,
  filtrarGuardado,
  armazenamento,
  CHAVE_R2,
};
