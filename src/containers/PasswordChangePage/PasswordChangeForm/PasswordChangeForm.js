import React, { Component } from 'react';
import { Form as FinalForm } from 'react-final-form';
import classNames from 'classnames';

import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { propTypes } from '../../../util/types';
import * as validators from '../../../util/validators';
import { ensureCurrentUser } from '../../../util/data';
import { isChangePasswordWrongPassword } from '../../../util/errors';

import { Form, PrimaryButton, FieldTextInput, H4 } from '../../../components';

import css from './PasswordChangeForm.module.css';

const RESET_TIMEOUT = 800;

const EyeIcon = ({ visible }) =>
  visible ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z"/>
    </svg>
  );

/**
 * The change-password form.
 * TODO: change to functional component
 *
 * @component
 * @param {Object} props
 * @param {string} [props.formId] - The form ID
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {function} props.onSubmit - The function to submit the form
 * @param {boolean} [props.inProgress] - Whether the form is in progress
 * @param {boolean} [props.resetPasswordInProgress] - Whether the reset password is in progress
 * @param {boolean} props.ready - Whether the form is ready
 * @param {propTypes.error} [props.changePasswordError] - The change password error
 * @param {propTypes.error} [props.resetPasswordError] - The reset password error
 * @returns {JSX.Element} Change-password form component
 */
class PasswordChangeForm extends Component {
  constructor(props) {
    super(props);
    this.state = {
      showResetPasswordMessage: false,
      showNewPassword: false,
      showCurrentPassword: false,
    };
    this.resetTimeoutId = null;
    this.submittedValues = {};
    this.handleResetPassword = this.handleResetPassword.bind(this);
  }
  componentWillUnmount() {
    window.clearTimeout(this.resetTimeoutId);
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
            formId,
            changePasswordError,
            currentUser,
            handleSubmit,
            inProgress = false,
            resetPasswordInProgress = false,
            invalid,
            pristine,
            ready,
            form,
            values,
          } = fieldRenderProps;

          const intl = useIntl();
          const user = ensureCurrentUser(currentUser);

          if (!user.id) {
            return null;
          }

          // New password
          const newPasswordLabel = intl.formatMessage({
            id: 'PasswordChangeForm.newPasswordLabel',
          });
          const newPasswordPlaceholder = intl.formatMessage({
            id: 'PasswordChangeForm.newPasswordPlaceholder',
          });
          const newPasswordRequiredMessage = intl.formatMessage({
            id: 'PasswordChangeForm.newPasswordRequired',
          });
          const newPasswordRequired = validators.requiredStringNoTrim(newPasswordRequiredMessage);

          const passwordMinLengthMessage = intl.formatMessage(
            {
              id: 'PasswordChangeForm.passwordTooShort',
            },
            {
              minLength: validators.PASSWORD_MIN_LENGTH,
            }
          );
          const passwordMaxLengthMessage = intl.formatMessage(
            {
              id: 'PasswordChangeForm.passwordTooLong',
            },
            {
              maxLength: validators.PASSWORD_MAX_LENGTH,
            }
          );

          const passwordMinLength = validators.minLength(
            passwordMinLengthMessage,
            validators.PASSWORD_MIN_LENGTH
          );
          const passwordMaxLength = validators.maxLength(
            passwordMaxLengthMessage,
            validators.PASSWORD_MAX_LENGTH
          );
          const passwordFormatMessage = intl.formatMessage({
            id: 'PasswordChangeForm.passwordTooWeak',
          });
          const passwordFormatValid = validators.passwordFormatValid(passwordFormatMessage);

          // password
          const passwordLabel = intl.formatMessage({
            id: 'PasswordChangeForm.passwordLabel',
          });
          const passwordPlaceholder = intl.formatMessage({
            id: 'PasswordChangeForm.passwordPlaceholder',
          });
          const passwordRequiredMessage = intl.formatMessage({
            id: 'PasswordChangeForm.passwordRequired',
          });

          const passwordRequired = validators.requiredStringNoTrim(passwordRequiredMessage);

          const passwordFailedMessage = intl.formatMessage({
            id: 'PasswordChangeForm.passwordFailed',
          });
          const passwordTouched =
            values.currentPassword &&
            this.submittedValues.currentPassword !== values.currentPassword;
          const passwordErrorText = isChangePasswordWrongPassword(changePasswordError)
            ? passwordFailedMessage
            : null;

          const confirmClasses = classNames(css.confirmChangesSection, {
            [css.confirmChangesSectionVisible]: !pristine,
          });

          const genericFailure =
            changePasswordError && !passwordErrorText ? (
              <span className={css.error}>
                <FormattedMessage id="PasswordChangeForm.genericFailure" />
              </span>
            ) : null;

