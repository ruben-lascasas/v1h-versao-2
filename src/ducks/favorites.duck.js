import { createSlice } from '@reduxjs/toolkit';
import { createImageVariantConfig } from '../util/sdkLoader';
import { addMarketplaceEntities } from './marketplaceData.duck';

const initialState = {
  favorites: [],
  currentUserId: null,
  // Per-listing aggregated like counts coming back from /api/listing-like.
  // Used as an optimistic override so the heart counter updates immediately
  // without waiting for the listing to be re-fetched from Sharetribe.
  counts: {},
};

const getFavoritesKey = userId => {
  return userId ? `marketplace_favorites_${userId}` : 'marketplace_favorites_guest';
};

const loadFavoritesFromStorage = userId => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const key = getFavoritesKey(userId);
    const stored = window.localStorage.getItem(key);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    return [];
  }
};

const saveFavoritesToStorage = (userId, favorites) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    const key = getFavoritesKey(userId);
    window.localStorage.setItem(key, JSON.stringify(favorites));
  } catch (e) {}
};

const favoritesSlice = createSlice({
  name: 'favorites',
  initialState,
  reducers: {
    addToFavorites: (state, action) => {
      const listingId = action.payload;
      if (!state.favorites.includes(listingId)) {
        state.favorites.unshift(listingId);
        saveFavoritesToStorage(state.currentUserId, state.favorites);
      }
    },
    removeFromFavorites: (state, action) => {
      const listingId = action.payload;
      state.favorites = state.favorites.filter(id => id !== listingId);
      saveFavoritesToStorage(state.currentUserId, state.favorites);
    },
    toggleFavorite: (state, action) => {
      const listingId = action.payload;
      const index = state.favorites.indexOf(listingId);
      if (index >= 0) {
        state.favorites.splice(index, 1);
      } else {
        state.favorites.unshift(listingId);
      }
      saveFavoritesToStorage(state.currentUserId, state.favorites);
    },
    initializeFavorites: (state, action) => {
      const payload = action.payload;
      // Support legacy string/null payload and new object { userId, serverFavorites }
      const userId =
        payload !== null && typeof payload === 'object' ? payload.userId : payload;
      const serverFavorites =
        payload !== null && typeof payload === 'object' ? payload.serverFavorites || null : null;

      state.currentUserId = userId || null;
      const localFavorites = loadFavoritesFromStorage(userId);

      if (serverFavorites !== null) {
        // Server is the source of truth for logged-in users: overwrite local
        // so an operator-side reset (or a remove on another device) propagates
        // back to this device. The pending-favorite flow (`addFavoriteAndSync`)
        // covers the case where the user tapped a heart while logged out.
        state.favorites = serverFavorites;
        saveFavoritesToStorage(userId, serverFavorites);
      } else {
        state.favorites = localFavorites;
      }
    },
    clearFavorites: state => {
      state.favorites = [];
      state.currentUserId = null;
    },
    setFavoriteCount: (state, action) => {
      const { listingId, count } = action.payload || {};
      if (listingId && typeof count === 'number') {
        state.counts[listingId] = count;
      }
    },
  },
});

export const {
  addToFavorites,
  removeFromFavorites,
  toggleFavorite,
  initializeFavorites,
  clearFavorites,
  setFavoriteCount,
} = favoritesSlice.actions;

export const selectFavorites = state => state.favorites?.favorites || [];

export const selectIsFavorite = (state, listingId) => {
  const favorites = selectFavorites(state);
  return favorites.includes(listingId);
};

// Returns the optimistic count override set by the last /api/listing-like
// response, or null if we haven't toggled this listing in the current session.
export const selectFavoriteCountOverride = (state, listingId) =>
  state.favorites?.counts?.[listingId] ?? null;

// ─── Server sync ──────────────────────────────────────────────────────────────

export const syncFavoritesToServer = () => async (dispatch, getState, sdk) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) return;
  const favorites = selectFavorites(state);
  try {
    await sdk.currentUser.updateProfile({ privateData: { favorites } });
  } catch (e) {
    // fail silently — favorites are still safe in localStorage
  }
};

