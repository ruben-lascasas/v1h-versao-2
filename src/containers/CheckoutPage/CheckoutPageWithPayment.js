import React, { useState } from 'react';
import classNames from 'classnames';

// Import contexts and util modules
import { FormattedMessage, intlShape } from '../../util/reactIntl';
import { pathByRouteName } from '../../util/routes';
import {
  isValidCurrencyForTransactionProcess,
  pickTransactionFieldsData,
} from '../../util/fieldHelpers.js';
import { propTypes } from '../../util/types';
import { ensureTransaction } from '../../util/data';
import { createSlug } from '../../util/urlHelpers';
import { isTransactionInitiateListingNotFoundError } from '../../util/errors';
import {
  getProcess,
  isBookingProcessAlias,
  resolveLatestProcessName,
  BOOKING_PROCESS_NAME,
  NEGOTIATION_PROCESS_NAME,
  PURCHASE_PROCESS_NAME,
} from '../../transactions/transaction';

// Import shared components
import { H3, H4, NamedLink, OrderBreakdown, Page } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import {
  bookingDatesMaybe,
  getBillingDetails,
  getFormattedTotalPrice,
  getShippingDetailsMaybe,
  getTransactionTypeData,
  hasDefaultPaymentMethod,
  hasPaymentExpired,
  hasTransactionPassedPendingPayment,
  processCheckoutWithPayment,
  setOrderPageInitialValues,
} from './CheckoutPageTransactionHelpers.js';
import { getErrorMessages } from './ErrorMessages';

import StripePaymentForm from './StripePaymentForm/StripePaymentForm';
import DetailsSideCard from './DetailsSideCard';
import { saveBillingDetails } from '../../ducks/user.duck';
import MobileListingImage from './MobileListingImage';
import MobileOrderBreakdown from './MobileOrderBreakdown';

import css from './CheckoutPage.module.css';

// Stripe PaymentIntent statuses, where user actions are already completed
// https://stripe.com/docs/payments/payment-intents/status
const STRIPE_PI_USER_ACTIONS_DONE_STATUSES = ['processing', 'requires_capture', 'succeeded'];

// Payment charge options
const ONETIME_PAYMENT = 'ONETIME_PAYMENT';
const PAY_AND_SAVE_FOR_LATER_USE = 'PAY_AND_SAVE_FOR_LATER_USE';
const USE_SAVED_CARD = 'USE_SAVED_CARD';

const paymentFlow = (selectedPaymentMethod, saveAfterOnetimePayment) => {
  // Payment mode could be 'replaceCard', but without explicit saveAfterOnetimePayment flag,
  // we'll handle it as one-time payment
  return selectedPaymentMethod === 'defaultCard'
    ? USE_SAVED_CARD
    : saveAfterOnetimePayment
    ? PAY_AND_SAVE_FOR_LATER_USE
    : ONETIME_PAYMENT;
};

const capitalizeString = s => `${s.charAt(0).toUpperCase()}${s.substr(1)}`;

/**
 * Prefix the properties of the chosen price variant as first level properties for the protected data of the transaction
 *
 * @example
 * const priceVariant = {
 *   name: 'something',
 * }
 *
 * will be returned as:
 * const priceVariant = {
 *   priceVariantName: 'something',
 * }
 *
 * @param {Object} priceVariant - The price variant object
 * @returns {Object} The price variant object with the properties prefixed with priceVariant*
 */
const prefixPriceVariantProperties = priceVariant => {
  if (!priceVariant) {
    return {};
  }

  const entries = Object.entries(priceVariant).map(([key, value]) => {
    return [`priceVariant${capitalizeString(key)}`, value];
  });
  return Object.fromEntries(entries);
};

/**
 * Construct orderParams object using pageData from session storage, shipping details, and optional payment params.
 * Note: This is used for both speculate transition and real transition
 *       - Speculate transition is called, when the the component is mounted. It's used to test if the data can go through the API validation
 *       - Real transition is made, when the user submits the StripePaymentForm.
 *
 * @param {Object} pageData data that's saved to session storage.
 * @param {Object} shippingDetails shipping address if applicable.
 * @param {Object} optionalPaymentParams (E.g. paymentMethod or setupPaymentMethodForSaving)
 * @param {Object} config app-wide configs. This contains hosted configs too.
 * @returns orderParams.
 */