          const classes = classNames(rootClassName || css.root, className);
          const submitDisabled = inProgress;

          const sendPasswordLink = (
            <span className={css.helperLink} onClick={this.handleResetPassword} role="button">
              <FormattedMessage id="PasswordChangeForm.resetPasswordLinkText" />
            </span>
          );

          const resendPasswordLink = (
            <span className={css.helperLink} onClick={this.handleResetPassword} role="button">
              <FormattedMessage id="PasswordChangeForm.resendPasswordLinkText" />
            </span>
          );

          const resetPasswordLink =
            this.state.showResetPasswordMessage || resetPasswordInProgress ? (
              <>
                <FormattedMessage
                  id="PasswordChangeForm.resetPasswordLinkSent"
                  values={{
                    email: <span className={css.emailStyle}>{currentUser.attributes.email}</span>,
                  }}
                />{' '}
                {resendPasswordLink}
              </>
            ) : (
              sendPasswordLink
            );

          return (
            <Form
              className={classes}
              onSubmit={e => {
                this.submittedValues = values;
                handleSubmit(e)
                  .then(() => {
                    this.resetTimeoutId = window.setTimeout(() => {
                      form.restart();
                      if (this.props.onChange) {
                        this.props.onChange();
                      }
                    }, RESET_TIMEOUT);
                  })
                  .catch(() => {
                    // Error is handled in duck file already.
                  });
              }}
            >
              <div className={`${css.newPasswordSection} ${css.passwordWrapper}`}>
                <FieldTextInput
                  type={this.state.showNewPassword ? 'text' : 'password'}
                  id={formId ? `${formId}.newPassword` : 'newPassword'}
                  name="newPassword"
                  autoComplete="new-password"
                  label={newPasswordLabel}
                  placeholder={newPasswordPlaceholder}
                  maxLength={validators.PASSWORD_MAX_LENGTH}
                  validate={validators.composeValidators(
                    newPasswordRequired,
                    passwordMinLength,
                    passwordMaxLength,
                    passwordFormatValid
                  )}
                />
                <button
                  type="button"
                  className={css.eyeButton}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => this.setState(s => ({ showNewPassword: !s.showNewPassword }))}
                  tabIndex="-1"
                  aria-label={intl.formatMessage({
                    id: this.state.showNewPassword ? 'SignupForm.hidePassword' : 'SignupForm.showPassword',
                  })}
                >
                  <EyeIcon visible={this.state.showNewPassword} />
                </button>
              </div>

              <div className={confirmClasses} aria-hidden={pristine}>
                <H4 as="h3" className={css.confirmChangesTitle}>
                  <FormattedMessage id="PasswordChangeForm.confirmChangesTitle" />
                </H4>
                <p className={css.confirmChangesInfo}>
                  <FormattedMessage id="PasswordChangeForm.confirmChangesInfo" />
                  <br />
                  <FormattedMessage
                    id="PasswordChangeForm.resetPasswordInfo"
                    values={{ resetPasswordLink }}
                  />
                </p>

                <div className={css.passwordWrapper}>
                  <FieldTextInput
                    className={css.password}
                    type={this.state.showCurrentPassword ? 'text' : 'password'}
                    id="currentPassword"
                    name="currentPassword"
                    disabled={pristine}
                    autoComplete="current-password"
                    label={passwordLabel}
                    placeholder={passwordPlaceholder}
                    maxLength={validators.PASSWORD_MAX_LENGTH}
                    validate={validators.composeValidators(
                      passwordRequired,
                      passwordMinLength,
                      passwordMaxLength
                    )}
                    customErrorText={passwordTouched ? null : passwordErrorText}
                  />
                  <button
                    type="button"
                    className={css.eyeButton}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => this.setState(s => ({ showCurrentPassword: !s.showCurrentPassword }))}
                    tabIndex="-1"
                    aria-label={intl.formatMessage({
                      id: this.state.showCurrentPassword ? 'SignupForm.hidePassword' : 'SignupForm.showPassword',
                    })}
                  >
                    <EyeIcon visible={this.state.showCurrentPassword} />
                  </button>
                </div>
              </div>
              <div className={css.bottomWrapper}>
                {genericFailure}
                <PrimaryButton
                  type="submit"
                  inProgress={inProgress}
                  ready={ready}
                  disabled={submitDisabled}
                >
                  <FormattedMessage id="PasswordChangeForm.saveChanges" />
                </PrimaryButton>
              </div>
            </Form>
          );
        }}
      />
    );
  }
}

export default PasswordChangeForm;
