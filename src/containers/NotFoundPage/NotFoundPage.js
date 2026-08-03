import React, { Component, useEffect } from 'react';
import { compose } from 'redux';
import { connect, useSelector } from 'react-redux';
import { useHistory, Link } from 'react-router-dom';
import { setSearchHistoryUserId } from '../../components/LocationAutocompleteInput/LocationAutocompleteInputImpl';

import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { useIntl } from '../../util/reactIntl';
import { createResourceLocatorString } from '../../util/routes';
import { isMainSearchTypeKeywords } from '../../util/search';
import { isScrollingDisabled } from '../../ducks/ui.duck';

const normalizeTerm = s =>
  s.toLowerCase()
   .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
   .replace(/[^a-z0-9]+/g, ' ')
   .trim();

const CATEGORY_DATA = [
  { slug: 'trabalho-reunioes', terms: ['trabalho reunioes', 'trabalho', 'reunioes', 'work meetings', 'work', 'meetings'] },
  { slug: 'educacao-cultura', terms: ['educacao cultura', 'educacao', 'cultura', 'education culture', 'education', 'culture'] },
  { slug: 'gastronomia-convivio', terms: ['gastronomia convivio', 'gastronomia', 'convivio', 'gastronomy social', 'gastronomy', 'social'] },
  { slug: 'eventos-festas', terms: ['eventos festas', 'eventos', 'festas', 'events parties', 'events', 'parties'] },
  { slug: 'criatividade-producao', terms: ['criatividade producao', 'criatividade', 'producao', 'creativity production', 'creativity', 'production'] },
  { slug: 'saude-bemestar', terms: ['saude bemestar corpo', 'saude', 'bemestar', 'bem estar', 'corpo', 'health wellness body', 'health', 'wellness'] },
  { slug: 'desporto-actividadefisica', terms: ['desporto actividadefisica', 'desporto', 'actividade', 'fisica', 'sport physical activity', 'sport', 'physical', 'activity'] },
  { slug: 'espaco-arlivre', terms: ['espaco ar livre', 'espaco arlivre', 'ar livre', 'arlivre', 'outdoor spaces', 'outdoor', 'outdoors'] },
  { slug: 'espacos_inusitados_alternativos', terms: ['espacos inusitados alternativos', 'inusitados', 'alternativos', 'unusual alternative', 'unusual', 'alternative'] },
];

const CATEGORY_LOOKUP = {};
CATEGORY_DATA.forEach(({ slug, terms }) => {
  terms.forEach(term => { CATEGORY_LOOKUP[normalizeTerm(term)] = slug; });
});

const findCategorySlug = search => CATEGORY_LOOKUP[normalizeTerm(search)] || null;

import { Page, LayoutSingleColumn } from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import SearchForm from './SearchForm/SearchForm';

import css from './NotFoundPage.module.css';

export class NotFoundPageComponent extends Component {
  constructor(props) {
    super(props);
    if (this.props.staticContext) {
      this.props.staticContext.notfound = true;
    }
  }

  render() {
    const {
      history,
      routeConfiguration,
      isKeywordSearch,
      scrollingDisabled,
    } = this.props;

    const handleSearchSubmit = values => {
      const { keywords, location, pub_categoryLevel1 } = values;

      if (pub_categoryLevel1) {
        history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, { pub_categoryLevel1 }));
        return;
      }
      if (keywords) {
        history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, { keywords }));
        return;
      }

      const { search, selectedPlace } = location || {};
      const { origin, bounds } = selectedPlace || {};

      if (selectedPlace) {
        history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, { address: search, origin, bounds }));
      } else if (search) {
        const categorySlug = findCategorySlug(search);
        if (categorySlug) {
          history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, { pub_categoryLevel1: categorySlug }));
        } else {
          history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, { keywords: search }));
        }
      } else {
        history.push(createResourceLocatorString('SearchPage', routeConfiguration, {}, {}));
      }
    };

    const homeLink = createResourceLocatorString('LandingPage', routeConfiguration, {}, {});

    return (
      <Page title="Página não encontrada | Venue1Hub" scrollingDisabled={scrollingDisabled}>
        <LayoutSingleColumn
          hideRecentlyViewed
          topbar={null}
          footer={null}
        >
          <div className={css.root}>
            <div className={css.card}>
              <div className={css.number}>404</div>

              <h1 className={css.heading}>Página não encontrada</h1>

              <p className={css.description}>
                A página que procura não existe ou foi movida.<br />
                Verifique o endereço ou explore os nossos espaços.
              </p>

              <SearchForm
                className={css.searchForm}
                isKeywordSearch={isKeywordSearch}
                onSubmit={handleSearchSubmit}
              />

              <Link to={homeLink} className={css.homeButton}>
                Voltar à página inicial
              </Link>
            </div>
          </div>
        </LayoutSingleColumn>
      </Page>
    );
  }
}

const EnhancedNotFoundPage = props => {
  const routeConfiguration = useRouteConfiguration();
  const config = useConfiguration();
  const history = useHistory();
  const intl = useIntl();
  // The 404 page renders without a Topbar (which is normally the only place
  // setSearchHistoryUserId runs). Without it, getSearchHistory falls back to
  // [] and the "Pesquisas recentes" section never appears in the SearchForm.
  const currentUserId = useSelector(state => state.user.currentUser?.id?.uuid || null);
  useEffect(() => {
    setSearchHistoryUserId(currentUserId);
  }, [currentUserId]);

  return (
    <NotFoundPageComponent
      routeConfiguration={routeConfiguration}
      marketplaceName={config.marketplaceName}
      isKeywordSearch={isMainSearchTypeKeywords(config)}
      history={history}
      intl={intl}
      {...props}
    />
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

const NotFoundPage = compose(connect(mapStateToProps))(EnhancedNotFoundPage);

export default NotFoundPage;
