import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useHistory } from 'react-router-dom';
import loadable from '@loadable/component';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../util/reactIntl';
import {
  displayDeliveryPickup,
  displayDeliveryShipping,
  displayPrice,
} from '../../util/configHelpers';
import {
  propTypes,
  AVAILABILITY_MULTIPLE_SEATS,
  LISTING_STATE_CLOSED,
  LINE_ITEM_NIGHT,
  LINE_ITEM_DAY,
  LINE_ITEM_HOUR,
  LINE_ITEM_FIXED,
  LINE_ITEM_ITEM,
  STOCK_MULTIPLE_ITEMS,
  STOCK_INFINITE_MULTIPLE_ITEMS,
  LISTING_STATE_PUBLISHED,
} from '../../util/types';
import { formatMoney } from '../../util/currency';
import { createSlug, parse, stringify } from '../../util/urlHelpers';
import { userDisplayNameAsString } from '../../util/data';
import {
  OFFER,
  REQUEST,
  getSupportedProcessesInfo,
  isBookingProcess,
  isNegotiationProcess,
  isInquiryProcess,
  isPurchaseProcess,
  resolveLatestProcessName,
} from '../../transactions/transaction';

import { ModalInMobile, PrimaryButton, AvatarSmall, AvatarMedium, H1, H2, NamedLink } from '../../components';
import TranslateButton from '../TranslateButton/TranslateButton';
import PriceVariantPicker from './PriceVariantPicker/PriceVariantPicker';
import SubmitFinePrint from './SubmitFinePrint/SubmitFinePrint';
import BookingModeToggle from './BookingModeToggle/BookingModeToggle';
import MultipleBookingsManager from './MultipleBookingsManager/MultipleBookingsManager';

import css from './OrderPanel.module.css';

const BookingTimeForm = loadable(() =>
  import(/* webpackChunkName: "BookingTimeForm" */ './BookingTimeForm/BookingTimeForm')
);
const BookingDatesForm = loadable(() =>
  import(/* webpackChunkName: "BookingDatesForm" */ './BookingDatesForm/BookingDatesForm')
);
const BookingFixedDurationForm = loadable(() =>
  import(
    /* webpackChunkName: "BookingFixedDurationForm" */ './BookingFixedDurationForm/BookingFixedDurationForm'
  )
);
const InquiryWithoutPaymentForm = loadable(() =>
  import(
    /* webpackChunkName: "InquiryWithoutPaymentForm" */ './InquiryWithoutPaymentForm/InquiryWithoutPaymentForm'
  )
);
const ProductOrderForm = loadable(() =>
  import(/* webpackChunkName: "ProductOrderForm" */ './ProductOrderForm/ProductOrderForm')
);

const NegotiationForm = loadable(() =>
  import(/* webpackChunkName: "NegotiationForm" */ './NegotiationForm/NegotiationForm')
);

const NegotiationRequestQuoteForm = loadable(() =>
  import(
    /* webpackChunkName: "NegotiationRequestQuoteForm" */ './NegotiationRequestQuoteForm/NegotiationRequestQuoteForm'
  )
);

// This defines when ModalInMobile shows content as Modal.
// Set to 0 so OrderPanel always renders inline on every viewport.
const MODAL_BREAKPOINT = 0;
const TODAY = new Date();
const ORDER_PANEL_SUBMIT_BUTTON_ID = 'orderPanelSubmitButton';

const isPublishedListing = listing => {
  return listing.attributes.state === LISTING_STATE_PUBLISHED;
};

const priceData = (price, currency, intl) => {
  if (price && price.currency === currency) {
    const formattedPrice = formatMoney(intl, price);
    return { formattedPrice, priceTitle: formattedPrice };
  } else if (price) {
    return {
      formattedPrice: `(${price.currency})`,
      priceTitle: `Unsupported currency (${price.currency})`,
    };
  }
  return {};
};

const getCheapestPriceVariant = (priceVariants = []) => {
  return priceVariants.reduce((cheapest, current) => {
    return current.priceInSubunits < cheapest.priceInSubunits ? current : cheapest;
  }, priceVariants[0]);
};

const formatMoneyIfSupportedCurrency = (price, intl) => {
  try {
    return formatMoney(intl, price);
  } catch (e) {
    return `(${price.currency})`;
  }
};

