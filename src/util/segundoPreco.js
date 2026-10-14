import { types as sdkTypes } from './sdkLoader';
import { formatMoney } from './currency';
import { precosDoAnuncio, outroModo } from './modosDePreco';

const { Money } = sdkTypes;

/**
 * "ou 30,00 € por hora" — a linha do segundo preço.
 *
 * PORQUE É QUE ISTO VIVE SOZINHO
 *
 * Um anúncio com os dois modos tem de os anunciar aos dois, e isso aparece em
 * mais do que um sítio: no cartão da pesquisa e no cabeçalho da página do
 * anúncio. Começou por estar só no cartão; quando se acrescentou ao cabeçalho,
 * ficaram duas cópias do mesmo cálculo — e duas cópias de uma regra de preços
 * é como se descobre, meses depois, que uma delas ficou para trás.
 *
 * Aqui também se percebe porquê de não se usar `attributes.price`: esse só
 * conhece o modo principal. Os preços dos dois modos estão em
 * `publicData.precos` e é de lá que saem, sempre.
 *
 * Quem chama é que decide SE a linha faz sentido naquele sítio (um anúncio sem
 * reservas, um cartão sem preço). Esta função responde só a uma pergunta: se
 * houver outro modo com preço, como é que ele se escreve.
 *
 * @param {Object} listing o anúncio, como vem da API
 * @param {Object} intl
 * @returns {string|null} a frase pronta, ou null se não houver segundo preço
 */
export const segundoPrecoMensagem = (listing, intl) => {
  const publicData = listing?.attributes?.publicData;
  const moeda = listing?.attributes?.price?.currency;
  const outro = outroModo(publicData?.unitType);
  if (!outro || !moeda || !intl) {
    return null;
  }

  const preco = precosDoAnuncio(listing)[outro];
  if (!Number.isInteger(preco)) {
    return null;
  }

  return intl.formatMessage(
    { id: 'ListingCard.tambemAoOutroModo' },
    { preco: formatMoney(intl, new Money(preco, moeda)), modo: outro }
  );
};
