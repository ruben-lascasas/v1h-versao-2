import React from 'react';
import '@testing-library/jest-dom';

import { types as sdkTypes } from '../../../../util/sdkLoader';
import { fakeIntl } from '../../../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../../../util/testHelpers';

import EditListingPricingPanel from './EditListingPricingPanel';

const { Money } = sdkTypes;
const { screen, userEvent } = testingLibrary;

const noop = () => null;
const SemTitulo = () => null;

const TIPOS = [
  {
    listingType: 'daily-rental',
    label: 'Aluguer diário',
    transactionType: {
      process: 'default-booking',
      alias: 'default-booking/release-1',
      unitType: 'day',
    },
    priceVariations: { enabled: false },
  },
  {
    listingType: 'venda',
    label: 'Venda',
    transactionType: {
      process: 'default-purchase',
      alias: 'default-purchase/release-1',
      unitType: 'item',
    },
    priceVariations: { enabled: false },
  },
];

const anuncio = (listingType, unitType, price, precos) => ({
  id: { uuid: 'l1' },
  attributes: {
    state: 'published',
    title: 'O Palmeiral',
    price: price != null ? new Money(price, 'EUR') : null,
    publicData: { listingType, unitType, ...(precos ? { precos } : {}) },
  },
});

const montar = (listing, onSubmit = jest.fn()) => {
  render(
    <EditListingPricingPanel
      intl={fakeIntl}
      listing={listing}
      listingTypes={TIPOS}
      marketplaceCurrency="EUR"
      listingMinimumPriceSubUnits={0}
      disabled={false}
      ready={false}
      onSubmit={onSubmit}
      submitButtonText="Guardar"
      panelUpdated={false}
      updateInProgress={false}
      errors={{}}
      updatePageTitle={SemTitulo}
      onListingTypeChange={noop}
    />
  );
  return onSubmit;
};

const SEGUNDO = 'EditListingPricingForm.segundoModo.label';

describe('EditListingPricingPanel — os dois preços', () => {
  it('um aluguer diário é convidado a pôr também um preço à hora', () => {
    montar(anuncio('daily-rental', 'day', 450000));
    expect(screen.getByRole('textbox', { name: SEGUNDO })).toBeInTheDocument();
  });

  /**
   * Para uma venda isto não quer dizer nada: não há "hora" nem "dia" numa
   * compra. Oferecer o campo era convidar o anfitrião a preencher uma coisa
   * que nunca seria usada.
   */
  it('uma venda não leva segundo preço', () => {
    montar(anuncio('venda', 'item', 2500));
    expect(screen.queryByRole('textbox', { name: SEGUNDO })).not.toBeInTheDocument();
  });

  /**
   * O campo é opcional. Se bloqueasse a gravação enquanto vazio, cada
   * anfitrião que só aluga ao dia ficava preso num formulário que lhe pede uma
   * coisa que ele não vende.
   */
  it('deixa gravar com o segundo preço em branco', async () => {
    const user = userEvent.setup();
    const onSubmit = montar(anuncio('daily-rental', 'day', 450000));

    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const valores = onSubmit.mock.calls[0][0];
    expect(valores.publicData.precos).toEqual({ day: 450000, hour: null });
  });

  it('grava os dois preços em cêntimos, na chave de onde o servidor cobra', async () => {
    const user = userEvent.setup();
    const onSubmit = montar(anuncio('daily-rental', 'day', 450000));

    await user.type(screen.getByRole('textbox', { name: SEGUNDO }), '600');
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const valores = onSubmit.mock.calls[0][0];
    expect(valores.publicData.precos).toEqual({ day: 450000, hour: 60000 });
    // O preço principal continua onde sempre esteve: é o que a Sharetribe
    // indexa para o filtro e o que o cartão mostra.
    expect(valores.price.amount).toBe(450000);
  });

  it('ao reabrir, mostra o segundo preço que já estava gravado', () => {
    montar(anuncio('daily-rental', 'day', 450000, { day: 450000, hour: 60000 }));
    expect(screen.getByRole('textbox', { name: SEGUNDO })).toHaveValue('€600.00');
  });

  /**
   * APAGAR TEM DE APAGAR
   *
   * Deixar a chave de fora não a remove de publicData — a Sharetribe funde o
   * que se envia com o que lá está. O anúncio continuaria a vender um modo que
   * o anfitrião acabou de tirar, e a cobrá-lo. Por isso escreve-se `null`.
   */
  it('apagar o segundo preço tira mesmo o modo ao anúncio', async () => {
    const user = userEvent.setup();
    const onSubmit = montar(anuncio('daily-rental', 'day', 450000, { day: 450000, hour: 60000 }));

    await user.clear(screen.getByRole('textbox', { name: SEGUNDO }));
    await user.click(screen.getByRole('button', { name: 'Guardar' }));

    const valores = onSubmit.mock.calls[0][0];
    expect(valores.publicData.precos).toEqual({ day: 450000, hour: null });
  });
});