const openOrderModal = (isOwnListing, isClosed, history, location) => {
  if (isOwnListing || isClosed) {
    window.scrollTo(0, 0);
  } else {
    const { pathname, search, state } = location;
    const searchString = `?${stringify({ ...parse(search), orderOpen: true })}`;
    history.push(`${pathname}${searchString}`, state);
  }
};

const closeOrderModal = (history, location) => {
  const { pathname, search, state } = location;
  const { orderOpen, ...searchParams } = parse(search);
  const searchString = `?${stringify(searchParams)}`;
  history.push(`${pathname}${searchString}`, state);
};

const handleSubmit = (isOwnListing, isClosed, isDirectSubmit, onSubmit, history, location) => {
  // TODO: currently, inquiry-process does not have any form to ask more order data.
  // We can submit without opening any inquiry/order modal.
  return isDirectSubmit
    ? () => onSubmit({})
    : () => openOrderModal(isOwnListing, isClosed, history, location);
};

const dateFormattingOptions = { day: '2-digit', month: '2-digit', year: 'numeric' };

const PriceMaybe = props => {
  const {
    price,
    publicData,
    validListingTypes,
    intl,
    marketplaceCurrency,
    showCurrencyMismatch = false,
  } = props;
  const { listingType, unitType } = publicData || {};

  const foundListingTypeConfig = validListingTypes.find(conf => conf.listingType === listingType);
  const showPrice = displayPrice(foundListingTypeConfig);
  const isPriceVariationsInUse = !!publicData?.priceVariationsEnabled;
  const hasMultiplePriceVariants = publicData?.priceVariants?.length > 1;

  if (!showPrice || !price || (isPriceVariationsInUse && hasMultiplePriceVariants)) {
    return null;
  }

  // Get formatted price or currency code if the currency does not match with marketplace currency
  const { formattedPrice, priceTitle } = priceData(price, marketplaceCurrency, intl);
  const priceValue = (
    <span className={css.priceValue}>{formatMoneyIfSupportedCurrency(price, intl)}</span>
  );
  const pricePerUnit = (
    <span className={css.perUnit}>
      <FormattedMessage id="OrderPanel.perUnit" values={{ unitType }} />
    </span>
  );

  // TODO: In CTA, we don't have space to show proper error message for a mismatch of marketplace currency
  //       Instead, we show the currency code in place of the price
  return showCurrencyMismatch ? (
    <div className={css.priceContainerInCTA}>
      <div className={css.priceValueInCTA} title={priceTitle}>
        <FormattedMessage
          id="OrderPanel.priceInMobileCTA"
          values={{ priceValue: formattedPrice }}
        />
      </div>
      <div className={css.perUnitInCTA}>
        <FormattedMessage id="OrderPanel.perUnit" values={{ unitType }} />
      </div>
    </div>
  ) : (
    <div className={css.priceContainer}>
      <p className={css.price}>
        <FormattedMessage id="OrderPanel.price" values={{ priceValue, pricePerUnit }} />
      </p>
    </div>
  );
};

const PriceMissing = () => {
  return (
    <p className={css.error}>
      <FormattedMessage id="OrderPanel.listingPriceMissing" />
    </p>
  );
};
const InvalidCurrency = () => {
  return (
    <p className={css.error}>
      <FormattedMessage id="OrderPanel.listingCurrencyInvalid" />
    </p>
  );
};

const InvalidPriceVariants = () => {
  return (
    <p className={css.error}>
      <FormattedMessage id="OrderPanel.listingPriceVariantsAreInvalid" />
    </p>
  );
};

const hasUniqueVariants = priceVariants => {
  const priceVariantsSlugs = priceVariants?.map(variant =>
    variant.name ? createSlug(variant.name) : 'no-name'
  );
  return new Set(priceVariantsSlugs).size === priceVariants.length;
};

const hasValidPriceVariants = priceVariants => {
  const isArray = Array.isArray(priceVariants);
  const hasItems = isArray && priceVariants.length > 0;
  const variantsHaveNames = hasItems && priceVariants.every(variant => variant.name);
  const namesAreUnique = hasItems && hasUniqueVariants(priceVariants);

  return variantsHaveNames && namesAreUnique;
};

