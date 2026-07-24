import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { useIntl, FormattedMessage } from '../../util/reactIntl';
import { createResourceLocatorString } from '../../util/routes';
import { createSlug } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';
import { daysBetween, minutesBetween } from '../../util/dates';
import { types as sdkTypes } from '../../util/sdkLoader';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { initializeCardPaymentData } from '../../ducks/stripe.duck';
import { fetchNearbyServiceListings, selectServiceListings } from '../../ducks/serviceListings.duck';

import {
  Page,
  LayoutSingleColumn,
  IconSpinner,
  NamedRedirect,
  ResponsiveImage,
  Button,
  H1,
  H3,
} from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import { handlePageData, storeData, clearData } from '../CheckoutPage/CheckoutPageSessionHelpers';
import { CART_STORAGE_KEY } from './cartStorageKey';
import { storeCartQueue } from './cartQueueStorage';

import css from './CartPage.module.css';

const { Money } = sdkTypes;

const estimateQuantity = (unitType, bookingDates) => {
  if (!bookingDates?.bookingStart || !bookingDates?.bookingEnd) {
    return 1;
  }
  if (unitType === 'hour') {
    const minutes = minutesBetween(bookingDates.bookingStart, bookingDates.bookingEnd);
    return Math.max(1, Math.round(minutes / 60));
  }
  if (unitType === 'day' || unitType === 'night') {
    return Math.max(1, daysBetween(bookingDates.bookingStart, bookingDates.bookingEnd));
  }
  return 1;
};

// Rough, display-only estimate (price × unit count). The real, authoritative
// total for each item is computed by the API on that item's own CheckoutPage —
// this is only meant to give the customer a sense of what the cart will cost.
const estimateItemTotal = (listing, bookingDates) => {
  const price = listing?.attributes?.price;
  if (!price) return null;
  const unitType = listing?.attributes?.publicData?.unitType;
  const quantity = estimateQuantity(unitType, bookingDates);
  return new Money(price.amount * quantity, price.currency);
};

const CartServiceRow = props => {
  const { listing, checked, onToggle, bookingDates, intl } = props;
  const { title, publicData } = listing?.attributes || {};
  const authorName = listing?.author?.attributes?.profile?.displayName;
  const firstImage = listing?.images?.[0] || null;
  const total = estimateItemTotal(listing, bookingDates);
  const formattedTotal = total ? formatMoney(intl, total) : null;
  const id = listing?.id?.uuid;

  return (
    <label className={css.serviceRow} htmlFor={`cart-service-${id}`}>
      <input
        id={`cart-service-${id}`}
        type="checkbox"
        className={css.checkbox}
        checked={checked}
        onChange={() => onToggle(id)}
      />
      <div className={css.serviceImageWrapper}>
        {firstImage ? (
          <ResponsiveImage
            rootClassName={css.serviceImage}
            alt={title}
            image={firstImage}
            variants={['listing-card', 'listing-card-2x']}
            sizes="72px"
          />
        ) : (
          <div className={css.serviceImagePlaceholder} />
        )}
      </div>
      <div className={css.serviceInfo}>
        <div className={css.serviceTitle}>{title}</div>
        {authorName ? <div className={css.serviceProvider}>{authorName}</div> : null}
      </div>
      {formattedTotal ? <div className={css.servicePrice}>{formattedTotal}</div> : null}
    </label>
  );
};

