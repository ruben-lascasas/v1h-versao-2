import { createSlice } from '@reduxjs/toolkit';
import { selectSavedSearches } from './savedSearches.duck';

// Stores the last time we checked each saved search ID for new results,
// per logged-in user, so re-opening the site doesn't re-notify about the
// same listings every time.
const STORAGE_KEY_PREFIX = 'v1h_savedSearchCheck_';
const THROTTLE_MS = 5 * 60 * 1000;
let lastApiCheckAt = 0;

const SKIP_PARAMS = new Set(['page', 'sort', 'view', 'mapSearch']);

const sanitiseParams = params => {
  const out = {};
  Object.entries(params || {}).forEach(([k, v]) => {
    if (!SKIP_PARAMS.has(k) && v != null && v !== '') out[k] = v;
  });
  return out;
};

const slice = createSlice({
  name: 'savedSearchAlerts',
  initialState: {
    matches: [], // [{ savedSearchId, label, url, listings: [{id,title}] }]
    dismissed: false,
  },
  reducers: {
    setMatches: (state, action) => {
      state.matches = action.payload;
      state.dismissed = false;
    },
    dismissAlerts: state => {
      state.dismissed = true;
    },
  },
});

export const { setMatches, dismissAlerts } = slice.actions;

export const selectSavedSearchMatches = state =>
  state.savedSearchAlerts?.matches || [];
export const selectSavedSearchAlertsDismissed = state =>
  state.savedSearchAlerts?.dismissed || false;

export const checkSavedSearchMatches = (userId, { force } = {}) => async (
  dispatch,
  getState,
  sdk
) => {
  const savedSearches = selectSavedSearches(getState());
  if (!savedSearches || savedSearches.length === 0) return;

  const now = Date.now();
  if (!force && now - lastApiCheckAt < THROTTLE_MS) return;
  lastApiCheckAt = now;

  const storageKey = STORAGE_KEY_PREFIX + userId;
  let perSearchDates = {};
  try {
    const stored = localStorage.getItem(storageKey);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        perSearchDates = parsed;
      }
    }
  } catch (_) {
    localStorage.removeItem(storageKey);
  }

  // Seed any new saved searches with "now" so we never notify about pre-save
  // listings — only listings created AFTER the user saved the search.
  const nowIso = new Date(now).toISOString();
  savedSearches.forEach(s => {
    if (!perSearchDates[s.id]) {
      // Use the savedAt timestamp so brand-new entries can pick up listings
      // created between save and the first check.
      perSearchDates[s.id] = new Date(s.savedAt || now).toISOString();
    }
  });
  localStorage.setItem(storageKey, JSON.stringify(perSearchDates));

  try {
    const results = await Promise.all(
      savedSearches.map(async s => {
        const safe = sanitiseParams(s.params);
        const cutoff = new Date(perSearchDates[s.id] || nowIso);
        try {
          const res = await sdk.listings.query({
            ...safe,
            createdAtStart: cutoff.toISOString(),
            sort: '-createdAt',
            perPage: 5,
          });
          const fresh = (res?.data?.data || []).filter(l => {
            const created = new Date(l?.attributes?.createdAt);
            // Exclude own listings — author info isn't always included in the
            // base listings.query response so we fall back to userId match.
            const authorId = l?.relationships?.author?.data?.id?.uuid;
            return created > cutoff && authorId !== userId;
          });
          return { savedSearch: s, listings: fresh };
        } catch (_) {
          return { savedSearch: s, listings: [] };
        }
      })
    );

    // Refresh cutoffs to now after the check so we don't double-notify.
    savedSearches.forEach(s => {
      perSearchDates[s.id] = nowIso;
    });
    localStorage.setItem(storageKey, JSON.stringify(perSearchDates));

    const matches = results
      .filter(r => r.listings.length > 0)
      .map(r => ({
        savedSearchId: r.savedSearch.id,
        label: r.savedSearch.label,
        url: r.savedSearch.url,
        count: r.listings.length,
        listings: r.listings.slice(0, 3).map(l => ({
          id: l.id?.uuid,
          title: l?.attributes?.title || '',
        })),
      }));

    if (matches.length > 0) {
      dispatch(setMatches(matches));
    }
  } catch (_) {
    /* ignored */
  }
};

export default slice.reducer;
