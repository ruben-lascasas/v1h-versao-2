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

import css from './CookiePolicyPage.module.css';

/**
 * Política de Cookies.
 *
 * Passou a mostrar o documento jurídico oficial (n.º 11). A tabela de cookies
 * que o documento traz vinha em branco, com `[COOKIE]` e `[FORNECEDOR]`; é
 * preenchida com os cookies reais da plataforma no conversor — ver
 * TABELA_COOKIES em scripts/converterJuridicos.js.
 *
 * O URL /cookie-policy mantém-se: é para lá que o banner de cookies aponta.
 */

const SLUG = 'politica-de-cookies';

export const CookiePolicyContent = () => {
  const { locale } = useLocale();
  return <LegalDocumentBySlug slug={SLUG} comCabecalho isEN={locale === 'en'} />;
};

const CookiePolicyPageComponent = props => {
  const { scrollingDisabled } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const history = useHistory();

  const handleBack = () => {
    if (history.length > 1) history.goBack();
    else history.push('/');
  };

  const abrirPreferencias = () => {
    if (typeof window !== 'undefined' && typeof window.__v1hOpenCookiePrefs === 'function') {
      window.__v1hOpenCookiePrefs();
    }
  };

  return (
    <Page
      title={isEN ? 'Cookie Policy | Venue1Hub' : 'Política de Cookies | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <h1 className={css.title}>{isEN ? 'Cookie Policy' : 'Política de Cookies'}</h1>
          <CookiePolicyContent />
          {/* A política explica as categorias; o botão é o que permite mudar de
              facto a escolha, sem ter de procurar o link no rodapé. */}
          <p className={css.text}>
            <button type="button" className={css.backButton} onClick={abrirPreferencias}>
              {isEN ? 'COOKIE SETTINGS' : 'DEFINIÇÕES DE COOKIES'}
            </button>
          </p>
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

const CookiePolicyPage = compose(connect(mapStateToProps))(CookiePolicyPageComponent);

const COOKIE_POLICY_ASSET_NAME = 'cookie-policy';
export { COOKIE_POLICY_ASSET_NAME, CookiePolicyPageComponent };
export default CookiePolicyPage;