const CartPage = () => {
  const config = useConfiguration();
  const routes = useRouteConfiguration();
  const intl = useIntl();
  const history = useHistory();
  const dispatch = useDispatch();

  const [pageData, setPageData] = useState(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [selectedServiceIds, setSelectedServiceIds] = useState([]);

  const scrollingDisabled = useSelector(isScrollingDisabled);

  useEffect(() => {
    const data = handlePageData({}, CART_STORAGE_KEY, history);
    setPageData(data || {});
    setIsDataLoaded(true);
  }, []);

  const listing = pageData?.listing;
  const orderData = pageData?.orderData;
  const bookingDates = orderData?.bookingDates;
  const mainListingId = listing?.id?.uuid;
  const geolocation = listing?.attributes?.geolocation;

  const nearbyServices = useSelector(state => selectServiceListings(state, mainListingId));
  const servicesFetched = useSelector(state =>
    Boolean(mainListingId && state.serviceListings?.listingsByListingId?.[mainListingId])
  );

  useEffect(() => {
    if (mainListingId && geolocation) {
      dispatch(fetchNearbyServiceListings(mainListingId, geolocation, config));
    }
  }, [mainListingId]);

  const hasRequiredData = !!(listing?.id && orderData);
  const shouldRedirectHome = isDataLoaded && !hasRequiredData;
  const shouldAutoProceed =
    isDataLoaded && hasRequiredData && servicesFetched && nearbyServices.length === 0;

  const proceedToCheckout = (checkoutListing, checkoutOrderData) => {
    dispatch(initializeCardPaymentData());
    storeData(checkoutOrderData, checkoutListing, null, 'CheckoutPage');
    history.push(
      createResourceLocatorString(
        'CheckoutPage',
        routes,
        { id: checkoutListing.id.uuid, slug: createSlug(checkoutListing.attributes.title) },
        {}
      )
    );
  };

  useEffect(() => {
    if (shouldAutoProceed) {
      clearData(CART_STORAGE_KEY);
      proceedToCheckout(listing, orderData);
    }
  }, [shouldAutoProceed]);

  const toggleService = id => {
    setSelectedServiceIds(prev =>
      prev.includes(id) ? prev.filter(existing => existing !== id) : [...prev, id]
    );
  };

  const selectedServices = nearbyServices.filter(s => selectedServiceIds.includes(s.id.uuid));

  const mainTotal = useMemo(() => estimateItemTotal(listing, bookingDates), [
    listing,
    bookingDates,
  ]);
  const serviceTotals = selectedServices.map(s => estimateItemTotal(s, bookingDates));

  const currency = mainTotal?.currency || config.currency;
  const totalAmount =
    (mainTotal?.amount || 0) + serviceTotals.reduce((sum, m) => sum + (m?.amount || 0), 0);
  const formattedTotal = formatMoney(intl, new Money(totalAmount, currency));

  const handleFinalize = () => {
    const serviceQueueItems = selectedServices.map(s => ({
      listing: s,
      orderData: bookingDates ? { bookingDates } : {},
    }));
    storeCartQueue(serviceQueueItems);
    clearData(CART_STORAGE_KEY);
    proceedToCheckout(listing, orderData);
  };

  if (shouldRedirectHome) {
    return <NamedRedirect name="LandingPage" />;
  }

  const topbar = <TopbarContainer />;

  const isLoading = !isDataLoaded || !hasRequiredData || !servicesFetched || shouldAutoProceed;

  if (isLoading) {
    return (
      <Page title={intl.formatMessage({ id: 'CartPage.title' })} scrollingDisabled={scrollingDisabled}>
        <LayoutSingleColumn topbar={topbar} footer={<FooterContainer />}>
          <div className={css.loading}>
            <IconSpinner />
          </div>
        </LayoutSingleColumn>
      </Page>
    );
  }

  const { title } = listing.attributes;
  const firstImage = listing.images?.[0] || null;
  const formattedMainPrice = mainTotal ? formatMoney(intl, mainTotal) : null;

  const bookingDatesLabel =
    bookingDates?.bookingStart && bookingDates?.bookingEnd
      ? `${intl.formatDate(bookingDates.bookingStart)} — ${intl.formatDate(
          bookingDates.bookingEnd
        )}`
      : null;

  return (
    <Page title={intl.formatMessage({ id: 'CartPage.title' })} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn topbar={topbar} footer={<FooterContainer />}>
        <div className={css.root}>
          <H1 className={css.heading}>
            <FormattedMessage id="CartPage.heading" />
          </H1>

          <div className={css.mainItem}>
            <div className={css.mainImageWrapper}>
              {firstImage ? (
                <ResponsiveImage
                  rootClassName={css.mainImage}
                  alt={title}
                  image={firstImage}
                  variants={['listing-card', 'listing-card-2x']}
                  sizes="96px"
                />
              ) : (
                <div className={css.mainImagePlaceholder} />
              )}
            </div>
            <div className={css.mainInfo}>
              <div className={css.mainTitle}>{title}</div>
              {bookingDatesLabel ? (
                <div className={css.mainDates}>{bookingDatesLabel}</div>
              ) : null}
            </div>
            {formattedMainPrice ? (
              <div className={css.mainPrice}>{formattedMainPrice}</div>
            ) : null}
          </div>

          {nearbyServices.length > 0 ? (
            <div className={css.servicesSection}>
              <H3 className={css.servicesHeading}>
                <FormattedMessage id="CartPage.servicesHeading" />
              </H3>
              <p className={css.servicesSubheading}>
                <FormattedMessage id="CartPage.servicesSubheading" />
              </p>
              <div className={css.servicesList}>
                {nearbyServices.map(s => (
                  <CartServiceRow
                    key={s.id.uuid}
                    listing={s}
                    checked={selectedServiceIds.includes(s.id.uuid)}
                    onToggle={toggleService}
                    bookingDates={bookingDates}
                    intl={intl}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className={css.totalBar}>
            <div className={css.totalLabelWrapper}>
              <span className={css.totalLabel}>
                <FormattedMessage id="CartPage.totalLabel" />
              </span>
              <span className={css.totalNote}>
                <FormattedMessage id="CartPage.totalNote" />
              </span>
            </div>
            <span className={css.totalAmount}>{formattedTotal}</span>
          </div>

          <Button className={css.finalizeButton} onClick={handleFinalize}>
            <FormattedMessage id="CartPage.finalizeButton" />
          </Button>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default CartPage;
