import React from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useLocale } from '../../context/localeContext';
import {
  selectSavedSearchMatches,
  selectSavedSearchAlertsDismissed,
  dismissAlerts,
} from '../../ducks/savedSearchAlerts.duck';
import css from './SavedSearchAlert.module.css';

const t = (isEN, pt, en) => (isEN ? en : pt);

const HeartIcon = () => (
  <svg
    width="30"
    height="30"
    viewBox="0 0 24 24"
    fill="currentColor"
    aria-hidden
  >
    <path d="M12.1 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.65 11.54L12.1 21.35z" />
  </svg>
);

const SavedSearchAlert = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const matches = useSelector(selectSavedSearchMatches);
  const dismissed = useSelector(selectSavedSearchAlertsDismissed);

  if (dismissed || !matches || matches.length === 0) return null;

  const single = matches.length === 1 ? matches[0] : null;
  const totalListings = matches.reduce((n, m) => n + (m.count || 0), 0);

  const handleClick = () => {
    if (single) {
      history.push(single.url);
    } else {
      history.push('/pesquisas-guardadas');
    }
    dispatch(dismissAlerts());
  };

  const banner = (
    <div className={css.banner}>
      <button
        type="button"
        className={css.content}
        onClick={handleClick}
        aria-label={t(isEN, 'Ver nova pesquisa', 'View new results')}
      >
        <span className={css.icon} aria-hidden>
          <HeartIcon />
        </span>
        <div className={css.messages}>
          {single ? (
            <span className={css.text}>
              <strong>
                {single.count}{' '}
                {single.count === 1
                  ? t(isEN, 'novo resultado', 'new result')
                  : t(isEN, 'novos resultados', 'new results')}
              </strong>
              {' '}
              {t(isEN, 'na pesquisa', 'in your search')}
              {' '}
              <span className={css.label}>{single.label}</span>
            </span>
          ) : (
            <span className={css.text}>
              <strong>
                {totalListings}{' '}
                {totalListings === 1
                  ? t(isEN, 'novo resultado', 'new result')
                  : t(isEN, 'novos resultados', 'new results')}
              </strong>
              {' '}
              {t(isEN, 'em', 'across')}{' '}
              {matches.length}{' '}
              {matches.length === 1
                ? t(isEN, 'pesquisa guardada', 'saved search')
                : t(isEN, 'pesquisas guardadas', 'saved searches')}
            </span>
          )}
        </div>
      </button>
      <button
        type="button"
        className={css.closeBtn}
        onClick={() => dispatch(dismissAlerts())}
        aria-label="Fechar"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  );

  // Portal into document.body so the toast escapes any parent stacking
  // context — keeps it above the ScrollToTopButton.
  return typeof document !== 'undefined'
    ? ReactDOM.createPortal(banner, document.body)
    : banner;
};

export default SavedSearchAlert;
