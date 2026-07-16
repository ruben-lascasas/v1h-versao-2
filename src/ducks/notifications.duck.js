import { createSlice } from '@reduxjs/toolkit';
import { selectFollowing } from './follow.duck';

const STORAGE_KEY_PREFIX = 'v1h_lastListingCheck_';
const THROTTLE_MS = 5 * 60 * 1000;

let lastApiCheckAt = 0;

const notificationsSlice = createSlice({
  name: 'notifications',
  initialState: {
    newListings: [],
    dismissed: false,
  },
  reducers: {
    setNewListings: (state, action) => {
      state.newListings = action.payload;
      state.dismissed = false;
    },
    dismissNotifications: state => {
      state.dismissed = true;
    },
  },
});

export const { setNewListings, dismissNotifications } = notificationsSlice.actions;

export const selectNewListings = state => state.notifications?.newListings || [];
export const selectNotificationsDismissed = state => state.notifications?.dismissed || false;

// ─── Check new listings from followed users ───────────────────────────────────

export const checkNewListingsFromFollowed = (userId, { force } = {}) => async (dispatch, getState, sdk) => {
  const following = selectFollowing(getState());
  if (!following || following.length === 0) return;

  const now = Date.now();
  if (!force && now - lastApiCheckAt < THROTTLE_MS) return;
  lastApiCheckAt = now;

  // Storage format: { [followedUserId]: isoDateString }
  // If a followed user has no entry, they were just followed → cutoff = now (no old listings)
  const storageKey = STORAGE_KEY_PREFIX + userId;
  let perUserDates = {};
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        perUserDates = parsed;
      }
    }
  } catch (e) {
    // old format (plain ISO string) — reset
    localStorage.removeItem(storageKey);
  }

  // For each followed user, set cutoff to now if not yet tracked
  const nowIso = new Date(now).toISOString();
  following.forEach(authorId => {
    if (!perUserDates[authorId]) {
      perUserDates[authorId] = nowIso;
    }
  });
  localStorage.setItem(storageKey, JSON.stringify(perUserDates));

  // Run sequentially with a small gap + abort on first 429. Promise.all
  // (one listings.query per followed user) was tripping the rate limit on
  // every landing-page load when the user followed several people.
  const results = [];
  let aborted = false;
  for (const authorId of following) {
    if (aborted) break;
    const cutoff = new Date(perUserDates[authorId] || nowIso);
    try {
      const r = await sdk.listings.query({ author_id: authorId, perPage: 5 });
      const fresh = (r.data?.data || []).filter(listing => {
        const createdAt = new Date(listing.attributes?.createdAt);
        return createdAt > cutoff;
      });
      results.push(fresh);
    } catch (e) {
      if (e?.status === 429) aborted = true;
    }
    await new Promise(r => setTimeout(r, 150));
  }

  if (!aborted) {
    following.forEach(authorId => {
      perUserDates[authorId] = nowIso;
    });
    localStorage.setItem(storageKey, JSON.stringify(perUserDates));
  }

  try {
    const newListings = results.flat();
    if (newListings.length > 0) {
      dispatch(setNewListings(newListings.map(l => ({
        id: l.id?.uuid,
        title: l.attributes?.title || 'Novo anúncio',
        authorId: l.relationships?.author?.data?.id?.uuid,
      }))));
    }
  } catch (e) {}
};


export default notificationsSlice.reducer;
