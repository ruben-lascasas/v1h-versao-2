import fs from 'fs';
import path from 'path';

/**
 * OS CAMPOS QUE O CARTÃO PRECISA TÊM DE SER PEDIDOS
 *
 * A Sharetribe devolve só os campos pedidos em `fields.listing`. O que não
 * estiver na lista não chega ao browser — e não dá erro nenhum: o campo vem
 * simplesmente `undefined`, e quem o lê assume que o anúncio não o tem.
 *
 * Foi o que aconteceu com `publicData.precos`. O cartão passou a saber dizer
 * "ou 45,00 € por hora" para um espaço que se aluga das duas maneiras, com
 * teste próprio a prová-lo — e na pesquisa não aparecia nada, porque os preços
 * nunca saíam do servidor. O teste do cartão passava; a funcionalidade estava
 * morta.
 *
 * Este teste lê os ficheiros e exige que cada sítio que monta cartões peça os
 * campos de que eles dependem.
 */

const ler = rel => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');

const FONTES = [
  ['pesquisa', '../containers/SearchPage/SearchPage.duck.js'],
  ['recomendações', './recommendations.duck.js'],
];

// Campos de publicData que o ListingCard lê para decidir o que mostrar.
const NECESSARIOS = [
  'publicData.listingType',
  'publicData.unitType',
  'publicData.transactionProcessAlias',
  'publicData.precos',
];

describe('fields.listing das consultas que alimentam cartões', () => {
  FONTES.forEach(([nome, rel]) => {
    const codigo = ler(rel);
    NECESSARIOS.forEach(campo => {
      it(`${nome} pede ${campo}`, () => {
        expect(codigo).toContain(`'${campo}'`);
      });
    });
  });
});
