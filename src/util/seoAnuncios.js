/**
 * Títulos e descrições dos anúncios, a partir de um modelo com variáveis.
 *
 * O modelo edita-se no painel SEO, na entrada "Anúncios (modelo)" de
 * seoPages.json. Variáveis entre chavetas ({titulo}, {cidade}…) são trocadas
 * pelos dados de cada anúncio. Um bloco entre parênteses retos desaparece
 * inteiro se alguma variável lá dentro estiver vazia:
 *
 *   "{titulo}[ em {cidade}] | Venue1Hub"
 *   → "Sala de Eventos em Viana do Castelo | Venue1Hub"
 *   → "Sala de Eventos | Venue1Hub"          (anúncio sem cidade)
 *
 * Se o título passar dos 60 caracteres que o Google mostra, tenta-se de novo
 * sem os blocos opcionais antes de o deixar cortar.
 */
import { PAGINAS_SEO, valoresEmVigor } from './seoOverrides';
import { LIMITES_SEO, cortarParaGoogle } from './seoAnalise';

export const CAMINHO_MODELO_ANUNCIOS = '/l/:anuncio';

export const VARIAVEIS_ANUNCIO = [
  { nome: 'titulo', descricao: 'Título do anúncio' },
  { nome: 'cidade', descricao: 'Cidade, tirada da morada' },
  { nome: 'categoria', descricao: 'Categoria do espaço ou serviço' },
  { nome: 'capacidade', descricao: 'Número de pessoas' },
  { nome: 'preco', descricao: 'Preço com a unidade (ex.: 500 €/dia)' },
  { nome: 'descricao', descricao: 'Início da descrição do anúncio' },
];

/** Um anúncio de exemplo, para a pré-visualização do painel. */
export const ANUNCIO_EXEMPLO = {
  titulo: 'Sala de Eventos',
  cidade: 'Viana do Castelo',
  categoria: 'Salas de Reunião',
  capacidade: '150',
  preco: '500 €/dia',
  descricao:
    'Os seus eventos ganham um cenário único entre o pinhal e o mar, com espaços versáteis e elegantes para reuniões, conferências e celebrações.',
};

const limpar = s =>
  String(s == null ? '' : s)
    .replace(/\s+/g, ' ')
    .trim();

/**
 * A cidade a partir da morada, no formato que o mapa devolve:
 * "Rua X 222, 4935-158 Darque, Viana do Castelo, Portugal" → "Viana do Castelo".
 * Na dúvida, vazio: um título com o nome da rua seria pior do que sem cidade.
 */
export const cidadeDaMorada = morada => {
  const partes = String(morada || '')
    .split(',')
    .map(p => p.trim())
    .filter(Boolean);
  if (partes.length && /^portugal$/i.test(partes[partes.length - 1])) partes.pop();
  if (partes.length < 2) return partes.length === 1 && !/\d/.test(partes[0]) ? partes[0] : '';
  const ultima = partes[partes.length - 1].replace(/\b\d{4}-\d{3}\b/, '').trim();
  return ultima && !/\d/.test(ultima) ? ultima : '';
};

/**
 * O nome da categoria mais específica do anúncio (ex.: "Salas de Reunião" em
 * vez de "Trabalho & Reuniões"), a partir da configuração de categorias.
 */
export const rotuloCategoria = (publicData, categoryConfiguration) => {
  const prefixo = categoryConfiguration?.key || 'categoryLevel';
  let nivel = categoryConfiguration?.categories || [];
  let rotulo = '';
  for (let i = 1; i <= 4; i++) {
    const id = publicData?.[`${prefixo}${i}`];
    const cat = id ? nivel.find(c => c.id === id) : null;
    if (!cat) break;
    rotulo = cat.name || rotulo;
    nivel = cat.subcategories || [];
  }
  return rotulo;
};

const UNIDADE = {
  pt: { hour: '/hora', day: '/dia', night: '/noite' },
  en: { hour: '/hour', day: '/day', night: '/night' },
};

