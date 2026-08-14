/**
 * Gera src/styles/flagIcons.css com apenas as bandeiras que o projecto usa.
 *
 * Porquê, em vez de importar `flag-icons/css/flag-icons.min.css`:
 *
 * O build do servidor externaliza o CSS que vem do node_modules — em vez de o
 * processar, deixa um `require()` para o Node executar em tempo de execução. O
 * Node tenta então interpretar CSS como JavaScript e rebenta com
 * "Unexpected token '.'". Era esse o erro 500 da página /contact.
 *
 * Passá-lo por `@import` dentro de um CSS nosso também não serve: o
 * postcss-import cola o conteúdo em src/styles, e os `url(../flags/…)` passam a
 * apontar para um sítio que não existe.
 *
 * Usamos 25 das 271 bandeiras do pacote, que pesa 4,8 MB. Gerar só as nossas,
 * com o SVG embutido, resolve o problema pela raiz e leva menos ficheiros.
 *
 * Correr com:  node scripts/gerarBandeiras.js
 * Voltar a correr sempre que se acrescentar um país a LanguagesField ou às
 * listas de prefixos telefónicos.
 */

const fs = require('fs');
const path = require('path');

const RAIZ = path.resolve(__dirname, '..');
const PACOTE = path.join(RAIZ, 'node_modules', 'flag-icons', 'flags');
const DESTINO = path.join(RAIZ, 'src', 'styles', 'flagIcons.css');

// Onde os códigos de país aparecem. Se acrescentar um sítio novo, junte-o aqui.
const FONTES = [
  'src/components/LanguagesField/LanguagesField.js',
  'src/containers/ContactPage/ContactPage.js',
  'src/containers/ContactDetailsPage/ContactDetailsForm/ContactDetailsForm.js',
  'src/containers/ProfilePage/ProfilePage.js',
];

const codigos = new Set();
for (const rel of FONTES) {
  const f = path.join(RAIZ, rel);
  if (!fs.existsSync(f)) continue;
  const s = fs.readFileSync(f, 'utf8');
  // `code` nas listas de prefixos telefónicos é o país. Em LanguagesField,
  // `code` é o idioma e o país está em `country` — apanhar só um dos dois
  // deixava de fora a bandeira do Reino Unido (inglês) e trazia 'en', 'ja' e
  // 'zh', que não são países e não existem no pacote.
  for (const m of s.matchAll(/\bcountry:\s*'([a-z]{2}(?:-[a-z]{2,3})?)'/g)) codigos.add(m[1]);
  const semLanguages = s.replace(/export const LANGUAGES = \[[\s\S]*?\n\];/, '');
  for (const m of semLanguages.matchAll(/\bcode:\s*'([a-z]{2}(?:-[a-z]{2,3})?)'/g)) codigos.add(m[1]);
}

const ordenados = [...codigos].sort();
if (ordenados.length === 0) {
  console.error('Nenhum código de país encontrado — o gerador não vai escrever um ficheiro vazio.');
  process.exit(1);
}

const emFalta = [];
const blocos = [];
let bytes = 0;

for (const code of ordenados) {
  const svg = path.join(PACOTE, '4x3', `${code}.svg`);
  if (!fs.existsSync(svg)) {
    emFalta.push(code);
    continue;
  }
  const dados = fs.readFileSync(svg);
  bytes += dados.length;
  const uri = `data:image/svg+xml;base64,${dados.toString('base64')}`;
  blocos.push(`.fi-${code}{background-image:url("${uri}")}`);
}

const cabecalho = `/* GERADO POR scripts/gerarBandeiras.js — NÃO EDITAR À MÃO.
 *
 * Contém apenas as ${blocos.length} bandeiras que o projecto usa, das 271 do
 * pacote flag-icons. O SVG vai embutido, por isso não há caminhos relativos
 * para se partirem quando o CSS é processado.
 *
 * Para acrescentar países: junte-os ao componente e volte a correr o gerador.
 */

.fi {
  background-size: contain;
  background-position: 50%;
  background-repeat: no-repeat;
  position: relative;
  display: inline-block;
  width: 1.333333em;
  line-height: 1em;
}
.fi:before { content: ' '; }
.fi.fis { width: 1em; }

`;

fs.writeFileSync(DESTINO, cabecalho + blocos.join('\n') + '\n', 'utf8');

console.log(`bandeiras encontradas : ${ordenados.length}`);
console.log(`escritas              : ${blocos.length}`);
if (emFalta.length) console.log(`sem ficheiro no pacote: ${emFalta.join(', ')}`);
console.log(`SVG embutido          : ${(bytes / 1024).toFixed(0)} KB`);
console.log(`ficheiro final        : ${(fs.statSync(DESTINO).size / 1024).toFixed(0)} KB`);
console.log(`códigos               : ${ordenados.join(' ')}`);
