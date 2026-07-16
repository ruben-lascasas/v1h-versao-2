import React, { Component } from 'react';
import classNames from 'classnames';

import { useRouteConfiguration } from '../../context/routeConfigurationContext';

import { FormattedMessage } from '../../util/reactIntl';
import { ensureCurrentUser } from '../../util/data';
import { isUserAuthorized } from '../../util/userHelpers';
import { pathByRouteName } from '../../util/routes';
import { registerEmailVerificationTrigger } from '../../util/emailVerificationGate';

import { Modal } from '../../components';

import EmailReminder from './EmailReminder';
import css from './ModalMissingInformation.module.css';

const MISSING_INFORMATION_MODAL_WHITELIST = [
  'LoginPage',
  'SignupPage',
  'ContactDetailsPage',
  'EmailVerificationPage',
  'PasswordResetPage',
  'StripePayoutPage',
];

const EMAIL_VERIFICATION = 'EMAIL_VERIFICATION';

const getSessionKey = userId => `emailReminderSeen_${userId}`;

const hasSeenReminder = userId => {
  try {
    return !!sessionStorage.getItem(getSessionKey(userId));
  } catch (e) {
    return false;
  }
};

const markReminderSeen = userId => {
  try {
    sessionStorage.setItem(getSessionKey(userId), '1');
  } catch (e) {}
};

class ModalMissingInformation extends Component {
  constructor(props) {
    super(props);

    this.state = {
      showMissingInformationReminder: null,
      afterCloseCallback: null,
    };
    this.handleMissingInformationReminder = this.handleMissingInformationReminder.bind(this);

    // Register gate trigger so any component can open this modal.
    // onAfterClose (optional) is called when the user dismisses the modal.
    registerEmailVerificationTrigger((onAfterClose) => {
      this.setState({ showMissingInformationReminder: EMAIL_VERIFICATION, afterCloseCallback: onAfterClose || null });
    });
  }

  componentDidUpdate() {
    const { currentUser, currentUserHasListings, currentUserHasOrders, location } = this.props;
    const user = ensureCurrentUser(currentUser);
    this.handleMissingInformationReminder(
      user,
      currentUserHasListings,
      currentUserHasOrders,
      location
    );
  }

  handleMissingInformationReminder(
    currentUser,
    currentUserHasListings,
    currentUserHasOrders,
    newLocation
  ) {
    const routes = this.props.routeConfiguration;
    const whitelistedPaths = MISSING_INFORMATION_MODAL_WHITELIST.map(page =>
      pathByRouteName(page, routes)
    );

    // Is the current page whitelisted?
    const isPageWhitelisted = whitelistedPaths.includes(newLocation.pathname);

    const userId = currentUser?.id?.uuid;
    const alreadySeen = hasSeenReminder(userId);
    const notShowing = !this.state.showMissingInformationReminder;

    if (!isPageWhitelisted && notShowing && !alreadySeen) {
      const emailUnverified = !!currentUser.id && !currentUser.attributes.emailVerified;
      if (emailUnverified) {
        this.setState({ showMissingInformationReminder: EMAIL_VERIFICATION });
      }
    }
  }

  render() {
    const {
      rootClassName,
      className,
      containerClassName,
      currentUser,
      sendVerificationEmailInProgress,
      sendVerificationEmailError,
      onManageDisableScrolling,
      onResendVerificationEmail,
    } = this.props;

    const user = ensureCurrentUser(currentUser);
    const classes = classNames(rootClassName || css.root, className);

    let content = null;

    const currentUserLoaded = user && user.id;
    if (currentUserLoaded && isUserAuthorized(currentUser)) {
      if (this.state.showMissingInformationReminder === EMAIL_VERIFICATION) {
        content = (
          <EmailReminder
            className={classes}
            user={user}
            onResendVerificationEmail={onResendVerificationEmail}
            sendVerificationEmailInProgress={sendVerificationEmailInProgress}
            sendVerificationEmailError={sendVerificationEmailError}
          />
        );
      }
    }

    const closeButtonMessage = (
      <FormattedMessage id="ModalMissingInformation.closeVerifyEmailReminder" />
    );

    return (
      <Modal
        id="MissingInformationReminder"
        containerClassName={classNames(css.modalContainer, containerClassName)}
        scrollLayerClassName={css.modalScrollLayer}
        isOpen={!!this.state.showMissingInformationReminder}
        onClose={() => {
          const userId = this.props.currentUser?.id?.uuid;
          markReminderSeen(userId);
          const cb = this.state.afterCloseCallback;
          this.setState({ showMissingInformationReminder: null, afterCloseCallback: null }, () => {
            if (cb) cb();
          });
        }}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
        closeButtonMessage={closeButtonMessage}
      >
        {content}
      </Modal>
    );
  }
}

/**
 * Modal that tells user that they have not saved all the information the service needs.
 * This is used to remind user that they need to verify their email address.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string?} props.containerClassName overwrite components own css.container
 * @param {string} props.id
 * @param {Object} props.currentUser API entity
 * @param {Function} props.onManageDisableScrolling
 * @param {Object?} props.sendVerificationEmailError
 * @param {boolean} props.sendVerificationEmailInProgress
 * @returns {JSX.Element} Modal element if user needs to be reminded
 */
const EnhancedModalMissingInformation = props => {
  const routeConfiguration = useRouteConfiguration();

  return <ModalMissingInformation routeConfiguration={routeConfiguration} {...props} />;
};

export default EnhancedModalMissingInformation;
