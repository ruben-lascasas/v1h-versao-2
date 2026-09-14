/**
 * Converte os documentos jurídicos (.docx) em módulos JS que o site renderiza.
 *
 * PORQUÊ ESTE SCRIPT EXISTE
 *
 * São 38 documentos, 1,19 milhões de caracteres, ~660 páginas A4. Transcrevê-los
 * à mão para JSX seria trabalho de semanas e, pior, cada correção do jurista
 * obrigava a repetir o trabalho. Assim, o .docx continua a ser o original: muda-se
 * lá, corre-se isto, e o site acompanha.
 *
 * COMO CORRER
 *
 *   node scripts/converterJuridicos.js "C:/caminho/para/DOCUMENTOS JURIDICOS"
 *
 * Os .docx NÃO entram no repositório — são o original de trabalho do jurídico e
 * vivem fora. O que se commita é o resultado desta conversão.
 *
 * SEM DEPENDÊNCIAS
 *
 * Um .docx é um ZIP com XML lá dentro. O projeto não tem biblioteca de zip, e
 * acrescentar uma para uma ferramenta que corre de vez em quando não se
 * justifica: o `zlib` do Node descomprime, e o WordprocessingML que o Word gera
 * é suficientemente regular para ser lido com um scanner próprio. Não é um
 * parser de XML para uso geral — é um leitor do que o Word escreve.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ─── Leitura do .docx (ZIP) ──────────────────────────────────────────────────

/**
 * Extrai um ficheiro de dentro de um ZIP.
 *
 * Lê o End of Central Directory, percorre as entradas e descomprime a que
 * interessa. Só suporta "stored" (0) e "deflate" (8), que são os dois métodos
 * que o Word usa.
 */
const lerDoZip = (buffer, nomeProcurado) => {
  // O EOCD tem assinatura 0x06054b50 e está no fim, possivelmente com comentário
  // a seguir — daí procurar-se de trás para a frente.
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0 && i > buffer.length - 65558; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('não parece um ficheiro .docx (ZIP sem EOCD)');

  const totalEntradas = buffer.readUInt16LE(eocd + 10);
  let ptr = buffer.readUInt32LE(eocd + 16);

  for (let n = 0; n < totalEntradas; n++) {
    if (buffer.readUInt32LE(ptr) !== 0x02014b50) throw new Error('entrada de ZIP inválida');
    const metodo = buffer.readUInt16LE(ptr + 10);
    const tamComprimido = buffer.readUInt32LE(ptr + 20);
    const tamNome = buffer.readUInt16LE(ptr + 28);
    const tamExtra = buffer.readUInt16LE(ptr + 30);
    const tamComentario = buffer.readUInt16LE(ptr + 32);
    const offsetLocal = buffer.readUInt32LE(ptr + 42);
    const nome = buffer.toString('utf8', ptr + 46, ptr + 46 + tamNome);

    if (nome === nomeProcurado) {
      // O cabeçalho local repete nome e extra, e os tamanhos podem diferir do
      // que está no directory — por isso lêem-se outra vez aqui.
      const nomeLocal = buffer.readUInt16LE(offsetLocal + 26);
      const extraLocal = buffer.readUInt16LE(offsetLocal + 28);
      const inicio = offsetLocal + 30 + nomeLocal + extraLocal;
      const dados = buffer.subarray(inicio, inicio + tamComprimido);
      return metodo === 0 ? dados : zlib.inflateRawSync(dados);
    }
    ptr += 46 + tamNome + tamExtra + tamComentario;
  }
  throw new Error(`${nomeProcurado} não encontrado dentro do .docx`);
};

// ─── XML ─────────────────────────────────────────────────────────────────────

const ENTIDADES = {
  '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};
const desescapar = s =>
  s.replace(/&(amp|lt|gt|quot|apos);/g, m => ENTIDADES[m]).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));

