/**
 * Transaction process graph for bookings:
 *   - default-booking
 */

/**
 * Transitions
 *
 * These strings must sync with values defined in Marketplace API,
 * since transaction objects given by API contain info about last transitions.
 * All the actions in API side happen in transitions,
 * so we need to understand what those strings mean.
 */

export const transitions = {
  // When a customer makes a booking to a listing, a transaction is
  // created with the initial request-payment transition.
  // At this transition a PaymentIntent is created by Marketplace API.
  // After this transition, the actual payment must be made on client-side directly to Stripe.
  REQUEST_PAYMENT: 'transition/request-payment',

  // A customer can also initiate a transaction with an inquiry, and
  // then transition that with a request.
  INQUIRE: 'transition/inquire',
  REQUEST_PAYMENT_AFTER_INQUIRY: 'transition/request-payment-after-inquiry',

  // Long-term path (>90 days): customer requests the date, provider must approve.
  REQUEST_LONG_TERM_RESERVATION: 'transition/request-long-term-reservation',
  REQUEST_LONG_TERM_RESERVATION_AFTER_INQUIRY:
    'transition/request-long-term-reservation-after-inquiry',

  // Provider accepts or declines the long-term request.
  ACCEPT_LONG_TERM_RESERVATION: 'transition/accept-long-term-reservation',
  DECLINE_LONG_TERM_RESERVATION: 'transition/decline-long-term-reservation',
  // Auto-expires if provider doesn't respond in 7 days.
  EXPIRE_LONG_TERM_APPROVAL: 'transition/expire-long-term-approval',
  // Customer/operator cancel while waiting for provider approval.
  CUSTOMER_CANCEL_LONG_TERM_PENDING: 'transition/customer-cancel-long-term-pending',
  OPERATOR_CANCEL_LONG_TERM_PENDING: 'transition/operator-cancel-long-term-pending',

  // System fires this 90 days before booking-start: payment window opens.
  OPEN_PAYMENT_WINDOW: 'transition/open-payment-window',
  OPERATOR_OPEN_PAYMENT_WINDOW: 'transition/operator-open-payment-window',

  // Customer pays once payment window is open.
  PAY_LONG_TERM_RESERVATION: 'transition/pay-long-term-reservation',
  // Customer confirms card — auto-accepts (provider already approved earlier).
  CONFIRM_LONG_TERM_PAYMENT: 'transition/confirm-long-term-payment',
  // Auto-expires if customer doesn't pay within 14 days.
  EXPIRE_LONG_TERM_RESERVATION: 'transition/expire-long-term-reservation',

  // Cancel approved long-term reservation before payment.
  OPERATOR_CANCEL_LONG_TERM: 'transition/operator-cancel-long-term',
  PROVIDER_CANCEL_LONG_TERM: 'transition/provider-cancel-long-term',
  CUSTOMER_CANCEL_LONG_TERM: 'transition/customer-cancel-long-term',

  // Stripe SDK might need to ask 3D security from customer, in a separate front-end step.
  // Therefore we need to make another transition to Marketplace API,
  // to tell that the payment is confirmed.
  CONFIRM_PAYMENT: 'transition/confirm-payment',

  // If the payment is not confirmed in the time limit set in transaction process (by default 15min)
  // the transaction will expire automatically.
  EXPIRE_PAYMENT: 'transition/expire-payment',

  // When the provider accepts or declines a transaction from the
  // SalePage, it is transitioned with the accept or decline transition.
  ACCEPT: 'transition/accept',
  DECLINE: 'transition/decline',

  // The operator can accept or decline the offer on behalf of the provider
  OPERATOR_ACCEPT: 'transition/operator-accept',
  OPERATOR_DECLINE: 'transition/operator-decline',

  // The backend automatically expire the transaction.
  EXPIRE: 'transition/expire',

  // Admin can also cancel the transition.
  CANCEL: 'transition/cancel',

  // The backend will mark the transaction completed.
  COMPLETE: 'transition/complete',
  OPERATOR_COMPLETE: 'transition/operator-complete',

  // Reviews are given through transaction transitions. Review 1 can be
  // by provider or customer, and review 2 will be the other party of
  // the transaction.
  REVIEW_1_BY_PROVIDER: 'transition/review-1-by-provider',
  REVIEW_2_BY_PROVIDER: 'transition/review-2-by-provider',
  REVIEW_1_BY_CUSTOMER: 'transition/review-1-by-customer',
  REVIEW_2_BY_CUSTOMER: 'transition/review-2-by-customer',
  EXPIRE_CUSTOMER_REVIEW_PERIOD: 'transition/expire-customer-review-period',
  EXPIRE_PROVIDER_REVIEW_PERIOD: 'transition/expire-provider-review-period',
  EXPIRE_REVIEW_PERIOD: 'transition/expire-review-period',
};

