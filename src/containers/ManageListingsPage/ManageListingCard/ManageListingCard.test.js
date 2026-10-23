import React from 'react';
import '@testing-library/jest-dom';

import { types as sdkTypes } from '../../../util/sdkLoader';
import {
  getHostedConfiguration,
  renderWithProviders as render,
  testingLibrary,
} from '../../../util/testHelpers';
import { createOwnListing, createStock, fakeIntl } from '../../../util/testData';

import { ManageListingCard } from './ManageListingCard';

const { screen, waitFor } = testingLibrary;

const { Money } = sdkTypes;
const noop = () => null;

const getConfig = listingTypes => {
  const hostedConfig = getHostedConfiguration();
  return {
    ...hostedConfig,
    listingTypes: {
      listingTypes,
    },
  };
};

describe('ManageListingCard', () => {
  it('Inquiry (inquiry): no price', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      availabilityPlan: null,

      publicData: {
        listingType: 'free-inquiry',
        transactionProcessAlias: 'default-inquiry/release-1',
        unitType: 'inquiry',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });

    const config = getConfig([
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
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.priceNotSet')).not.toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.price')).not.toBeInTheDocument(); //fakeIntl
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.manageAvailability')).not.toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.manageStock')).not.toBeInTheDocument();
  });

  it('Inquiry (inquiry): with price', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      availabilityPlan: null,

      publicData: {
        listingType: 'free-inquiry',
        transactionProcessAlias: 'default-inquiry/release-1',
        unitType: 'inquiry',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });

    const config = getConfig([
      {
        id: 'free-inquiry',
        transactionProcess: {
          name: 'default-inquiry',
          alias: 'default-inquiry/release-1',
        },
        unitType: 'inquiry',
        defaultListingFields: {
          price: true,
        },
      },
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.priceNotSet')).not.toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.price')).toBeInTheDocument(); //fakeIntl
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.manageAvailability')).not.toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.manageStock')).not.toBeInTheDocument();
  });

  it('Booking (day): normal', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      availabilityPlan: {
        type: 'availability-plan/time',
        timezone: 'Etc/UTC',
        entries: [
          { dayOfWeek: 'mon', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'tue', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'wed', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'thu', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'fri', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'sat', startTime: '00:00', endTime: '00:00', seats: 1 },
          //{ dayOfWeek: 'sun', startTime: '00:00', endTime: '00:00', seats: 1 },
        ],
      },

      publicData: {
        listingType: 'rent-bicycles-daily',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'hour',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />
    );
    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument();
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
  });

  it('Booking (day): closed', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      state: 'closed',
      availabilityPlan: {
        type: 'availability-plan/time',
        timezone: 'Etc/UTC',
        entries: [
          { dayOfWeek: 'mon', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'tue', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'wed', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'thu', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'fri', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'sat', startTime: '00:00', endTime: '00:00', seats: 1 },
          //{ dayOfWeek: 'sun', startTime: '00:00', endTime: '00:00', seats: 1 },
        ],
      },

      publicData: {
        listingType: 'rent-bicycles-daily',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'hour',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />
    );
    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument();
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();

    expect(tree.getByText('ManageListingCard.closedListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.openListing')).toBeInTheDocument();
  });

  it('Booking (day): pendingApproval', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      state: 'pendingApproval',
      availabilityPlan: {
        type: 'availability-plan/time',
        timezone: 'Etc/UTC',
        entries: [
          { dayOfWeek: 'mon', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'tue', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'wed', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'thu', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'fri', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'sat', startTime: '00:00', endTime: '00:00', seats: 1 },
          //{ dayOfWeek: 'sun', startTime: '00:00', endTime: '00:00', seats: 1 },
        ],
      },

      publicData: {
        listingType: 'rent-bicycles-daily',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'hour',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />
    );
    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument();
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();

    expect(tree.getByText('ManageListingCard.pendingApproval')).toBeInTheDocument();
  });

  it('Booking (day): draft', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      state: 'draft',
      availabilityPlan: {
        type: 'availability-plan/time',
        timezone: 'Etc/UTC',
        entries: [
          { dayOfWeek: 'mon', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'tue', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'wed', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'thu', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'fri', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'sat', startTime: '00:00', endTime: '00:00', seats: 1 },
          //{ dayOfWeek: 'sun', startTime: '00:00', endTime: '00:00', seats: 1 },
        ],
      },

      publicData: {
        listingType: 'rent-bicycles-daily',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'hour',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.discardDraftLinkText')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument();
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();

    expect(tree.getByText('ManageListingCard.draftOverlayText')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.finishListingDraft')).toBeInTheDocument();
  });

  it('Booking (day): no price', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: null,
      availabilityPlan: {
        type: 'availability-plan/time',
        timezone: 'Etc/UTC',
        entries: [
          { dayOfWeek: 'mon', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'tue', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'wed', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'thu', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'fri', startTime: '00:00', endTime: '00:00', seats: 1 },
          { dayOfWeek: 'sat', startTime: '00:00', endTime: '00:00', seats: 1 },
          //{ dayOfWeek: 'sun', startTime: '00:00', endTime: '00:00', seats: 1 },
        ],
      },

      publicData: {
        listingType: 'rent-bicycles-daily',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'hour',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />
    );
    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.priceNotSet')).toBeInTheDocument();
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
  });

  it('Purchase (item): normal', () => {
    const listing = createOwnListing(
      'listing-day',
      {
        title: 'the listing',
        description: 'Lorem ipsum',
        price: new Money(1000, 'USD'),
        availabilityPlan: null,

        publicData: {
          listingType: 'sell-bicycles-item',
          transactionProcessAlias: 'default-purchase/release-1',
          unitType: 'item',
          amenities: ['dog_1'],
          location: {
            address: 'Main Street 123',
            building: 'A 1',
          },
        },
      },
      {
        currentStock: createStock('stock-id', { quantity: 5 }),
      }
    );
    const config = getConfig([
      {
        id: 'sell-bicycles-item',
        label: 'Sell products',
        transactionProcess: {
          alias: 'default-purchase/release-1',
          name: 'default-purchase',
        },
        unitType: 'item',
        stockType: 'multipleItems',
      },
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument();
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
  });

  it('Purchase (item): normal out-of-stock', () => {
    const listing = createOwnListing(
      'listing-day',
      {
        title: 'the listing',
        description: 'Lorem ipsum',
        price: new Money(1000, 'USD'),
        availabilityPlan: null,

        publicData: {
          listingType: 'sell-bicycles-item',
          transactionProcessAlias: 'default-purchase/release-1',
          unitType: 'item',
          amenities: ['dog_1'],
          location: {
            address: 'Main Street 123',
            building: 'A 1',
          },
        },
      },
      {
        currentStock: createStock('stock-id', { quantity: 0 }),
      }
    );

    const config = getConfig([
      {
        id: 'sell-bicycles-item',
        label: 'Sell products',
        transactionProcess: {
          alias: 'default-purchase/release-1',
          name: 'default-purchase',
        },
        unitType: 'item',
        stockType: 'multipleItems',
      },
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument(); //fakeIntl
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();

    // Out of stock
    expect(tree.getByText('ManageListingCard.outOfStockOverlayText')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.closeListingTextOr')).toBeInTheDocument();
  });

  it('Purchase (item): draft', () => {
    const listing = createOwnListing(
      'listing-day',
      {
        title: 'the listing',
        description: 'Lorem ipsum',
        price: new Money(1000, 'USD'),
        availabilityPlan: null,
        state: 'draft',
        publicData: {
          listingType: 'sell-bicycles-item',
          transactionProcessAlias: 'default-purchase/release-1',
          unitType: 'item',
          amenities: ['dog_1'],
          location: {
            address: 'Main Street 123',
            building: 'A 1',
          },
        },
      },
      {
        currentStock: createStock('stock-id', { quantity: 5 }),
      }
    );

    const config = getConfig([
      {
        id: 'sell-bicycles-item',
        label: 'Sell products',
        transactionProcess: {
          alias: 'default-purchase/release-1',
          name: 'default-purchase',
        },
        unitType: 'item',
        stockType: 'multipleItems',
      },
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.discardDraftLinkText')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument(); //fakeIntl
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();

    expect(tree.getByText('ManageListingCard.draftOverlayText')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.finishListingDraft')).toBeInTheDocument();
  });

  it('Purchase (item): no price', () => {
    const listing = createOwnListing(
      'listing-day',
      {
        title: 'the listing',
        description: 'Lorem ipsum',
        price: null,
        availabilityPlan: null,

        publicData: {
          listingType: 'sell-bicycles-item',
          transactionProcessAlias: 'default-purchase/release-1',
          unitType: 'item',
          amenities: ['dog_1'],
          location: {
            address: 'Main Street 123',
            building: 'A 1',
          },
        },
      },
      {
        currentStock: createStock('stock-id', { quantity: 5 }),
      }
    );
    const config = getConfig([
      {
        id: 'sell-bicycles-item',
        label: 'Sell products',
        transactionProcess: {
          alias: 'default-purchase/release-1',
          name: 'default-purchase',
        },
        unitType: 'item',
        stockType: 'multipleItems',
      },
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.priceNotSet')).toBeInTheDocument();
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
  });

  it('Purchase (item): no stock', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      availabilityPlan: null,

      publicData: {
        listingType: 'sell-bicycles-item',
        transactionProcessAlias: 'default-purchase/release-1',
        unitType: 'item',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });
    const config = getConfig([
      {
        id: 'sell-bicycles-item',
        label: 'Sell products',
        transactionProcess: {
          alias: 'default-purchase/release-1',
          name: 'default-purchase',
        },
        unitType: 'item',
        stockType: 'multipleItems',
      },
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument(); //fakeIntl
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
  });

  it('Purchase (item): oneItem', () => {
    const listing = createOwnListing('listing-day', {
      title: 'the listing',
      description: 'Lorem ipsum',
      price: new Money(1000, 'USD'),
      availabilityPlan: null,

      publicData: {
        listingType: 'sell-bicycles-item',
        transactionProcessAlias: 'default-purchase/release-1',
        unitType: 'item',
        amenities: ['dog_1'],
        location: {
          address: 'Main Street 123',
          building: 'A 1',
        },
      },
    });
    const config = getConfig([
      {
        id: 'sell-bicycles-item',
        label: 'Sell products',
        transactionProcess: {
          alias: 'default-purchase/release-1',
          name: 'default-purchase',
        },
        unitType: 'item',
        stockType: 'oneItem',
      },
    ]);

    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );

    expect(tree.getByText('ResponsiveImage.noImage')).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.closeListing')).toBeInTheDocument();
    expect(tree.getByText('ManageListingCard.price')).toBeInTheDocument(); //fakeIntl
    expect(tree.getByText(/the Listing/i)).toBeInTheDocument();
    expect(tree.getByLabelText('ManageListingCard.editListing')).toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.setPriceAndStock')).not.toBeInTheDocument();
  });

  it('matches snapshot (purchase)', () => {
    const config = getConfig([
      {
        id: 'sell-bicycles-item',
        label: 'Sell products',
        transactionProcess: {
          alias: 'default-purchase/release-1',
          name: 'default-purchase',
        },
        unitType: 'item',
        stockType: 'multipleItems',
      },
    ]);
    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={createOwnListing('listing1', {
          publicData: {
            listingType: 'product-selling',
            transactionProcessAlias: 'default-purchase/release-1',
          },
        })}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config }
    );
    expect(tree.asFragment().firstChild).toMatchSnapshot();
  });
});

/**
 * Fechar um anúncio era imediato: um clique no X, sem pergunta nenhuma.
 *
 * Num anúncio com destaque pago isso custa 9,99 € que não voltam — a regra é
 * que quem encerra perde o destaque, sem devolução nem crédito. Um clique
 * acidental não pode ter esse preço sem que ninguém tenha avisado.
 */
describe('confirmação antes de fechar um anúncio', () => {
  const { userEvent } = testingLibrary;

  const anuncio = (publicData = {}) =>
    createOwnListing('listing-a-fechar', {
      title: 'the listing',
      price: new Money(1000, 'EUR'),
      publicData: {
        listingType: 'rent-bicycles-daily',
        transactionProcessAlias: 'default-booking/release-1',
        unitType: 'day',
        ...publicData,
      },
    });

  const montar = (publicData = {}) => {
    const onCloseListing = jest.fn();
    const tree = render(
      <ManageListingCard
        history={{ push: noop }}
        listing={anuncio(publicData)}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={onCloseListing}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />
    );
    return { tree, onCloseListing };
  };

  it('o clique no fechar já não fecha nada: pergunta primeiro', async () => {
    const { tree, onCloseListing } = montar();

    await userEvent.click(tree.getByLabelText('ManageListingCard.closeListing'));

    expect(onCloseListing).not.toHaveBeenCalled();
    expect(tree.getByText('ManageListingCard.closeListingConfirmMessage')).toBeInTheDocument();
  });

  it('confirmar fecha', async () => {
    const { tree, onCloseListing } = montar();

    await userEvent.click(tree.getByLabelText('ManageListingCard.closeListing'));
    await userEvent.click(tree.getByText('ManageListingCard.closeListingConfirmButton'));

    expect(onCloseListing).toHaveBeenCalledTimes(1);
  });

  it('voltar atrás não fecha', async () => {
    const { tree, onCloseListing } = montar();

    await userEvent.click(tree.getByLabelText('ManageListingCard.closeListing'));
    await userEvent.click(tree.getByText('ManageListingCard.closeListingCancelButton'));

    expect(onCloseListing).not.toHaveBeenCalled();
    expect(
      tree.queryByText('ManageListingCard.closeListingConfirmMessage')
    ).not.toBeInTheDocument();
  });

  // O aviso do dinheiro só aparece a quem tem destaque pago: dizer a toda a
  // gente que vai perder dinheiro assustava sem razão.
  it('um anúncio com destaque avisa que o destaque se perde', async () => {
    const { tree } = montar({ featured: 'true' });

    await userEvent.click(tree.getByLabelText('ManageListingCard.closeListing'));

    expect(
      tree.getByText('ManageListingCard.closeListingConfirmMessageFeatured')
    ).toBeInTheDocument();
  });

  it('sem destaque, a pergunta não fala em dinheiro nenhum', async () => {
    const { tree } = montar();

    await userEvent.click(tree.getByLabelText('ManageListingCard.closeListing'));

    expect(
      tree.queryByText('ManageListingCard.closeListingConfirmMessageFeatured')
    ).not.toBeInTheDocument();
  });
});

/**
 * VISITAS DO ANÚNCIO — pedido do Rafael a 2026-10-23.
 *
 * Não se consegue ver isto no browser com qualquer conta: só aparece a quem
 * tem anúncios, e a conta com que verifiquei não tinha nenhum. Daí o teste.
 *
 * Os contadores vêm do estado (`recommendations.viewCounts`), alimentado por
 * uma só chamada a /api/listing-views. Pôr `viewCountsFetched: true` serve
 * também para o thunk sair logo e não tentar rede nenhuma no teste.
 */
describe('ManageListingCard — visitas', () => {
  const comVisitas = contadores => ({
    recommendations: { viewCounts: contadores, viewCountsFetched: true },
  });

  const cartao = (listing, initialState) =>
    render(
      <ManageListingCard
        history={{ push: noop }}
        listing={listing}
        intl={fakeIntl}
        isMenuOpen={false}
        onCloseListing={noop}
        onOpenListing={noop}
        onToggleMenu={noop}
        hasClosingError={false}
        hasOpeningError={false}
        availabilityEnabled={true}
      />,
      { config: getConfig([]), initialState }
    );

  const anuncio = () =>
    createOwnListing('listing-day', {
      title: 'the listing',
      price: new Money(1000, 'USD'),
      publicData: { listingType: 'free-inquiry', unitType: 'inquiry' },
    });

  it('mostra as visitas do anúncio', () => {
    const tree = cartao(anuncio(), comVisitas({ 'listing-day': { allTimeCount: 12 } }));

    expect(tree.getByText('ManageListingCard.visitas')).toBeInTheDocument();
  });

  it('no singular usa a chave do singular', () => {
    const tree = cartao(anuncio(), comVisitas({ 'listing-day': { allTimeCount: 1 } }));

    expect(tree.getByText('ManageListingCard.umaVisita')).toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.visitas')).not.toBeInTheDocument();
  });

  /**
   * O caso que decide o desenho: enquanto os contadores não chegaram, não se
   * mostra "0 visitas". Um zero lê-se como "ninguém viu o seu espaço", e isso
   * é a mensagem errada para quem está à espera da verificação.
   */
  it('antes de os contadores chegarem não mostra nada', () => {
    const tree = cartao(anuncio(), { recommendations: { viewCounts: {}, viewCountsFetched: true } });

    expect(tree.queryByText('ManageListingCard.visitas')).not.toBeInTheDocument();
    expect(tree.queryByText('ManageListingCard.umaVisita')).not.toBeInTheDocument();
  });

  it('um anúncio sem visitas nenhumas mostra zero, não um vazio', () => {
    const tree = cartao(anuncio(), comVisitas({ 'listing-day': { allTimeCount: 0 } }));

    expect(tree.getByText('ManageListingCard.visitas')).toBeInTheDocument();
  });
});