/** Todos os blocos de topo do corpo, pela ordem em que aparecem. */
const blocosDoCorpo = xml => {
  const corpo = xml.slice(xml.indexOf('<w:body>'), xml.lastIndexOf('</w:body>'));
  const blocos = [];
  const re = /<w:(p|tbl)(?:\s[^>]*)?(\/)?>/g;
  let m;
  while ((m = re.exec(corpo)) !== null) {
    const tag = m[1];
    if (m[2]) continue; // <w:p/> vazio
    const fecho = `</w:${tag}>`;
    // Procura o fecho correspondente, saltando aninhamentos do mesmo nome
    // (tabelas dentro de tabelas, parágrafos dentro de células).
    let i = re.lastIndex;
    let profundidade = 1;
    const abertura = new RegExp(`<w:${tag}(?:\\s[^>]*)?>|</w:${tag}>`, 'g');
    abertura.lastIndex = i;
    let mm;
    while (profundidade > 0 && (mm = abertura.exec(corpo)) !== null) {
      profundidade += mm[0] === fecho ? -1 : 1;
      i = abertura.lastIndex;
    }
    blocos.push({ tag, xml: corpo.slice(m.index, i) });
    re.lastIndex = i;
  }
  return blocos;
};

/** Mapa rId → URL, para os hiperligações. */
const lerRelacoes = xml => {
  const mapa = {};
  const re = /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"[^>]*>/g;
  let m;
  while ((m = re.exec(xml)) !== null) mapa[m[1]] = desescapar(m[2]);
  return mapa;
};

/**
 * Partes de texto de um parágrafo, preservando negrito e hiperligações.
 *
 * Devolve uma string quando o parágrafo é texto corrido sem formatação — que é
 * a esmagadora maioria — e um array de partes quando há alguma coisa a marcar.
 * Isto poupa bastante peso nos 38 ficheiros gerados.
 */
const partesDoParagrafo = (xmlP, relacoes) => {
  const partes = [];
  // Corre os runs pela ordem do documento, sabendo se cada um está dentro de
  // uma hiperligação.
  const re = /<w:hyperlink\b([^>]*)>([\s\S]*?)<\/w:hyperlink>|<w:r\b(?:\s[^>]*)?>([\s\S]*?)<\/w:r>/g;
  let m;
  while ((m = re.exec(xmlP)) !== null) {
    if (m[1] !== undefined) {
      const id = /r:id="([^"]+)"/.exec(m[1]);
      const href = id ? relacoes[id[1]] : null;
      const dentro = partesDoParagrafo(m[2], relacoes);
      const texto = typeof dentro === 'string' ? dentro : dentro.map(p => p.t).join('');
      if (texto) partes.push(href ? { t: texto, href } : { t: texto });
    } else {
      const run = m[3];
      const props = /<w:rPr>([\s\S]*?)<\/w:rPr>/.exec(run);
      const negrito = props ? /<w:b\/>|<w:b\s[^>]*\/>|<w:b>/.test(props[1]) : false;
      let texto = '';
      // ATENÇÃO aos atributos. O Word escreve `<w:br w:type="textWrapping"/>`,
      // não `<w:br/>`. Um padrão que só apanhasse a forma pura colava as linhas
      // umas às outras — era assim que "Versão: 1.0" e "Data de entrada em
      // vigor:" apareciam na mesma palavra.
      const reT = /<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\b[^>]*\/?>|<w:br\b[^>]*\/?>/g;
      let mt;
      while ((mt = reT.exec(run)) !== null) {
        if (mt[1] !== undefined) texto += desescapar(mt[1]);
        else if (mt[0].startsWith('<w:br')) texto += '\n';
        else texto += ' ';
      }
      if (texto) partes.push(negrito ? { t: texto, b: true } : { t: texto });
    }
  }

  // Junta partes contíguas com a mesma formatação, para não gerar dezenas de
  // fragmentos por causa da forma como o Word parte os runs.
  const juntas = [];
  for (const p of partes) {
    const ult = juntas[juntas.length - 1];
    if (ult && !!ult.b === !!p.b && ult.href === p.href) ult.t += p.t;
    else juntas.push({ ...p });
  }

  if (juntas.length === 0) return '';
  if (juntas.length === 1 && !juntas[0].b && !juntas[0].href) return juntas[0].t;
  return juntas;
};

const textoSimples = partes => (typeof partes === 'string' ? partes : partes.map(p => p.t).join(''));

// ─── Conversão de um documento ───────────────────────────────────────────────

