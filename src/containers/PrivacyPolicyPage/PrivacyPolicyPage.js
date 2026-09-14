import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';

import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import LegalDocumentBySlug from '../LegalPage/LegalDocumentBySlug';

import css from './PrivacyPolicyPage.module.css';

/**
 * Política de Privacidade.
 *
 * Passou a mostrar o documento jurídico oficial (n.º 10) em vez do texto que
 * aqui estava escrito à mão. O URL /privacy-policy mantém-se — está ligado do
 * registo, da FAQ e do banner de cookies.
 */

const SLUG = 'politica-de-privacidade';

/** O texto sem moldura, para o modal de aceitação no registo. */
export const PrivacyPolicyContent = () => {
  const { locale } = useLocale();
  return <LegalDocumentBySlug slug={SLUG} comCabecalho isEN={locale === 'en'} />;
};

const PrivacyPolicyPageComponent = props => {
  const { scrollingDisabled } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const history = useHistory();

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.push('/');
  };

  return (
    <Page
      title={isEN ? 'Privacy Policy | Venue1Hub' : 'Política de Privacidade | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <h1 className={css.title}>{isEN ? 'Privacy Policy' : 'Política de Privacidade'}</h1>
          <PrivacyPolicyContent />
          <p className={css.text}>
            <NamedLink name="LegalCentrePage">
              {isEN ? 'See all legal documents' : 'Ver todos os documentos jurídicos'}
            </NamedLink>
          </p>
          <div className={css.backButtonRow}>
            <button type="button" className={css.backButton} onClick={handleBack}>
              {isEN ? 'BACK' : 'VOLTAR'}
            </button>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

const PrivacyPolicyPage = compose(connect(mapStateToProps))(PrivacyPolicyPageComponent);

const PRIVACY_POLICY_ASSET_NAME = 'privacy-policy';
export { PRIVACY_POLICY_ASSET_NAME, PrivacyPolicyPageComponent };
export default PrivacyPolicyPage;