const getOrderParams = (
  pageData,
  shippingDetails,
  optionalPaymentParams,
  config,
  transactionFieldProtectedData,
  customerDefaultMessage
) => {
  const quantity = pageData.orderData?.quantity;
  const quantityMaybe = quantity ? { quantity } : {};
  const seats = pageData.orderData?.seats;
  const seatsMaybe = seats ? { seats } : {};
  const deliveryMethod = pageData.orderData?.deliveryMethod;
  const deliveryMethodMaybe = deliveryMethod ? { deliveryMethod } : {};
  const { listingType, unitType, priceVariants } = pageData?.listing?.attributes?.publicData || {};

  // price variant data for fixed duration bookings
  const priceVariantName = pageData.orderData?.priceVariantName;
  const priceVariantNameMaybe = priceVariantName ? { priceVariantName } : {};
  const priceVariant = priceVariants?.find(pv => pv.name === priceVariantName);
  const priceVariantMaybe = priceVariant ? prefixPriceVariantProperties(priceVariant) : {};

  const customerDefaultMessageMaybe = customerDefaultMessage ? { customerDefaultMessage } : {};

  // Multi-booking — store all slots in protectedData so the transaction page
  // (customer + provider) can display the full set later.
  const multipleBookings = pageData.orderData?.multipleBookings;
  const multipleBookingsMaybe =
    multipleBookings?.additionalBookings?.length > 0
      ? { multipleBookings }
      : {};

  const protectedDataMaybe = {
    protectedData: {
      ...getTransactionTypeData(listingType, unitType, config),
      ...deliveryMethodMaybe,
      ...shippingDetails,
      ...priceVariantMaybe,
      ...transactionFieldProtectedData,
      ...customerDefaultMessageMaybe,
      ...multipleBookingsMaybe,
    },
  };

  // Note: Avoid misinterpreting the following logic as allowing arbitrary mixing of `quantity` and `seats`.
  // You can only pass either quantity OR seats and units to the orderParams object
  // Quantity represents the total booked units for the line item (e.g. days, hours).
  // When quantity is not passed, we pass seats and units.
  // If `bookingDatesMaybe` is provided, it determines `units`, and `seats` defaults to 1
  // (implying quantity = units)

  // These are the order parameters for the first payment-related transition
  // which is either initiate-transition or initiate-transition-after-enquiry
  const orderParams = {
    listingId: pageData?.listing?.id,
    ...deliveryMethodMaybe,
    ...quantityMaybe,
    ...seatsMaybe,
    ...bookingDatesMaybe(pageData.orderData?.bookingDates),
    ...priceVariantNameMaybe,
    ...protectedDataMaybe,
    ...optionalPaymentParams,
  };
  return orderParams;
};

