import { createSlice } from '@reduxjs/toolkit';

// localStorage cache for review counts. Reviews change rarely → caching for
// 30 minutes is plenty and dramatically reduces 429s in dev, because every
// ListingCard on the page used to fire its own /reviews/query call. Cache
// hits short-circuit before any SDK call.
const RATING_CACHE_KEY = 'v1h_listing_ratings_v1';
const RATING_CACHE_TTL_MS = 30 * 60 * 1000;
let _ratingCacheRead = null;
const readRatingCache = () => {
  if (_ratingCacheRead) return _ratingCacheRead;
  try {
    if (typeof window === 'undefined') return (_ratingCacheRead = {});
    const raw = window.localStorage.getItem(RATING_CACHE_KEY);
    _ratingCacheRead = raw ? JSON.parse(raw) || {} : {};
  } catch (_) {
    _ratingCacheRead = {};
  }
  return _ratingCacheRead;
};
const writeRatingCache = (listingId, payload) => {
  try {
    if (typeof window === 'undefined') return;
    const cache = readRatingCache();
    cache[listingId] = { ...payload, ts: Date.now() };
    window.localStorage.setItem(RATING_CACHE_KEY, JSON.stringify(cache));
  } catch (_) {}
};
const readCachedRating = listingId => {
  const cache = readRatingCache();
  const entry = cache[listingId];
  if (!entry) return null;
  if (Date.now() - (entry.ts || 0) > RATING_CACHE_TTL_MS) return null;
  return entry;
};

// Sequential queue with a small gap between SDK calls so 30 cards on one
// page don't burst-fire 30 parallel /reviews/query requests and trigger
// 429. Concurrency = 1, 250 ms gap = ~4 requests/sec — well under the
// 60/min test limit while still feeling responsive.
const REVIEW_FETCH_GAP_MS = 250;
let _ratingQueueChain = Promise.resolve();
const enqueueRatingFetch = task => {
  const next = _ratingQueueChain.then(async () => {
    try {
      await task();
    } finally {
      await new Promise(r => setTimeout(r, REVIEW_FETCH_GAP_MS));
    }
  });
  _ratingQueueChain = next.catch(() => {});
  return next;
};

const computeAverage = reviews => {
  if (!reviews || reviews.length === 0) return null;
  const ratings = reviews.map(r => r?.rating ?? r?.attributes?.rating).filter(r => r != null);
  if (ratings.length === 0) return null;
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return Math.round(avg * 10) / 10;
};

const ratingsSlice = createSlice({
  name: 'ratings',
  initialState: {
    averages: {},
    counts: {},
    // User-level ratings — aggregated from every review where the user is the
    // subject (provider or customer). Stored separately from listing ratings
    // so the two namespaces don't collide if a listing id ever equals a user id.
    userAverages: {},
    userCounts: {},
  },
  reducers: {
    setListingRating: (state, action) => {
      const { listingId, reviews } = action.payload;
      const avg = computeAverage(reviews);
      if (listingId) {
        state.averages[listingId] = avg;
        state.counts[listingId] = reviews?.length || 0;
      }
    },
    setUserRating: (state, action) => {
      const { userId, reviews } = action.payload;
      if (!userId) return;
      state.userAverages[userId] = computeAverage(reviews);
      state.userCounts[userId] = reviews?.length || 0;
    },
  },
  extraReducers: builder => {
    builder.addCase('ListingPage/fetchReviews/fulfilled', (state, action) => {
      const arg = action.meta.arg;
      const listingId = arg?.listingId?.uuid || arg?.listingId;
      const reviews = action.payload;
      if (listingId) {
        state.averages[listingId] = computeAverage(reviews);
        state.counts[listingId] = reviews?.length || 0;
      }
    });
  },
});

export const { setListingRating, setUserRating } = ratingsSlice.actions;

export const fetchListingRating = listingId => async (dispatch, getState, sdk) => {
  if (!listingId) return;
  const already = getState().ratings?.averages;
  if (already && listingId in already) return; // already fetched this session

  // localStorage cache hit — hydrate Redux without touching the SDK.
  const cached = readCachedRating(listingId);
  if (cached) {
    dispatch(setListingRating({
      listingId,
      // setListingRating uses reviews.length for the count; reconstruct an
      // array of the right length with the right rating so computeAverage
      // also returns the cached avg.
      reviews: Array.from({ length: cached.count || 0 }, () => ({
        attributes: { rating: cached.avg },
      })),
    }));
    return;
  }

  // Queue real SDK calls so 30 listings on one page don't burst-fire 30
  // parallel requests (instant 429 in test env).
  return enqueueRatingFetch(async () => {
    // Re-check after dequeue — another instance may have already fetched
    // (e.g. user is on a page that shows the same listing twice).
    const latest = getState().ratings?.averages;
    if (latest && listingId in latest) return;
    try {
      const response = await sdk.reviews.query({
        listing_id: listingId,
        state: 'public',
      });
      const reviews = response?.data?.data || [];
      const cleaned = reviews.map(r => ({ attributes: r.attributes }));
      dispatch(setListingRating({ listingId, reviews: cleaned }));
      writeRatingCache(listingId, {
        avg: computeAverage(cleaned),
        count: cleaned.length,
      });
    } catch (e) {
      // 429 / network error — DON'T mark as fetched. Letting Redux stay
      // empty for this listing means the next page-view can retry instead
      // of caching a permanent "0 reviews" answer.
    }
  });
};

// Returns the average rating for a listing, or undefined if not yet fetched
export const selectListingRating = (state, listingId) => {
  const val = state.ratings?.averages?.[listingId];
  return val !== undefined ? val : undefined;
};

// Returns the review count for a listing, or undefined if not yet fetched
export const selectListingReviewCount = (state, listingId) => {
  return state.ratings?.counts?.[listingId];
};

// Fetch only the reviews where the user was reviewed AS A CUSTOMER
// (i.e. type 'ofCustomer' — what the host wrote about the guest after a
// completed booking). The earlier version averaged every review the user
// received, but the V1H bosses decided that mixing host-side and guest-side
// reviews skewed the visible "user rating" — they want this number to
// reflect *only* how the person behaves as a guest.
export const fetchUserRating = userId => async (dispatch, getState, sdk) => {
  if (!userId) return;
  const already = getState().ratings?.userAverages;
  if (already && userId in already) return;
  try {
    const response = await sdk.reviews.query({
      subjectId: userId,
      state: 'public',
    });
    const all = response?.data?.data || [];
    // Filter to customer-side reviews even if Sharetribe ignored a type
    // query param. The review's `type` is 'ofCustomer' when the customer
    // is the subject (host wrote it about the guest).
    const customerReviews = all.filter(
      r => r?.attributes?.type === 'ofCustomer'
    );
    dispatch(
      setUserRating({
        userId,
        reviews: customerReviews.map(r => ({ attributes: r.attributes })),
      })
    );
  } catch (_) {
    dispatch(setUserRating({ userId, reviews: [] }));
  }
};

export const selectUserRating = (state, userId) => {
  const val = state.ratings?.userAverages?.[userId];
  return val !== undefined ? val : undefined;
};
export const selectUserReviewCount = (state, userId) =>
  state.ratings?.userCounts?.[userId];

export default ratingsSlice.reducer;