/**
 * States
 *
 * These constants are only for making it clear how transitions work together.
 * You should not use these constants outside of this file.
 *
 * Note: these states are not in sync with states used transaction process definitions
 *       in Marketplace API. Only last transitions are passed along transaction object.
 */
export const states = {
  INITIAL: 'initial',
  INQUIRY: 'inquiry',
  PENDING_PAYMENT: 'pending-payment',
  PAYMENT_EXPIRED: 'payment-expired',
  PREAUTHORIZED: 'preauthorized',
  DECLINED: 'declined',
  ACCEPTED: 'accepted',
  EXPIRED: 'expired',
  CANCELED: 'canceled',
  DELIVERED: 'delivered',
  REVIEWED: 'reviewed',
  REVIEWED_BY_CUSTOMER: 'reviewed-by-customer',
  REVIEWED_BY_PROVIDER: 'reviewed-by-provider',
  // Long-term reservation states (>90 days)
  LONG_TERM_PENDING_APPROVAL: 'long-term-pending-approval',
  LONG_TERM_DECLINED: 'long-term-declined',
  LONG_TERM_RESERVED: 'long-term-reserved',
  PAYMENT_WINDOW_OPEN: 'payment-window-open',
  LONG_TERM_EXPIRED: 'long-term-expired',
  LONG_TERM_CANCELLED: 'long-term-cancelled',
};

/**
 * Description of transaction process graph
 *
 * You should keep this in sync with transaction process defined in Marketplace API
 *
 * Note: we don't use yet any state machine library,
 *       but this description format is following Xstate (FSM library)
 *       https://xstate.js.org/docs/
 */
export const graph = {
  // id is defined only to support Xstate format.
  // However if you have multiple transaction processes defined,
  // it is best to keep them in sync with transaction process aliases.
  id: 'default-booking/release-2',

  // This 'initial' state is a starting point for new transaction
  initial: states.INITIAL,

  // States
  states: {
    [states.INITIAL]: {
      on: {
        [transitions.INQUIRE]: states.INQUIRY,
        [transitions.REQUEST_PAYMENT]: states.PENDING_PAYMENT,
        [transitions.REQUEST_LONG_TERM_RESERVATION]: states.LONG_TERM_PENDING_APPROVAL,
      },
    },
    [states.INQUIRY]: {
      on: {
        [transitions.REQUEST_PAYMENT_AFTER_INQUIRY]: states.PENDING_PAYMENT,
        [transitions.REQUEST_LONG_TERM_RESERVATION_AFTER_INQUIRY]: states.LONG_TERM_PENDING_APPROVAL,
      },
    },

    [states.LONG_TERM_PENDING_APPROVAL]: {
      on: {
        [transitions.ACCEPT_LONG_TERM_RESERVATION]: states.LONG_TERM_RESERVED,
        [transitions.DECLINE_LONG_TERM_RESERVATION]: states.LONG_TERM_DECLINED,
        [transitions.EXPIRE_LONG_TERM_APPROVAL]: states.LONG_TERM_DECLINED,
        [transitions.CUSTOMER_CANCEL_LONG_TERM_PENDING]: states.LONG_TERM_CANCELLED,
        [transitions.OPERATOR_CANCEL_LONG_TERM_PENDING]: states.LONG_TERM_CANCELLED,
      },
    },
    [states.LONG_TERM_DECLINED]: {},

    [states.LONG_TERM_RESERVED]: {
      on: {
        [transitions.OPEN_PAYMENT_WINDOW]: states.PAYMENT_WINDOW_OPEN,
        [transitions.OPERATOR_OPEN_PAYMENT_WINDOW]: states.PAYMENT_WINDOW_OPEN,
        [transitions.OPERATOR_CANCEL_LONG_TERM]: states.LONG_TERM_CANCELLED,
        [transitions.PROVIDER_CANCEL_LONG_TERM]: states.LONG_TERM_CANCELLED,
        [transitions.CUSTOMER_CANCEL_LONG_TERM]: states.LONG_TERM_CANCELLED,
      },
    },
    [states.PAYMENT_WINDOW_OPEN]: {
      on: {
        [transitions.PAY_LONG_TERM_RESERVATION]: states.PENDING_PAYMENT,
        [transitions.EXPIRE_LONG_TERM_RESERVATION]: states.LONG_TERM_EXPIRED,
      },
    },
    [states.LONG_TERM_EXPIRED]: {},
    [states.LONG_TERM_CANCELLED]: {},

    [states.PENDING_PAYMENT]: {
      on: {
        [transitions.EXPIRE_PAYMENT]: states.PAYMENT_EXPIRED,
        [transitions.CONFIRM_PAYMENT]: states.PREAUTHORIZED,
        [transitions.CONFIRM_LONG_TERM_PAYMENT]: states.ACCEPTED,
      },
    },

    [states.PAYMENT_EXPIRED]: {},
    [states.PREAUTHORIZED]: {
      on: {
        [transitions.DECLINE]: states.DECLINED,
        [transitions.OPERATOR_DECLINE]: states.DECLINED,
        [transitions.EXPIRE]: states.EXPIRED,
        [transitions.ACCEPT]: states.ACCEPTED,
        [transitions.OPERATOR_ACCEPT]: states.ACCEPTED,
      },
    },

    [states.DECLINED]: {},
    [states.EXPIRED]: {},
    [states.ACCEPTED]: {
      on: {
        [transitions.CANCEL]: states.CANCELED,
        [transitions.COMPLETE]: states.DELIVERED,
        [transitions.OPERATOR_COMPLETE]: states.DELIVERED,
      },
    },

    [states.CANCELED]: {},
    [states.DELIVERED]: {
      on: {
        [transitions.EXPIRE_REVIEW_PERIOD]: states.REVIEWED,
        [transitions.REVIEW_1_BY_CUSTOMER]: states.REVIEWED_BY_CUSTOMER,
        [transitions.REVIEW_1_BY_PROVIDER]: states.REVIEWED_BY_PROVIDER,
      },
    },

    [states.REVIEWED_BY_CUSTOMER]: {
      on: {
        [transitions.REVIEW_2_BY_PROVIDER]: states.REVIEWED,
        [transitions.EXPIRE_PROVIDER_REVIEW_PERIOD]: states.REVIEWED,
      },
    },
    [states.REVIEWED_BY_PROVIDER]: {
      on: {
        [transitions.REVIEW_2_BY_CUSTOMER]: states.REVIEWED,
        [transitions.EXPIRE_CUSTOMER_REVIEW_PERIOD]: states.REVIEWED,
      },
    },
    [states.REVIEWED]: { type: 'final' },
  },
};

