import React from 'react';
import ReactDOM from 'react-dom';
import { useSelector, useDispatch } from 'react-redux';
import { NamedLink } from '../../components';
import { useLocale } from '../../context/localeContext';
import {
  selectNewListings,
  selectNotificationsDismissed,
  dismissNotifications,
} from '../../ducks/notifications.duck';
import css from './NewListingNotification.module.css';

const t = (isEN, pt, en) => (isEN ? en : pt);

const NewListingNotification = () => {
  const dispatch = useDispatch();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const newListings = useSelector(selectNewListings);
  const dismissed = useSelector(selectNotificationsDismissed);

  if (dismissed || newListings.length === 0) return null;

  const banner = (
    <div className={css.banner}>
      <div className={css.content}>
        <span className={css.icon} aria-hidden>
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
        <div className={css.messages}>
          {newListings.length === 1 ? (
            <span className={css.text}>
              {t(isEN,
                'Um anfitrião que segues publicou:',
                'A host you follow just published:'
              )}
              {' '}
              <NamedLink
                name="ListingPage"
                params={{
                  id: newListings[0].id,
                  slug: newListings[0].title?.toLowerCase().replace(/\s+/g, '-') || 'anuncio',
                }}
                className={css.link}
                title={newListings[0].title}
              >
                {newListings[0].title}
              </NamedLink>
            </span>
          ) : (
            <span className={css.text}>
              <strong>
                {newListings.length}{' '}
                {t(isEN, 'novos anúncios', 'new listings')}
              </strong>
              {' '}
              {t(isEN, 'de anfitriões que segues', 'from hosts you follow')}
            </span>
          )}
        </div>
      </div>
      <button
        type="button"
        className={css.closeBtn}
        onClick={() => dispatch(dismissNotifications())}
        aria-label="Fechar"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg" aria-hidden>
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

export default NewListingNotification;
