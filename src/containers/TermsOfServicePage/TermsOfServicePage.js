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

import css from './TermsOfServicePage.module.css';

/**
 * Termos de Serviço.
 *
 * O conteúdo escrito à mão que aqui estava foi substituído pelo documento
 * jurídico oficial (n.º 1), que vive em LegalPage/documentos/ e é gerado a
 * partir do .docx do jurídico.
 *
 * O URL /terms-of-service mantém-se de propósito: está ligado do banner de
 * cookies, do formulário de registo, da FAQ e de emails já enviados. Quebrá-lo
 * para arrumar a casa seria pior do que a desarrumação.
 */

const SLUG = 'termos-de-servico';

/**
 * O texto, sem moldura.
 *
 * É isto que a AuthenticationPage mostra no modal de aceitação — ou seja, o que
 * a pessoa aceita ao registar-se passa a ser o documento a sério, sem ter sido
 * preciso mexer no fluxo de registo.
 */
export const TermsOfServiceContent = () => {
  const { locale } = useLocale();
  return <LegalDocumentBySlug slug={SLUG} comCabecalho isEN={locale === 'en'} />;
};

const TermsOfServicePageComponent = props => {
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
      title={isEN ? 'Terms of Service | Venue1Hub' : 'Termos de Serviço | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <h1 className={css.title}>{isEN ? 'Terms of Service' : 'Termos de Serviço'}</h1>
          <TermsOfServiceContent />
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

const TermsOfServicePage = compose(connect(mapStateToProps))(TermsOfServicePageComponent);

const TOS_ASSET_NAME = 'terms-of-service';
export { TOS_ASSET_NAME, TermsOfServicePageComponent };
export default TermsOfServicePage;
