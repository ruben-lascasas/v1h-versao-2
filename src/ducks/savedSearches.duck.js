/**
 * Saved searches — persisted in `currentUser.privateData.savedSearches` so a
 * user can re-run the same filtered search later (similar to eBay's
 * "Guardar esta búsqueda"). Each entry is:
 *   { id, label, url, params, savedAt }
 *
 * Selectors / actions follow the same shape as `favorites.duck.js`.
 */

import { fetchCurrentUser } from './user.duck';

const MAX_SAVED_SEARCHES = 25;

// URL-only params that don't change the underlying search (pagination, sort,
// map bounds, view mode). Two saved searches that differ only in these are
// the same search semantically — used for dedup, not for navigation.
const VOLATILE_SEARCH_PARAMS = new Set([
  'page',
  'sort',
  'view',
  'mapSearch',
  'bounds',
  'origin',
]);

const normalizeParams = params => {
  const out = {};
  if (!params || typeof params !== 'object') return out;
  Object.entries(params).forEach(([k, v]) => {
    if (VOLATILE_SEARCH_PARAMS.has(k)) return;
    if (v == null || v === '') return;
    out[k] = String(v);
  });
  return out;
};

// Stable signature of a saved search: filter-bearing params sorted and joined.
// Two searches share a key iff they navigate to the same effective listing
// query, even if their stored `url`s differ in pagination / map bounds.
const searchKey = entry => {
  if (!entry) return '';
  const params = normalizeParams(entry.params);
  const keys = Object.keys(params).sort();
  const qs = keys.map(k => `${k}=${params[k]}`).join('&');
  return qs;
};

export const selectSavedSearches = state => {
  const fromUser =
    state.user?.currentUser?.attributes?.profile?.privateData?.savedSearches;
  return Array.isArray(fromUser) ? fromUser : [];
};

export const selectIsSearchSaved = (state, urlOrEntry) => {
  const list = selectSavedSearches(state);
  // Accept either a raw URL (legacy) or a full entry shape with params.
  const target =
    typeof urlOrEntry === 'string'
      ? { url: urlOrEntry, params: paramsFromUrl(urlOrEntry) }
      : urlOrEntry;
  const targetKey = searchKey(target);
  return list.some(s => s && searchKey(s) === targetKey);
};

// Tiny helper for the legacy `selectIsSearchSaved(state, urlString)` callers:
// parse the querystring back into a plain object so we can normalize it.
const paramsFromUrl = url => {
  if (!url || typeof url !== 'string') return {};
  const qIndex = url.indexOf('?');
  if (qIndex === -1) return {};
  const usp = new URLSearchParams(url.slice(qIndex + 1));
  const obj = {};
  usp.forEach((v, k) => {
    obj[k] = v;
  });
  return obj;
};

// Add or remove a search from the user's saved list and sync to server.
// Resolves with { saved: true|false, error? } so the caller can show feedback.
export const toggleSavedSearchAndSync = entry => (dispatch, getState, sdk) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) {
    return Promise.resolve({ saved: false, error: 'not-authenticated' });
  }
  const current = selectSavedSearches(state);
  const entryKey = searchKey(entry);
  const exists = current.some(s => s && searchKey(s) === entryKey);
  const next = exists
    ? current.filter(s => s && searchKey(s) !== entryKey)
    : [
        {
          ...entry,
          savedAt: Date.now(),
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        },
        ...current,
      ].slice(0, MAX_SAVED_SEARCHES);

  return sdk.currentUser
    .updateProfile({ privateData: { savedSearches: next } })
    .then(() => {
      // Refresh currentUser so selectors see the new privateData immediately.
      dispatch(fetchCurrentUser());
      return { saved: !exists, list: next };
    })
    .catch(err => ({ saved: exists, error: err?.message || 'update-failed' }));
};

// One-shot cleanup for users who already have duplicate entries created
// before the dedup logic above existed. Keeps the newest entry (highest
// savedAt) for each canonical key and drops the rest. No-op when the list
// is already clean, so it's safe to call on every page load.
export const dedupeSavedSearchesAndSync = () => (dispatch, getState, sdk) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) return Promise.resolve();
  const current = selectSavedSearches(state);
  if (!current || current.length < 2) return Promise.resolve();

  const seen = new Map();
  // Iterate in newest-first order so the first occurrence we keep is the
  // freshest one for each key.
  [...current]
    .sort((a, b) => (b?.savedAt || 0) - (a?.savedAt || 0))
    .forEach(s => {
      const k = searchKey(s);
      if (!seen.has(k)) seen.set(k, s);
    });
  const deduped = Array.from(seen.values()).sort(
    (a, b) => (b?.savedAt || 0) - (a?.savedAt || 0)
  );
  if (deduped.length === current.length) return Promise.resolve();

  return sdk.currentUser
    .updateProfile({ privateData: { savedSearches: deduped } })
    .then(() => dispatch(fetchCurrentUser()))
    .catch(() => {});
};

// Count how many listings currently match a saved search by re-running the
// same params with perPage=1 — Sharetribe still returns meta.totalItems so
// we only need one tiny API call per saved entry.
export const fetchSavedSearchCount = savedSearch => async (dispatch, getState, sdk) => {
  if (!savedSearch || !savedSearch.params) return null;
  // Strip URL-only params (page, sort, view…) that aren't listing-query keys
  // but keep the filters that actually narrow the result set.
  const SKIP = new Set(['page', 'sort', 'view', 'mapSearch']);
  const safe = {};
  Object.entries(savedSearch.params).forEach(([k, v]) => {
    if (!SKIP.has(k) && v != null && v !== '') safe[k] = v;
  });
  try {
    const res = await sdk.listings.query({ ...safe, perPage: 1 });
    const total = res?.data?.meta?.totalItems;
    return typeof total === 'number' ? total : null;
  } catch (e) {
    return null;
  }
};

// Remove a single saved search by id.
export const removeSavedSearchAndSync = id => (dispatch, getState, sdk) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) return Promise.resolve();
  const current = selectSavedSearches(state);
  const next = current.filter(s => s && s.id !== id);
  return sdk.currentUser
    .updateProfile({ privateData: { savedSearches: next } })
    .then(() => dispatch(fetchCurrentUser()))
    .catch(() => {});
};
