import { createSlice } from '@reduxjs/toolkit';

const getFollowingKey = userId =>
  userId ? `marketplace_following_${userId}` : 'marketplace_following_guest';

const loadFollowingFromStorage = userId => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const stored = window.localStorage.getItem(getFollowingKey(userId));
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

const saveFollowingToStorage = (userId, following) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(getFollowingKey(userId), JSON.stringify(following));
  } catch (e) {}
};

const followSlice = createSlice({
  name: 'follow',
  initialState: {
    following: [],
    currentUserId: null,
    // Per-target follower count overrides — populated optimistically when the
    // user clicks "A SEGUIR", then reconciled with the real server value once
    // /api/user-follow responds. Lets the badge update without a page reload.
    counts: {},
  },
  reducers: {
    toggleFollowLocal: (state, action) => {
      const userId = action.payload;
      const idx = state.following.indexOf(userId);
      if (idx >= 0) {
        state.following.splice(idx, 1);
      } else {
        state.following.unshift(userId);
      }
      saveFollowingToStorage(state.currentUserId, state.following);
    },
    initializeFollowing: (state, action) => {
      const { userId, serverFollowing } = action.payload || {};
      state.currentUserId = userId || null;
      const local = loadFollowingFromStorage(userId);
      if (serverFollowing != null) {
        const merged = [...new Set([...serverFollowing, ...local])];
        state.following = merged;
        saveFollowingToStorage(userId, merged);
      } else {
        state.following = local;
      }
    },
    clearFollowing: state => {
      state.following = [];
      state.currentUserId = null;
    },
    setFollowerCount: (state, action) => {
      const { targetUserId, count } = action.payload || {};
      if (targetUserId && typeof count === 'number') {
        state.counts[targetUserId] = count;
      }
    },
  },
});

export const {
  toggleFollowLocal,
  initializeFollowing,
  clearFollowing,
  setFollowerCount,
} = followSlice.actions;

export const selectFollowing = state => state.follow?.following || [];
export const selectIsFollowing = (state, userId) => selectFollowing(state).includes(userId);
export const selectFollowerCountOverride = (state, userId) =>
  state.follow?.counts?.[userId] ?? null;

// Lifted out so the optimistic-count caller and the existing reducer share the
// same view of the current count, falling back to the entity's publicData when
// we haven't toggled this target yet.
const readCurrentFollowerCount = (state, targetUserId) => {
  const override = state.follow?.counts?.[targetUserId];
  if (typeof override === 'number') return override;
  const entity =
    state.marketplaceData?.entities?.user?.[targetUserId] ||
    null;
  const pubCount = entity?.attributes?.profile?.publicData?.followersCount;
  return typeof pubCount === 'number' ? pubCount : 0;
};

export const toggleFollowAndSync = userId => (dispatch, getState, sdk) => {
  // Compute the new action BEFORE the local toggle so the backend knows
  // whether the user just followed or unfollowed.
  const wasFollowing = selectIsFollowing(getState(), userId);
  const currentCount = readCurrentFollowerCount(getState(), userId);
  const optimisticCount = wasFollowing
    ? Math.max(0, currentCount - 1)
    : currentCount + 1;
  dispatch(setFollowerCount({ targetUserId: userId, count: optimisticCount }));
  dispatch(toggleFollowLocal(userId));
  const state = getState();
  if (state.auth?.isAuthenticated) {
    const following = selectFollowing(getState());
    sdk.currentUser.updateProfile({ privateData: { following } }).catch(() => {});

    // Mirror the favourites pattern: tell the backend so it can record an
    // alert on the target user's metadata (throttled to 1 per fan per 24h).
    if (typeof fetch !== 'undefined') {
      fetch('/api/user-follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          targetUserId: userId,
          action: wasFollowing ? 'unfollow' : 'follow',
        }),
      })
        .then(r => (r.ok ? r.json() : null))
        .then(data => {
          if (data && typeof data.count === 'number') {
            dispatch(setFollowerCount({ targetUserId: userId, count: data.count }));
          }
        })
        .catch(() => {});
    }
  }
};

export const updateLastOnline = () => (dispatch, getState, sdk) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) return;
  sdk.currentUser
    .updateProfile({ publicData: { lastOnline: new Date().toISOString() } })
    .catch(() => {});
};

export default followSlice.reducer;