/**
 * @typedef {Object} ListingTypeConfig
 * @property {string} listingType - The type of the listing
 * @property {string} transactionType - The type of the transaction
 * @property {string} transactionType.process - The process descriptionof the transaction
 * @property {string} transactionType.alias - The alias of the transaction process
 * @property {string} transactionType.unitType - The unit type of the transaction
 */

/**
 * OrderPanel is a component that renders a panel for making bookings, purchases, or inquiries for a listing.
 * It handles different transaction processes and displays appropriate forms based on the listing type.
 *
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overwrites the default class for the root element
 * @param {string} [props.className] - Custom class that extends
 * @param {string} [props.titleClassName] - Custom class name for the title
 * @param {propTypes.listing} props.listing - The listing data (either regular or own listing)
 * @param {Array<ListingTypeConfig>} props.validListingTypes - Array of valid listing type configurations
 * @param {boolean} [props.isOwnListing=false] - Whether the listing belongs to the current user
 * @param {listingType.user|listingType.currentUser} props.author - The listing author's user data
 * @param {ReactNode} [props.authorLink] - Custom component for rendering the author link
 * @param {ReactNode} [props.payoutDetailsWarning] - Warning message about payout details
 * @param {Function} props.onSubmit - Handler for form submission
 * @param {ReactNode|string} props.title - Title of the panel
 * @param {ReactNode} [props.titleDesktop] - Alternative title for desktop view
 * @param {ReactNode|string} [props.subTitle] - Subtitle text
 * @param {Function} props.onManageDisableScrolling - Handler for managing scroll behavior
 * @param {Function} props.onFetchTimeSlots - Handler for fetching available time slots
 * @param {Object} [props.monthlyTimeSlots] - Available time slots by month
 * @param {Function} props.onFetchTransactionLineItems - Handler for fetching transaction line items
 * @param {Function} [props.onContactUser] - Handler for contacting the listing author
 * @param {Array} [props.lineItems] - Array of line items for the transaction
 * @param {boolean} props.fetchLineItemsInProgress - Whether line items are being fetched
 * @param {Object} [props.fetchLineItemsError] - Error object if line items fetch failed
 * @param {string} props.marketplaceCurrency - The currency used in the marketplace
 * @param {number} props.dayCountAvailableForBooking - Number of days available for booking
 * @param {string} props.marketplaceName - Name of the marketplace
 *
 * @returns {JSX.Element} Component that displays the order panel with appropriate form
 */
