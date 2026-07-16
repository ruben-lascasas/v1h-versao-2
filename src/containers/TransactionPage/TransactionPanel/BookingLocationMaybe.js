import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import { Heading } from '../../../components';

import AddressLinkMaybe from './AddressLinkMaybe';

import css from './TransactionPanel.module.css';

// Functional component as a helper to build ActivityFeed section
const BookingLocationMaybe = props => {
  const { className, rootClassName, listing, showBookingLocation } = props;
  const classes = classNames(rootClassName || css.bookingLocationContainer, className);

  if (showBookingLocation) {
    const location = listing?.attributes?.publicData?.location || {};
    return (
      <div className={classes}>
        <Heading as="h3" rootClassName={css.sectionHeading}>
          <FormattedMessage id="TransactionPanel.bookingLocationHeading" />
        </Heading>
        <div className={css.bookingLocationContent}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0, marginTop: 2 }}>
            <path fill="#e53e3e" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
          </svg>
          <AddressLinkMaybe
            linkRootClassName={css.bookingLocationAddress}
            location={location}
            geolocation={listing?.attributes?.geolocation}
            showAddress={true}
          />
        </div>
      </div>
    );
  }
  return null;
};

export default BookingLocationMaybe;
