import React, { Component, useState, useRef, useEffect } from 'react';
import 'flag-icons/css/flag-icons.min.css';
import { compose } from 'redux';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';
import { Form as FinalForm, Field } from 'react-final-form';

import { FormattedMessage, injectIntl, intlShape } from '../../../util/reactIntl';
import { propTypes } from '../../../util/types';
import * as validators from '../../../util/validators';
import { ensureCurrentUser } from '../../../util/data';
import {
  isChangeEmailTakenError,
  isChangeEmailWrongPassword,
  isTooManyEmailVerificationRequestsError,
} from '../../../util/errors';

import {
  FieldPhoneNumberInput,
  Form,
  PrimaryButton,
  FieldTextInput,
  H4,
} from '../../../components';

import css from './ContactDetailsForm.module.css';

const SHOW_EMAIL_SENT_TIMEOUT = 2000;

// Country list (kept in sync with ContactPage)
const PHONE_COUNTRIES = [
  { code: 'pt', dial: '+351', digits: 9 },
  { code: 'es', dial: '+34',  digits: 9 },
  { code: 'fr', dial: '+33',  digits: 10 },
  { code: 'gb', dial: '+44',  digits: 11 },
  { code: 'de', dial: '+49',  digits: 11 },
  { code: 'it', dial: '+39',  digits: 10 },
  { code: 'nl', dial: '+31',  digits: 9 },
  { code: 'be', dial: '+32',  digits: 9 },
  { code: 'ch', dial: '+41',  digits: 9 },
  { code: 'us', dial: '+1',   digits: 10 },
  { code: 'br', dial: '+55',  digits: 11 },
  { code: 'ao', dial: '+244', digits: 9 },
  { code: 'mz', dial: '+258', digits: 9 },
];

