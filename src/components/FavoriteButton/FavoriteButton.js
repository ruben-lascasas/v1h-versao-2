import React from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import classNames from 'classnames';

import {
  selectIsFavorite,
  toggleFavoriteAndSync,
  addFavoriteAndSync,
  selectFavoriteCountOverride,
  setFavoriteCount,
} from '../../ducks/favorites.duck';
import IconHeart from '../IconHeart/IconHeart';

import css from './FavoriteButton.module.css';

// Vinted-style formatting: hide zero, cap large numbers so the pill stays small.
const formatCount = n => {
  if (typeof n !== 'number' || n <= 0) return null;
  if (n > 999) return '+999';
  return String(n);
};

const PENDING_FAVORITE_KEY = 'pendingFavoriteListingId';

export const applyPendingFavorite = dispatch => {
  try {
    const pendingId = sessionStorage.getItem(PENDING_FAVORITE_KEY);
    if (pendingId) {
      dispatch(addFavoriteAndSync(pendingId));
      sessionStorage.removeItem(PENDING_FAVORITE_KEY);
    }
  } catch (e) {}
};

const FavoriteButton = props => {
  // `readOnly` shows the heart + counter but blocks the toggle — used on the
  // owner's own listing so they can see how many people favourited it without
  // being able to like themselves.
  const { listingId, className, initialCount, readOnly = false } = props;
  const dispatch = useDispatch();
  const history = useHistory();
  const location = useLocation();
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const isFavorite = useSelector(state => selectIsFavorite(state, listingId));
  const countOverride = useSelector(state => selectFavoriteCountOverride(state, listingId));

  const baseCount = countOverride != null ? countOverride : initialCount;
  const numericCount = typeof baseCount === 'number' ? baseCount : 0;
  const displayCount = formatCount(numericCount);

  const handleToggleFavorite = event => {
    event.preventDefault();
    event.stopPropagation();
    if (readOnly) return;

    if (!isAuthenticated) {
      try {
        sessionStorage.setItem(PENDING_FAVORITE_KEY, listingId);
      } catch (e) {}
      history.push('/login', { from: `${location.pathname}${location.search}` });
      return;
    }

    // Optimistic count update so the pill reacts on the same frame as the
    // heart fill — the server response will overwrite this with the real
    // value (handled inside toggleFavoriteAndSync).
    const optimisticCount = isFavorite
      ? Math.max(0, numericCount - 1)
      : numericCount + 1;
    dispatch(setFavoriteCount({ listingId, count: optimisticCount }));
    dispatch(toggleFavoriteAndSync(listingId));
  };

  return (
    <button
      type="button"
      className={classNames(css.root, className, {
        [css.active]: isFavorite && !readOnly,
        [css.withCount]: !!displayCount,
        [css.readOnly]: readOnly,
      })}
      onClick={handleToggleFavorite}
      aria-pressed={readOnly ? undefined : isFavorite}
      aria-label={
        readOnly
          ? `${numericCount} favourites`
          : isFavorite
            ? 'Remove from favorites'
            : 'Add to favorites'
      }
      tabIndex={readOnly ? -1 : 0}
    >
      <IconHeart filled={readOnly ? numericCount > 0 : isFavorite} />
      {displayCount ? <span className={css.count}>{displayCount}</span> : null}
    </button>
  );
};

export default FavoriteButton;
