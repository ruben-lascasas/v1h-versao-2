import {
  TX_TRANSITION_ACTOR_CUSTOMER as CUSTOMER,
  TX_TRANSITION_ACTOR_PROVIDER as PROVIDER,
  CONDITIONAL_RESOLVER_WILDCARD,
  ConditionalResolver,
} from '../../transactions/transaction';

// Get UI data mapped to specific transaction state & role
export const getStateDataForBookingProcess = (txInfo, processInfo) => {
  const { transactionRole } = txInfo;
  const { processName, processState, states } = processInfo;
  const _ = CONDITIONAL_RESOLVER_WILDCARD;

  return new ConditionalResolver([processState, transactionRole])
    .cond([states.INQUIRY, _], () => {
      return { processName, processState, actionNeeded: true };
    })
    .cond([states.PENDING_PAYMENT, CUSTOMER], () => {
      return { processName, processState, actionNeeded: true };
    })
    // Long-term pending approval: provider must act
    .cond([states.LONG_TERM_PENDING_APPROVAL, PROVIDER], () => {
      return { processName, processState, actionNeeded: true, isSaleNotification: true };
    })
    .cond([states.LONG_TERM_PENDING_APPROVAL, CUSTOMER], () => {
      return { processName, processState };
    })
    .cond([states.LONG_TERM_DECLINED, _], () => {
      return { processName, processState, isFinal: true };
    })
    // Long-term reservation accepted: waiting for 90-day timer
    .cond([states.LONG_TERM_RESERVED, _], () => {
      return { processName, processState };
    })
    .cond([states.PAYMENT_WINDOW_OPEN, CUSTOMER], () => {
      // Customer needs to pay now — payment window is open
      return { processName, processState, actionNeeded: true };
    })
    .cond([states.PAYMENT_WINDOW_OPEN, _], () => {
      return { processName, processState };
    })
    .cond([states.LONG_TERM_EXPIRED, _], () => {
      return { processName, processState, isFinal: true };
    })
    .cond([states.LONG_TERM_CANCELLED, _], () => {
      return { processName, processState, isFinal: true };
    })
    .cond([states.CANCELED, _], () => {
      return { processName, processState, isFinal: true };
    })
    .cond([states.PREAUTHORIZED, PROVIDER], () => {
      return { processName, processState, actionNeeded: true, isSaleNotification: true };
    })
    .cond([states.ACCEPTED, _], () => {
      return { processName, processState, actionNeeded: true };
    })
    .cond([states.DECLINED, _], () => {
      return { processName, processState, isFinal: true };
    })
    .cond([states.EXPIRED, _], () => {
      return { processName, processState, isFinal: true };
    })
    .cond([states.DELIVERED, _], () => {
      return { processName, processState, actionNeeded: true };
    })
    .cond([states.REVIEWED_BY_PROVIDER, CUSTOMER], () => {
      return { processName, processState, actionNeeded: true };
    })
    .cond([states.REVIEWED_BY_CUSTOMER, PROVIDER], () => {
      return { processName, processState, actionNeeded: true };
    })
    .cond([states.REVIEWED, _], () => {
      return { processName, processState, isFinal: true };
    })
    .default(() => {
      // Default values for other states
      return { processName, processState };
    })
    .resolve();
};
