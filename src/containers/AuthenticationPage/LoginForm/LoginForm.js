import React, { useState, useEffect } from 'react';
import { Form as FinalForm } from 'react-final-form';
import classNames from 'classnames';

import { useIntl } from '../../../util/reactIntl';
import * as validators from '../../../util/validators';
import { Form, PrimaryButton, FieldTextInput, FieldCheckbox, NamedLink } from '../../../components';

import css from './LoginForm.module.css';

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

const LoginFormComponent = props => {
  const [showPassword, setShowPassword] = useState(false);
  const [rememberedEmail, setRememberedEmail] = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('rememberedEmail');
    if (saved) {
      setRememberedEmail(saved);
    }
  }, []);

  return (
    <FinalForm
      {...props}
      initialValues={{ email: rememberedEmail || props.initialValues?.email }}
      render={fieldRenderProps => {
        const {
          rootClassName,
          className,
          formId,
          handleSubmit,
          inProgress,
          invalid,
          values,
          errors,
          intl,
        } = fieldRenderProps;

        const emailRequired = validators.required(intl.formatMessage({ id: 'LoginForm.emailRequired' }));
        const emailValid = validators.emailFormatValid(intl.formatMessage({ id: 'LoginForm.emailInvalid' }));
        const passwordRequired = validators.requiredStringNoTrim(intl.formatMessage({ id: 'LoginForm.passwordRequired' }));

        const emailPlaceholder = intl.formatMessage({ id: 'LoginForm.emailPlaceholder' });
        const passwordPlaceholder = intl.formatMessage({ id: 'LoginForm.passwordPlaceholder' });

        const passwordRecoveryLink = (
          <NamedLink
            name="PasswordRecoveryPage"
            className={css.recoveryLink}
            to={{
              search:
                values?.email && !errors?.email ? `email=${encodeURIComponent(values.email)}` : '',
            }}
          >
            {intl.formatMessage({ id: 'LoginForm.forgotPassword' })}
          </NamedLink>
        );

        const classes = classNames(rootClassName || css.root, className);
        const submitInProgress = inProgress;
        // Allow click even when invalid — final-form shows field-level errors
        // on submit attempt. Only block while a submission is in flight.
        const submitDisabled = submitInProgress;

        const handleFormSubmit = e => {
          if (values?.rememberMe && values?.email) {
            localStorage.setItem('rememberedEmail', values.email);
          } else {
            localStorage.removeItem('rememberedEmail');
          }
          handleSubmit(e);
        };

        return (
          <Form className={classes} onSubmit={handleFormSubmit}>
            <div>
              <FieldTextInput
                type="email"
                id={formId ? `${formId}.email` : 'email'}
                name="email"
                autoComplete="email"
                placeholder={emailPlaceholder}
                maxLength={100}
                validate={validators.composeValidators(emailRequired, emailValid)}
              />
              <div className={css.passwordWrapper}>
                <FieldTextInput
                  className={css.password}
                  type={showPassword ? 'text' : 'password'}
                  id={formId ? `${formId}.password` : 'password'}
                  name="password"
                  autoComplete="current-password"
                  placeholder={passwordPlaceholder}
                  maxLength={validators.PASSWORD_MAX_LENGTH}
                  validate={passwordRequired}
                />
                <button
                  type="button"
                  className={css.eyeButton}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => setShowPassword(v => !v)}
                  tabIndex="-1"
                  aria-label={intl.formatMessage({ id: showPassword ? 'LoginForm.hidePassword' : 'LoginForm.showPassword' })}
                >
                  <EyeIcon visible={showPassword} />
                </button>
              </div>
              <div className={css.rememberRow}>
                <FieldCheckbox
                  id={formId ? `${formId}.rememberMe` : 'rememberMe'}
                  name="rememberMe"
                  label={intl.formatMessage({ id: 'LoginForm.rememberMe' })}
                  value="rememberMe"
                />
              </div>
              <div className={css.forgotPasswordRow}>
                <span className={css.recoveryLinkInfo}>
                  {intl.formatMessage({ id: 'LoginForm.forgotPasswordLabel' })}
                </span>
                {' '}{passwordRecoveryLink}
              </div>
            </div>
            <div className={css.bottomWrapper}>
              <PrimaryButton
                rootClassName={css.submitButton}
                type="submit"
                inProgress={submitInProgress}
                disabled={submitDisabled}
              >
                {intl.formatMessage({ id: 'LoginForm.logIn' })}
              </PrimaryButton>
              <p className={css.switchAuthText}>
                {intl.formatMessage({ id: 'LoginForm.noAccount' })}{' '}
                <NamedLink name="SignupPage" className={css.switchAuthLink}>
                  {intl.formatMessage({ id: 'LoginForm.signupLink' })}
                </NamedLink>
              </p>
            </div>
          </Form>
        );
      }}
    />
  );
};

const LoginForm = props => {
  const intl = useIntl();
  return <LoginFormComponent {...props} intl={intl} />;
};

export default LoginForm;