// Parse a stored phone like "+351 912 345 678" into { prefix, digits }
const parsePhone = stored => {
  const safe = (stored || '').toString().trim();
  if (!safe) return { prefix: '+351', digits: '' };
  // Try to match a known country prefix (longest first to avoid +1 catching +12)
  const sorted = [...PHONE_COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  const match = sorted.find(c => safe.startsWith(c.dial));
  if (match) {
    const rest = safe.slice(match.dial.length).replace(/\D+/g, '');
    return { prefix: match.dial, digits: rest };
  }
  return { prefix: '+351', digits: safe.replace(/\D+/g, '') };
};

const formatDigitGroups = digits =>
  (digits || '').toString().replace(/\D+/g, '').replace(/(\d{3})(?=\d)/g, '$1 ');

const PhonePrefixDropdown = ({ value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = PHONE_COUNTRIES.find(c => c.dial === value) || PHONE_COUNTRIES[0];

  useEffect(() => {
    const handler = e => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={css.phonePrefixWrapper} ref={ref}>
      <button
        type="button"
        className={css.phonePrefixBtn}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <span className={`fi fi-${selected.code}`} />
        <span>{selected.dial}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1l4 4 4-4" stroke="#888" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul className={css.phonePrefixDropdown}>
          {PHONE_COUNTRIES.map(c => (
            <li key={c.code}>
              <button
                type="button"
                className={`${css.phonePrefixOption}${c.dial === value ? ` ${css.phonePrefixOptionSelected}` : ''}`}
                onClick={() => { onChange(c.dial); setOpen(false); }}
              >
                <span className={`fi fi-${c.code}`} />
                <span>{c.code.toUpperCase()} {c.dial}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const PhoneNumberMaybe = props => {
  const { formId, userTypeConfig, intl } = props;

  const isDisabled = userTypeConfig?.defaultUserFields?.phoneNumber === false;
  if (isDisabled) {
    return null;
  }

  const { required } = userTypeConfig?.phoneNumberSettings || {};
  const isRequired = required === true;

  const inputId = formId ? `${formId}.phoneNumber` : 'phoneNumber';
  const label = intl.formatMessage({ id: 'ContactDetailsForm.phoneLabel' });
  const requiredMessage = intl.formatMessage({ id: 'ContactDetailsForm.phoneRequired' });

  return (
    <div className={css.phone}>
      <label htmlFor={inputId} className={css.phoneLabel}>{label}</label>
      <Field
        name="phoneNumber"
        validate={value => {
          if (isRequired && !value) return requiredMessage;
          return undefined;
        }}
      >
        {({ input, meta }) => {
          const { prefix, digits } = parsePhone(input.value);
          const country = PHONE_COUNTRIES.find(c => c.dial === prefix) || PHONE_COUNTRIES[0];
          const formattedDigits = formatDigitGroups(digits);

          const updateValue = (newPrefix, newDigits) => {
            const cleaned = (newDigits || '').replace(/\D+/g, '').slice(0, country.digits);
            const grouped = formatDigitGroups(cleaned);
            input.onChange(cleaned ? `${newPrefix} ${grouped}` : '');
          };

          return (
            <>
              <div className={css.phoneInputWrapper}>
                <PhonePrefixDropdown
                  value={prefix}
                  onChange={newPrefix => updateValue(newPrefix, '')}
                />
                <input
                  id={inputId}
                  className={css.phoneInput}
                  type="tel"
                  placeholder="9XX XXX XXX"
                  value={formattedDigits}
                  onChange={e => updateValue(prefix, e.target.value)}
                  onBlur={input.onBlur}
                  onFocus={input.onFocus}
                />
              </div>
              {meta.touched && meta.error ? (
                <p className={css.phoneError}>{meta.error}</p>
              ) : null}
            </>
          );
        }}
      </Field>
    </div>
  );
};

/**
 * The ContactDetailsForm component.
 *
 * @component
 * @param {Object} props
 * @param {string} [props.rootClassName] - The root class name to be used instead of the default css.root.
 * @param {string} [props.className] - The class name
 * @param {string} [props.formId] - The form id
 * @param {propTypes.error} [props.saveEmailError] - The save email error
 * @param {propTypes.error} [props.savePhoneNumberError] - The save phone number error
 * @param {boolean} props.inProgress - Whether the form is in progress
 * @param {intlShape} props.intl - The intl object
 * @param {Function} props.onResendVerificationEmail - The resend verification email function
 * @param {boolean} props.ready - Whether the form is ready
 * @param {propTypes.error} props.sendVerificationEmailError - The send verification email error
 * @param {boolean} props.sendVerificationEmailInProgress - Whether the send verification email is in progress
 * @param {boolean} props.resetPasswordInProgress - Whether the reset password is in progress
 * @param {propTypes.error} props.resetPasswordError - The reset password error
 * @returns {JSX.Element}
 */
class ContactDetailsFormComponent extends Component {
  constructor(props) {
    super(props);
    this.state = { showVerificationEmailSentMessage: false, showResetPasswordMessage: false };
    this.emailSentTimeoutId = null;
    this.restartTimeoutId = null;
    this.handleResendVerificationEmail = this.handleResendVerificationEmail.bind(this);
    this.handleResetPassword = this.handleResetPassword.bind(this);
    this.submittedValues = {};
  }

  componentWillUnmount() {
    window.clearTimeout(this.emailSentTimeoutId);
    window.clearTimeout(this.restartTimeoutId);
  }

  handleResendVerificationEmail() {
    this.setState({ showVerificationEmailSentMessage: true });

    this.props.onResendVerificationEmail().then(() => {
      // show "verification email sent" text for a bit longer.
      this.emailSentTimeoutId = window.setTimeout(() => {
        this.setState({ showVerificationEmailSentMessage: false });
      }, SHOW_EMAIL_SENT_TIMEOUT);
    });
  }

  handleResetPassword() {
    this.setState({ showResetPasswordMessage: true });
    const email = this.props.currentUser.attributes.email;
    this.props.onResetPassword(email);
  }

  render() {
    return (
      <FinalForm
        {...this.props}
        render={fieldRenderProps => {
          const {
            rootClassName,
            className,
            saveEmailError,
            savePhoneNumberError,
            currentUser,
            formId,
            handleSubmit,
            inProgress = false,
            intl,
            invalid,
            sendVerificationEmailError,
            sendVerificationEmailInProgress = false,
            resetPasswordInProgress = false,
            values,
            userTypeConfig,
          } = fieldRenderProps;
          const { email, phoneNumber } = values;

          const user = ensureCurrentUser(currentUser);

          if (!user.id) {
            return null;
          }

          const { email: currentEmail, emailVerified, pendingEmail, profile } = user.attributes;

          // email

          // has the email changed
          const emailChanged = currentEmail !== email;

          const emailLabel = intl.formatMessage({
            id: 'ContactDetailsForm.emailLabel',
          });

          const emailPlaceholder = currentEmail || '';

          const emailRequiredMessage = intl.formatMessage({
            id: 'ContactDetailsForm.emailRequired',
          });
          const emailRequired = validators.required(emailRequiredMessage);
          const emailInvalidMessage = intl.formatMessage({
            id: 'ContactDetailsForm.emailInvalid',
          });
          const emailValid = validators.emailFormatValid(emailInvalidMessage);

          const tooManyVerificationRequests = isTooManyEmailVerificationRequestsError(
            sendVerificationEmailError
          );

          const emailTouched = this.submittedValues.email !== values.email;
          const emailTakenErrorText = isChangeEmailTakenError(saveEmailError)
            ? intl.formatMessage({ id: 'ContactDetailsForm.emailTakenError' })
            : null;

          let resendEmailMessage = null;
          if (tooManyVerificationRequests) {
            resendEmailMessage = (
              <span className={css.tooMany}>
                <FormattedMessage id="ContactDetailsForm.tooManyVerificationRequests" />
              </span>
            );
          } else if (
            sendVerificationEmailInProgress ||
            this.state.showVerificationEmailSentMessage
          ) {
            resendEmailMessage = (
              <span className={css.emailSent}>
                <FormattedMessage id="ContactDetailsForm.emailSent" />
              </span>
            );
          } else {
            resendEmailMessage = (
              <span
                className={css.helperLink}
                onClick={this.handleResendVerificationEmail}
                role="button"
              >
                <FormattedMessage id="ContactDetailsForm.resendEmailVerificationText" />
              </span>
            );
          }

          // Email status info: unverified, verified and pending email (aka changed unverified email)
          let emailVerifiedInfo = null;

          if (emailVerified && !pendingEmail && !emailChanged) {
            // Current email is verified and there's no pending unverified email
            emailVerifiedInfo = (
              <span className={css.emailVerified}>
                <FormattedMessage id="ContactDetailsForm.emailVerified" />
              </span>
            );
          } else if (!emailVerified && !pendingEmail) {
            // Current email is unverified. This is the email given in sign up form

            emailVerifiedInfo = (
              <span className={css.emailUnverified}>
                <FormattedMessage
                  id="ContactDetailsForm.emailUnverified"
                  values={{ resendEmailMessage }}
                />
              </span>
            );
          } else if (pendingEmail) {
            // Current email has been tried to change, but the new address is not yet verified

            const pendingEmailStyled = <span className={css.emailStyle}>{pendingEmail}</span>;
            const pendingEmailCheckInbox = (
              <span className={css.checkInbox}>
                <FormattedMessage
                  id="ContactDetailsForm.pendingEmailCheckInbox"
                  values={{ pendingEmail: pendingEmailStyled }}
                />
              </span>
            );

            emailVerifiedInfo = (
              <span className={css.pendingEmailUnverified}>
                <FormattedMessage
                  id="ContactDetailsForm.pendingEmailUnverified"
                  values={{ pendingEmailCheckInbox, resendEmailMessage }}
                />
              </span>
            );
          }

          // phone
          const protectedData = profile.protectedData || {};
          const currentPhoneNumber = protectedData.phoneNumber;

          // has the phone number changed
          const phoneNumberChanged =
            currentPhoneNumber !== phoneNumber &&
            !(typeof currentPhoneNumber === 'undefined' && phoneNumber === '');

          // password
          const passwordLabel = intl.formatMessage({
            id: 'ContactDetailsForm.passwordLabel',
          });
          const passwordPlaceholder = intl.formatMessage({
            id: 'ContactDetailsForm.passwordPlaceholder',
          });
          const passwordRequiredMessage = intl.formatMessage({
            id: 'ContactDetailsForm.passwordRequired',
          });

          const passwordRequired = validators.requiredStringNoTrim(passwordRequiredMessage);

          const passwordMinLengthMessage = intl.formatMessage(
            {
              id: 'ContactDetailsForm.passwordTooShort',
            },
            {
              minLength: validators.PASSWORD_MIN_LENGTH,
            }
          );

          const passwordMinLength = validators.minLength(
            passwordMinLengthMessage,
            validators.PASSWORD_MIN_LENGTH
          );

          const passwordValidators = emailChanged
            ? validators.composeValidators(passwordRequired, passwordMinLength)
            : null;

          const passwordFailedMessage = intl.formatMessage({
            id: 'ContactDetailsForm.passwordFailed',
          });
          const passwordTouched = this.submittedValues.currentPassword !== values.currentPassword;
          const passwordErrorText = isChangeEmailWrongPassword(saveEmailError)
            ? passwordFailedMessage
            : null;

          const confirmClasses = classNames(css.confirmChangesSection, {
            [css.confirmChangesSectionVisible]: emailChanged,
          });

          // generic error
          const isGenericEmailError = saveEmailError && !(emailTakenErrorText || passwordErrorText);

          let genericError = null;

          if (isGenericEmailError && savePhoneNumberError) {
            genericError = (
              <span className={css.error}>
                <FormattedMessage id="ContactDetailsForm.genericFailure" />
              </span>
            );
          } else if (isGenericEmailError) {
            genericError = (
              <span className={css.error}>
                <FormattedMessage id="ContactDetailsForm.genericEmailFailure" />
              </span>
            );
          } else if (savePhoneNumberError) {
            genericError = (
              <span className={css.error}>
                <FormattedMessage id="ContactDetailsForm.genericPhoneNumberFailure" />
              </span>
            );
          }

          const sendPasswordLink = (
            <span className={css.helperLink} onClick={this.handleResetPassword} role="button">
              <FormattedMessage id="ContactDetailsForm.resetPasswordLinkText" />
            </span>
          );

          const resendPasswordLink = (
            <span className={css.helperLink} onClick={this.handleResetPassword} role="button">
              <FormattedMessage id="ContactDetailsForm.resendPasswordLinkText" />
            </span>
          );

          const resetPasswordLink =
            this.state.showResetPasswordMessage || resetPasswordInProgress ? (
              <>
                <FormattedMessage
                  id="ContactDetailsForm.resetPasswordLinkSent"
                  values={{
                    email: <span className={css.emailStyle}>{currentUser.attributes.email}</span>,
                  }}
                />{' '}
                {resendPasswordLink}
              </>
            ) : (
              sendPasswordLink
            );

          const classes = classNames(rootClassName || css.root, className);
          const submittedOnce = Object.keys(this.submittedValues).length > 0;
          const pristineSinceLastSubmit = submittedOnce && isEqual(values, this.submittedValues);
          const submitDisabled = inProgress;

          return (
            <Form
              className={classes}
              onSubmit={e => {
                this.submittedValues = values;
                handleSubmit(e).then(() => {
                  this.restartTimeoutId = setTimeout(() => {
                    fieldRenderProps.form.restart({ email, phoneNumber });
                  }, 1000);
                });
              }}
            >
              <div className={css.contactDetailsSection}>
                <FieldTextInput
                  type="email"
                  name="email"
                  id={formId ? `${formId}.email` : 'email'}
                  label={emailLabel}
                  placeholder={emailPlaceholder}
                  maxLength={100}
                  validate={validators.composeValidators(emailRequired, emailValid)}
                  customErrorText={emailTouched ? null : emailTakenErrorText}
                />
                {emailVerifiedInfo}

                <PhoneNumberMaybe formId={formId} userTypeConfig={userTypeConfig} intl={intl} />
              </div>

              <div className={confirmClasses} aria-hidden={!emailChanged}>
                <H4 as="h3" className={css.confirmChangesTitle}>
                  <FormattedMessage id="ContactDetailsForm.confirmChangesTitle" />
                </H4>
                <p className={css.confirmChangesInfo}>
                  <FormattedMessage id="ContactDetailsForm.confirmChangesInfo" />
                  <br />
                  <FormattedMessage
                    id="ContactDetailsForm.resetPasswordInfo"
                    values={{ resetPasswordLink }}
                  />
                </p>

                <FieldTextInput
                  className={css.password}
                  type="password"
                  name="currentPassword"
                  id={formId ? `${formId}.currentPassword` : 'currentPassword'}
                  disabled={!emailChanged}
                  autoComplete="current-password"
                  label={passwordLabel}
                  placeholder={passwordPlaceholder}
                  validate={passwordValidators}
                  customErrorText={passwordTouched ? null : passwordErrorText}
                />
              </div>
              <div className={css.bottomWrapper}>
                {genericError}
                <PrimaryButton
                  type="submit"
                  inProgress={inProgress}
                  ready={pristineSinceLastSubmit}
                  disabled={submitDisabled}
                >
                  <FormattedMessage id="ContactDetailsForm.saveChanges" />
                </PrimaryButton>
              </div>
            </Form>
          );
        }}
      />
    );
  }
}

const ContactDetailsForm = compose(injectIntl)(ContactDetailsFormComponent);

ContactDetailsForm.displayName = 'ContactDetailsForm';

export default ContactDetailsForm;