/**
 * Os valores das variáveis para um anúncio.
 *
 * @param {Object} listing entidade do Sharetribe
 * @param {Object} opcoes
 * @param {string} opcoes.lingua 'pt' | 'en'
 * @param {string} [opcoes.categoria] rótulo já traduzido da categoria
 * @param {string} [opcoes.precoFormatado] preço já formatado (ex.: "500,00 €")
 */
export const dadosDoAnuncio = (listing, { lingua = 'pt', categoria, precoFormatado } = {}) => {
  const a = listing?.attributes || {};
  const pd = a.publicData || {};
  const unidade = UNIDADE[lingua === 'en' ? 'en' : 'pt'][pd.unitType] || '';
  const preco = precoFormatado ? `${limpar(precoFormatado).replace(/[,.]00(?=\D|$)/, '')}${unidade}` : '';
  const capacidade = Number(pd.numero_pessoas) > 0 ? String(pd.numero_pessoas) : '';
  return {
    titulo: limpar(a.title),
    cidade: cidadeDaMorada(pd.location?.address),
    categoria: limpar(categoria),
    capacidade,
    preco,
    descricao: limpar(a.description),
  };
};

const TOKEN = /\{(\w+)\}/g;

const substituir = (texto, dados) => texto.replace(TOKEN, (_, nome) => limpar(dados[nome]));

const arrumar = s =>
  s
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/([,.;:])\1+/g, '$1')
    .trim();

/**
 * Aplica um modelo a um anúncio.
 *
 * @param {string} modelo
 * @param {Object} dados saída de dadosDoAnuncio
 * @param {Object} [opcoes]
 * @param {boolean} [opcoes.semOpcionais] tira todos os blocos [ … ]
 */
export const aplicarModelo = (modelo, dados, { semOpcionais = false } = {}) => {
  const comBlocos = String(modelo || '').replace(/\[([^\[\]]*)\]/g, (_, bloco) => {
    if (semOpcionais) return '';
    const nomes = [...bloco.matchAll(TOKEN)].map(m => m[1]);
    return nomes.every(n => limpar(dados[n])) ? bloco : '';
  });
  return arrumar(substituir(comBlocos, dados));
};

export const tituloDoModelo = (modelo, dados) => {
  const completo = aplicarModelo(modelo, dados);
  if (completo.length <= LIMITES_SEO.tituloMax) return completo;
  const curto = aplicarModelo(modelo, dados, { semOpcionais: true });
  return curto || completo;
};

export const descricaoDoModelo = (modelo, dados) =>
  cortarParaGoogle(aplicarModelo(modelo, dados), LIMITES_SEO.descricaoMax);

export const paginaModeloAnuncios = () =>
  PAGINAS_SEO.find(p => p.path === CAMINHO_MODELO_ANUNCIOS) || null;

/**
 * O título, a descrição e os textos de partilha de um anúncio, com o modelo
 * em vigor (o gravado no painel ou o sugerido).
 */
export const seoDoAnuncio = ({
  listing,
  lingua,
  paginasGravadas,
  categoryConfiguration,
  precoFormatado,
}) => {
  const pagina = paginaModeloAnuncios();
  if (!pagina || !listing?.attributes?.title) return null;
  const modelo = valoresEmVigor(pagina, paginasGravadas?.[pagina.path], lingua);
  const categoria = rotuloCategoria(listing.attributes.publicData, categoryConfiguration);
  const dados = dadosDoAnuncio(listing, { lingua, categoria, precoFormatado });
  const title = tituloDoModelo(modelo.title, dados);
  const description = descricaoDoModelo(modelo.description, dados);
  return {
    title,
    description,
    socialTitle: modelo.socialTitle ? tituloDoModelo(modelo.socialTitle, dados) : title,
    socialDescription: modelo.socialDescription
      ? descricaoDoModelo(modelo.socialDescription, dados)
      : description,
  };
};
