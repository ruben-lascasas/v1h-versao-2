import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useLocale } from '../../context/localeContext';
import {
  selectFavoriteAlerts,
  selectFavoriteAlertsDismissed,
  dismissAndSync,
  pollFavoriteAlerts,
  refreshFavoriteAlertsFromUser,
} from '../../ducks/favoriteAlerts.duck';
import { createSlug } from '../../util/urlHelpers';
import css from './FavoriteAlert.module.css';

// Cap how many banners show at once. Extras stay queued (in Redux) and slide
// in once the user dismisses one of the visible banners.
const MAX_VISIBLE = 6;

const t = (isEN, pt, en) => (isEN ? en : pt);

const HeartIcon = () => (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12.1 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.65 11.54L12.1 21.35z" />
  </svg>
);

const FavoriteAlert = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const isAuth = useSelector(state => state.auth?.isAuthenticated);
  const alerts = useSelector(selectFavoriteAlerts);
  const dismissed = useSelector(selectFavoriteAlertsDismissed);

  // Seed from the currentUser already cached in Redux as soon as we mount, then
  // poll periodically so the toast appears for owners who happen to be on the
  // site while a fan clicks the heart on another device.
  useEffect(() => {
    if (!isAuth) return undefined;
    dispatch(refreshFavoriteAlertsFromUser());
    dispatch(pollFavoriteAlerts({ force: true }));
    const id = setInterval(() => {
      dispatch(pollFavoriteAlerts());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [isAuth, dispatch]);

  if (dismissed || !alerts || alerts.length === 0) return null;

  // Group alerts by listingId so multiple fans liking the same listing only
  // produce one toast for that listing. Each listing gets its own banner so
  // the owner can see exactly which of their anúncios was favourited.
  const grouped = [];
  const seen = new Map();
  alerts.forEach(a => {
    if (!a?.listingId) return;
    if (seen.has(a.listingId)) {
      const idx = seen.get(a.listingId);
      grouped[idx].count += 1;
    } else {
      seen.set(a.listingId, grouped.length);
      grouped.push({ ...a, count: 1 });
    }
  });

  const goToListing = entry => {
    const slug = createSlug(entry.listingTitle || 'anuncio');
    history.push(`/l/${slug}/${entry.listingId}`);
    dispatch(dismissAndSync(entry.listingId));
  };

  const visible = grouped.slice(0, MAX_VISIBLE);

  const stack = (
    <div className={css.stack}>
      {visible.map(entry => (
        <div key={entry.listingId} className={css.banner}>
          <button
            type="button"
            className={css.content}
            onClick={() => goToListing(entry)}
            aria-label={t(isEN, 'Ver anúncio favoritado', 'View favourited listing')}
          >
            <span className={css.icon} aria-hidden>
              <HeartIcon />
            </span>
            <div className={css.messages}>
              <span className={css.text}>
                {entry.count > 1 ? (
                  <>
                    <strong>{entry.count}</strong>{' '}
                    {t(isEN, 'adicionaram ', 'people added ')}
                  </>
                ) : (
                  t(isEN, 'Adicionaram ', 'Someone added ')
                )}
                <span className={css.label}>
                  {entry.listingTitle || (isEN ? 'a listing' : 'um anúncio')}
                </span>
                {' '}
                {t(isEN, 'aos favoritos', 'to favourites')}
              </span>
            </div>
          </button>
          <button
            type="button"
            className={css.closeBtn}
            onClick={() => dispatch(dismissAndSync(entry.listingId))}
            aria-label={t(isEN, 'Fechar', 'Close')}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );

  // Portal into document.body so the toast stack escapes any parent
  // stacking context — keeps it above the ScrollToTopButton.
  return typeof document !== 'undefined'
    ? ReactDOM.createPortal(stack, document.body)
    : stack;
};

export default FavoriteAlert;
