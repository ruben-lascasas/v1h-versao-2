import React, { useEffect } from 'react';
import ReactDOM from 'react-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import { useLocale } from '../../context/localeContext';
import {
  selectFollowAlerts,
  selectFollowAlertsDismissed,
  dismissAndSync,
  pollFollowAlerts,
  refreshFollowAlertsFromUser,
} from '../../ducks/followAlerts.duck';
import css from './FollowAlert.module.css';

// Cap visible banners; extras stay queued in Redux and slide in one at a
// time as the user dismisses the visible ones.
const MAX_VISIBLE = 6;

const t = (isEN, pt, en) => (isEN ? en : pt);

const UserPlusIcon = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden>
    {/* Head — filled circle */}
    <circle cx="9" cy="7" r="4" />
    {/* Body — rounded shoulders */}
    <path d="M2 21v-2a4 4 0 0 1 4-4h6a4 4 0 0 1 4 4v2H2z" />
    {/* Plus sign — filled cross */}
    <path d="M18 8h2v3h3v2h-3v3h-2v-3h-3v-2h3z" />
  </svg>
);

const FollowAlert = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const isAuth = useSelector(state => state.auth?.isAuthenticated);
  const alerts = useSelector(selectFollowAlerts);
  const dismissed = useSelector(selectFollowAlertsDismissed);

  useEffect(() => {
    if (!isAuth) return undefined;
    dispatch(refreshFollowAlertsFromUser());
    dispatch(pollFollowAlerts({ force: true }));
    const id = setInterval(() => {
      dispatch(pollFollowAlerts());
    }, 60 * 1000);
    return () => clearInterval(id);
  }, [isAuth, dispatch]);

  if (dismissed || !alerts || alerts.length === 0) return null;

  // Dedupe by fanUserId (same fan toggling shouldn't show two toasts).
  const seen = new Set();
  const unique = alerts.filter(a => {
    if (!a?.fanUserId || seen.has(a.fanUserId)) return false;
    seen.add(a.fanUserId);
    return true;
  });

  const goToFan = fanUserId => {
    history.push(`/u/${fanUserId}`);
    dispatch(dismissAndSync(fanUserId));
  };

  const visible = unique.slice(0, MAX_VISIBLE);

  const stack = (
    <div className={css.stack}>
      {visible.map(entry => (
        <div key={entry.fanUserId} className={css.banner}>
          <button
            type="button"
            className={css.content}
            onClick={() => goToFan(entry.fanUserId)}
            aria-label={t(isEN, 'Ver seguidor', 'View follower')}
          >
            <span className={css.icon} aria-hidden>
              <UserPlusIcon />
            </span>
            <div className={css.messages}>
              <span className={css.text}>
                <span className={css.label}>
                  {entry.fanName || t(isEN, 'Um utilizador', 'A user')}
                </span>
                {' '}
                {t(isEN, 'começou a seguir-te', 'started following you')}
              </span>
            </div>
          </button>
          <button
            type="button"
            className={css.closeBtn}
            onClick={() => dispatch(dismissAndSync(entry.fanUserId))}
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

export default FollowAlert;
