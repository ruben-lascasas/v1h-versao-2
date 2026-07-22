import React, { useRef, useState } from 'react';
import { Form as FinalForm, FormSpy } from 'react-final-form';
import arrayMutators from 'final-form-arrays';
import classNames from 'classnames';

import { useIntl } from '../../../util/reactIntl';
import { useConfiguration } from '../../../context/configurationContext';
import { propTypes } from '../../../util/types';
import * as validators from '../../../util/validators';
import { getPropsForCustomUserFieldInputs } from '../../../util/userHelpers';

import {
  Form,
  PrimaryButton,
  FieldTextInput,
  CustomExtendedDataField,
  NamedLink,
  FieldLocationAutocompleteInput,
} from '../../../components';

import FieldSelectUserType from '../FieldSelectUserType';
import UserFieldDisplayName from '../UserFieldDisplayName';
import UserFieldPhoneNumber from '../UserFieldPhoneNumber';
import ProfessionField, { SEGMENT_FORM_NAME, findProfessionConfig } from '../ProfessionField';

import css from './SignupForm.module.css';

const getSoleUserTypeMaybe = userTypes =>
  Array.isArray(userTypes) && userTypes.length === 1 ? userTypes[0].userType : null;

const MIN_AGE = 18;

// Fields per step, used to decide whether "Continuar" can advance —
// unregistered names are simply ignored.
// Step 2 — "Os seus dados": identity + how to reach the user.
const STEP2_FIELDS = ['fname', 'lname', 'dob', 'phoneNumber', 'signupLocation'];
// Step 3 — "Conta": login credentials + username.
const STEP3_FIELDS = ['email', 'password', 'confirmPassword', 'displayName'];

const isPasswordUsedMoreThanOnce = formValues => {
  // confirmPassword is supposed to match the password — exclude it, otherwise
  // this check fires on every valid signup.
  const { confirmPassword, ...otherValues } = formValues;
  const pw = formValues.password;
  const hasPasswordString = pw != null && pw.length >= validators.PASSWORD_MIN_LENGTH;

  if (hasPasswordString) {
    const isPasswordRepeated = Object.values(otherValues).filter(v => v === pw).length > 1;
    return isPasswordRepeated;
  }
  return false;
};

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

// ─── Indicador de força da password (tempo real) ─────────────────────────────
const PasswordStrengthMeter = ({ password, intl }) => {
  if (!password) return null;

  const checks = [
    {
      key: 'length',
      ok: password.length >= validators.PASSWORD_MIN_LENGTH,
      label: intl.formatMessage(
        { id: 'SignupForm.passwordCheckLength' },
        { min: validators.PASSWORD_MIN_LENGTH }
      ),
    },
    {
      key: 'lower',
      ok: /[a-zà-öø-ÿ]/.test(password),
      label: intl.formatMessage({ id: 'SignupForm.passwordCheckLowercase' }),
    },
    {
      key: 'upper',
      ok: /[A-ZÀ-ÖØ-Þ]/.test(password),
      label: intl.formatMessage({ id: 'SignupForm.passwordCheckUppercase' }),
    },
    {
      key: 'digit',
      ok: /[0-9]/.test(password),
      label: intl.formatMessage({ id: 'SignupForm.passwordCheckDigit' }),
    },
  ];
  const passed = checks.filter(c => c.ok).length;
  const level = passed <= 2 ? 'weak' : passed === 3 ? 'medium' : 'strong';

  return (
    <div className={css.strengthMeter} aria-live="polite">
      <div className={css.strengthHeader}>
        <div className={css.strengthTrack}>
          <div
            className={classNames(css.strengthFill, {
              [css.strengthFillWeak]: level === 'weak',
              [css.strengthFillMedium]: level === 'medium',
              [css.strengthFillStrong]: level === 'strong',
            })}
            style={{ width: `${(passed / checks.length) * 100}%` }}
          />
        </div>
        <span
          className={classNames(css.strengthLabel, {
            [css.strengthLabelWeak]: level === 'weak',
            [css.strengthLabelMedium]: level === 'medium',
            [css.strengthLabelStrong]: level === 'strong',
          })}
        >
          {intl.formatMessage({ id: `SignupForm.passwordStrength_${level}` })}
        </span>
      </div>
      <ul className={css.strengthChecklist}>
        {checks.map(c => (
          <li key={c.key} className={c.ok ? css.checkOk : css.checkPending}>
            {c.ok ? '✓' : '•'} {c.label}
          </li>
        ))}
      </ul>
    </div>
  );
};