const NIVEIS = { Heading1: 'h2', Heading2: 'h3', Heading3: 'h4', Ttulo1: 'h2', Ttulo2: 'h3', Ttulo3: 'h4' };

const converterTabela = (xmlTbl, relacoes) => {
  const linhas = [];
  const reTr = /<w:tr\b(?:\s[^>]*)?>([\s\S]*?)<\/w:tr>/g;
  let mr;
  while ((mr = reTr.exec(xmlTbl)) !== null) {
    const celulas = [];
    const reTc = /<w:tc\b(?:\s[^>]*)?>([\s\S]*?)<\/w:tc>/g;
    let mc;
    while ((mc = reTc.exec(mr[1])) !== null) {
      const paras = mc[1].match(/<w:p\b(?:\s[^>]*)?>[\s\S]*?<\/w:p>/g) || [];
      celulas.push(paras.map(p => textoSimples(partesDoParagrafo(p, relacoes))).join(' ').trim());
    }
    if (celulas.length) linhas.push(celulas);
  }
  return linhas;
};

const converterDocumento = buffer => {
  const xml = lerDoZip(buffer, 'word/document.xml').toString('utf8');
  let relacoes = {};
  try {
    relacoes = lerRelacoes(lerDoZip(buffer, 'word/_rels/document.xml.rels').toString('utf8'));
  } catch (e) {
    // Um documento sem hiperligações não traz ficheiro de relações. Não é erro.
  }

  const blocos = [];
  let listaAberta = null;

  const fecharLista = () => {
    if (listaAberta && listaAberta.itens.length) blocos.push(listaAberta);
    listaAberta = null;
  };

  for (const bloco of blocosDoCorpo(xml)) {
    if (bloco.tag === 'tbl') {
      fecharLista();
      const linhas = converterTabela(bloco.xml, relacoes);
      if (linhas.length) blocos.push({ tipo: 'tabela', linhas });
      continue;
    }

    const partes = partesDoParagrafo(bloco.xml, relacoes);
    if (!textoSimples(partes).trim()) continue;

    const estilo = /<w:pStyle w:val="([^"]+)"/.exec(bloco.xml);
    const nivel = estilo ? NIVEIS[estilo[1]] : null;
    if (nivel) {
      fecharLista();
      blocos.push({ tipo: nivel, texto: textoSimples(partes).trim() });
      continue;
    }

    const emLista = /<w:numPr>/.test(bloco.xml);
    if (emLista) {
      const ilvl = /<w:ilvl w:val="(\d+)"/.exec(bloco.xml);
      const numId = /<w:numId w:val="(\d+)"/.exec(bloco.xml);
      const chave = numId ? numId[1] : '?';
      // Uma lista nova começa quando muda o numId — é assim que o Word separa
      // listas consecutivas que pertencem a parágrafos diferentes.
      if (!listaAberta || listaAberta.chave !== chave) {
        fecharLista();
        listaAberta = { tipo: 'lista', chave, itens: [] };
      }
      listaAberta.itens.push({ n: ilvl ? +ilvl[1] : 0, c: partes });
      continue;
    }

    fecharLista();
    blocos.push({ tipo: 'p', c: partes });
  }
  fecharLista();

  return blocos;
};

// ─── Catálogo ────────────────────────────────────────────────────────────────

/**
 * Os 38 documentos, com o slug do URL e a categoria do Legal Centre.
 *
 * Escrito à mão em vez de derivado do nome do ficheiro: o slug entra em URLs
 * públicos e não pode mudar sozinho porque alguém renomeou um .docx. As
 * categorias são as que o guia interno define, mais "A plataforma" para os
 * documentos transversais que não cabem em nenhuma das outras.
 */
