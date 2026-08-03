import { createSlice } from '@reduxjs/toolkit';
import { createImageVariantConfig } from '../util/sdkLoader';
import { addMarketplaceEntities } from './marketplaceData.duck';

// One-shot fetch of the candidate pool used by the homepage
// "Para si" / "For you" recommendations section. The component scores and
// ranks locally.
//
// ⚠️ TEST-ENV TUNING (active right now):
//   - PER_PAGE = 30, MAX_PAGES = 1  → at most 30 listings fetched.
//   Dialled down from 50 to 30 because 50 was still contributing to the
//   429 cascade in dev (the marketplace currently has ~30 listings — 30
//   covers everything).
//
// 🚀 BEFORE GOING TO PRODUCTION:
//   Switch back to fetching EVERY published listing:
//       const PER_PAGE = 100;  // Sharetribe's per-request maximum
//       const MAX_PAGES = 50;  // 5000-listing ceiling
//   The live environment is NOT rate-limited, so paginating through every
//   listing is safe and gives the algorithm the full pool to score
//   against — which is what we actually want for real "Para si"
//   personalisation. See memory `project_recommendations_perpage_test.md`.
const PER_PAGE = 30;
const MAX_PAGES = 1;
// Gap between paginated requests so we don't trigger the Sharetribe rate
// limit when there are many pages to walk.
const PAGE_DELAY_MS = 250;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Same denormalizer as similarListings.duck — picks images + author out of
// the JSON:API `included` array so each listing arrives self-contained.
const denormalizeListings = response => {
  const data = response?.data;
  if (!data) return [];
  const included = data.included || [];
  const includedMap = {};
  included.forEach(item => {
    const key = `${item.type}:${item.id.uuid}`;
    includedMap[key] = item;
  });
  return (data.data || []).map(listing => {
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
    return { ...listing, images, author };
  });
};

const slice = createSlice({
  name: 'recommendations',
  initialState: {
    // List of listing UUIDs. The actual listing objects live in
    // `marketplaceData.entities.listing` so the SDK's Money / UUID class
    // wrapping is applied — storing raw listings here was crashing
    // ListingCard because `formatMoney` expects a Money instance.
    candidateIds: [],
    fetched: false,      // True after the first attempt (success or fail) — gates re-fetch.
    inProgress: false,
    error: null,
    // Listing-view counts keyed by listing UUID. Used by the scoring as
    // a popularity signal (cold-start users see popular listings first
    // instead of just "newest"). Fetched once per session.
    viewCounts: {},
    viewCountsFetched: false,
    // Exclude snapshot: the set of listing IDs that should NOT appear in
    // "Para si" for the current user. Captured once per user-session so
    // that anything the user views or favorites *during* the session keeps
    // showing up in the section. Stored in Redux (not local ref) so it
    // survives navigation away from the homepage and back.
    excludeSnapshot: { userId: null, ids: [] },
  },
  reducers: {
    setInProgress: (state, action) => {
      state.inProgress = !!action.payload;
    },
    setCandidateIds: (state, action) => {
      state.candidateIds = Array.isArray(action.payload) ? action.payload : [];
      state.fetched = true;
      state.inProgress = false;
      state.error = null;
    },
    setError: (state, action) => {
      state.error = action.payload || null;
      state.fetched = true;
      state.inProgress = false;
    },
    clearCandidates: state => {
      state.candidateIds = [];
      state.fetched = false;
      state.inProgress = false;
      state.error = null;
    },
    setExcludeSnapshot: (state, action) => {
      const { userId = null, ids = [] } = action.payload || {};
      state.excludeSnapshot = { userId, ids: Array.from(new Set(ids)) };
    },
    clearExcludeSnapshot: state => {
      state.excludeSnapshot = { userId: null, ids: [] };
    },
    setViewCounts: (state, action) => {
      state.viewCounts = action.payload || {};
      state.viewCountsFetched = true;
    },
  },
});

export const {
  setInProgress,
  setCandidateIds,
  setError,
  clearCandidates,
  setExcludeSnapshot,
  clearExcludeSnapshot,
  setViewCounts,
} = slice.actions;

export const selectRecommendationCandidateIds = state =>
  state.recommendations?.candidateIds || [];
export const selectRecommendationsFetched = state =>
  !!state.recommendations?.fetched;
export const selectRecommendationsInProgress = state =>
  !!state.recommendations?.inProgress;
export const selectExcludeSnapshot = state =>
  state.recommendations?.excludeSnapshot || { userId: null, ids: [] };
export const selectViewCounts = state =>
  state.recommendations?.viewCounts || {};
export const selectViewCountsFetched = state =>
  !!state.recommendations?.viewCountsFetched;

// sessionStorage keys. We keep the cache in sessionStorage (not local)
// so it dies when the user closes the tab — good middle ground between
// "always refetch" and "cache forever". TTL adds a max age so a tab left
// open for hours doesn't keep serving stale data.
// Bump these version numbers whenever the cached shape changes so stale
// cached data from an older deploy doesn't break the new code path.
const CACHE_KEY_CANDIDATES = 'recommendations_candidates_v2';
const CACHE_KEY_VIEW_COUNTS = 'recommendations_view_counts_v2';
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

