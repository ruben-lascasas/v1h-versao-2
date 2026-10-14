import '@testing-library/jest-dom';

import { types as sdkTypes } from './sdkLoader';
import { fakeIntl } from './testData';

import { segundoPrecoMensagem } from './segundoPreco';

const { Money } = sdkTypes;

const anuncio = (publicData, price = new Money(12000, 'EUR')) => ({
  attributes: { price, publicData },
});

// `fakeIntl` devolve o id em vez da frase traduzida. O que interessa verificar
// é o que lhe é entregue — é aí que um erro de preço estaria.
const intlQueRegista = () => {
  const chamadas = [];
  return [
    {
      ...fakeIntl,
      formatMessage: (d, v) => {
        chamadas.push({ id: d.id, values: v });
        return fakeIntl.formatMessage(d, v);
      },
    },
    chamadas,
  ];
};

/**
 * A MESMA FRASE EM DOIS SÍTIOS
 *
 * Esta linha aparece no cartão da pesquisa e no cabeçalho da página do
 * anúncio. Estava calculada duas vezes; passou a estar aqui, uma só. Estes
 * testes são o que garante que continua a dizer o mesmo nos dois sítios.
 */
describe('segundoPrecoMensagem', () => {
  it('anuncia o preço à hora num espaço que também se aluga ao dia', () => {
    const [intl, chamadas] = intlQueRegista();

    const frase = segundoPrecoMensagem(
      anuncio({ unitType: 'day', precos: { day: 12000, hour: 3000 } }),
      intl
    );

    expect(frase).toBeTruthy();
    const c = chamadas.find(x => x.id === 'ListingCard.tambemAoOutroModo');
    expect(c.values.modo).toBe('hour');
    expect(c.values.preco).toContain('30');
  });

  it('e o preço ao dia, num anúncio que se vende à hora', () => {
    const [intl, chamadas] = intlQueRegista();

    segundoPrecoMensagem(anuncio({ unitType: 'hour', precos: { day: 12000, hour: 3000 } }), intl);

    const c = chamadas.find(x => x.id === 'ListingCard.tambemAoOutroModo');
    expect(c.values.modo).toBe('day');
    expect(c.values.preco).toContain('120');
  });

  it('num anúncio de um modo só, não inventa uma segunda linha', () => {
    expect(segundoPrecoMensagem(anuncio({ unitType: 'day' }), fakeIntl)).toBeNull();
  });

  /**
   * Isto é o que separa "não tem preço à hora" de "tem, mas está a zero". Um
   * anúncio com `precos` guarda o modo que não vende a null — anunciá-lo seria
   * prometer um aluguer que não existe, ou pior, a 0,00 €.
   */
  it('um modo guardado a null não se anuncia', () => {
    expect(
      segundoPrecoMensagem(
        anuncio({ unitType: 'day', precos: { day: 12000, hour: null } }),
        fakeIntl
      )
    ).toBeNull();
  });

  /**
   * O preço nunca sai de `attributes.price`: esse só conhece o modo principal.
   * Se saísse, um espaço de 120 €/dia anunciaria "ou 120,00 € por hora".
   */
  it('não usa o preço principal para o outro modo', () => {
    const [intl, chamadas] = intlQueRegista();

    segundoPrecoMensagem(anuncio({ unitType: 'day', precos: { day: 12000, hour: 3000 } }), intl);

    const c = chamadas.find(x => x.id === 'ListingCard.tambemAoOutroModo');
    expect(c.values.preco).not.toContain('120');
  });

  it('aguenta um anúncio sem preço nenhum', () => {
    expect(
      segundoPrecoMensagem({ attributes: { publicData: { unitType: 'day' } } }, fakeIntl)
    ).toBeNull();
    expect(segundoPrecoMensagem(null, fakeIntl)).toBeNull();
  });
});
