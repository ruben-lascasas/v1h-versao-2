import {
  TX_TRANSITION_ACTOR_CUSTOMER as CUSTOMER,
  TX_TRANSITION_ACTOR_PROVIDER as PROVIDER,
  CONDITIONAL_RESOLVER_WILDCARD,
  ConditionalResolver,
} from '../../transactions/transaction';

/**
 * Get state data against booking process for TransactionPage's UI.
 * I.e. info about showing action buttons, current state etc.
 *
 * @param {*} txInfo detials about transaction
 * @param {*} processInfo  details about process
 */
export const getStateDataForBookingProcess = (txInfo, processInfo) => {
  const { transaction, transactionRole, nextTransitions } = txInfo;
  const isProviderBanned = transaction?.provider?.attributes?.banned;
  const isCustomerBanned = transaction?.provider?.attributes?.banned;
  const _ = CONDITIONAL_RESOLVER_WILDCARD;

  const {
    processName,
    processState,
    states,
    transitions,
    isCustomer,
    actionButtonProps,
    leaveReviewProps,
    transaction: tx,
    onCheckoutRedirect,
  } = processInfo;

  return new ConditionalResolver([processState, transactionRole])
    .cond([states.INQUIRY, CUSTOMER], () => {
      const transitionNames = Array.isArray(nextTransitions)
        ? nextTransitions.map(t => t.attributes.name)
        : [];
      const requestAfterInquiry = transitions.REQUEST_PAYMENT_AFTER_INQUIRY;
      const hasCorrectNextTransition = transitionNames.includes(requestAfterInquiry);
      const showOrderPanel = !isProviderBanned && hasCorrectNextTransition;
      return { processName, processState, showOrderPanel };
    })
    .cond([states.INQUIRY, PROVIDER], () => {
      return { processName, processState, showDetailCardHeadings: true };
    })
    // Long-term pending approval: provider must accept or decline.
    .cond([states.LONG_TERM_PENDING_APPROVAL, CUSTOMER], () => {
      const cancelBtn = actionButtonProps(transitions.CUSTOMER_CANCEL_LONG_TERM_PENDING, CUSTOMER);
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showActionButtons: true,
        primaryButtonProps: cancelBtn,
      };
    })
    .cond([states.LONG_TERM_PENDING_APPROVAL, PROVIDER], () => {
      const acceptBtn = isCustomerBanned
        ? null
        : actionButtonProps(transitions.ACCEPT_LONG_TERM_RESERVATION, PROVIDER);
      const declineBtn = isCustomerBanned
        ? null
        : actionButtonProps(transitions.DECLINE_LONG_TERM_RESERVATION, PROVIDER);
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showActionButtons: true,
        primaryButtonProps: acceptBtn,
        secondaryButtonProps: declineBtn,
      };
    })
    .cond([states.LONG_TERM_DECLINED, _], () => {
      return { processName, processState, showDetailCardHeadings: true };
    })
    // Long-term reservation accepted: waiting for 90-day timer.
    .cond([states.LONG_TERM_RESERVED, CUSTOMER], () => {
      const cancelBtn = actionButtonProps(transitions.CUSTOMER_CANCEL_LONG_TERM, CUSTOMER);
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showActionButtons: true,
        primaryButtonProps: cancelBtn,
      };
    })
    .cond([states.LONG_TERM_RESERVED, PROVIDER], () => {
      const cancelBtn = actionButtonProps(transitions.PROVIDER_CANCEL_LONG_TERM, PROVIDER);
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showActionButtons: true,
        primaryButtonProps: cancelBtn,
      };
    })
    // Payment window opened (90 days before booking-start). Customer
    // must complete the payment now. The "Pay now" button redirects to
    // the checkout page with the existing transaction's booking dates,
    // and the checkout picks up the transaction in `payment-window-open`
    // state and uses the `pay-long-term-reservation` transition (which
    // creates a Stripe PaymentIntent).
    .cond([states.PAYMENT_WINDOW_OPEN, CUSTOMER], () => {
      const bookingStart = tx?.booking?.attributes?.start || tx?.booking?.attributes?.displayStart;
      const bookingEnd = tx?.booking?.attributes?.end || tx?.booking?.attributes?.displayEnd;
      const payBtn = actionButtonProps(transitions.PAY_LONG_TERM_RESERVATION, CUSTOMER, {
        onAction: () => {
          if (onCheckoutRedirect && bookingStart && bookingEnd) {
            onCheckoutRedirect({
              bookingStartTime: new Date(bookingStart).getTime(),
              bookingEndTime: new Date(bookingEnd).getTime(),
            });
          }
        },
      });
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showExtraInfo: true,
        showActionButtons: true,
        primaryButtonProps: payBtn,
      };
    })
    .cond([states.PAYMENT_WINDOW_OPEN, PROVIDER], () => {
      return { processName, processState, showDetailCardHeadings: true };
    })
    .cond([states.LONG_TERM_EXPIRED, _], () => {
      return { processName, processState, showDetailCardHeadings: true };
    })
    .cond([states.LONG_TERM_CANCELLED, _], () => {
      return { processName, processState, showDetailCardHeadings: true };
    })
    .cond([states.PREAUTHORIZED, CUSTOMER], () => {
      return { processName, processState, showDetailCardHeadings: true, showExtraInfo: true };
    })
    .cond([states.PREAUTHORIZED, PROVIDER], () => {
      const primary = isCustomerBanned ? null : actionButtonProps(transitions.ACCEPT, PROVIDER);
      const secondary = isCustomerBanned ? null : actionButtonProps(transitions.DECLINE, PROVIDER);
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showActionButtons: true,
        primaryButtonProps: primary,
        secondaryButtonProps: secondary,
      };
    })
    .cond([states.DELIVERED, _], () => {
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showReviewAsFirstLink: true,
        showActionButtons: true,
        primaryButtonProps: leaveReviewProps,
      };
    })
    .cond([states.REVIEWED_BY_PROVIDER, CUSTOMER], () => {
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showReviewAsSecondLink: true,
        showActionButtons: true,
        primaryButtonProps: leaveReviewProps,
      };
    })
    .cond([states.REVIEWED_BY_CUSTOMER, PROVIDER], () => {
      return {
        processName,
        processState,
        showDetailCardHeadings: true,
        showReviewAsSecondLink: true,
        showActionButtons: true,
        primaryButtonProps: leaveReviewProps,
      };
    })
    .cond([states.REVIEWED, _], () => {
      return { processName, processState, showDetailCardHeadings: true, showReviews: true };
    })
    .default(() => {
      // Default values for other states
      return { processName, processState, showDetailCardHeadings: true };
    })
    .resolve();
};