const readCache = key => {
  try {
    if (typeof window === 'undefined') return null;
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - (parsed.ts || 0) > CACHE_TTL_MS) return null;
    return parsed.data;
  } catch (_) {
    return null;
  }
};
const writeCache = (key, data) => {
  try {
    if (typeof window === 'undefined') return;
    window.sessionStorage.setItem(key, JSON.stringify({ ts: Date.now(), data }));
  } catch (_) {
    // Quota / private-browsing — silent. The fetch path still works without
    // the cache.
  }
};

// Fetch the bulk view-count snapshot from the local server endpoint so the
// scoring can use real audience size as a signal. Idempotent — second call
// in the same session is a no-op. Failure is silent because the section
// still works without view counts (just without the popularity boost).
export const fetchViewCounts = () => async (dispatch, getState) => {
  const state = getState();
  if (state.recommendations?.viewCountsFetched) return;

  // Hot path: sessionStorage cache hit — skip the network entirely.
  const cached = readCache(CACHE_KEY_VIEW_COUNTS);
  if (cached) {
    dispatch(setViewCounts(cached));
    return;
  }

  try {
    const res = await fetch('/api/listing-views');
    if (!res.ok) return;
    const data = await res.json();
    if (data && typeof data === 'object') {
      dispatch(setViewCounts(data));
      writeCache(CACHE_KEY_VIEW_COUNTS, data);
    }
  } catch (_) {
    // Silent — popularity signal is optional.
  }
};

export const fetchRecommendationCandidates = config => async (dispatch, getState, sdk) => {
  const state = getState();
  if (state.recommendations?.fetched || state.recommendations?.inProgress) {
    // Already attempted this session — don't re-trigger to avoid burning
    // requests on every homepage mount.
    return;
  }

  // sessionStorage cache hit. Only honour it if at least 6 of the cached
  // listings are still in marketplaceData — otherwise the cache is stale
  // (e.g. Destaque is now configured for `featured` only and seeds far
  // fewer entries), and we'd rather pay for one fresh fetch than show the
  // user a 1-card grid.
  const MIN_CACHE_HIT_SIZE = 6;
  const cachedIds = readCache(CACHE_KEY_CANDIDATES);
  if (Array.isArray(cachedIds) && cachedIds.length > 0) {
    const entities = getState().marketplaceData?.entities?.listing || {};
    const stillThere = cachedIds.filter(id => !!entities[id]);
    if (stillThere.length >= MIN_CACHE_HIT_SIZE) {
      dispatch(setCandidateIds(stillThere));
      return;
    }
  }

  dispatch(setInProgress(true));

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config?.layout?.listingImage || {};
  const aspectRatio = aspectHeight / aspectWidth;

  const baseParams = {
    perPage: PER_PAGE,
    include: ['author', 'author.profileImage', 'images'],
    'fields.listing': [
      'title',
      'geolocation',
      'price',
      'state',
      'createdAt',
      'publicData.listingType',
      'publicData.transactionProcessAlias',
      'publicData.unitType',
      'publicData.categoryLevel1',
      'publicData.categoryLevel2',
      'publicData.categoryLevel3',
      'publicData.location',
      'publicData.favoritesCount',
      'publicData.featured',
    ],
    'fields.image': [`variants.${variantPrefix}`, `variants.${variantPrefix}-2x`, `variants.${variantPrefix}-4x`],
    ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
    ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
    ...createImageVariantConfig(`${variantPrefix}-4x`, 1600, aspectRatio),
    'limit.images': 1,
    sort: '-createdAt',
  };

  // Retry one specific page on 429 with exponential backoff (800ms, 1.6s,
  // 3.2s) — same strategy used by similarListings.duck so the rate-limit
  // handling is consistent across the marketplace.
  const queryPageWithRetry = async (page, attempt = 0) => {
    try {
      return await sdk.listings.query({ ...baseParams, page });
    } catch (err) {
      const isRateLimited = err && err.status === 429;
      if (isRateLimited && attempt < 3) {
        const delay = 800 * Math.pow(2, attempt);
        await sleep(delay);
        return queryPageWithRetry(page, attempt + 1);
      }
      throw err;
    }
  };

  try {
    // First page tells us how many pages we actually have to walk so we
    // don't make speculative requests. Each page response is also pushed
    // into `marketplaceData` so the SDK type wrapping (Money / UUID / …)
    // is applied — that's what `ListingCard` expects.
    const collectedIds = [];
    const pushResponse = resp => {
      dispatch(addMarketplaceEntities(resp));
      (resp?.data?.data || []).forEach(l => {
        if (l?.id?.uuid) collectedIds.push(l.id.uuid);
      });
    };

    const firstResp = await queryPageWithRetry(1);
    pushResponse(firstResp);
    const totalPages = Math.min(
      Number(firstResp?.data?.meta?.totalPages || 1),
      MAX_PAGES
    );

    // Walk the remaining pages sequentially with a small delay between
    // each. Sequential (not parallel) so we don't burst into 429.
    for (let p = 2; p <= totalPages; p++) {
      await sleep(PAGE_DELAY_MS);
      const resp = await queryPageWithRetry(p);
      pushResponse(resp);
    }

    dispatch(setCandidateIds(collectedIds));
    writeCache(CACHE_KEY_CANDIDATES, collectedIds);
  } catch (e) {
    dispatch(setError({ message: e?.message || 'fetch-failed' }));
  }
};

export default slice.reducer;
