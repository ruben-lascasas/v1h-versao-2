/**
 * A análise do painel SEO, ao estilo do Yoast: comprimentos, palavra-chave
 * principal no título e na descrição, e repetições entre páginas.
 *
 * Os limites são os que o Google costuma mostrar sem cortar — cerca de 60
 * caracteres no título e 160 na descrição. São aproximações: o Google corta por
 * largura em píxeis, não por caracteres.
 */

export const LIMITES_SEO = {
  tituloMin: 30,
  tituloMax: 60,
  descricaoMin: 70,
  descricaoMax: 160,
};

/** Minúsculas e sem acentos: "Reunião" e "reuniao" contam como a mesma palavra. */
export const normalizarTexto = s =>
  String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const contem = (texto, termo) => {
  const t = normalizarTexto(termo);
  return Boolean(t) && normalizarTexto(texto).includes(t);
};

const igual = (a, b) => Boolean(normalizarTexto(a)) && normalizarTexto(a) === normalizarTexto(b);

/**
 * @param {Object} valores { focusKeyword, title, description, noIndex }
 * @param {Array<{nome: string, valores: Object}>} outras as outras páginas, na mesma língua
 * @param {Object} [opcoes]
 * @param {boolean} [opcoes.semPalavraChave] não avaliar a palavra-chave (modelos)
 * @returns {Array<{nivel: 'bom'|'aviso'|'mau', texto: string}>}
 */
export const analisarSeo = (valores, outras = [], { semPalavraChave = false } = {}) => {
  const { focusKeyword, title, description, noIndex } = valores || {};
  const titulo = String(title || '').trim();
  const descricao = String(description || '').trim();
  const chave = String(focusKeyword || '').trim();
  const r = [];
  const add = (nivel, texto) => r.push({ nivel, texto });

  if (noIndex) {
    add('mau', 'Esta página está marcada para não aparecer no Google.');
  }

  if (!titulo) {
    add('mau', 'Falta o título.');
  } else if (titulo.length < LIMITES_SEO.tituloMin) {
    add('aviso', `O título é curto (${titulo.length} caracteres). Há espaço para mais informação útil.`);
  } else if (titulo.length > LIMITES_SEO.tituloMax) {
    add('aviso', `O título tem ${titulo.length} caracteres. O Google costuma cortar a partir de ${LIMITES_SEO.tituloMax}.`);
  } else {
    add('bom', `O título tem um bom comprimento (${titulo.length} caracteres).`);
  }

  if (!descricao) {
    add('mau', 'Falta a meta description. O Google vai escolher um excerto da página.');
  } else if (descricao.length < LIMITES_SEO.descricaoMin) {
    add('aviso', `A descrição é curta (${descricao.length} caracteres).`);
  } else if (descricao.length > LIMITES_SEO.descricaoMax) {
    add('aviso', `A descrição tem ${descricao.length} caracteres. O Google costuma cortar a partir de ${LIMITES_SEO.descricaoMax}.`);
  } else {
    add('bom', `A descrição tem um bom comprimento (${descricao.length} caracteres).`);
  }

  if (semPalavraChave) {
    // Num modelo, a palavra-chave é a de cada anúncio: não há uma para verificar.
  } else if (!chave) {
    add('aviso', 'Defina uma palavra-chave principal para a análise a poder verificar.');
  } else {
    add(
      contem(titulo, chave) ? 'bom' : 'aviso',
      contem(titulo, chave)
        ? 'A palavra-chave principal aparece no título.'
        : 'A palavra-chave principal não aparece no título.'
    );
    add(
      contem(descricao, chave) ? 'bom' : 'aviso',
      contem(descricao, chave)
        ? 'A palavra-chave principal aparece na descrição.'
        : 'A palavra-chave principal não aparece na descrição.'
    );
  }

  const tituloRepetido = outras.find(o => igual(o.valores?.title, titulo));
  if (tituloRepetido) {
    add('mau', `O título é igual ao da página "${tituloRepetido.nome}". Cada página deve ter o seu.`);
  }
  const descricaoRepetida = outras.find(o => igual(o.valores?.description, descricao));
  if (descricaoRepetida) {
    add('aviso', `A descrição é igual à da página "${descricaoRepetida.nome}".`);
  }
  const chaveRepetida = chave && outras.find(o => igual(o.valores?.focusKeyword, chave));
  if (chaveRepetida) {
    add(
      'aviso',
      `A página "${chaveRepetida.nome}" usa a mesma palavra-chave principal. As duas vão competir pela mesma pesquisa.`
    );
  }

  return r;
};

/** O pior nível da análise, para o ponto colorido na lista de páginas. */
export const nivelGeral = analise =>
  analise.some(a => a.nivel === 'mau')
    ? 'mau'
    : analise.some(a => a.nivel === 'aviso')
    ? 'aviso'
    : 'bom';

/** Corta como o Google: no fim de uma palavra, com reticências. */
export const cortarParaGoogle = (texto, maximo) => {
  const t = String(texto || '').trim();
  if (t.length <= maximo) return t;
  const corte = t.slice(0, maximo);
  // Se uma frase acaba perto do limite, corta-se aí, sem reticências.
  const fimDeFrase = Math.max(corte.lastIndexOf('. '), corte.lastIndexOf('! '), corte.lastIndexOf('? '));
  if (fimDeFrase > maximo * 0.6) return corte.slice(0, fimDeFrase + 1).trim();
  const ultimoEspaco = corte.lastIndexOf(' ');
  const fim = (ultimoEspaco > maximo * 0.6 ? corte.slice(0, ultimoEspaco) : corte).trim();
  return `${fim.replace(/[,;:]$/, '')} …`;
};
