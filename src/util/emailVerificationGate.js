// Simple singleton that lets any component trigger the email verification modal.
// ModalMissingInformation registers itself; buttons call triggerEmailVerificationModal().
// Pass an optional callback to triggerEmailVerificationModal — it runs when the user closes the modal.

let _trigger = null;

export const registerEmailVerificationTrigger = fn => {
  _trigger = fn;
};

export const triggerEmailVerificationModal = (onAfterClose) => {
  if (_trigger) _trigger(onAfterClose);
};
