import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { useIntl } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { isPasswordRecoveryEmailNotFoundError } from '../../util/errors';
import { isScrollingDisabled } from '../../ducks/ui.duck';

import {
  Heading,
  Page,
  InlineTextButton,
  ResponsiveBackgroundImageContainer,
  LayoutSingleColumn,
} from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import PasswordRecoveryForm from './PasswordRecoveryForm/PasswordRecoveryForm';

import {
  recoverPassword,
  retypePasswordRecoveryEmail,
  clearPasswordRecoveryError,
} from './PasswordRecoveryPage.duck';
import css from './PasswordRecoveryPage.module.css';

const PasswordRecovery = props => {
  const { initialEmail, onChange, onSubmitEmail, recoveryInProgress, recoveryError } = props;
  return (
    <div className={css.submitEmailContent}>
      <Heading as="h1" rootClassName={css.modalTitle}>
        Esqueceu a password?
      </Heading>
      <p className={css.modalMessage}>
        Sem problemas! Introduza o email com que se registou e enviaremos instruções para definir uma nova password.
      </p>
      <PasswordRecoveryForm
        inProgress={recoveryInProgress}
        onChange={onChange}
        onSubmit={values => onSubmitEmail(values.email)}
        initialValues={{ email: initialEmail }}
        recoveryError={recoveryError}
      />
    </div>
  );
};

const GenericError = () => {
  return (
    <div className={css.genericErrorContent}>
      <Heading as="h1" rootClassName={css.modalTitle}>
        Ocorreu um erro
      </Heading>
      <p className={css.modalMessage}>
        Não foi possível processar o pedido. Por favor tente novamente.
      </p>
    </div>
  );
};

const EmailSubmittedContent = props => {
  const {
    passwordRequested,
    initialEmail,
    submittedEmail,
    onRetypeEmail,
    onSubmitEmail,
    recoveryInProgress,
  } = props;

  const submittedEmailText = (
    <span className={css.email}>{passwordRequested ? initialEmail : submittedEmail}</span>
  );

  const resendEmailLink = (
    <InlineTextButton rootClassName={css.helperLink} onClick={() => onSubmitEmail(submittedEmail)}>
      reenviar o email
    </InlineTextButton>
  );

  const fixEmailLink = (
    <InlineTextButton rootClassName={css.helperLink} onClick={onRetypeEmail}>
      corrigir o email
    </InlineTextButton>
  );

  return (
    <div className={css.emailSubmittedContent}>
      <Heading as="h1" rootClassName={css.modalTitle}>
        Email enviado
      </Heading>
      <p className={css.modalMessage}>
        Enviámos um email para {submittedEmailText} com instruções para recuperar a sua password.
      </p>
      <div className={css.bottomWrapper}>
        <p className={css.helperText}>
          {recoveryInProgress ? (
            'A reenviar o email…'
          ) : (
            <>Não recebeu? Pode {resendEmailLink}.</>
          )}
        </p>
        <p className={css.helperText}>
          <>Email errado? Pode {fixEmailLink}.</>
        </p>
      </div>
    </div>
  );
};

export const PasswordRecoveryPageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const emailParam = searchParams.get('email');

  const {
    scrollingDisabled,
    initialEmail,
    submittedEmail,
    recoveryError,
    recoveryInProgress,
    passwordRequested,
    onChange,
    onSubmitEmail,
    onRetypeEmail,
  } = props;
  const alreadyrequested = submittedEmail || passwordRequested;
  const emailToUse = emailParam || initialEmail;
  const showPasswordRecoveryForm = (
    <PasswordRecovery
      initialEmail={emailToUse}
      onChange={onChange}
      onSubmitEmail={onSubmitEmail}
      recoveryInProgress={recoveryInProgress}
      recoveryError={recoveryError}
    />
  );

  return (
    <Page
      title={intl.formatMessage({ id: 'PasswordRecoveryPage.title' })}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        mainColumnClassName={css.layoutWrapperMain}
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <ResponsiveBackgroundImageContainer
          className={css.root}
          childrenWrapperClassName={css.contentContainer}
          as="section"
          image={config.branding.brandImage}
          sizes="100%"
          useOverlay
        >
          {isPasswordRecoveryEmailNotFoundError(recoveryError) ? (
            showPasswordRecoveryForm
          ) : recoveryError ? (
            <GenericError />
          ) : alreadyrequested ? (
            <EmailSubmittedContent
              passwordRequested={passwordRequested}
              initialEmail={initialEmail}
              submittedEmail={submittedEmail}
              onRetypeEmail={onRetypeEmail}
              onSubmitEmail={onSubmitEmail}
              recoveryInProgress={recoveryInProgress}
            />
          ) : (
            showPasswordRecoveryForm
          )}
        </ResponsiveBackgroundImageContainer>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const {
    initialEmail,
    submittedEmail,
    recoveryError,
    recoveryInProgress,
    passwordRequested,
  } = state.PasswordRecoveryPage;
  return {
    scrollingDisabled: isScrollingDisabled(state),
    initialEmail,
    submittedEmail,
    recoveryError,
    recoveryInProgress,
    passwordRequested,
  };
};

const mapDispatchToProps = dispatch => ({
  onChange: () => dispatch(clearPasswordRecoveryError()),
  onSubmitEmail: email => dispatch(recoverPassword({ email })),
  onRetypeEmail: () => dispatch(retypePasswordRecoveryEmail()),
});

const PasswordRecoveryPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(PasswordRecoveryPageComponent);

export default PasswordRecoveryPage;
