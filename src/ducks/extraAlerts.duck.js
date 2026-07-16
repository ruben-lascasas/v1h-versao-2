import { createSlice } from '@reduxjs/toolkit';
import { fetchCurrentUser } from './user.duck';

/**
 * Single Redux slice powering 4 additional in-app toast types so we don't
 * spin up four near-identical ducks. Each alert has a `kind`:
 *
 *   followed-listing-edit    — listing of someone I follow was edited
 *   favorite-listing-edit    — listing I favourited was edited
 *   review-received          — someone left a review on me or my listing
 *   followed-listing-review  — listing of someone I follow was reviewed
 *
 * Source of truth: `user.metadata.unseenExtraAlerts`, populated by the
 * server cron in `server/jobs/notifyExtraAlertsJob.js`. The duck polls
 * currentUser every 60s and mirrors that array into Redux for the toast
 * component to render.
 */

const POLL_INTERVAL_MS = 60 * 1000;
let lastPollAt = 0;

const slice = createSlice({
  name: 'extraAlerts',
  initialState: {
    alerts: [],
    // ids dismissed in this session — keeps a stale poll from re-adding a
    // banner the user already closed before the server caught up.
    dismissedIds: [],
  },
  reducers: {
    setExtraAlerts: (state, action) => {
      const incoming = Array.isArray(action.payload) ? action.payload : [];
      state.alerts = incoming.filter(
        a => a && !state.dismissedIds.includes(a.id)
      );
    },
    dismissExtraAlert: (state, action) => {
      const id = action.payload;
      state.dismissedIds = [...state.dismissedIds, id];
      state.alerts = state.alerts.filter(a => a.id !== id);
    },
    dismissAllExtraAlerts: state => {
      state.dismissedIds = [
        ...state.dismissedIds,
        ...state.alerts.map(a => a.id),
      ];
      state.alerts = [];
    },
  },
});

export const {
  setExtraAlerts,
  dismissExtraAlert,
  dismissAllExtraAlerts,
} = slice.actions;

export const selectExtraAlerts = state => state.extraAlerts?.alerts || [];
export const selectDismissedExtraAlertIds = state =>
  state.extraAlerts?.dismissedIds || [];

const readAlertsFromState = state =>
  state.user?.currentUser?.attributes?.profile?.metadata?.unseenExtraAlerts ||
  [];

export const refreshExtraAlertsFromUser = () => (dispatch, getState) => {
  const alerts = readAlertsFromState(getState());
  dispatch(setExtraAlerts(alerts));
};

export const pollExtraAlerts = ({ force } = {}) => async (
  dispatch,
  getState
) => {
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
  dispatch(refreshExtraAlertsFromUser());
};

// Per-alert dismiss — POSTs the id so other devices stop showing it too.
export const dismissExtraAlertAndSync = id => async (dispatch, getState) => {
  dispatch(dismissExtraAlert(id));
  const state = getState();
  if (!state.auth?.isAuthenticated || typeof fetch === 'undefined') return;
  try {
    await fetch('/api/dismiss-extra-alert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ id }),
    });
  } catch (_) {
    /* locally dismissed already; server catches up on next refresh */
  }
};

export default slice.reducer;
