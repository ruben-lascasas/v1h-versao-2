import { createSlice } from '@reduxjs/toolkit';
import { fetchCurrentUser } from './user.duck';

/**
 * Mirrors favoriteAlerts.duck.js but for "someone started following you"
 * toasts. Source of truth lives in the target's `user.metadata.unseenFollowAlerts`,
 * populated server-side by /api/user-follow whenever a follow passes the 24h
 * per-fan throttle.
 */

const POLL_INTERVAL_MS = 60 * 1000;
let lastPollAt = 0;

const slice = createSlice({
  name: 'followAlerts',
  initialState: {
    alerts: [], // [{ fanUserId, fanName, at }]
    dismissed: false,
    dismissedFanIds: [],
  },
  reducers: {
    setFollowAlerts: (state, action) => {
      const incoming = Array.isArray(action.payload) ? action.payload : [];
      state.alerts = incoming.filter(
        a => a && !state.dismissedFanIds.includes(a.fanUserId)
      );
      state.dismissed = false;
    },
    dismissFollowAlerts: state => {
      state.dismissed = true;
      state.alerts = [];
    },
    dismissFollowAlertForFan: (state, action) => {
      const id = action.payload;
      state.alerts = state.alerts.filter(a => a && a.fanUserId !== id);
      if (id && !state.dismissedFanIds.includes(id)) {
        state.dismissedFanIds = [...state.dismissedFanIds, id];
      }
    },
  },
});

export const {
  setFollowAlerts,
  dismissFollowAlerts,
  dismissFollowAlertForFan,
} = slice.actions;

export const selectFollowAlerts = state =>
  state.followAlerts?.alerts || [];
export const selectFollowAlertsDismissed = state =>
  state.followAlerts?.dismissed || false;

const readAlertsFromState = state =>
  state.user?.currentUser?.attributes?.profile?.metadata?.unseenFollowAlerts || [];

export const refreshFollowAlertsFromUser = () => (dispatch, getState) => {
  dispatch(setFollowAlerts(readAlertsFromState(getState())));
};

export const pollFollowAlerts = ({ force } = {}) => async (dispatch, getState) => {
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
  dispatch(setFollowAlerts(readAlertsFromState(getState())));
};

export const dismissAndSync = fanUserId => async (dispatch, getState) => {
  if (fanUserId) {
    dispatch(dismissFollowAlertForFan(fanUserId));
  } else {
    dispatch(dismissFollowAlerts());
  }
  const state = getState();
  if (!state.auth?.isAuthenticated || typeof fetch === 'undefined') return;
  try {
    await fetch('/api/dismiss-follow-alerts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(fanUserId ? { fanUserId } : {}),
    });
  } catch (_) {
    /* already dismissed locally */
  }
};

export default slice.reducer;
