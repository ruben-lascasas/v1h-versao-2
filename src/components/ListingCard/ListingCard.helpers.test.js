import '@testing-library/jest-dom';

import { types as sdkTypes } from '../../util/sdkLoader';
import { fakeIntl } from '../../util/testData';

import { getListingCardTranslations } from './ListingCard.helpers';

const { Money } = sdkTypes;

const CONFIG = {
  currency: 'EUR',
  listing: {
    listingTypes: [
      {
        listingType: 'daily-rental',
        transactionType: {
          process: 'default-booking',
          alias: 'default-booking/release-1',
          unitType: 'day',
        },
      },
    ],
  },
};

const anuncio = precos => ({
  attributes: {
    title: 'O Palmeiral',
    price: new Money(450000, 'EUR'),
    publicData: {
      listingType: 'daily-rental',
      unitType: 'day',
      transactionProcessAlias: 'default-booking/release-1',
      ...(precos ? { precos } : {}),
    },
  },
});

/**
 * O SEGUNDO PREÇO NA PESQUISA
 *
 * A Sharetribe indexa um preço por anúncio, por isso um espaço que se aluga à
 * hora e ao dia só anunciava um deles. Quem procurasse uma sala para duas
 * horas via "4 500,00 € por dia" e passava à frente — o anúncio existe para os
 * dois usos, mas só se apresentava para um.
 */
describe('getListingCardTranslations — o segundo preço', () => {
  it('anuncia o preço à hora quando o espaço também se aluga assim', () => {
    // `fakeIntl` devolve o id em vez da mensagem traduzida, por isso o que se
    // verifica é o valor que lhe é entregue — que é onde o erro estaria.
    const chamadas = [];
    const intl = {
      ...fakeIntl,
      formatMessage: (desc, values) => {
        chamadas.push({ id: desc.id, values });
        return fakeIntl.formatMessage(desc, values);
      },
    };

    const t = getListingCardTranslations(anuncio({ day: 450000, hour: 60000 }), CONFIG, intl);

    expect(t.segundoPrecoMessage).toBeTruthy();
    const segunda = chamadas.find(c => c.id === 'ListingCard.tambemAoOutroModo');
    expect(segunda.values.modo).toBe('hour');
    expect(segunda.values.preco).toContain('600');
  });

  it('num anúncio de um modo só, não inventa uma segunda linha', () => {
    const t = getListingCardTranslations(anuncio(), CONFIG, fakeIntl);
    expect(t.segundoPrecoMessage).toBeNull();
  });

  /**
   * O preço principal não muda. É ele que a Sharetribe indexa para o filtro e
   * é por ele que o cartão é ordenado — mexer aqui mudava preços à vista em
   * todo o catálogo.
   */
  it('não mexe no preço principal', () => {
    const comDois = getListingCardTranslations(
      anuncio({ day: 450000, hour: 60000 }),
      CONFIG,
      fakeIntl
    );
    const semDois = getListingCardTranslations(anuncio(), CONFIG, fakeIntl);
    expect(comDois.priceMessage).toEqual(semDois.priceMessage);
  });
});
