import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useLocale } from '../../context/localeContext';
import {
  selectExtraAlerts,
  dismissExtraAlertAndSync,
  pollExtraAlerts,
  refreshExtraAlertsFromUser,
} from '../../ducks/extraAlerts.duck';
import { createSlug } from '../../util/urlHelpers';
import { listingHighlightsEnabled } from '../../config/configFeatures';
import css from './ExtraAlerts.module.css';

// Show at most this many banners at once. Anything beyond stays queued and
// only slides in once the user dismisses one of the visible ones.
const MAX_VISIBLE = 6;

const PencilIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const HeartPencilIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12.1 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.65 11.54L12.1 21.35z" />
  </svg>
);

const StarIcon = () => (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9" />
  </svg>
);

// Same lightning bolt used by the "Destacar anúncio" button in the profile
// sidebar — keeps the destaque visual language consistent across the app.
const BoltIcon = () => (
  <svg width="26" height="26" viewBox="4 2 16 20" fill="currentColor" stroke="none" aria-hidden>
    <polygon points="13,2 4,14 11,14 10,22 20,10 13,10 14,2" />
  </svg>
);

const ICONS = {
  'followed-listing-edit':   { Icon: PencilIcon,       cls: css.iconEdit },
  'favorite-listing-edit':   { Icon: HeartPencilIcon,  cls: css.iconHeartEdit },
  'review-received':         { Icon: StarIcon,         cls: css.iconReview },
  'followed-listing-review': { Icon: StarIcon,         cls: css.iconFollowed },
  'destaque-expiring-soon':  { Icon: BoltIcon,         cls: css.iconReview },
  'destaque-expired':        { Icon: BoltIcon,         cls: css.iconReview },
};

const message = (entry, isEN) => {
  const label = entry.listingTitle || (isEN ? 'a listing' : 'um anúncio');
  const who = entry.authorName || (isEN ? 'Someone' : 'Alguém');
  switch (entry.kind) {
    case 'followed-listing-edit':
      return isEN ? (
        <>
          <strong>{who}</strong> updated <span className={css.label}>{label}</span>
        </>
      ) : (
        <>
          <strong>{who}</strong> atualizou <span className={css.label}>{label}</span>
        </>
      );
    case 'favorite-listing-edit':
      return isEN ? (
        <>
          A listing you favourited was updated:{' '}
          <span className={css.label}>{label}</span>
        </>
      ) : (
        <>
          Um anúncio nos teus favoritos foi atualizado:{' '}
          <span className={css.label}>{label}</span>
        </>
      );
    case 'review-received':
      return isEN ? (
        <>
          <strong>{who}</strong> left you a review on{' '}
          <span className={css.label}>{label}</span>
        </>
      ) : (
        <>
          <strong>{who}</strong> deixou-te uma avaliação em{' '}
          <span className={css.label}>{label}</span>
        </>
      );
    case 'followed-listing-review':
      return isEN ? (
        <>
          A listing from <strong>{who}</strong> received a new review
          {' '}(<span className={css.label}>{label}</span>)
        </>
      ) : (
        <>
          Um anúncio de <strong>{who}</strong> recebeu uma nova avaliação
          {' '}(<span className={css.label}>{label}</span>)
        </>
      );
    case 'destaque-expiring-soon': {
      const d = entry.daysLeft || 3;
      const dayWord = d === 1
        ? (isEN ? 'day' : 'dia')
        : (isEN ? 'days' : 'dias');
      return isEN ? (
        <>
          The spotlight on <span className={css.label}>{label}</span> ends in <strong>{d} {dayWord}</strong>
        </>
      ) : (
        <>
          O destaque do anúncio <span className={css.label}>{label}</span> termina em <strong>{d} {dayWord}</strong>
        </>
      );
    }
    case 'destaque-expired':
      return isEN ? (
        <>
          <span className={css.label}>{label}</span> is no longer featured
        </>
      ) : (
        <>
          O anúncio <span className={css.label}>{label}</span> já não está em destaque
        </>
      );
    default:
      return null;
  }
};

const ExtraAlerts = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const isAuth = useSelector(state => state.auth?.isAuthenticated);
  const alerts = useSelector(selectExtraAlerts);

  useEffect(() => {
    if (!isAuth) return undefined;
    dispatch(refreshExtraAlertsFromUser());
    dispatch(pollExtraAlerts({ force: true }));
    const id = setInterval(() => dispatch(pollExtraAlerts()), 60 * 1000);
    return () => clearInterval(id);
  }, [isAuth, dispatch]);

  if (!alerts || alerts.length === 0) return null;
  // Destaque alerts push the user towards a flow that is switched off, so drop
  // them rather than offer a dead end.
  const relevant = listingHighlightsEnabled
    ? alerts
    : alerts.filter(a => a.kind !== 'destaque-expired' && a.kind !== 'destaque-expiring-soon');
  if (relevant.length === 0) return null;
  const visible = relevant.slice(0, MAX_VISIBLE);

  const go = entry => {
    // Destaque alerts open the "Destacar Anúncio" page so the user can
    // renew immediately; the other kinds open the affected listing.
    if (entry.kind === 'destaque-expired' || entry.kind === 'destaque-expiring-soon') {
      history.push('/destacar-anuncio');
    } else if (entry.listingId) {
      const slug = createSlug(entry.listingTitle || 'anuncio');
      history.push(`/l/${slug}/${entry.listingId}`);
    }
    dispatch(dismissExtraAlertAndSync(entry.id));
  };

  // Render into document.body via a portal so the toast stack escapes any
  // parent stacking context (e.g. transformed page wrappers) — otherwise the
  // ScrollToTopButton ends up rendered on top of the toasts even though its
  // z-index is lower than the stack.
  const stack = (
    <div className={css.stack}>
      {visible.map(entry => {
        const meta = ICONS[entry.kind];
        if (!meta) return null;
        const { Icon, cls } = meta;
        return (
          <div key={entry.id} className={css.banner}>
            <button
              type="button"
              className={css.content}
              onClick={() => go(entry)}
              aria-label={isEN ? 'Open' : 'Abrir'}
            >
              <span className={`${css.icon} ${cls}`}>
                <Icon />
              </span>
              <span className={css.messages}>
                <span className={css.text}>{message(entry, isEN)}</span>
              </span>
            </button>
            <button
              type="button"
              className={css.closeBtn}
              onClick={() => dispatch(dismissExtraAlertAndSync(entry.id))}
              aria-label={isEN ? 'Close' : 'Fechar'}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        );
      })}
    </div>
  );

  return typeof document !== 'undefined'
    ? ReactDOM.createPortal(stack, document.body)
    : stack;
};

export default ExtraAlerts;