const CATALOGO = [
  { n: 1, slug: 'termos-de-servico', cat: 'plataforma', curto: 'Termos de Serviço' },
  { n: 2, slug: 'termos-do-cliente', cat: 'reservar', curto: 'Termos do Cliente' },
  { n: 3, slug: 'termos-do-anfitriao', cat: 'espacos', curto: 'Termos do Anfitrião' },
  // O único que não é uma política: é o modelo do contrato que se forma em cada
  // reserva, com 22 campos preenchidos com os dados reais do anfitrião, do
  // cliente e do espaço. Publicado na mesma, e marcado como modelo — mostrar a
  // quem reserva exatamente o que vai aceitar é melhor do que escondê-lo.
  { n: 4, slug: 'contrato-de-reserva', cat: 'reservar', curto: 'Contrato de Reserva', modelo: true },
  { n: 5, slug: 'termos-de-pagamento', cat: 'pagamentos', curto: 'Termos de Pagamento' },
  { n: 6, slug: 'taxas-e-comissoes', cat: 'pagamentos', curto: 'Taxas e Comissões' },
  { n: 7, slug: 'cancelamento-e-reembolso', cat: 'reservar', curto: 'Cancelamento e Reembolso' },
  { n: 8, slug: 'danos-e-caucoes', cat: 'reclamacoes', curto: 'Danos, Cauções e Reclamações' },
  { n: 9, slug: 'resolucao-de-conflitos', cat: 'reclamacoes', curto: 'Resolução de Conflitos' },
  { n: 10, slug: 'politica-de-privacidade', cat: 'privacidade', curto: 'Política de Privacidade' },
  { n: 11, slug: 'politica-de-cookies', cat: 'privacidade', curto: 'Política de Cookies' },
  { n: 12, slug: 'consentimento-de-cookies', cat: 'privacidade', curto: 'Consentimento de Cookies' },
  { n: 13, slug: 'aviso-legal', cat: 'plataforma', curto: 'Aviso Legal' },
  { n: 14, slug: 'anfitrioes-profissionais', cat: 'espacos', curto: 'Anfitriões Profissionais' },
  { n: 15, slug: 'conformidade-do-anfitriao', cat: 'espacos', curto: 'Conformidade do Anfitrião' },
  { n: 16, slug: 'politica-de-anuncios', cat: 'conteudos', curto: 'Política de Anúncios' },
  { n: 17, slug: 'politica-de-conteudos', cat: 'conteudos', curto: 'Política de Conteúdos' },
  { n: 18, slug: 'avaliacoes-e-reviews', cat: 'conteudos', curto: 'Avaliações' },
  { n: 19, slug: 'utilizacao-aceitavel', cat: 'seguranca', curto: 'Utilização Aceitável' },
  { n: 20, slug: 'propriedade-intelectual', cat: 'conteudos', curto: 'Propriedade Intelectual' },
  { n: 21, slug: 'notice-and-action', cat: 'conteudos', curto: 'Denúncia de Conteúdo Ilegal' },
  { n: 22, slug: 'suspensao-de-contas', cat: 'seguranca', curto: 'Suspensão de Contas' },
  { n: 23, slug: 'verificacao-de-identidade', cat: 'seguranca', curto: 'Verificação de Identidade' },
  { n: 24, slug: 'informacao-fiscal', cat: 'fiscalidade', curto: 'Informação Fiscal para Anfitriões' },
  { n: 25, slug: 'aviso-dac7', cat: 'fiscalidade', curto: 'Aviso DAC7' },
  { n: 26, slug: 'politica-de-faturacao', cat: 'fiscalidade', curto: 'Política de Faturação' },
  { n: 27, slug: 'termos-de-subscricao', cat: 'pagamentos', curto: 'Termos de Subscrição' },
  { n: 28, slug: 'servicos-complementares', cat: 'reservar', curto: 'Serviços Complementares' },
  { n: 29, slug: 'prestadores-e-parceiros', cat: 'espacos', curto: 'Prestadores e Parceiros' },
  { n: 30, slug: 'informacao-de-seguro', cat: 'reservar', curto: 'Informação de Seguro' },
  { n: 31, slug: 'circunstancias-extraordinarias', cat: 'reservar', curto: 'Circunstâncias Extraordinárias' },
  { n: 32, slug: 'anti-circumvention', cat: 'seguranca', curto: 'Contratação Fora da Plataforma' },
  { n: 33, slug: 'trust-and-safety', cat: 'seguranca', curto: 'Confiança e Segurança' },
  { n: 34, slug: 'acessibilidade', cat: 'plataforma', curto: 'Acessibilidade' },
  { n: 35, slug: 'transparencia-de-ranking', cat: 'plataforma', curto: 'Transparência de Ranking' },
  { n: 36, slug: 'promocoes-e-referral', cat: 'pagamentos', curto: 'Promoções e Recomendações' },
  { n: 37, slug: 'publicidade-e-destaques', cat: 'pagamentos', curto: 'Publicidade e Destaques' },
  { n: 38, slug: 'creditos-e-vouchers', cat: 'pagamentos', curto: 'Créditos e Vouchers' },
];

