/**
 * Um espaço serve para mais do que uma coisa.
 *
 * O PROBLEMA
 *
 * As categorias da Sharetribe são um caminho único por anúncio:
 * `categoryLevel1` → `categoryLevel2`, e acabou. Mas o mesmo salão é "sala de
 * pequenos-almoços" de manhã e "sala de workshops" à tarde, e quem procura
 * workshops nunca o encontra se o anfitrião teve de escolher uma coisa só.
 *
 * A SOLUÇÃO, E PORQUE É QUE É ASSIM
 *
 * Um campo próprio — `usos` — com as mesmas subcategorias da árvore, onde cabe
 * mais do que uma. A árvore fica como está: continua a mandar na navegação,
 * nos carrosséis, nos "espaços semelhantes" e no cabeçalho do anúncio (são 110
 * referências espalhadas por 16 ficheiros, e mexer nelas não traria nada).
 *
 * O que muda de dono é o FILTRO da pesquisa, e tinha de mudar: a API da
 * Sharetribe só sabe cruzar condições com "E", nunca com "OU". Não há forma de
 * perguntar "categoria principal = X **ou** usos contém X" — e com a verdade
 * repartida por dois campos, metade dos anúncios ficava de fora sem ninguém
 * perceber porquê, porque uma pesquisa a menos não dá erro nenhum.
 *
 * Por isso a categoria principal é escrita TAMBÉM em `usos` quando o anúncio é
 * gravado. O filtro passa a olhar só para aí, e a pergunta volta a ser uma só.
 */

/** Todas as subcategorias de um ramo. */
export const subcategoriasDe = (categories, level1Id) => {
  const ramo = (categories || []).find(c => c.id === level1Id);
  return (ramo?.subcategories || []).map(s => s.id);
};

/** O ramo a que uma subcategoria pertence. */
export const ramoDe = (categories, level2Id) =>
  (categories || []).find(c => (c.subcategories || []).some(s => s.id === level2Id))?.id || null;

/** O nome legível de uma subcategoria, para mostrar a quem lê. */
export const nomeDaSubcategoria = (categories, level2Id) => {
  for (const c of categories || []) {
    const sub = (c.subcategories || []).find(s => s.id === level2Id);
    if (sub) return sub.name;
  }
  return null;
};

/**
 * Os usos a gravar num anúncio: a categoria principal mais os usos extra.
 *
 * Sem duplicados e sem valores vazios. A ordem mantém a categoria principal à
 * frente — é a que descreve o espaço antes de tudo o resto.
 */
export const construirUsos = (categoriaPrincipal, usosExtra = []) => {
  const todos = [categoriaPrincipal, ...(usosExtra || [])].filter(Boolean);
  return [...new Set(todos)];
};

/**
 * Os usos de um anúncio, como estão guardados.
 *
 * Um anúncio criado antes deste campo existir não tem `usos` — nesse caso vale
 * a categoria principal, que é o que ele sempre disse ser. Assim a pesquisa
 * nunca deixa ninguém de fora enquanto o retro-preenchimento não correr.
 */
export const usosDoAnuncio = publicData => {
  const usos = publicData?.usos;
  if (Array.isArray(usos) && usos.length > 0) return usos;
  return [publicData?.categoryLevel2].filter(Boolean);
};

/**
 * O campo `usos` existe na configuração da Console?
 *
 * Enquanto não existir, não está indexado — e um filtro por um campo não
 * indexado NÃO dá erro: é ignorado, e a pesquisa devolve tudo. Por isso o
 * código pergunta antes de mudar de filtro, e mantém o comportamento antigo
 * até o campo estar lá. Verificado contra a API: `pub_inventado=has_any:xyz`
 * devolve o catálogo inteiro.
 */
export const campoUsosConfigurado = listingFields =>
  (listingFields || []).some(f => f.key === 'usos' && f.schemaType === 'multi-enum');

/**
 * A escolha de quem procura, traduzida para subcategorias.
 *
 * Escolher um ramo inteiro ("Eventos & Festas") é escolher todas as
 * subcategorias dele: é assim que uma pergunta só, com "qualquer um destes",
 * substitui o cruzamento de dois campos que a API não sabe fazer.
 */
export const usosParaFiltrar = (categories, level1Ids = [], level2Ids = []) => {
  const doRamo = (level1Ids || []).flatMap(id => subcategoriasDe(categories, id));
  return [...new Set([...doRamo, ...(level2Ids || [])])].filter(Boolean);
};

/** "a,b,c" → ['a','b','c'] */
export const listaDeIds = valor =>
  String(valor || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