// Tells the backend to recount likes via the Integration SDK so every visitor
// sees the same aggregated number next to the heart, regardless of whose
// device or account loaded the listing.
const postListingLike = (listingId, action, dispatch) => {
  if (typeof fetch === 'undefined') return;
  fetch('/api/listing-like', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ listingId, action }),
  })
    .then(r => (r.ok ? r.json() : null))
    .then(data => {
      if (data && typeof data.count === 'number') {
        dispatch(setFavoriteCount({ listingId, count: data.count }));
      }
    })
    .catch(() => {});
};

// Use these instead of raw toggleFavorite / addToFavorites in components
export const toggleFavoriteAndSync = listingId => (dispatch, getState, sdk) => {
  // Read state BEFORE toggle so we know which action to send to the backend.
  const wasFavorite = selectIsFavorite(getState(), listingId);
  dispatch(toggleFavorite(listingId));
  const state = getState();
  if (state.auth?.isAuthenticated) {
    const favorites = selectFavorites(getState());
    sdk.currentUser.updateProfile({ privateData: { favorites } }).catch(() => {});
    postListingLike(listingId, wasFavorite ? 'unlike' : 'like', dispatch);
  }
};

export const addFavoriteAndSync = listingId => (dispatch, getState, sdk) => {
  dispatch(addToFavorites(listingId));
  const state = getState();
  if (state.auth?.isAuthenticated) {
    const favorites = selectFavorites(getState());
    sdk.currentUser.updateProfile({ privateData: { favorites } }).catch(() => {});
    // Same /api/listing-like call as toggle: covers the post-login "apply
    // pending favorite" path where the heart was tapped while logged out.
    postListingLike(listingId, 'like', dispatch);
  }
};

// ─── Fetch listings ───────────────────────────────────────────────────────────

export const fetchFavoriteListings = config => async (dispatch, getState, sdk) => {
  const state = getState();
  const favoriteListingIds = selectFavorites(state);
  if (!favoriteListingIds || favoriteListingIds.length === 0) return [];

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config?.layout?.listingImage || {};
  const aspectRatio = aspectHeight / aspectWidth;

  // Skip listings that are already hydrated in marketplaceData — saves a
  // burst of needless requests for users navigating between pages that
  // already loaded their favourites.
  const loadedEntities = state.marketplaceData?.entities?.listing || {};
  const idsToFetch = favoriteListingIds.filter(id => !loadedEntities[id]);
  if (idsToFetch.length === 0) return [];

  // Sequential with a small gap + retry-on-429. Was Promise.all over N
  // parallel `sdk.listings.show` calls; even after sequentialising, 429
  // still hit because the rate-limit bucket gets exhausted by other
  // parallel components (Destaque, transactions/query, etc.) on page load.
  // Each call gets up to 4 retries: 1.5s, 3s, 6s, 12s.
  const FETCH_GAP_MS = 200;
  const showWithRetry = (params, attempt = 0) =>
    sdk.listings.show(params).catch(err => {
      const isRateLimited = err && err.status === 429;
      if (isRateLimited && attempt < 4) {
        const delay = 1500 * Math.pow(2, attempt);
        return new Promise(r => setTimeout(r, delay)).then(() =>
          showWithRetry(params, attempt + 1)
        );
      }
      return null;
    });

  const results = [];
  for (const listingId of idsToFetch) {
    const params = {
      id: listingId,
      include: ['author', 'author.profileImage', 'images'],
      'fields.image': [`variants.${variantPrefix}`, `variants.${variantPrefix}-2x`],
      ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
      ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
    };
    // eslint-disable-next-line no-await-in-loop
    const response = await showWithRetry(params);
    if (response) {
      dispatch(addMarketplaceEntities(response, {}));
      results.push(response);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, FETCH_GAP_MS));
  }
  return results;
};

export const loadData = () => (dispatch, getState) => {
  const state = getState();
  const favoriteListingIds = selectFavorites(state);
  if (!favoriteListingIds || favoriteListingIds.length === 0) return Promise.resolve();
  return dispatch(fetchFavoriteListings());
};

export default favoritesSlice.reducer;