// ─── Correções aplicadas ao texto ────────────────────────────────────────────

/** Data de entrada em vigor, usada em todos os `[DATA]`. */
const DATA_VIGOR = process.env.DATA_VIGOR || '14-09-2026';

/**
 * Correções que se aplicam ao texto de todos os documentos.
 *
 * Ficam registadas aqui, e não feitas à mão nos ficheiros gerados, para que
 * qualquer pessoa consiga ver exatamente o que foi alterado em relação ao
 * original do jurídico — e para que a correção sobreviva à próxima conversão.
 */
const CORRECOES = [
  // Os documentos 36, 37 e 38 diziam que a plataforma é operada pela
  // "Venue1Hub OÜ"; os outros 35, incluindo o Aviso Legal, dizem "EdgeHub OÜ" —
  // com o mesmo registry code (17515912) e a mesma sede, ou seja, a mesma
  // sociedade com dois nomes. Uniformizado para EdgeHub OÜ por decisão do
  // Rúben a 2026-09-14.
  //
  // Sem `\b` no fim de propósito: em JavaScript o `\b` é definido sobre
  // [A-Za-z0-9_], por isso "Ü" não conta como letra e não há fronteira nenhuma
  // entre "OÜ" e o espaço seguinte. Com `\b` no fim, 11 ocorrências escapavam.
  { de: /\bVenue1Hub OÜ/g, para: 'EdgeHub OÜ' },
  // "Data de entrada em vigor: [DATA]" e afins. Os restantes marcadores ficam
  // como estão de propósito: são exemplos de formato (identificadores de caso)
  // ou modelos de formulário que os próprios documentos especificam.
  { de: /\[DATA\]/g, para: DATA_VIGOR },
];

/**
 * Os cookies que a plataforma usa mesmo.
 *
 * A Política de Cookies traz uma tabela-modelo com `[COOKIE]`, `[FORNECEDOR]` e
 * afins — e essa, ao contrário dos outros marcadores, é para ser preenchida com
 * dados nossos. Publicar uma política de cookies com a tabela por preencher
 * seria dizer ao visitante que não sabemos que cookies usamos.
 *
 * A lista veio do que está declarado na página de cookies antiga e do que se
 * confirma no código: `v1h_cookie_consent` em CookieConsent.js e
 * `v1h_popup_fundador_v1` em FounderPopup.js, entre outros.
 */
const TABELA_COOKIES = [
  ['Cookie / tecnologia', 'Fornecedor', 'Finalidade', 'Categoria', 'Duração'],
  ['st-authinfo, st-*', 'Sharetribe', 'Manter a sessão autenticada na Plataforma', 'Essencial', 'Sessão / até 7 dias'],
  ['v1h_cookie_consent', 'Venue1Hub', 'Guardar a escolha de cookies do visitante', 'Essencial', '1 ano'],
  ['locale', 'Venue1Hub', 'Memorizar o idioma escolhido (PT/EN)', 'Preferências', '1 ano'],
  ['locationSearchHistory', 'Venue1Hub', 'Guardar pesquisas recentes na barra de pesquisa', 'Preferências', 'Até ser limpo pelo utilizador'],
  ['v1h_popup_fundador_v1', 'Venue1Hub', 'Não repetir o aviso da campanha de fundador', 'Preferências', 'Até ser limpo pelo utilizador'],
  ['v1h_pwa_installed, v1h_pwa_install_dismissed', 'Venue1Hub', 'Estado do convite para instalar a aplicação', 'Preferências', 'Até ser limpo pelo utilizador'],
  ['recently_viewed_session', 'Venue1Hub', 'Anúncios vistos recentemente', 'Funcionalidade', 'Sessão'],
  ['following_*, favorites_*', 'Venue1Hub', 'Anfitriões seguidos e anúncios favoritos', 'Funcionalidade', 'Até ser limpo pelo utilizador'],
  ['__stripe_mid, __stripe_sid', 'Stripe', 'Processamento de pagamentos e prevenção de fraude', 'Essencial', '1 ano / 30 minutos'],
  ['mapbox.eventData, mapbox-gl', 'Mapbox', 'Mapa de pesquisa e geolocalização', 'Essencial', 'Sessão / até 1 ano'],
  ['_ga, _ga_*', 'Google Analytics', 'Estatísticas agregadas de utilização', 'Analítico', '2 anos'],
];

