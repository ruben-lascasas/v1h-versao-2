import { createSlice } from '@reduxjs/toolkit';
import { fetchCurrentUser } from './user.duck';

/**
 * Mirrors savedSearchAlerts.duck.js but for "someone favourited your listing"
 * toasts. Source of truth lives in the owner's `user.metadata.unseenFavoriteAlerts`,
 * populated server-side by /api/listing-like whenever a like passes the 24h
 * per-fan throttle. We re-fetch currentUser periodically so the toast also
 * appears for owners who are already mid-session when the like happens.
 */

const POLL_INTERVAL_MS = 60 * 1000;
let lastPollAt = 0;

const slice = createSlice({
  name: 'favoriteAlerts',
  initialState: {
    alerts: [], // [{ listingId, listingTitle, at }]
    dismissed: false,
    // listingIds the user closed in this session — kept in Redux so a stale
    // poll response doesn't re-add a banner the user already dismissed
    // before the server caught up.
    dismissedListingIds: [],
  },
  reducers: {
    setAlerts: (state, action) => {
      const incoming = Array.isArray(action.payload) ? action.payload : [];
      state.alerts = incoming.filter(
        a => a && !state.dismissedListingIds.includes(a.listingId)
      );
      state.dismissed = false;
    },
    dismissFavoriteAlerts: state => {
      state.dismissed = true;
      state.alerts = [];
    },
    dismissFavoriteAlertForListing: (state, action) => {
      const id = action.payload;
      state.alerts = state.alerts.filter(a => a && a.listingId !== id);
      if (id && !state.dismissedListingIds.includes(id)) {
        state.dismissedListingIds = [...state.dismissedListingIds, id];
      }
    },
  },
});

export const {
  setAlerts,
  dismissFavoriteAlerts,
  dismissFavoriteAlertForListing,
} = slice.actions;

export const selectFavoriteAlerts = state =>
  state.favoriteAlerts?.alerts || [];
export const selectFavoriteAlertsDismissed = state =>
  state.favoriteAlerts?.dismissed || false;

// Reads unseenFavoriteAlerts from the cached currentUser, if any. Use this
// after a fresh fetchCurrentUser to push the latest server state into the
// alerts slice.
const readAlertsFromState = state =>
  state.user?.currentUser?.attributes?.profile?.metadata?.unseenFavoriteAlerts || [];

export const refreshFavoriteAlertsFromUser = () => (dispatch, getState) => {
  const alerts = readAlertsFromState(getState());
  dispatch(setAlerts(alerts));
};

export const pollFavoriteAlerts = ({ force } = {}) => async (dispatch, getState) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) return;

  const now = Date.now();
  if (!force && now - lastPollAt < POLL_INTERVAL_MS) return;
  lastPollAt = now;

  try {
    await dispatch(fetchCurrentUser());
  } catch (_) {
    return;
  }
  const alerts = readAlertsFromState(getState());
  dispatch(setAlerts(alerts));
};

// Per-banner dismiss: only this listing's alert goes away on the server so
// the next queued banner can slide into its place. Pass the listingId from
// the banner that was closed; pass nothing/undefined for legacy "clear all".
export const dismissAndSync = listingId => async (dispatch, getState, sdk) => {
  if (listingId) {
    dispatch(dismissFavoriteAlertForListing(listingId));
  } else {
    dispatch(dismissFavoriteAlerts());
  }
  const state = getState();
  if (!state.auth?.isAuthenticated || typeof fetch === 'undefined') return;
  try {
    await fetch('/api/dismiss-favorite-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(listingId ? { listingId } : {}),
    });
  } catch (_) {
    // already dismissed locally — server will catch up next refresh
  }
};

export default slice.reducer;
