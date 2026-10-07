/**
 * Põe nos anúncios que já existem o campo `usos`.
 *
 * PORQUE É PRECISO
 *
 * A pesquisa passa a filtrar por `usos` em vez de `categoryLevel`. Um anúncio
 * sem esse campo continua a aparecer — o código trata disso, lendo a categoria
 * principal quando `usos` falta — mas só até alguém o editar e gravar. Mais
 * vale pô-lo em todos de uma vez, e ficar com uma verdade só.
 *
 * O que escreve: `usos = [categoria principal]`. Os usos extra são do
 * anfitrião: quem decide que o salão também serve para workshops é ele, não
 * este script.
 *
 * Correr:
 *   node scripts/preencherUsos.js            (só mostra o que faria)
 *   node scripts/preencherUsos.js --aplicar  (grava)
 */

require('dotenv').config();

const { getIntegrationSdk } = require('../server/api-util/sdk');
// A mesma tabela que o browser usa (src/util/categorias.js): dois ids da
// árvore passam dos 32 caracteres que a Sharetribe aceita numa opção, e na
// Console ficaram encurtados.
const ALIAS = require('../src/config/usosAlias.json');

const idDeUso = id => ALIAS[id] || id;

const aplicar = process.argv.includes('--aplicar');

(async () => {
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.error('Integration SDK não configurado.');
    process.exit(1);
  }

  console.log(aplicar ? 'MODO: a gravar' : 'MODO: apenas simulação (use --aplicar para gravar)');
  console.log();

  const anuncios = [];
  for (let page = 1; page <= 20; page++) {
    const res = await sdk.listings.query({ page, perPage: 100 });
    const batch = res?.data?.data || [];
    anuncios.push(...batch);
    if (page >= (res?.data?.meta?.totalPages || 1) || batch.length === 0) break;
  }

  let jaTinham = 0;
  let semCategoria = 0;
  let tratados = 0;

  for (const l of anuncios) {
    const pd = l.attributes.publicData || {};
    const titulo = (l.attributes.title || '(sem título)').slice(0, 32);

    if (Array.isArray(pd.usos) && pd.usos.length > 0) {
      jaTinham++;
      continue;
    }
    // Um rascunho a meio pode ainda não ter categoria. Não há nada a escrever,
    // e inventar uma seria pior do que deixar vazio.
    if (!pd.categoryLevel2) {
      semCategoria++;
      console.log(`  ${titulo.padEnd(34)} sem categoria — deixado como está (${l.attributes.state})`);
      continue;
    }

    const uso = idDeUso(pd.categoryLevel2);
    const nota = uso !== pd.categoryLevel2 ? `  (id encurtado, era ${pd.categoryLevel2})` : '';
    console.log(`  ${titulo.padEnd(34)} usos: [${uso}]${nota}`);
    tratados++;

    if (aplicar) {
      await sdk.listings.update({
        id: l.id.uuid,
        publicData: { usos: [uso] },
      });
    }
  }

  console.log();
  console.log(
    `  ${anuncios.length} anúncios · ${jaTinham} já tinham · ${semCategoria} sem categoria · ` +
      `${tratados} ${aplicar ? 'preenchidos' : 'por preencher'}.`
  );
  if (!aplicar && tratados > 0) {
    console.log('  Correr outra vez com --aplicar para gravar.');
  }
})().catch(e => {
  console.error('ERRO:', e?.data?.errors || e?.message || e);
  process.exit(1);
});
