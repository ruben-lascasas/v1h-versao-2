import React, { act } from 'react';
import '@testing-library/jest-dom';

import { fakeIntl } from '../../../../util/testData';
import { renderWithProviders as render, testingLibrary } from '../../../../util/testHelpers';

import EditListingLocationForm from './EditListingLocationForm';

const { screen, userEvent, fireEvent } = testingLibrary;

const noop = () => null;

beforeAll(() => {
  // Mock window.scroll - otherwise, Jest/JSDOM will print a not-implemented error.
  window.mapboxgl = { accessToken: 'test' };
  window.mapboxSdk = () => ({
    geocoding: {
      forwardGeocode: () => ({
        send: () =>
          Promise.resolve({
            body: { features: [] },
          }),
      }),
    },
  });
});

describe('EditListingDeliveryForm', () => {
  it('Check that shipping fees can be given and submit button activates', async () => {
    const user = userEvent.setup();
    const saveActionMsg = 'Save location';
    await act(async () => {
      render(
        <EditListingLocationForm
          intl={fakeIntl}
          dispatch={noop}
          onSubmit={noop}
          saveActionMsg={saveActionMsg}
          updated={false}
          updateInProgress={false}
          disabled={false}
          ready={false}
        />
      );
    });

    // Pickup fields
    const address = 'EditListingLocationForm.address';
    expect(screen.getByText(address)).toBeInTheDocument();

    const building = 'EditListingLocationForm.building';
    expect(screen.getByText(building)).toBeInTheDocument();

    // Test that save button is disabled at first
    expect(screen.getByRole('button', { name: saveActionMsg })).toBeDisabled();

    await user.type(screen.getByTestId('location-search'), 'Erottajankatu 19, Helsinki');
    await user.type(screen.getByRole('textbox', { name: building }), 'B');
  });

  // Regression: the submit button stays disabled until a place is resolved, and
  // without `closeOnBlur` the field's onBlur never fired — so `meta.touched`
  // stayed false and ValidationError rendered nothing. The step looked frozen
  // with no explanation. Leaving the field must now explain the block.
  it('explains why the step is blocked when no address is selected', async () => {
    const user = userEvent.setup();
    const saveActionMsg = 'Save location';
    await act(async () => {
      render(
        <EditListingLocationForm
          intl={fakeIntl}
          dispatch={noop}
          onSubmit={noop}
          saveActionMsg={saveActionMsg}
          updated={false}
          updateInProgress={false}
          disabled={false}
          ready={false}
        />
      );
    });

    const locationInput = screen.getByTestId('location-search');
    await user.type(locationInput, 'Rua Augusta 100, Lisboa');
    // Blur without picking a suggestion — the geocoder mock returns none.
    await act(async () => {
      fireEvent.blur(locationInput);
    });

    expect(screen.getByRole('button', { name: saveActionMsg })).toBeDisabled();
    // The field-level error is now reachable, because the field is touched.
    expect(
      screen.getByText('EditListingLocationForm.addressNotRecognized')
    ).toBeInTheDocument();
    // And the button says why it is disabled.
    expect(
      screen.getByText('EditListingLocationForm.selectAddressHint')
    ).toBeInTheDocument();
  });
});