// Check if a transition is the kind that should be rendered
// when showing transition history (e.g. ActivityFeed)
// The first transition and most of the expiration transitions made by system are not relevant
export const isRelevantPastTransition = transition => {
  return [
    transitions.ACCEPT,
    transitions.OPERATOR_ACCEPT,
    transitions.CANCEL,
    transitions.COMPLETE,
    transitions.OPERATOR_COMPLETE,
    transitions.CONFIRM_PAYMENT,
    transitions.DECLINE,
    transitions.OPERATOR_DECLINE,
    transitions.EXPIRE,
    transitions.REVIEW_1_BY_CUSTOMER,
    transitions.REVIEW_1_BY_PROVIDER,
    transitions.REVIEW_2_BY_CUSTOMER,
    transitions.REVIEW_2_BY_PROVIDER,
  ].includes(transition);
};

// Processes might be different on how reviews are handled.
// Default processes use two-sided diamond shape, where either party can make the review first
export const isCustomerReview = transition => {
  return [transitions.REVIEW_1_BY_CUSTOMER, transitions.REVIEW_2_BY_CUSTOMER].includes(transition);
};

// Processes might be different on how reviews are handled.
// Default processes use two-sided diamond shape, where either party can make the review first
export const isProviderReview = transition => {
  return [transitions.REVIEW_1_BY_PROVIDER, transitions.REVIEW_2_BY_PROVIDER].includes(transition);
};

// Check if the given transition is privileged.
//
// Privileged transitions need to be handled from a secure context,
// i.e. the backend. This helper is used to check if the transition
// should go through the local API endpoints, or if using JS SDK is
// enough.
export const isPrivileged = transition => {
  return [
    transitions.REQUEST_PAYMENT,
    transitions.REQUEST_PAYMENT_AFTER_INQUIRY,
    transitions.REQUEST_LONG_TERM_RESERVATION,
    transitions.REQUEST_LONG_TERM_RESERVATION_AFTER_INQUIRY,
    transitions.PAY_LONG_TERM_RESERVATION,
  ].includes(transition);
};

// Check when transaction is completed (booking over)
export const isCompleted = transition => {
  const txCompletedTransitions = [
    transitions.COMPLETE,
    transitions.OPERATOR_COMPLETE,
    transitions.REVIEW_1_BY_CUSTOMER,
    transitions.REVIEW_1_BY_PROVIDER,
    transitions.REVIEW_2_BY_CUSTOMER,
    transitions.REVIEW_2_BY_PROVIDER,
    transitions.EXPIRE_REVIEW_PERIOD,
    transitions.EXPIRE_CUSTOMER_REVIEW_PERIOD,
    transitions.EXPIRE_PROVIDER_REVIEW_PERIOD,
  ];
  return txCompletedTransitions.includes(transition);
};

// Check when transaction is refunded (booking did not happen)
// In these transitions action/stripe-refund-payment is called
export const isRefunded = transition => {
  const txRefundedTransitions = [
    transitions.EXPIRE_PAYMENT,
    transitions.EXPIRE,
    transitions.CANCEL,
    transitions.DECLINE,
  ];
  return txRefundedTransitions.includes(transition);
};

export const statesNeedingProviderAttention = [states.PREAUTHORIZED];