/** A tabela-modelo da Política de Cookies dá lugar aos cookies reais. */
const preencherTabelaCookies = blocos =>
  blocos.map(b => {
    const ehModelo =
      b.tipo === 'tabela' && b.linhas.some(l => l.some(c => /^\[(COOKIE|FORNECEDOR)\]$/.test(c)));
    return ehModelo ? { tipo: 'tabela', linhas: TABELA_COOKIES } : b;
  });

const corrigir = valor => {
  if (typeof valor === 'string') {
    return CORRECOES.reduce((s, c) => s.replace(c.de, c.para), valor);
  }
  if (Array.isArray(valor)) return valor.map(corrigir);
  if (valor && typeof valor === 'object') {
    const saida = {};
    for (const [k, v] of Object.entries(valor)) saida[k] = k === 't' || k === 'texto' ? corrigir(v) : corrigir(v);
    return saida;
  }
  return valor;
};

// ─── Escrita ─────────────────────────────────────────────────────────────────

const cabecalho = doc => `/**
 * ${doc.titulo}
 *
 * GERADO AUTOMATICAMENTE — não editar à mão.
 *
 * Original: documento jurídico n.º ${doc.numero} (.docx), fora do repositório.
 * Para alterar, mexer no .docx e correr:
 *   node scripts/converterJuridicos.js "<pasta dos documentos>"
 */
`;

