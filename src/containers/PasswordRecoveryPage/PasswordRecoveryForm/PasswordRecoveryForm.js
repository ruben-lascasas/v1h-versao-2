import React, { Component } from 'react';
import { Form as FinalForm } from 'react-final-form';
import isEqual from 'lodash/isEqual';
import classNames from 'classnames';

import { propTypes } from '../../../util/types';
import * as validators from '../../../util/validators';
import { isPasswordRecoveryEmailNotFoundError } from '../../../util/errors';

import { Form, PrimaryButton, FieldTextInput, NamedLink } from '../../../components';

import css from './PasswordRecoveryForm.module.css';

class PasswordRecoveryForm extends Component {
  constructor(props) {
    super(props);
    this.submittedValues = {};
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
            handleSubmit,
            pristine,
            initialValues,
            inProgress = false,
            recoveryError,
            values,
          } = fieldRenderProps;

          const emailRequired = validators.required('Este campo é obrigatório.');
          const emailValid = validators.emailFormatValid('Introduza um endereço de email válido.');

          const customErrorText = isPasswordRecoveryEmailNotFoundError(recoveryError)
            ? 'Não encontrámos nenhuma conta com este email.'
            : null;
          const initialEmail = initialValues ? initialValues.email : null;
          const emailTouched = values.email !== this.submittedValues.email;

          const classes = classNames(rootClassName || css.root, className);
          const submitInProgress = inProgress;
          const submittedOnce = Object.keys(this.submittedValues).length > 0;
          const pristineSinceLastSubmit = submittedOnce && isEqual(values, this.submittedValues);
          // Only disable while a submit is actually in progress, so the button
          // stays clickable (and reacts to hover) even with the field empty.
          // Final Form's required validators will still block empty submits and
          // show inline error messages when the user clicks ENVIAR INSTRUÇÕES.
          const submitDisabled = submitInProgress || pristineSinceLastSubmit;

          const loginLink = (
            <NamedLink name="LoginPage" className={css.modalHelperLink}>
              Inicie sessão
            </NamedLink>
          );

          return (
            <Form
              className={classes}
              onSubmit={e => {
                this.submittedValues = values;
                handleSubmit(e);
              }}
            >
              <FieldTextInput
                className={css.email}
                type="email"
                id={formId ? `${formId}.email` : 'email'}
                name="email"
                autoComplete="email"
                label="Email"
                placeholder="jane.doe@example.com"
                maxLength={100}
                validate={validators.composeValidators(emailRequired, emailValid)}
                customErrorText={emailTouched ? null : customErrorText}
              />

              <div className={css.bottomWrapper}>
                <p className={css.bottomWrapperText}>
                  <span className={css.modalHelperText}>
                    Lembrou-se da password? {loginLink}.
                  </span>
                </p>

                <PrimaryButton
                  rootClassName={css.submitButton}
                  type="submit"
                  inProgress={submitInProgress}
                  disabled={submitDisabled}
                >
                  Enviar instruções
                </PrimaryButton>
              </div>
            </Form>
          );
        }}
      />
    );
  }
}

export default PasswordRecoveryForm;
