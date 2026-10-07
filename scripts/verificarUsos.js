/**
 * A árvore de categorias e o campo `usos` dizem a mesma coisa?
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * São duas listas mantidas em sítios diferentes da Console — a árvore em
 * "Listing categories", as opções em "Listing fields" — e nada obriga uma a
 * seguir a outra. Quem acrescentar amanhã uma subcategoria e se esquecer da
 * opção parte a pesquisa para esse ramo, e a pesquisa não se queixa: devolve
 * menos resultados, e pronto.
 *
 * Já aconteceu uma vez, de outra maneira: dois ids passavam dos 32 caracteres
 * que a Sharetribe aceita numa opção e tiveram de ser encurtados. Estão em
 * src/config/usosAlias.json, e este script confirma que continuam a bater
 * certo.
 *
 * Correr depois de mexer em categorias ou no campo:
 *   node scripts/verificarUsos.js
 */

require('dotenv').config();

const sdkLoader = require('sharetribe-flex-sdk');
const ALIAS = require('../src/config/usosAlias.json');

const idDeUso = id => ALIAS[id] || id;
const LIMITE_SHARETRIBE = 32;

(async () => {
  const sdk = sdkLoader.createInstance({
    clientId: process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID,
  });

  const res = await sdk.assetsByAlias({
    paths: ['listings/listing-categories.json', 'listings/listing-fields.json'],
    alias: 'latest',
  });
  const docs = res.data.data;
  const categorias = docs.find(d => d.attributes.data.categories)?.attributes.data.categories || [];
  const campos = docs.find(d => d.attributes.data.listingFields)?.attributes.data.listingFields || [];
  const campo = campos.find(f => f.key === 'usos');

  if (!campo) {
    console.error('✗ O campo `usos` não existe na configuração publicada.');
    console.error('  Sem ele, a pesquisa mantém o filtro antigo (uma categoria por anúncio).');
    process.exit(1);
  }

  const problemas = [];

  if (campo.schemaType !== 'multi-enum') {
    problemas.push(`o campo é "${campo.schemaType}" e tinha de ser "multi-enum"`);
  }
  if (!campo.filterConfig?.indexForSearch) {
    // Sem índice, o filtro é ignorado em silêncio e a pesquisa devolve tudo.
    problemas.push('o campo não está indexado para pesquisa');
  }

  const opcoes = (campo.enumOptions || []).map(o => o.option);
  const subcategorias = categorias.flatMap(c => (c.subcategories || []).map(s => s.id));

  const semOpcao = subcategorias.filter(id => !opcoes.includes(idDeUso(id)));
  const semCategoria = opcoes.filter(op => !subcategorias.some(id => idDeUso(id) === op));
  const longosSemAlias = subcategorias.filter(
    id => id.length > LIMITE_SHARETRIBE && idDeUso(id) === id
  );

  console.log(`árvore: ${subcategorias.length} subcategorias · campo: ${opcoes.length} opções`);
  console.log(`tabela de ids encurtados: ${Object.keys(ALIAS).length}`);
  console.log();

  if (longosSemAlias.length) {
    problemas.push(
      `ids com mais de ${LIMITE_SHARETRIBE} caracteres e sem encurtamento: ${longosSemAlias.join(', ')}`
    );
  }
  if (semOpcao.length) {
    problemas.push(`subcategorias sem opção no campo: ${semOpcao.join(', ')}`);
  }
  if (semCategoria.length) {
    problemas.push(`opções do campo que não existem na árvore: ${semCategoria.join(', ')}`);
  }

  if (problemas.length === 0) {
    console.log('✓ As duas listas batem certo. A pesquisa por categoria cobre todos os ramos.');
    return;
  }

  console.error('✗ Desalinhamento:');
  problemas.forEach(p => console.error('  · ' + p));
  console.error();
  console.error('  Enquanto assim estiver, quem procurar por esses ramos vê menos anúncios');
  console.error('  do que existem — e a pesquisa não dá erro nenhum.');
  process.exit(1);
})().catch(e => {
  console.error('ERRO:', e?.data?.errors || e?.message || e);
  process.exit(1);
});
