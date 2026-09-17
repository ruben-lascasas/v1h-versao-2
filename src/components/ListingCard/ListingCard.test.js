import React from 'react';
import '@testing-library/jest-dom';

import { getHostedConfiguration, renderWithProviders as render } from '../../util/testHelpers';
import { createUser, createListing, fakeIntl } from '../../util/testData';

import { ListingCard } from './ListingCard';

const getConfig = () => {
  const hostedConfig = getHostedConfiguration();
  return {
    ...hostedConfig,
    listingTypes: {
      listingTypes: [
        {
          id: 'free-inquiry',
          transactionProcess: {
            name: 'default-inquiry',
            alias: 'default-inquiry/release-1',
          },
          unitType: 'inquiry',
          defaultListingFields: {
            price: false,
          },
        },
      ],
    },
  };
};

describe('ListingCard', () => {
  it('matches snapshot', () => {
    // This is quite small component what comes to rendered HTML
    // For now, we rely on snapshot-testing.
    const listing = createListing('listing1', {}, { author: createUser('user1') });
    const tree = render(<ListingCard listing={listing} intl={fakeIntl} />);
    expect(tree.asFragment().firstChild).toMatchSnapshot();
  });

  it('matches snapshot without price', () => {
    const config = getConfig();
    const listing = createListing(
      'listing1',
      { publicData: { listingType: 'free-inquiry' } },
      { author: createUser('user1') }
    );
    const tree = render(<ListingCard listing={listing} intl={fakeIntl} />, { config });
    expect(tree.asFragment().firstChild).toMatchSnapshot();
  });
});

/**
 * Um anúncio fechado continua a ser buscado por id nos Vistos Recentemente e
 * nos Favoritos, e a API devolve-o na mesma. Aparecia como qualquer outro —
 * com o selo "Em destaque" que o anfitrião pagou — e só se percebia depois de
 * clicar. Um tester tropeçou exactamente nisto.
 */
describe('ListingCard de um anúncio encerrado', () => {
  const fechado = () =>
    createListing(
      'listing-fechado',
      { state: 'closed', publicData: { featured: 'true' } },
      { author: createUser('user1') }
    );

  it('diz que já não está disponível', () => {
    const { getByText } = render(<ListingCard listing={fechado()} intl={fakeIntl} />);
    expect(getByText('Já não disponível')).toBeInTheDocument();
  });

  it('não ostenta o destaque que o anúncio já não pode cumprir', () => {
    const { queryByText } = render(<ListingCard listing={fechado()} intl={fakeIntl} />);
    expect(queryByText('Em destaque')).not.toBeInTheDocument();
  });

  it('um anúncio publicado com destaque continua a mostrá-lo', () => {
    const publicado = createListing(
      'listing-vivo',
      { state: 'published', publicData: { featured: 'true' } },
      { author: createUser('user1') }
    );
    const { queryByText } = render(<ListingCard listing={publicado} intl={fakeIntl} />);
    expect(queryByText('Já não disponível')).not.toBeInTheDocument();
  });
});