const DescriptionSection = ({ description, intl, css }) => {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const [translated, setTranslated] = useState(null);
  const textRef = useRef(null);
  const shownDescription = translated || description;

  useEffect(() => {
    if (!textRef.current) return;

    const measure = () => {
      const el = textRef.current;
      if (!el) return;
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    };

    measure();

    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }

    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(textRef.current);
    }

    window.addEventListener('resize', measure);

    return () => {
      window.removeEventListener('resize', measure);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [description, expanded]);

  return (
    <div className={css.descriptionSection}>
      <p className={css.descriptionHeading}>
        {intl.formatMessage({ id: 'ListingPage.descriptionTitle' })}
      </p>
      <div className={css.descriptionBox}>
        <p
          ref={textRef}
          className={expanded ? css.descriptionText : `${css.descriptionText} ${css.descriptionTextClamped}`}
        >
          {shownDescription}
        </p>
        <div className={css.descriptionActions}>
          <TranslateButton
            text={description}
            isShowingOriginal={!translated}
            onResult={setTranslated}
          />
          {(isClamped || expanded) && (
            <button
              type="button"
              className={css.descriptionToggle}
              onClick={() => setExpanded(prev => !prev)}
            >
              {expanded
                ? intl.formatMessage({ id: 'OrderPanel.descriptionSeeLess' })
                : intl.formatMessage({ id: 'OrderPanel.descriptionSeeMore' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

const OrderPanel = props => {
  const [mounted, setMounted] = useState(false);
  // Booking mode: 'single' (existing flow) or 'multiple'.
  const [bookingMode, setBookingMode] = useState('single');
  const [isHighlighted, setIsHighlighted] = useState(false);
  const panelRef = useRef(null);
  const intl = useIntl();
  const location = useLocation();
  const history = useHistory();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const params = parse(location.search);
    if (params.highlight === 'booking') {
      setIsHighlighted(true);
      panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const timer = setTimeout(() => setIsHighlighted(false), 3500);
      return () => clearTimeout(timer);
    }
  }, []);
  const {
    rootClassName,
    className,
    titleClassName,
    listing,
    validListingTypes,
    lineItemUnitType: lineItemUnitTypeMaybe,
    isOwnListing,
    onSubmit,
    title,
    titleDesktop,
    author,
    authorLink,
    onManageDisableScrolling,
    onFetchTimeSlots,
    monthlyTimeSlots,
    timeSlotsForDate,
    onFetchTransactionLineItems,
    onContactUser,
    lineItems,
    marketplaceCurrency,
    dayCountAvailableForBooking,
    marketplaceName,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    payoutDetailsWarning,
    showListingImage,
    editParams,
    amenityChips = [],
    detailItems = [],
    description = null,
    afterDescription = null,
  } = props;

  const publicData = listing?.attributes?.publicData || {};
  const { listingType, unitType, transactionProcessAlias = '', priceVariants, startTimeInterval } =
    publicData || {};

  const processName = resolveLatestProcessName(transactionProcessAlias.split('/')[0]);
  const lineItemUnitType = lineItemUnitTypeMaybe || `line-item/${unitType}`;

  const price = listing?.attributes?.price;
  const isInquiry = isInquiryProcess(processName);
  const isBooking = isBookingProcess(processName);
  const isPurchase = isPurchaseProcess(processName);
  const isNegotiation = isNegotiationProcess(processName);
  const isPaymentProcess = isBooking || isPurchase || isNegotiation;

  const showPriceMissing = isPaymentProcess && !isNegotiation && !price;
  const showInvalidCurrency =
    isPaymentProcess && !isNegotiation && price?.currency !== marketplaceCurrency;

  const timeZone = listing?.attributes?.availabilityPlan?.timezone;
  const isClosed = listing?.attributes?.state === LISTING_STATE_CLOSED;

  const shouldHaveFixedBookingDuration = isBooking && [LINE_ITEM_FIXED].includes(lineItemUnitType);
  const showBookingFixedDurationForm =
    mounted && shouldHaveFixedBookingDuration && !isClosed && timeZone && priceVariants?.length > 0;

  const shouldHaveBookingTime = isBooking && [LINE_ITEM_HOUR].includes(lineItemUnitType);
  const showBookingTimeForm = mounted && shouldHaveBookingTime && !isClosed && timeZone;

  const shouldHaveBookingDates =
    isBooking && [LINE_ITEM_DAY, LINE_ITEM_NIGHT].includes(lineItemUnitType);
  const showBookingDatesForm = mounted && shouldHaveBookingDates && !isClosed && timeZone;

  // The listing resource has a relationship: `currentStock`,
  // which you should include when making API calls.
  const shouldHavePurchase = isPurchase && lineItemUnitType === LINE_ITEM_ITEM;
  const currentStock = listing.currentStock?.attributes?.quantity;
  const isOutOfStock = shouldHavePurchase && !isClosed && currentStock === 0;

  // Show form only when stock is fully loaded. This avoids "Out of stock" UI by
  // default before all data has been downloaded.
  const showProductOrderForm =
    mounted && shouldHavePurchase && !isClosed && typeof currentStock === 'number';

  const showInquiryForm = mounted && !isClosed && isInquiry;
  // if listing is a request, we show the negotiation form (reverse negotiation). User (provider) needs to make an offer first.
  const showNegotiationForm = mounted && !isClosed && isNegotiation && unitType === REQUEST;
  // if listing is an offer, we show the "request a quote" form as user needs to ask for a quote first from the provider.
  const showRequestQuoteForm = mounted && !isClosed && isNegotiation && unitType === OFFER;

  const supportedProcessesInfo = getSupportedProcessesInfo();
  const isKnownProcess = supportedProcessesInfo.map(info => info.name).includes(processName);

  const { pickupEnabled, shippingEnabled } = listing?.attributes?.publicData || {};

  const listingTypeConfig = validListingTypes.find(conf => conf.listingType === listingType);
  const displayShipping = displayDeliveryShipping(listingTypeConfig);
  const displayPickup = displayDeliveryPickup(listingTypeConfig);
  const allowOrdersOfMultipleItems = [STOCK_MULTIPLE_ITEMS, STOCK_INFINITE_MULTIPLE_ITEMS].includes(
    listingTypeConfig?.stockType
  );

  const searchParams = parse(location.search);
  const isOrderOpen = !!searchParams.orderOpen;
  const preselectedPriceVariantSlug = searchParams.bookableOption;

  // Shared budget URL params — pre-fill the booking form when present
  const urlBookingStart = searchParams.bookingStart;
  const urlBookingEnd = searchParams.bookingEnd;
  const urlSeats = searchParams.seats ? Number(searchParams.seats) : null;

  const seatsEnabled = [AVAILABILITY_MULTIPLE_SEATS].includes(listingTypeConfig?.availabilityType);

  // Note: publicData contains priceVariationsEnabled if listing is created with priceVariations enabled.
  const isPriceVariationsInUse = !!publicData?.priceVariationsEnabled;
  const preselectedPriceVariant =
    Array.isArray(priceVariants) && preselectedPriceVariantSlug && isPriceVariationsInUse
      ? priceVariants.find(pv => pv?.name && createSlug(pv?.name) === preselectedPriceVariantSlug)
      : null;

  // Build initialValues from shared budget URL. We include priceVariantName so it
  // isn't lost when external initialValues override the form's internal defaults.
  const sharedBudgetInitialValues =
    urlBookingStart && urlBookingEnd
      ? {
          bookingStartTime: String(new Date(urlBookingStart).getTime()),
          bookingEndTime: String(new Date(urlBookingEnd).getTime()),
          bookingStartDate: new Date(urlBookingStart),
          bookingDates: {
            startDate: new Date(urlBookingStart),
            endDate: new Date(urlBookingEnd),
          },
          ...(urlSeats && urlSeats > 1 ? { seats: urlSeats } : {}),
          ...(preselectedPriceVariant?.name ? { priceVariantName: preselectedPriceVariant.name } : {}),
        }
      : null;

  const priceVariantsMaybe = isPriceVariationsInUse
    ? {
        isPriceVariationsInUse,
        priceVariants,
        priceVariantFieldComponent: PriceVariantPicker,
        preselectedPriceVariant,
        isPublishedListing: isPublishedListing(listing),
      }
    : !isPriceVariationsInUse && showBookingFixedDurationForm
    ? {
        isPriceVariationsInUse: false,
        priceVariants: [getCheapestPriceVariant(priceVariants)],
        priceVariantFieldComponent: PriceVariantPicker,
      }
    : {};

  const showInvalidPriceVariantsMessage =
    isPriceVariationsInUse && !hasValidPriceVariants(priceVariants);

  const listingTitle = listing?.attributes?.title || '';

  const sharedProps = {
    lineItemUnitType,
    onSubmit,
    price,
    marketplaceCurrency,
    listingId: listing.id,
    listingTitle,
    isOwnListing,
    marketplaceName,
    onFetchTransactionLineItems,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    payoutDetailsWarning,
    onContactUser,
  };

  const showClosedListingHelpText = listing.id && isClosed;

  const subTitleText = showClosedListingHelpText
    ? intl.formatMessage({ id: 'OrderPanel.subTitleClosedListing' })
    : null;

  const authorDisplayName = userDisplayNameAsString(author, '');

  const classes = classNames(rootClassName || css.root, className);
  const titleClasses = classNames(titleClassName || css.orderTitle);

  return (
    <div className={classes} ref={panelRef}>
      <ModalInMobile
        containerClassName={css.modalContainer}
        id="OrderFormInModal"
        isModalOpenOnMobile={isOrderOpen}
        onClose={() => {
          closeOrderModal(history, location);
          document.getElementById(ORDER_PANEL_SUBMIT_BUTTON_ID)?.focus();
        }}
        showAsModalMaxWidth={MODAL_BREAKPOINT}
        onManageDisableScrolling={onManageDisableScrolling}
        usePortal
      >
        <div className={css.modalHeading}>
          <H1 className={css.heading}>{title}</H1>
        </div>

        {showListingImage && (
          <div className={css.orderHeading}>
            {titleDesktop ? titleDesktop : <H2 className={titleClasses}>{title}</H2>}
            {subTitleText ? <div className={css.orderHelp}>{subTitleText}</div> : null}
          </div>
        )}

        <PriceMaybe
          price={price}
          publicData={publicData}
          validListingTypes={validListingTypes}
          intl={intl}
          marketplaceCurrency={marketplaceCurrency}
        />

        {amenityChips.length > 0 && (
          <div className={css.amenitySection}>
            <p className={css.amenityHeading}>
              {intl.formatMessage({ id: 'OrderPanel.amenitiesHeading' })}
            </p>
            <div className={css.amenityChips}>
              {amenityChips.map(chip => (
                <span key={chip} className={css.amenityChip}>{chip}</span>
              ))}
            </div>
          </div>
        )}

        {detailItems.length > 0 && (
          <div className={css.detailSection}>
            <p className={css.detailHeading}>
              {intl.formatMessage({ id: 'OrderPanel.detailsHeading' })}
            </p>
            <ul className={css.detailList}>
              {detailItems.map(item => (
                <li key={item.key} className={css.detailRow}>
                  <span className={css.detailLabel}>{item.label}:</span>
                  <span className={css.detailValue}>{item.value}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {description && (
          <DescriptionSection description={description} intl={intl} css={css} />
        )}

        {afterDescription}

        {isOwnListing ? (
          <>
            <NamedLink
              name="EditListingPage"
              params={editParams}
              className={css.editListingButton}
            >
              <FormattedMessage id="OrderPanel.editListingButton" />
            </NamedLink>
            <SubmitFinePrint isOwnListing={true} />
          </>
        ) : showPriceMissing ? (
          <PriceMissing />
        ) : showInvalidCurrency ? (
          <InvalidCurrency />
        ) : showInvalidPriceVariantsMessage ? (
          <InvalidPriceVariants />
        ) : showBookingFixedDurationForm || showBookingTimeForm || showBookingDatesForm ? (
          <div className={isHighlighted ? css.highlighted : null}>
            <BookingModeToggle mode={bookingMode} onChange={setBookingMode} />
            {bookingMode === 'multiple' ? (
              <MultipleBookingsManager
                timeZone={timeZone}
                isHourly={showBookingTimeForm || showBookingFixedDurationForm}
                monthlyTimeSlots={monthlyTimeSlots}
                onFetchTimeSlots={onFetchTimeSlots}
                dayCountAvailableForBooking={dayCountAvailableForBooking}
                listingId={listing.id}
                price={price}
                marketplaceCurrency={marketplaceCurrency}
                lineItemUnitType={lineItemUnitType}
                intl={intl}
                onSubmitSlot={onSubmit}
                onContactUser={onContactUser}
              />
            ) : showBookingFixedDurationForm ? (
              <BookingFixedDurationForm
                seatsEnabled={seatsEnabled}
                className={css.bookingForm}
                formId="OrderPanelBookingFixedDurationForm"
                dayCountAvailableForBooking={dayCountAvailableForBooking}
                monthlyTimeSlots={monthlyTimeSlots}
                timeSlotsForDate={timeSlotsForDate}
                onFetchTimeSlots={onFetchTimeSlots}
                startDatePlaceholder={intl.formatDate(TODAY, dateFormattingOptions)}
                startTimeInterval={startTimeInterval}
                timeZone={timeZone}
                finePrintComponent={SubmitFinePrint}
                {...priceVariantsMaybe}
                {...sharedProps}
              />
            ) : showBookingTimeForm ? (
              <BookingTimeForm
                seatsEnabled={seatsEnabled}
                className={css.bookingForm}
                formId="OrderPanelBookingTimeForm"
                dayCountAvailableForBooking={dayCountAvailableForBooking}
                monthlyTimeSlots={monthlyTimeSlots}
                timeSlotsForDate={timeSlotsForDate}
                onFetchTimeSlots={onFetchTimeSlots}
                startDatePlaceholder={intl.formatDate(TODAY, dateFormattingOptions)}
                endDatePlaceholder={intl.formatDate(TODAY, dateFormattingOptions)}
                timeZone={timeZone}
                finePrintComponent={SubmitFinePrint}
                {...(sharedBudgetInitialValues ? { initialValues: sharedBudgetInitialValues } : {})}
                {...priceVariantsMaybe}
                {...sharedProps}
              />
            ) : (
              <BookingDatesForm
                seatsEnabled={seatsEnabled}
                className={css.bookingForm}
                formId="OrderPanelBookingDatesForm"
                dayCountAvailableForBooking={dayCountAvailableForBooking}
                monthlyTimeSlots={monthlyTimeSlots}
                onFetchTimeSlots={onFetchTimeSlots}
                timeZone={timeZone}
                finePrintComponent={SubmitFinePrint}
                {...(sharedBudgetInitialValues ? { initialValues: sharedBudgetInitialValues } : {})}
                {...priceVariantsMaybe}
                {...sharedProps}
              />
            )}
          </div>
        ) : showProductOrderForm ? (
          <ProductOrderForm
            formId="OrderPanelProductOrderForm"
            currentStock={currentStock}
            allowOrdersOfMultipleItems={allowOrdersOfMultipleItems}
            pickupEnabled={pickupEnabled && displayPickup}
            shippingEnabled={shippingEnabled && displayShipping}
            displayDeliveryMethod={displayPickup || displayShipping}
            onContactUser={onContactUser}
            {...sharedProps}
          />
        ) : showInquiryForm ? (
          <InquiryWithoutPaymentForm
            formId="OrderPanelInquiryForm"
            onSubmit={onSubmit}
            finePrintComponent={SubmitFinePrint}
            isOwnListing={isOwnListing}
          />
        ) : showNegotiationForm ? (
          <NegotiationForm
            formId="OrderPanelNegotiationForm"
            onSubmit={onSubmit}
            finePrintComponent={SubmitFinePrint}
            payoutDetailsWarning={payoutDetailsWarning}
            isOwnListing={isOwnListing}
          />
        ) : showRequestQuoteForm ? (
          <NegotiationRequestQuoteForm
            formId="OrderPanelRequestQuoteForm"
            onSubmit={onSubmit}
            finePrintComponent={SubmitFinePrint}
            payoutDetailsWarning={payoutDetailsWarning}
            isOwnListing={isOwnListing}
          />
        ) : !isKnownProcess ? (
          <p className={css.errorSidebar}>
            <FormattedMessage id="OrderPanel.unknownTransactionProcess" />
          </p>
        ) : null}
      </ModalInMobile>
      <div className={css.openOrderForm}>
        <PriceMaybe
          price={price}
          publicData={publicData}
          validListingTypes={validListingTypes}
          intl={intl}
          marketplaceCurrency={marketplaceCurrency}
          showCurrencyMismatch
        />

        {!isOwnListing && !isClosed && onContactUser ? (
          <button
            type="button"
            className={css.mobileContactButton}
            onClick={() => onContactUser()}
          >
            <FormattedMessage id="OrderPanel.contactCta" defaultMessage="Enviar mensagem" />
          </button>
        ) : null}

        {isOwnListing ? (
          <NamedLink
            name="EditListingPage"
            params={editParams}
            className={css.editListingButton}
          >
            <FormattedMessage id="OrderPanel.editListingButton" />
          </NamedLink>
        ) : isClosed ? (
          <div className={css.closedListingButton}>
            <FormattedMessage id="OrderPanel.closedListingButtonText" />
          </div>
        ) : (
          <PrimaryButton
            id={ORDER_PANEL_SUBMIT_BUTTON_ID}
            onClick={handleSubmit(
              isOwnListing,
              isClosed,
              showInquiryForm || showNegotiationForm,
              onSubmit,
              history,
              location
            )}
            disabled={isOutOfStock}
          >
            {isBooking ? (
              <FormattedMessage id="OrderPanel.ctaButtonMessageBooking" />
            ) : isOutOfStock ? (
              <FormattedMessage id="OrderPanel.ctaButtonMessageNoStock" />
            ) : isPurchase ? (
              <FormattedMessage id="OrderPanel.ctaButtonMessagePurchase" />
            ) : showNegotiationForm ? (
              <FormattedMessage id="OrderPanel.ctaButtonMessageMakeOffer" />
            ) : showRequestQuoteForm ? (
              <FormattedMessage id="OrderPanel.ctaButtonMessageRequestAQuote" />
            ) : (
              <FormattedMessage id="OrderPanel.ctaButtonMessageInquiry" />
            )}
          </PrimaryButton>
        )}
      </div>
    </div>
  );
};

export default OrderPanel;