const principal = () => {
  const pasta = process.argv[2];
  if (!pasta) {
    console.error('Uso: node scripts/converterJuridicos.js "<pasta com os .docx>"');
    process.exit(1);
  }

  const destino = path.join(__dirname, '..', 'src', 'containers', 'LegalPage', 'documentos');
  fs.mkdirSync(destino, { recursive: true });

  const ficheiros = fs.readdirSync(pasta).filter(f => f.endsWith('.docx') && !f.startsWith('_'));
  const porNumero = new Map();
  for (const f of ficheiros) {
    const m = /^(\d+)\./.exec(f);
    if (m) porNumero.set(+m[1], f);
  }

  const resumo = [];
  for (const entrada of CATALOGO) {
    const ficheiro = porNumero.get(entrada.n);
    if (!ficheiro) {
      console.error(`  !! documento n.º ${entrada.n} não encontrado na pasta`);
      continue;
    }
    const buffer = fs.readFileSync(path.join(pasta, ficheiro));
    let blocos = converterDocumento(buffer);

    // O primeiro h2 é o título do documento, e os parágrafos logo a seguir
    // trazem versão e datas. Saem do corpo e passam a metadados do cabeçalho da
    // página, para não aparecerem duas vezes.
    const titulo = blocos.length && blocos[0].tipo === 'h2' ? blocos[0].texto : entrada.curto;
    if (blocos.length && blocos[0].tipo === 'h2') blocos = blocos.slice(1);

    // Só nos primeiros blocos: vários documentos repetem versão e data no fim,
    // dentro de uma secção própria, e essa deve ficar onde está.
    const cabeca = blocos.slice(0, 4).map(b => (b.tipo === 'p' ? textoSimples(b.c) : '')).join('\n');
    const versao = (/Vers[ãa]o:\s*([\d.]+)/i.exec(cabeca) || [, '1.0'])[1];
    // A data do próprio documento manda. Só se usa DATA_VIGOR quando o original
    // trazia `[DATA]` por preencher — senão o cabeçalho da página dizia uma data
    // e o corpo do documento dizia outra.
    const dataNoTexto = /(?:entrada em vigor|Data de entrada em vigor):?\s*(\d{2}-\d{2}-\d{4})/i.exec(cabeca);
    const entradaEmVigor = dataNoTexto ? dataNoTexto[1] : DATA_VIGOR;

    const ehMetadado = b =>
      b.tipo === 'p' &&
      /^\s*(Vers[ãa]o|Data de entrada em vigor|Entrada em vigor|[ÚU]ltima atualiza[çc][ãa]o)\s*:/i.test(
        textoSimples(b.c)
      );
    while (blocos.length && ehMetadado(blocos[0])) blocos = blocos.slice(1);

    if (entrada.slug === 'politica-de-cookies') blocos = preencherTabelaCookies(blocos);
    blocos = corrigir(blocos);

    const doc = {
      numero: entrada.n,
      slug: entrada.slug,
      modelo: !!entrada.modelo,
      categoria: entrada.cat,
      titulo: corrigir(titulo),
      curto: entrada.curto,
      versao,
      entradaEmVigor,
      blocos,
    };

    const saida = cabecalho(doc) + `\nexport default ${JSON.stringify(doc, null, 0)};\n`;
    fs.writeFileSync(path.join(destino, `${entrada.slug}.js`), saida, 'utf8');

    // Os modelos saem também em JSON.
    //
    // O site é ESM e importa o .js; o servidor é CommonJS e precisa dos blocos
    // do modelo para preencher o contrato de cada reserva. Só os modelos, para
    // não duplicar 1,7 MB de texto que o servidor nunca vai ler.
    if (entrada.modelo) {
      fs.writeFileSync(
        path.join(destino, `${entrada.slug}.json`),
        JSON.stringify(doc, null, 0) + String.fromCharCode(10),
        'utf8'
      );
    }
    resumo.push({ ...entrada, titulo: doc.titulo, versao, entradaEmVigor, blocos: blocos.length, kb: Math.round(saida.length / 1024) });
    console.log(`  ${String(entrada.n).padStart(2)}. ${entrada.slug.padEnd(32)} ${String(blocos.length).padStart(4)} blocos  ${String(Math.round(saida.length / 1024)).padStart(3)} KB`);
  }

  // Catálogo para o Legal Centre e para o rodapé. Só metadados — nenhum texto,
  // por isso pode entrar no bundle principal sem peso.
  const catalogo = `/**
 * Catálogo dos documentos jurídicos.
 *
 * GERADO AUTOMATICAMENTE por scripts/converterJuridicos.js — não editar à mão.
 * Só metadados: o texto de cada documento vive no seu próprio módulo e só é
 * descarregado quando alguém o abre.
 */

export const LEGAL_DOCUMENTS = ${JSON.stringify(
    resumo.map(r => ({ numero: r.n, slug: r.slug, categoria: r.cat, titulo: r.titulo, curto: r.curto, versao: r.versao, entradaEmVigor: r.entradaEmVigor, modelo: !!r.modelo })),
    null,
    2
  )};

export const documentoPorSlug = slug => LEGAL_DOCUMENTS.find(d => d.slug === slug) || null;
`;
  fs.writeFileSync(path.join(__dirname, '..', 'src', 'config', 'legalDocuments.js'), catalogo, 'utf8');

  // O mesmo catálogo em JSON. O site é ESM e importa o .js; o servidor é
  // CommonJS e faz `require` a este — é preciso saber as versões em vigor para
  // registar o que cada pessoa aceitou. Um ficheiro de dados serve os dois.
  fs.writeFileSync(
    path.join(__dirname, '..', 'src', 'config', 'legalDocuments.json'),
    JSON.stringify(
      resumo.map(r => ({ numero: r.n, slug: r.slug, categoria: r.cat, titulo: r.titulo, curto: r.curto, versao: r.versao, entradaEmVigor: r.entradaEmVigor, modelo: !!r.modelo })),
      null,
      2
    ) + '\n',
    'utf8'
  );

  console.log(`\n  ${resumo.length} documentos convertidos.`);
  console.log(`  Data de entrada em vigor: ${DATA_VIGOR}`);
};

if (require.main === module) principal();

module.exports = { lerDoZip, converterDocumento, CATALOGO };