const SignupFormComponent = props => {
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const config = useConfiguration();
  // Without a geocoder (e.g. missing Mapbox token) the autocomplete can never
  // offer suggestions, so "picked a suggestion" must not gate the submit.
  const hasGeocoderAccess = !!(
    config?.maps?.mapboxAccessToken || config?.maps?.googleMapsAPIKey
  );

  // ── Wizard ──────────────────────────────────────────────────────────────
  // Step 1 (tipo de conta) is skipped when there's a single/preselected type.
  const initialUserType = props.preselectedUserType || getSoleUserTypeMaybe(props.userTypes);
  const hasUserTypeStep = (props.userTypes?.length ?? 0) > 1 && !props.preselectedUserType;
  const firstStep = hasUserTypeStep ? 1 : 2;
  const [step, setStep] = useState(firstStep);
  const prevUserTypeRef = useRef(initialUserType);

  return (
  <FinalForm
    {...props}
    mutators={{ ...arrayMutators }}
    initialValues={{ userType: initialUserType }}
    render={formRenderProps => {
      const {
        rootClassName,
        className,
        formId,
        handleSubmit,
        inProgress,
        invalid,
        intl,
        termsAndConditions,
        preselectedUserType,
        userTypes,
        userFields,
        values,
        errors = {},
      } = formRenderProps;

      const { userType } = values || {};

      const nameLettersOnly = value =>
        value && /[^a-zA-ZÀ-ÿ\s'\-]/.test(value)
          ? intl.formatMessage({ id: 'SignupForm.nameLettersOnly' })
          : undefined;
      const nameMinLength = validators.minLength(intl.formatMessage({ id: 'SignupForm.nameMinLength' }, { min: 2 }), 2);
      const nameMaxLength = validators.maxLength(intl.formatMessage({ id: 'SignupForm.nameMaxLength' }, { max: 35 }), 35);
      const blockNameInput = e => {
        if (/[^a-zA-ZÀ-ÿ\s'\-]/.test(e.key) && e.key.length === 1) e.preventDefault();
      };

      const emailRequired = validators.required(intl.formatMessage({ id: 'SignupForm.emailRequired' }));
      const emailValid = validators.emailFormatValid(intl.formatMessage({ id: 'SignupForm.emailInvalid' }));

      // Data de nascimento: obrigatória e ≥ 18 anos.
      const dobRequired = validators.required(intl.formatMessage({ id: 'SignupForm.dobRequired' }));
      const dobValidAge = value => {
        if (!value) return undefined;
        const dob = new Date(`${value}T00:00:00Z`);
        if (isNaN(dob.getTime())) {
          return intl.formatMessage({ id: 'SignupForm.dobInvalid' });
        }
        const now = new Date();
        let age = now.getUTCFullYear() - dob.getUTCFullYear();
        const monthDiff = now.getUTCMonth() - dob.getUTCMonth();
        if (monthDiff < 0 || (monthDiff === 0 && now.getUTCDate() < dob.getUTCDate())) {
          age--;
        }
        if (age < MIN_AGE) return intl.formatMessage({ id: 'SignupForm.dobUnder18' });
        if (age > 120) return intl.formatMessage({ id: 'SignupForm.dobInvalid' });
        return undefined;
      };

      const passwordMinLength = validators.minLength(
        intl.formatMessage({ id: 'SignupForm.passwordTooShort' }, { minLength: validators.PASSWORD_MIN_LENGTH }),
        validators.PASSWORD_MIN_LENGTH
      );
      const passwordMaxLength = validators.maxLength(
        intl.formatMessage({ id: 'SignupForm.passwordTooLong' }, { maxLength: validators.PASSWORD_MAX_LENGTH }),
        validators.PASSWORD_MAX_LENGTH
      );
      const passwordRequired = validators.requiredStringNoTrim(intl.formatMessage({ id: 'SignupForm.passwordRequired' }));
      const passwordFormatValid = validators.passwordFormatValid(
        intl.formatMessage({ id: 'SignupForm.passwordTooWeak' })
      );
      const passwordValidators = validators.composeValidators(
        passwordRequired,
        passwordMinLength,
        passwordMaxLength,
        passwordFormatValid
      );

      const confirmPasswordRequired = validators.requiredStringNoTrim(
        intl.formatMessage({ id: 'SignupForm.confirmPasswordRequired' })
      );
      const confirmPasswordMatch = value =>
        value !== values.password
          ? intl.formatMessage({ id: 'SignupForm.confirmPasswordMismatch' })
          : undefined;
      const confirmPasswordValidators = validators.composeValidators(
        confirmPasswordRequired,
        passwordMinLength,
        passwordMaxLength,
        confirmPasswordMatch
      );

      // Custom user fields. Since user types are not supported here,
      // only fields with no user type id limitation are selected.
      const userFieldProps = getPropsForCustomUserFieldInputs(userFields, userType);

      // Profissão depends on the selected "Segmento de negócio" (ver
      // ProfessionField). Aqui só precisamos dos valores para o gating do
      // submit.
      const segmentValue = values?.[SEGMENT_FORM_NAME];
      const professionConfig = findProfessionConfig(segmentValue, userFields);
      const professionOptions = professionConfig?.options || null;

      const noUserTypes = !userType && !(userTypes?.length > 0);
      const userTypeConfig = userTypes.find(config => config.userType === userType);
      const showDefaultUserFields = userType || noUserTypes;
      const showCustomUserFields = (userType || noUserTypes) && userFieldProps?.length > 0;

      const classes = classNames(rootClassName || css.root, className);
      const submitInProgress = inProgress;

      // The location field is `{ search, predictions, selectedPlace }`. The
      // user has typed something but not picked an option from the dropdown
      // when `search` has text but `selectedPlace` is null. Block the submit
      // in that intermediate state so they don't end up with no city saved.
      const loc = values?.signupLocation;
      const locationTypingButNotPicked =
        hasGeocoderAccess &&
        !!(loc && typeof loc.search === 'string' && loc.search.trim() && !loc.selectedPlace);

      const passwordRepeatedElsewhere = isPasswordUsedMoreThanOnce(values);

      // ── Gating por passo ──────────────────────────────────────────────
      // "O botão primário só fica ativo quando os obrigatórios mínimos
      // estão preenchidos."
      const step2Invalid =
        STEP2_FIELDS.some(fieldName => errors[fieldName]) || locationTypingButNotPicked;
      const step3Invalid =
        STEP3_FIELDS.some(fieldName => errors[fieldName]) || passwordRepeatedElsewhere;

      // O campo do segmento não está marcado como obrigatório na Console,
      // por isso reforçamos aqui; a profissão é required quando é dropdown.
      const hasSegmentField = userFieldProps.some(f => f.name === SEGMENT_FORM_NAME);
      const segmentMissing = hasSegmentField && !segmentValue;
      const professionMissing = !!professionOptions && !values?.profissao;

      const submitDisabled =
        submitInProgress ||
        invalid ||
        locationTypingButNotPicked ||
        segmentMissing ||
        professionMissing;

      // ── Cabeçalho do wizard ───────────────────────────────────────────
      const displayStep = hasUserTypeStep ? step : step - 1;
      const displayTotal = hasUserTypeStep ? 4 : 3;
      const stepTitleKey =
        step === 1
          ? 'SignupForm.step1Title'
          : step === 2
          ? 'SignupForm.step2Title'
          : step === 3
          ? 'SignupForm.step3Title'
          : 'SignupForm.step4Title';

      return (
        <Form className={classes} onSubmit={handleSubmit}>
          {/* Auto-avança do passo 1 quando o tipo de conta muda. */}
          <FormSpy
            subscription={{ values: true }}
            onChange={({ values: spyValues }) => {
              const nextUserType = spyValues?.userType;
              const prev = prevUserTypeRef.current;
              prevUserTypeRef.current = nextUserType;
              if (nextUserType && nextUserType !== prev) {
                setStep(s => (s === 1 ? 2 : s));
              }
            }}
          />

          <div className={css.wizardHeader}>
            {step > firstStep ? (
              <button
                type="button"
                className={css.backButton}
                onClick={() => setStep(s => Math.max(firstStep, s - 1))}
              >
                ‹ {intl.formatMessage({ id: 'SignupForm.back' })}
              </button>
            ) : (
              <span />
            )}
            <span className={css.stepCount}>
              {intl.formatMessage(
                { id: 'SignupForm.stepOf' },
                { current: displayStep, total: displayTotal }
              )}
            </span>
          </div>
          <div className={css.progressTrack}>
            <div
              className={css.progressFill}
              style={{ width: `${(displayStep / displayTotal) * 100}%` }}
            />
          </div>
          <h3 className={css.stepTitle}>{intl.formatMessage({ id: stepTitleKey })}</h3>

          {/* ── Passo 1 — Tipo de conta ─────────────────────────────────── */}
          <div className={step === 1 ? css.step : css.stepHidden}>
            <FieldSelectUserType
              name="userType"
              userTypes={userTypes}
              hasExistingUserType={!!preselectedUserType}
              intl={intl}
            />
          </div>

          {/* ── Passo 2 — Os seus dados ─────────────────────────────────── */}
          <div className={step === 2 ? css.step : css.stepHidden}>
            {showDefaultUserFields ? (
              <div className={css.defaultUserFields}>
                <div className={css.twoCol}>
                  <FieldTextInput
                    className={css.twoColItem}
                    type="text"
                    id={formId ? `${formId}.fname` : 'fname'}
                    name="fname"
                    autoComplete="given-name"
                    placeholder={intl.formatMessage({ id: 'SignupForm.firstNamePlaceholder' })}
                    onKeyDown={blockNameInput}
                    validate={validators.composeValidators(
                      validators.required(intl.formatMessage({ id: 'SignupForm.firstNameRequired' })),
                      nameLettersOnly,
                      nameMinLength,
                      nameMaxLength
                    )}
                  />
                  <FieldTextInput
                    className={css.twoColItem}
                    type="text"
                    id={formId ? `${formId}.lname` : 'lname'}
                    name="lname"
                    autoComplete="family-name"
                    placeholder={intl.formatMessage({ id: 'SignupForm.lastNamePlaceholder' })}
                    onKeyDown={blockNameInput}
                    validate={validators.composeValidators(
                      validators.required(intl.formatMessage({ id: 'SignupForm.lastNameRequired' })),
                      nameLettersOnly,
                      nameMinLength,
                      nameMaxLength
                    )}
                  />
                </div>

                <div className={classNames(css.twoCol, css.row)}>
                  <FieldTextInput
                    className={css.twoColItem}
                    type="date"
                    id={formId ? `${formId}.dob` : 'dob'}
                    name="dob"
                    autoComplete="bday"
                    label={intl.formatMessage({ id: 'SignupForm.dobLabel' })}
                    validate={validators.composeValidators(dobRequired, dobValidAge)}
                  />

                  <UserFieldPhoneNumber
                    formName="SignupForm"
                    className={css.twoColItem}
                    userTypeConfig={userTypeConfig}
                    intl={intl}
                  />
                </div>

                <div className={css.locationWrapper}>
                  <FieldLocationAutocompleteInput
                    name="signupLocation"
                    placeholder="Cidade, País..."
                    useDefaultPredictions={false}
                    suggestCurrentLocation={false}
                    hideSearchHistory
                    hideExtras
                    format={v => v}
                    valueFromForm={values.signupLocation}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {/* ── Passo 3 — Conta ──────────────────────────────────────────── */}
          <div className={step === 3 ? css.step : css.stepHidden}>
            {showDefaultUserFields ? (
              <div className={css.defaultUserFields}>
                <FieldTextInput
                  className={css.firstRow}
                  type="email"
                  id={formId ? `${formId}.email` : 'email'}
                  name="email"
                  autoComplete="email"
                  placeholder="jane.doe@example.com"
                  maxLength={100}
                  validate={validators.composeValidators(emailRequired, emailValid)}
                />

                <div className={`${css.passwordWrapper} ${css.row}`}>
                  <FieldTextInput
                    className={css.password}
                    type={showPassword ? 'text' : 'password'}
                    id={formId ? `${formId}.password` : 'password'}
                    name="password"
                    autoComplete="new-password"
                    placeholder={intl.formatMessage({ id: 'SignupForm.passwordPlaceholder' })}
                    maxLength={validators.PASSWORD_MAX_LENGTH}
                    validate={passwordValidators}
                  />
                  <button
                    type="button"
                    className={css.eyeButton}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setShowPassword(v => !v)}
                    tabIndex="-1"
                    aria-label={intl.formatMessage({ id: showPassword ? 'SignupForm.hidePassword' : 'SignupForm.showPassword' })}
                  >
                    <EyeIcon visible={showPassword} />
                  </button>
                </div>

                <PasswordStrengthMeter password={values.password} intl={intl} />

                <div className={`${css.passwordWrapper} ${css.row}`}>
                  <FieldTextInput
                    className={css.password}
                    type={showConfirmPassword ? 'text' : 'password'}
                    id={formId ? `${formId}.confirmPassword` : 'confirmPassword'}
                    name="confirmPassword"
                    autoComplete="new-password"
                    placeholder={intl.formatMessage({ id: 'SignupForm.confirmPasswordPlaceholder' })}
                    maxLength={validators.PASSWORD_MAX_LENGTH}
                    validate={confirmPasswordValidators}
                  />
                  <button
                    type="button"
                    className={css.eyeButton}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setShowConfirmPassword(v => !v)}
                    tabIndex="-1"
                    aria-label={intl.formatMessage({ id: showConfirmPassword ? 'SignupForm.hidePassword' : 'SignupForm.showPassword' })}
                  >
                    <EyeIcon visible={showConfirmPassword} />
                  </button>
                </div>

                {passwordRepeatedElsewhere ? (
                  <div className={css.error}>
                    {intl.formatMessage({ id: 'SignupForm.passwordRepeatedOnOtherFields' })}
                  </div>
                ) : null}

                <UserFieldDisplayName
                  formName="SignupForm"
                  className={css.row}
                  userTypeConfig={userTypeConfig}
                  intl={intl}
                />
              </div>
            ) : null}
          </div>

          {/* ── Passo 4 — A sua atividade ───────────────────────────────── */}
          <div className={step === 4 ? css.step : css.stepHidden}>
            {showCustomUserFields ? (
              <div className={css.customFields}>
                {userFieldProps.map(({ key, ...fieldProps }) => (
                  <CustomExtendedDataField key={key} {...fieldProps} formId={formId} />
                ))}
              </div>
            ) : null}

            <ProfessionField className={css.row} formId={formId} userFields={userFields} />

            <div className={css.termsWrapper}>{termsAndConditions}</div>
          </div>

          <div className={css.bottomWrapper}>
            {step < 4 ? (
              <PrimaryButton
                rootClassName={css.submitButton}
                type="button"
                disabled={step === 1 ? !userType : step === 2 ? step2Invalid : step3Invalid}
                onClick={() => setStep(s => Math.min(4, s + 1))}
              >
                {intl.formatMessage({ id: 'SignupForm.continue' })}
              </PrimaryButton>
            ) : (
              <PrimaryButton
                rootClassName={css.submitButton}
                type="submit"
                inProgress={submitInProgress}
                disabled={submitDisabled}
              >
                {intl.formatMessage({ id: 'SignupForm.signUp' })}
              </PrimaryButton>
            )}
            <p className={css.switchAuthText}>
              {intl.formatMessage({ id: 'SignupForm.hasAccount' })}{' '}
              <NamedLink name="LoginPage" className={css.switchAuthLink}>
                {intl.formatMessage({ id: 'SignupForm.loginLink' })}
              </NamedLink>
            </p>
          </div>
        </Form>
      );
    }}
  />
  );
};

/**
 * A component that renders the signup form as a 4-step wizard:
 * 1) tipo de conta, 2) identidade (nome/apelido/dob/username),
 * 3) conta e contacto (email/password/telefone/localização),
 * 4) atividade (segmento/profissão) + termos.
 * All steps stay mounted (hidden via CSS) so field validators stay registered.
 *
 * @component
 * @param {Object} props
 * @param {string} props.rootClassName - The root class name that overrides the default class css.root
 * @param {string} props.className - The class that extends the root class
 * @param {string} props.formId - The form id
 * @param {boolean} props.inProgress - Whether the form is in progress
 * @param {ReactNode} props.termsAndConditions - The terms and conditions
 * @param {string} props.preselectedUserType - The preselected user type
 * @param {propTypes.userTypes} props.userTypes - The user types
 * @param {propTypes.listingFields} props.userFields - The user fields
 * @returns {JSX.Element}
 */
const SignupForm = props => {
  const intl = useIntl();
  return <SignupFormComponent {...props} intl={intl} />;
};

export default SignupForm;
