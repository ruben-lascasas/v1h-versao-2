import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useConfiguration } from '../../context/configurationContext';
import { useLocale } from '../../context/localeContext';
import { useIntl } from '../../util/reactIntl';
import { H2, Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import {
  selectSavedSearches,
  removeSavedSearchAndSync,
  fetchSavedSearchCount,
  dedupeSavedSearchesAndSync,
} from '../../ducks/savedSearches.duck';
import css from './SavedSearchesPage.module.css';

const formatDate = (ts, locale) => {
  try {
    return new Date(ts).toLocaleDateString(
      locale && locale.toLowerCase().startsWith('en') ? 'en-GB' : 'pt-PT',
      { year: 'numeric', month: 'short', day: '2-digit' }
    );
  } catch {
    return '';
  }
};

const PinIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

// Globe glyph used when the saved search has no filters (whole marketplace).
const GlobeIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <path d="M12 3c2.5 2.5 4 5.5 4 9s-1.5 6.5-4 9c-2.5-2.5-4-5.5-4-9s1.5-6.5 4-9z" />
    </g>
  </svg>
);

// Fallback type detection for entries saved before we started persisting the
// type field. Mirrors detectType() in SaveSearchButton.js.
const inferType = entry => {
  if (entry.type) return entry.type;
  const p = entry.params || {};
  if (p.keywords) return 'keyword';
  if (p.pub_categoryLevel1) return 'category';
  if (p.address) return 'location';
  return 'all';
};

const TypeGlyph = ({ type }) => {
  if (type === 'category') return <span aria-hidden>#</span>;
  if (type === 'keyword') return <span aria-hidden>↩</span>;
  if (type === 'all') return <GlobeIcon />;
  return <PinIcon />;
};

const SavedSearchesPage = () => {
  const intl = useIntl();
  const config = useConfiguration();
  const dispatch = useDispatch();
  const history = useHistory();
  const { locale } = useLocale();
  const isPt = !locale || String(locale).toLowerCase().startsWith('pt');

  const scrollingDisabled = useSelector(isScrollingDisabled);
  const savedSearches = useSelector(selectSavedSearches);
  const [counts, setCounts] = useState({});

  // Clean up any duplicate entries left over from before the dedup logic
  // existed in the duck. Safe no-op when the list is already clean.
  useEffect(() => {
    dispatch(dedupeSavedSearchesAndSync());
  }, [dispatch]);

  // Re-query Sharetribe for each saved search so the card can show the live
  // result count next to each entry. Throttled implicitly by setState batching.
  useEffect(() => {
    let cancelled = false;
    savedSearches.forEach(async s => {
      if (counts[s.id] != null) return;
      const total = await dispatch(fetchSavedSearchCount(s));
      if (cancelled) return;
      setCounts(prev => ({ ...prev, [s.id]: total }));
    });
    return () => {
      cancelled = true;
    };
  }, [savedSearches, dispatch, counts]);

  const title = intl.formatMessage(
    { id: 'SavedSearchesPage.title' },
    { marketplaceName: config.marketplaceName }
  );

  const hasItems = Array.isArray(savedSearches) && savedSearches.length > 0;

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled} className={css.root}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <div className={css.headingWrapper}>
            <H2 as="h1" className={css.heading}>
              {isPt ? 'Pesquisas guardadas' : 'Saved searches'}
            </H2>
            <p className={css.count}>
              {isPt
                ? `${savedSearches.length} ${savedSearches.length === 1 ? 'pesquisa' : 'pesquisas'}`
                : `${savedSearches.length} ${savedSearches.length === 1 ? 'search' : 'searches'}`}
            </p>
          </div>

          {!hasItems ? (
            <div className={css.empty}>
              <p>
                {isPt
                  ? 'Ainda não guardaste nenhuma pesquisa. Vai à página de procurar anúncios e clica no coração ao lado do número de resultados.'
                  : 'You haven\'t saved any searches yet. Go to the search page and click the heart next to the results count.'}
              </p>
              <button
                type="button"
                className={css.browseLink}
                onClick={() => history.push('/s')}
              >
                {isPt ? 'Procurar anúncios' : 'Browse listings'}
              </button>
            </div>
          ) : (
            <ul className={css.list}>
              {savedSearches.map(s => (
                <li key={s.id} className={css.item}>
                  <div className={css.cardTop}>
                    <span className={css.pinIcon}>
                      <TypeGlyph type={inferType(s)} />
                    </span>
                    <div className={css.info}>
                      <span className={css.label}>{s.label}</span>
                      <span className={css.savedAt}>
                        {isPt ? 'Guardada a ' : 'Saved on '}{formatDate(s.savedAt, locale)}
                      </span>
                    </div>
                    <span className={css.countBadge}>
                      {counts[s.id] == null
                        ? '…'
                        : isPt
                          ? `${counts[s.id]} ${counts[s.id] === 1 ? 'anúncio' : 'anúncios'}`
                          : `${counts[s.id]} ${counts[s.id] === 1 ? 'listing' : 'listings'}`}
                    </span>
                  </div>
                  <div className={css.cardActions}>
                    <button
                      type="button"
                      className={css.repeatButton}
                      onClick={() => history.push(s.url)}
                    >
                      {isPt ? 'Repetir pesquisa' : 'Run search'}
                    </button>
                    <button
                      type="button"
                      className={css.removeButton}
                      onClick={() => dispatch(removeSavedSearchAndSync(s.id))}
                    >
                      {isPt ? 'Remover' : 'Remove'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default SavedSearchesPage;
