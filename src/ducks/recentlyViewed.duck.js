import { createSlice } from '@reduxjs/toolkit';
import { createImageVariantConfig } from '../util/sdkLoader';

const MAX_RECENTLY_VIEWED = 20;

// Denormalize JSON:API response into { [uuid]: listingWithRelationships }
const denormalizeListings = response => {
  const data = response?.data;
  if (!data) return {};

  const included = data.included || [];
  const includedMap = {};
  included.forEach(item => {
    const key = `${item.type}:${item.id.uuid}`;
    includedMap[key] = item;
  });

  const result = {};
  (data.data || []).forEach(listing => {
    const imageRefs = listing.relationships?.images?.data || [];
    const images = imageRefs
      .map(ref => includedMap[`image:${ref.id.uuid}`])
      .filter(Boolean);

    const authorRef = listing.relationships?.author?.data;
    let author = authorRef ? { ...includedMap[`user:${authorRef.id.uuid}`] } : null;
    if (author) {
      const profileImageRef = author.relationships?.profileImage?.data;
      if (profileImageRef) {
        author = { ...author, profileImage: includedMap[`image:${profileImageRef.id.uuid}`] };
      }
    }

    result[listing.id.uuid] = { ...listing, images, author };
  });

  return result;
};

// Entries older than 30 days are ignored when loaded from the server
const EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;
const isExpired = entry => Date.now() - entry.viewedAt > EXPIRY_MS;

const recentlyViewedSlice = createSlice({
  name: 'recentlyViewed',
  initialState: {
    entries: [], // [{ id, viewedAt }]
    currentUserId: null,
    listings: {}, // { [uuid]: denormalized listing } — isolated from marketplaceData
  },
  reducers: {
    initializeRecentlyViewed: (state, action) => {
      const payload = action.payload;
      const userId =
        payload !== null && typeof payload === 'object' ? payload.userId : payload;
      const serverEntries =
        payload !== null && typeof payload === 'object' ? payload.serverEntries || null : null;

      state.currentUserId = userId || null;

      if (serverEntries && serverEntries.length > 0) {
        // Merge server entries with current in-memory entries, keeping the most recent viewedAt per id.
        // This prevents a race condition where fetchCurrentUser returns stale server data before
        // addToRecentlyViewedAndSync has finished writing to the server.
        const allEntries = [...serverEntries, ...state.entries];
        const seen = new Set();
        const merged = allEntries
          .filter(e => e && e.id && !isExpired(e))
          .sort((a, b) => b.viewedAt - a.viewedAt)
          .filter(e => (seen.has(e.id) ? false : seen.add(e.id)))
          .slice(0, MAX_RECENTLY_VIEWED);
        state.entries = merged;
      }
      // If no serverEntries, keep current in-memory entries (avoids clearing on every fetchCurrentUser)
    },
    addToRecentlyViewed: (state, action) => {
      const id = action.payload;
      if (!id) return;
      state.entries = state.entries.filter(e => e.id !== id);
      state.entries.unshift({ id, viewedAt: Date.now() });
      if (state.entries.length > MAX_RECENTLY_VIEWED) {
        state.entries = state.entries.slice(0, MAX_RECENTLY_VIEWED);
      }
    },
    setRecentlyViewedListings: (state, action) => {
      // Merge rather than replace so partial fetches never clear previously loaded listings
      Object.assign(state.listings, action.payload);
    },
    clearRecentlyViewed: state => {
      state.entries = [];
      state.currentUserId = null;
      state.listings = {};
    },
  },
});

export const { initializeRecentlyViewed, addToRecentlyViewed, setRecentlyViewedListings, clearRecentlyViewed } = recentlyViewedSlice.actions;

const selectEntries = state => state.recentlyViewed?.entries;
let _lastEntries = null;
let _lastIds = [];
export const selectRecentlyViewed = state => {
  const entries = selectEntries(state);
  if (entries === _lastEntries) return _lastIds;
  _lastEntries = entries;
  _lastIds = (entries || []).map(e => e.id);
  return _lastIds;
};

// ─── Session persistence (guest users) ───────────────────────────────────────
// sessionStorage survives hard refresh (Ctrl+Shift+R) but clears when the tab
// is closed. Used only for non-logged-in users — cleared on login/logout.

const SESSION_KEY = 'rv_session';