const fetchSpeculatedTransactionIfNeeded = (orderParams, pageData, fetchSpeculatedTransaction) => {
  const tx = pageData ? pageData.transaction : null;
  const pageDataListing = pageData.listing;
  const processName =
    tx?.attributes?.processName ||
    pageDataListing?.attributes?.publicData?.transactionProcessAlias?.split('/')[0];
  const process = processName ? getProcess(processName) : null;

  // If transaction has passed payment-pending state, speculated tx is not needed.
  const shouldFetchSpeculatedTransaction =
    !!pageData?.listing?.id &&
    !!pageData.orderData &&
    !!process &&
    !hasTransactionPassedPendingPayment(tx, process);

  if (shouldFetchSpeculatedTransaction) {
    const processAlias = pageData.listing.attributes.publicData?.transactionProcessAlias;
    const transactionId = tx ? tx.id : null;
    const isInquiryInPaymentProcess =
      tx?.attributes?.lastTransition === process.transitions.INQUIRE;
    const resolvedProcessName = resolveLatestProcessName(processName);
    const isOfferPendingInNegotiationProcess =
      resolvedProcessName === NEGOTIATION_PROCESS_NAME &&
      tx.attributes.state === `state/${process.states.OFFER_PENDING}`;

    // Detect long-term booking (>90 days). For booking processes only —
    // negotiation flows are not affected.
    const bookingStartIso =
      orderParams?.bookingStart || orderParams?.bookingDates?.bookingStart;
    const daysUntil = bookingStartIso
      ? (new Date(bookingStartIso).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      : 0;
    const isLongTermBooking =
      daysUntil > 90 &&
      !!process.transitions.REQUEST_LONG_TERM_RESERVATION;

    // Detect resume from payment-window-open: existing transaction whose
    // last transition opened the payment window (timer or operator-forced).
    // Use pay-long-term-reservation which creates the Stripe PaymentIntent.
    // Also keep this true on retry attempts where pay-long-term-reservation
    // has already run, so the speculation stays on the long-term track.
    const lastTr = tx?.attributes?.lastTransition;
    const isResumingLongTermPayment =
      lastTr === process.transitions.OPEN_PAYMENT_WINDOW ||
      lastTr === process.transitions.OPERATOR_OPEN_PAYMENT_WINDOW ||
      lastTr === process.transitions.PAY_LONG_TERM_RESERVATION;

    const requestTransition = isResumingLongTermPayment
      ? process.transitions.PAY_LONG_TERM_RESERVATION
      : isInquiryInPaymentProcess
      ? isLongTermBooking
        ? process.transitions.REQUEST_LONG_TERM_RESERVATION_AFTER_INQUIRY
        : process.transitions.REQUEST_PAYMENT_AFTER_INQUIRY
      : isOfferPendingInNegotiationProcess
      ? process.transitions.REQUEST_PAYMENT_TO_ACCEPT_OFFER
      : isLongTermBooking
      ? process.transitions.REQUEST_LONG_TERM_RESERVATION
      : process.transitions.REQUEST_PAYMENT;
    const isPrivileged = process.isPrivileged(requestTransition);

    fetchSpeculatedTransaction(
      orderParams,
      processAlias,
      transactionId,
      requestTransition,
      isPrivileged
    );
  }
};

/**
 * Load initial data for the page
 *
 * Since the data for the checkout is not passed in the URL (there
 * might be lots of options in the future), we must pass in the data
 * some other way. Currently the ListingPage sets the initial data
 * for the CheckoutPage's Redux store.
 *
 * For some cases (e.g. a refresh in the CheckoutPage), the Redux
 * store is empty. To handle that case, we store the received data
 * to window.sessionStorage and read it from there if no props from
 * the store exist.
 *
 * This function also sets of fetching the speculative transaction
 * based on this initial data.
 */
export const loadInitialDataForStripePayments = ({
  pageData,
  fetchSpeculatedTransaction,
  fetchStripeCustomer,
  config,
}) => {
  // Fetch currentUser with stripeCustomer entity
  // Note: since there's need for data loading in "componentWillMount" function,
  //       this is added here instead of loadData static function.
  fetchStripeCustomer();

  // Fetch speculated transaction for showing price in order breakdown
  // NOTE: if unit type is line-item/item, quantity needs to be added.
  // The way to pass it to checkout page is through pageData.orderData
  const shippingDetails = {};
  const optionalPaymentParams = {};
  const orderParams = getOrderParams(pageData, shippingDetails, optionalPaymentParams, config);

  fetchSpeculatedTransactionIfNeeded(orderParams, pageData, fetchSpeculatedTransaction);
};

const handleSubmit = (values, process, props, stripe, submitting, setSubmitting) => {
  if (submitting) {
    return;
  }
  setSubmitting(true);

  const {
    history,
    config,
    routeConfiguration,
    speculatedTransaction,
    currentUser,
    stripeCustomerFetched,
    paymentIntent,
    dispatch,
    onInitiateOrder,
    onConfirmCardPayment,
    onConfirmPayment,
    onSavePaymentMethod,
    onSubmitCallback,
    pageData,
    setPageData,
    sessionStorageKey,
    transactionFieldConfigs = [],
  } = props;
  const { card, message, paymentMethod: selectedPaymentMethod, formValues } = values;
  const { saveAfterOnetimePayment: saveAfterOnetimePaymentRaw } = formValues;

  // Tax ID (NIF) and company name are mandatory for Portuguese e-commerce
  // (so V1H can later issue invoices that comply with AT). Stored under
  // protectedData so the invoicing integration can read them; NIF is
  // normalised (uppercase, no spaces).
  const rawTaxId = formValues?.taxId;
  const normalisedTaxId =
    typeof rawTaxId === 'string' ? rawTaxId.trim().toUpperCase().replace(/\s+/g, '') : '';
  const rawCompanyName = formValues?.companyName;
  const billingTaxData = {
    ...(normalisedTaxId ? { billingTaxId: normalisedTaxId } : {}),
    ...(rawCompanyName && rawCompanyName.trim()
      ? { billingCompanyName: rawCompanyName.trim() }
      : {}),
  };

  // Memoriza-os no perfil para a próxima reserva já vir preenchida. A
  // transação continua a levar a sua própria cópia: é o que a fatura tem de
  // reflectir, e não pode mudar se a pessoa alterar o NIF mais tarde.
  dispatch(
    saveBillingDetails({
      taxId: normalisedTaxId,
      companyName: rawCompanyName ? rawCompanyName.trim() : '',
    })
  );

  const transactionFieldsProtectedData = {
    ...pickTransactionFieldsData(formValues, 'protected', true, transactionFieldConfigs),
    ...billingTaxData,
  };

  const saveAfterOnetimePayment =
    Array.isArray(saveAfterOnetimePaymentRaw) && saveAfterOnetimePaymentRaw.length > 0;
  const selectedPaymentFlow = paymentFlow(selectedPaymentMethod, saveAfterOnetimePayment);
  const hasDefaultPaymentMethodSaved = hasDefaultPaymentMethod(stripeCustomerFetched, currentUser);
  const stripePaymentMethodId = hasDefaultPaymentMethodSaved
    ? currentUser?.stripeCustomer?.defaultPaymentMethod?.attributes?.stripePaymentMethodId
    : null;

  // If paymentIntent status is not waiting user action,
  // confirmCardPayment has been called previously.
  const hasPaymentIntentUserActionsDone =
    paymentIntent && STRIPE_PI_USER_ACTIONS_DONE_STATUSES.includes(paymentIntent.status);

  const requestPaymentParams = {
    pageData,
    speculatedTransaction,
    stripe,
    card,
    billingDetails: getBillingDetails(formValues, currentUser),
    paymentIntent,
    hasPaymentIntentUserActionsDone,
    stripePaymentMethodId,
    process,
    onInitiateOrder,
    onConfirmCardPayment,
    onConfirmPayment,
    onSavePaymentMethod,
    sessionStorageKey,
    stripeCustomer: currentUser?.stripeCustomer,
    isPaymentFlowUseSavedCard: selectedPaymentFlow === USE_SAVED_CARD,
    isPaymentFlowPayAndSaveCard: selectedPaymentFlow === PAY_AND_SAVE_FOR_LATER_USE,
    setPageData,
  };

  const shippingDetails = getShippingDetailsMaybe(formValues);
  // Note: optionalPaymentParams contains Stripe paymentMethod,
  // but that can also be passed on Step 2
  // stripe.confirmCardPayment(stripe, { payment_method: stripePaymentMethodId })
  const optionalPaymentParams =
    selectedPaymentFlow === USE_SAVED_CARD && hasDefaultPaymentMethodSaved
      ? { paymentMethod: stripePaymentMethodId }
      : selectedPaymentFlow === PAY_AND_SAVE_FOR_LATER_USE
      ? { setupPaymentMethodForSaving: true }
      : {};

  // These are the order parameters for the first payment-related transition
  // which is either initiate-transition or initiate-transition-after-enquiry
  const orderParams = getOrderParams(
    pageData,
    shippingDetails,
    optionalPaymentParams,
    config,
    transactionFieldsProtectedData,
    message
  );

  // There are multiple XHR calls that needs to be made against Stripe API and Sharetribe Marketplace API on checkout with payments
  processCheckoutWithPayment(orderParams, requestPaymentParams)
    .then(response => {
      const { orderId, paymentMethodSaved } = response;
      setSubmitting(false);

      const orderDetailsPath = pathByRouteName('OrderDetailsPage', routeConfiguration, {
        id: orderId.uuid,
      });
      const initialValues = {
        savePaymentMethodFailed: !paymentMethodSaved,
      };

      setOrderPageInitialValues(initialValues, routeConfiguration, dispatch);
      onSubmitCallback();
      history.push(orderDetailsPath);
    })
    .catch(err => {
      console.error(err);
      setSubmitting(false);
    });
};

const onStripeInitialized = (stripe, process, props) => {
  const { paymentIntent, onRetrievePaymentIntent, pageData } = props;
  const tx = pageData?.transaction || null;

  // We need to get up to date PI, if payment is pending but it's not expired.
  const shouldFetchPaymentIntent =
    stripe &&
    !paymentIntent &&
    tx?.id &&
    process?.getState(tx) === process?.states.PENDING_PAYMENT &&
    !hasPaymentExpired(tx, process);

  if (shouldFetchPaymentIntent) {
    const { stripePaymentIntentClientSecret } =
      tx.attributes.protectedData?.stripePaymentIntents?.default || {};

    // Fetch up to date PaymentIntent from Stripe
    onRetrievePaymentIntent({ stripe, stripePaymentIntentClientSecret });
  }
};

/**
 * A component that renders the checkout page with payment.
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.scrollingDisabled - Whether the page should scroll
 * @param {string} props.speculateTransactionError - The error message for the speculate transaction
 * @param {propTypes.transaction} props.speculatedTransaction - The speculated transaction
 * @param {boolean} props.isClockInSync - Whether the clock is in sync
 * @param {string} props.initiateOrderError - The error message for the initiate order
 * @param {string} props.confirmPaymentError - The error message for the confirm payment
 * @param {intlShape} props.intl - The intl object
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {string} props.confirmCardPaymentError - The error message for the confirm card payment
 * @param {propTypes.paymentIntent} props.paymentIntent - The Stripe's payment intent
 * @param {boolean} props.stripeCustomerFetched - Whether the stripe customer has been fetched
 * @param {Object} props.pageData - The page data
 * @param {propTypes.listing} props.pageData.listing - The listing entity
 * @param {boolean} props.showListingImage - A boolean indicating whether images are enabled with this listing type
 * @param {propTypes.transaction} props.pageData.transaction - The transaction entity
 * @param {Object} props.pageData.orderData - The order data
 * @param {string} props.processName - The process name
 * @param {string} props.listingTitle - The listing title
 * @param {string} props.title - The title
 * @param {Function} props.onInitiateOrder - The function to initiate the order
 * @param {Function} props.onConfirmCardPayment - The function to confirm the card payment
 * @param {Function} props.onConfirmPayment - The function to confirm the payment after Stripe call is made
 * @param {Function} props.onSavePaymentMethod - The function to save the payment method for later use
 * @param {Function} props.onSubmitCallback - The function to submit the callback
 * @param {propTypes.error} props.initiateOrderError - The error message for the initiate order
 * @param {propTypes.error} props.confirmPaymentError - The error message for the confirm payment
 * @param {propTypes.error} props.confirmCardPaymentError - The error message for the confirm card payment
 * @param {propTypes.paymentIntent} props.paymentIntent - The Stripe's payment intent
 * @param {boolean} props.stripeCustomerFetched - Whether the stripe customer has been fetched
 * @param {Object} props.config - The config
 * @param {Object} props.routeConfiguration - The route configuration
 * @param {Object} props.history - The history object
 * @param {Object} props.history.push - The push state function of the history object
 * @returns {JSX.Element}
 */
export const CheckoutPageWithPayment = props => {
  const [submitting, setSubmitting] = useState(false);
  // Initialized stripe library is saved to state - if it's needed at some point here too.
  const [stripe, setStripe] = useState(null);

  const {
    scrollingDisabled,
    speculateTransactionError,
    speculatedTransaction: speculatedTransactionMaybe,
    isClockInSync,
    initiateOrderError,
    confirmPaymentError,
    intl,
    currentUser,
    confirmCardPaymentError,
    showListingImage,
    paymentIntent,
    retrievePaymentIntentError,
    stripeCustomerFetched,
    pageData,
    processName,
    listingTitle,
    title,
    transactionFieldConfigs = [],
    showTransactionFields,
    config,
  } = props;

  // Since the listing data is already given from the ListingPage
  // and stored to handle refreshes, it might not have the possible
  // deleted or closed information in it. If the transaction
  // initiate or the speculative initiate fail due to the listing
  // being deleted or closed, we should dig the information from the
  // errors and not the listing data.
  const listingNotFound =
    isTransactionInitiateListingNotFoundError(speculateTransactionError) ||
    isTransactionInitiateListingNotFoundError(initiateOrderError);

  const { listing, transaction, orderData } = pageData;
  const existingTransaction = ensureTransaction(transaction);
  const speculatedTransaction = ensureTransaction(speculatedTransactionMaybe, {}, null);

  // If existing transaction has line-items, it has gone through one of the request-payment transitions.
  // Otherwise, we try to rely on speculatedTransaction for order breakdown data.
  const tx =
    existingTransaction?.attributes?.lineItems?.length > 0
      ? existingTransaction
      : speculatedTransaction;
  const timeZone = listing?.attributes?.availabilityPlan?.timezone;
  const transactionProcessAlias = listing?.attributes?.publicData?.transactionProcessAlias;
  const priceVariantName = tx.attributes.protectedData?.priceVariantName;

  const txBookingMaybe = tx?.booking?.id ? { booking: tx.booking, timeZone } : {};

  // Show breakdown only when (speculated?) transaction is loaded
  // (i.e. it has an id and lineItems)
  const isMultiBooking =
    (orderData?.multipleBookings?.additionalBookings?.length || 0) > 0;
  const breakdown =
    tx.id && tx.attributes.lineItems?.length > 0 ? (
      <OrderBreakdown
        className={css.orderBreakdown}
        userRole="customer"
        transaction={tx}
        {...txBookingMaybe}
        currency={config.currency}
        marketplaceName={config.marketplaceName}
        hideBookingPeriod={isMultiBooking}
      />
    ) : null;

  const totalPrice =
    tx?.attributes?.lineItems?.length > 0 ? getFormattedTotalPrice(tx, intl) : null;

  const process = processName ? getProcess(processName) : null;
  const transitions = process.transitions;
  const isPaymentExpired = hasPaymentExpired(existingTransaction, process, isClockInSync);

  // Resume-payment detection (long-term reservation whose payment window
  // is open, OR already moved into pending-payment via pay-long-term).
  // Use existingTransaction directly — `tx` may fall back to the
  // speculatedTransaction whose lastTransition reflects something else.
  // We must keep treating this as "resume" through the entire submit
  // pipeline (including post-pay-long-term-reservation) so the Stripe
  // form stays mounted while confirmCardPayment runs.
  const existingTxLastTransition = existingTransaction?.attributes?.lastTransition;
  const existingTxState = existingTransaction?.attributes?.state;
  const paymentWindowOpenStateName = process.states?.PAYMENT_WINDOW_OPEN
    ? `state/${process.states.PAYMENT_WINDOW_OPEN}`
    : null;
  const pendingPaymentStateName = process.states?.PENDING_PAYMENT
    ? `state/${process.states.PENDING_PAYMENT}`
    : null;
  const cameFromLongTermFlow =
    existingTxLastTransition === process.transitions.OPEN_PAYMENT_WINDOW ||
    existingTxLastTransition === process.transitions.OPERATOR_OPEN_PAYMENT_WINDOW ||
    existingTxLastTransition === process.transitions.PAY_LONG_TERM_RESERVATION ||
    existingTxLastTransition === process.transitions.CONFIRM_LONG_TERM_PAYMENT;
  const isResumingLongTermPayment =
    cameFromLongTermFlow ||
    (paymentWindowOpenStateName && existingTxState === paymentWindowOpenStateName) ||
    // pending-payment can be either a regular short-term flow or the
    // post-pay long-term flow; only treat it as resume when there's an
    // existing transaction (i.e. we didn't start fresh from the listing).
    (pendingPaymentStateName &&
      existingTxState === pendingPaymentStateName &&
      !!existingTransaction?.id);

  // Allow showing page when currentUser is still being downloaded,
  // but show payment form only when user info is loaded.
  const showPaymentForm = !!(
    currentUser &&
    !listingNotFound &&
    !initiateOrderError &&
    !speculateTransactionError &&
    !retrievePaymentIntentError &&
    !isPaymentExpired
  );

  const firstImage = listing?.images?.length > 0 ? listing.images[0] : null;

  const listingLink = (
    <NamedLink
      name="ListingPage"
      params={{ id: listing?.id?.uuid, slug: createSlug(listingTitle) }}
    >
      <FormattedMessage id="CheckoutPage.errorlistingLinkText" />
    </NamedLink>
  );

  const errorMessages = getErrorMessages(
    listingNotFound,
    initiateOrderError,
    isPaymentExpired,
    retrievePaymentIntentError,
    speculateTransactionError,
    listingLink
  );

  const isBooking = processName === BOOKING_PROCESS_NAME;
  const isPurchase = processName === PURCHASE_PROCESS_NAME;
  const isNegotiation = processName === NEGOTIATION_PROCESS_NAME;

  const txTransitions = existingTransaction?.attributes?.transitions || [];
  const hasInquireTransition = txTransitions.find(tr => tr.transition === transitions.INQUIRE);
  const showInitialMessageInput = !hasInquireTransition && !isNegotiation;

  // Get first and last name of the current user and use it in the StripePaymentForm to autofill the name field
  const userName = currentUser?.attributes?.profile
    ? `${currentUser.attributes.profile.firstName} ${currentUser.attributes.profile.lastName}`
    : null;

  // If paymentIntent status is not waiting user action,
  // confirmCardPayment has been called previously.
  const hasPaymentIntentUserActionsDone =
    paymentIntent && STRIPE_PI_USER_ACTIONS_DONE_STATUSES.includes(paymentIntent.status);

  // If your marketplace works mostly in one country you can use initial values to select country automatically
  // e.g. {country: 'FI'}

  // O NIF é obrigatório e era pedido de novo em cada reserva: ficava guardado
  // apenas na transação, nunca no utilizador. Quem reservasse três vezes
  // escrevia-o três vezes.
  const dadosFaturacao = currentUser?.attributes?.profile?.protectedData || {};

  const initialValuesForStripePayment = {
    name: userName,
    recipientName: userName,
    taxId: dadosFaturacao.billingTaxId || '',
    companyName: dadosFaturacao.billingCompanyName || '',
    // Default the "Guardar dados do cartão" checkbox to OFF — users were
    // annoyed by having to uncheck it every time.
    saveAfterOnetimePayment: [],
  };
  const askShippingDetails =
    orderData?.deliveryMethod === 'shipping' &&
    !hasTransactionPassedPendingPayment(existingTransaction, process);

  const listingLocation = listing?.attributes?.publicData?.location;
  const showPickUpLocation = isPurchase && orderData?.deliveryMethod === 'pickup';
  const showLocation = (isBooking || isNegotiation) && listingLocation?.address;

  const providerDisplayName = isNegotiation
    ? existingTransaction?.provider?.attributes?.profile?.displayName
    : listing?.author?.attributes?.profile?.displayName;

  // Check if the listing currency is compatible with Stripe for the specified transaction process.
  // This function validates the currency against the transaction process requirements and
  // ensures it is supported by Stripe, as indicated by the 'stripe' parameter.
  // If using a transaction process without any stripe actions, leave out the 'stripe' parameter.
  const currency =
    existingTransaction?.attributes?.payinTotal?.currency || listing.attributes.price?.currency;
  const isStripeCompatibleCurrency = isValidCurrencyForTransactionProcess(
    transactionProcessAlias,
    currency,
    'stripe'
  );

  // Render an error message if the listing is using a non Stripe supported currency
  // and is using a transaction process with Stripe actions (default-booking or default-purchase)
  if (!isStripeCompatibleCurrency) {
    return (
      <Page title={title} scrollingDisabled={scrollingDisabled}>
        <TopbarContainer />
        <div className={css.contentContainer}>
          <section className={css.incompatibleCurrency}>
            <H4 as="h1" className={css.heading}>
              <FormattedMessage id="CheckoutPage.incompatibleCurrency" />
            </H4>
          </section>
        </div>
        <FooterContainer />
      </Page>
    );
  }

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <TopbarContainer />
      <div className={css.contentContainer}>
        {/* Mobile only — checkout title shown ABOVE the listing image */}
        <H3 as="h1" className={classNames(css.heading, css.headingMobileTop)}>
          {title}
        </H3>
        <MobileListingImage
          listingTitle={listingTitle}
          author={listing?.author}
          firstImage={firstImage}
          layoutListingImageConfig={config.layout.listingImage}
          showListingImage={showListingImage}
        />
        <main className={css.orderFormContainer}>
          <div className={classNames(css.headingContainer, css.headingContainerDesktop)}>
            <H3 as="h1" className={css.heading}>
              {title}
            </H3>
            <H4 as="h2" className={css.detailsHeadingMobile}>
              <FormattedMessage id="CheckoutPage.listingTitle" values={{ listingTitle }} />
            </H4>
          </div>
          {/* Mobile-only — location shown right under the listing title */}
          {showLocation && listingLocation?.address ? (
            <div className={css.mobileLocationUnderTitle}>
              <h4 className={css.mobileLocationLabel}>
                <FormattedMessage
                  id="StripePaymentForm.locationDetailsTitle"
                  defaultMessage="Localização do espaço"
                />
              </h4>
              <p className={css.mobileLocationAddress}>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="14"
                  height="14"
                  style={{ flexShrink: 0, marginRight: 6, fill: '#e53935', verticalAlign: 'text-top' }}
                >
                  <path
                    fill="#e53935"
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  />
                </svg>
                {listingLocation.address}
                {listingLocation.building ? (
                  <span style={{ marginLeft: 6, color: '#7C6350', fontWeight: 600 }}>
                    · {listingLocation.building}
                  </span>
                ) : null}
              </p>
            </div>
          ) : null}
          <MobileOrderBreakdown
            speculateTransactionErrorMessage={errorMessages.speculateTransactionErrorMessage}
            breakdown={breakdown}
            priceVariantName={priceVariantName}
          />
          <section className={css.paymentContainer}>
            {(() => {
              const bookingStart = orderData?.bookingDates?.bookingStart;
              if (!bookingStart) return null;
              const days = Math.floor(
                (new Date(bookingStart).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
              );
              if (days <= 90) return null;
              if (isResumingLongTermPayment) return null;
              return (
                <div
                  style={{
                    background: '#FFF8EE',
                    border: '1px solid #BAA38A',
                    borderRadius: 6,
                    padding: '12px 16px',
                    marginBottom: 16,
                    fontSize: 14,
                    color: '#3F3131',
                    lineHeight: 1.5,
                  }}
                >
                  <strong>Reserva a longo prazo:</strong> A tua data está a {days} dias de
                  distância. O pagamento será cobrado <strong>90 dias antes da data do evento</strong>.
                  Receberás um email com instruções perto dessa altura.
                </div>
              );
            })()}
            {errorMessages.initiateOrderErrorMessage}
            {errorMessages.listingNotFoundErrorMessage}
            {errorMessages.speculateErrorMessage}
            {errorMessages.retrievePaymentIntentErrorMessage}
            {errorMessages.paymentExpiredMessage}

            {(() => {
              const bookingStart = orderData?.bookingDates?.bookingStart;
              const days = bookingStart
                ? (new Date(bookingStart).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                : 0;
              const isLongTerm =
                !isResumingLongTermPayment &&
                days > 90 &&
                !!process.transitions.REQUEST_LONG_TERM_RESERVATION;
              if (!isLongTerm || !showPaymentForm) return null;
              return (
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() =>
                    handleSubmit(
                      {
                        // Minimal form values — the long-term flow skips Stripe
                        // and only fires the request-long-term-reservation
                        // transition (no PaymentIntent, no card-confirm).
                        formValues: {
                          name: currentUser?.attributes?.profile?.displayName || 'Customer',
                          recipientName:
                            currentUser?.attributes?.profile?.displayName || 'Customer',
                          saveAfterOnetimePayment: [],
                        },
                      },
                      process,
                      props,
                      stripe,
                      submitting,
                      setSubmitting
                    )
                  }
                  style={{
                    width: '100%',
                    padding: '14px 24px',
                    backgroundColor: '#2E2E2E',
                    color: '#fff',
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    border: 'none',
                    borderRadius: 6,
                    cursor: submitting ? 'not-allowed' : 'pointer',
                    marginTop: 8,
                  }}
                >
                  {submitting ? 'A confirmar...' : 'Confirmar reserva'}
                </button>
              );
            })()}

            {(() => {
              const bookingStart = orderData?.bookingDates?.bookingStart;
              const days = bookingStart
                ? (new Date(bookingStart).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
                : 0;
              const isLongTerm =
                !isResumingLongTermPayment &&
                days > 90 &&
                !!process.transitions.REQUEST_LONG_TERM_RESERVATION;
              if (isLongTerm) return null;
              return showPaymentForm ? (
              <StripePaymentForm
                className={css.paymentForm}
                onSubmit={values =>
                  handleSubmit(values, process, props, stripe, submitting, setSubmitting)
                }
                inProgress={submitting}
                formId="CheckoutPagePaymentForm"
                providerDisplayName={providerDisplayName}
                showInitialMessageInput={showInitialMessageInput}
                initialValues={initialValuesForStripePayment}
                initiateOrderError={initiateOrderError}
                confirmCardPaymentError={confirmCardPaymentError}
                confirmPaymentError={confirmPaymentError}
                hasHandledCardPayment={hasPaymentIntentUserActionsDone}
                loadingData={!stripeCustomerFetched}
                defaultPaymentMethod={
                  hasDefaultPaymentMethod(stripeCustomerFetched, currentUser)
                    ? currentUser.stripeCustomer.defaultPaymentMethod
                    : null
                }
                paymentIntent={paymentIntent}
                onStripeInitialized={stripe => {
                  setStripe(stripe);
                  return onStripeInitialized(stripe, process, props);
                }}
                askShippingDetails={askShippingDetails}
                showPickUpLocation={showPickUpLocation}
                showLocation={showLocation}
                listingLocation={listingLocation}
                totalPrice={totalPrice}
                locale={config.localization.locale}
                stripePublishableKey={config.stripe.publishableKey}
                marketplaceName={config.marketplaceName}
                isBooking={isBookingProcessAlias(transactionProcessAlias)}
                isFuzzyLocation={config.maps.fuzzy.enabled}
                transactionFieldConfigs={transactionFieldConfigs}
                showTransactionFields={showTransactionFields}
              />
            ) : null;
            })()}
          </section>
        </main>

        <DetailsSideCard
          listing={listing}
          listingTitle={listingTitle}
          priceVariantName={priceVariantName}
          author={listing?.author}
          firstImage={firstImage}
          layoutListingImageConfig={config.layout.listingImage}
          speculateTransactionErrorMessage={errorMessages.speculateTransactionErrorMessage}
          isInquiryProcess={false}
          processName={processName}
          breakdown={breakdown}
          showListingImage={showListingImage}
          intl={intl}
          multipleBookings={orderData?.multipleBookings}
          primaryBookingDates={orderData?.bookingDates}
        />
      </div>
      <FooterContainer />
    </Page>
  );
};

export default CheckoutPageWithPayment;