export const saveSessionEntries = entries => {
  try {
    if (entries && entries.length > 0) {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify(entries));
    } else {
      sessionStorage.removeItem(SESSION_KEY);
    }
  } catch (_) {}
};

export const loadSessionEntries = () => {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
};

export const clearSessionEntries = () => {
  try { sessionStorage.removeItem(SESSION_KEY); } catch (_) {}
};

// ─── OAuth redirect bridge ────────────────────────────────────────────────────
// sessionStorage is used ONLY to survive the Google/Facebook OAuth redirect.
// It is cleared immediately after being read, so it is not a persistent cache.

const OAUTH_SESSION_KEY = 'rv_prelogin';

export const savePreLoginEntriesToSession = entries => {
  try {
    if (entries && entries.length > 0) {
      sessionStorage.setItem(OAUTH_SESSION_KEY, JSON.stringify(entries));
    }
  } catch (_) {}
};

export const loadAndClearPreLoginEntries = () => {
  try {
    const raw = sessionStorage.getItem(OAUTH_SESSION_KEY);
    sessionStorage.removeItem(OAUTH_SESSION_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
};

// ─── Server sync ──────────────────────────────────────────────────────────────

export const syncRecentlyViewedToServer = () => async (_dispatch, getState, sdk) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) return;
  const entries = state.recentlyViewed?.entries || [];
  try {
    await sdk.currentUser.updateProfile({ privateData: { recentlyViewed: entries } });
  } catch (e) {
    // fail silently
  }
};

export const addToRecentlyViewedAndSync = id => (dispatch, getState, sdk) => {
  dispatch(addToRecentlyViewed(id));
  const state = getState();
  const entries = getState().recentlyViewed?.entries || [];
  if (state.auth?.isAuthenticated) {
    sdk.currentUser.updateProfile({ privateData: { recentlyViewed: entries } }).catch(() => {});
  } else {
    // Guest: persist in sessionStorage so hard refresh doesn't lose the list
    saveSessionEntries(entries);
  }
};

// ─── Fetch listings ───────────────────────────────────────────────────────────

export const fetchRecentlyViewedListings = config => async (dispatch, getState, sdk) => {
  const state = getState();
  const ids = selectRecentlyViewed(state);
  if (!ids || ids.length === 0) return;

  // Only fetch listings not already loaded — safe to call on every entries change
  const loadedIds = new Set(Object.keys(state.recentlyViewed?.listings || {}));
  const idsToFetch = ids.filter(id => !loadedIds.has(id));
  if (idsToFetch.length === 0) return;

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config?.layout?.listingImage || {};
  const aspectRatio = aspectHeight / aspectWidth;

  const params = {
    include: ['author', 'author.profileImage', 'images'],
    'fields.image': [`variants.${variantPrefix}`, `variants.${variantPrefix}-2x`, `variants.${variantPrefix}-4x`],
    ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
    ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
    ...createImageVariantConfig(`${variantPrefix}-4x`, 1600, aspectRatio),
  };

  // Sequential fetch with retry-on-429 + small gap between calls.
  // Sequentialising stopped the 20-parallel burst, but 429 still hits when
  // the shared rate-limit bucket has already been spent by other components
  // (Destaque, transactions/query, etc.) on page load. So each call gets
  // up to 4 retries with exponential backoff: 1.5s, 3s, 6s, 12s.
  const FETCH_GAP_MS = 200;
  const showWithRetry = (id, attempt = 0) =>
    sdk.listings.show({ id, ...params })
      .then(r => r?.data || null)
      .catch(err => {
        const isRateLimited = err && err.status === 429;
        if (isRateLimited && attempt < 4) {
          const delay = 1500 * Math.pow(2, attempt);
          return new Promise(r => setTimeout(r, delay)).then(() =>
            showWithRetry(id, attempt + 1)
          );
        }
        return null;
      });

  const allListings = {};
  for (const id of idsToFetch) {
    // eslint-disable-next-line no-await-in-loop
    const response = await showWithRetry(id);
    if (response) {
      const denormalized = denormalizeListings({
        data: { data: [response.data], included: response.included || [] },
      });
      Object.assign(allListings, denormalized);
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise(r => setTimeout(r, FETCH_GAP_MS));
  }
  if (Object.keys(allListings).length > 0) {
    dispatch(setRecentlyViewedListings(allListings));
  }
};

export const loadData = () => dispatch => {
  return dispatch(fetchRecentlyViewedListings());
};

export default recentlyViewedSlice.reducer;
