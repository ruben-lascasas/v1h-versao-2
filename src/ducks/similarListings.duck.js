import { createSlice } from '@reduxjs/toolkit';
import { createImageVariantConfig } from '../util/sdkLoader';

const MAX_RESULTS = 20;
const FETCH_POOL_SIZE = 50;

const shuffle = arr => {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

// Denormalize JSON:API response into { [uuid]: listingWithRelationships }
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

const similarListingsSlice = createSlice({
  name: 'similarListings',
  initialState: {
    listingsByListingId: {}, // { [currentListingId]: [listings] }
  },
  reducers: {
    setSimilarListings: (state, action) => {
      const { listingId, listings } = action.payload;
      state.listingsByListingId[listingId] = listings;
    },
    clearSimilarListings: state => {
      state.listingsByListingId = {};
    },
  },
});

export const { setSimilarListings, clearSimilarListings } = similarListingsSlice.actions;

export const selectSimilarListings = (state, listingId) =>
  state.similarListings?.listingsByListingId?.[listingId] || [];

export const fetchSimilarListings = (currentListingId, categoryLevel1, config) => async (
  dispatch,
  getState,
  sdk
) => {
  if (!currentListingId) return;

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config?.layout?.listingImage || {};
  const aspectRatio = aspectHeight / aspectWidth;

  const params = {
    perPage: FETCH_POOL_SIZE,
    include: ['author', 'author.profileImage', 'images'],
    'fields.listing': [
      'title',
      'geolocation',
      'price',
      'state',
      'publicData.listingType',
      'publicData.categoryLevel1',
      'publicData.location',
      'publicData.favoritesCount',
      'publicData.featured',
    ],
    'fields.image': [`variants.${variantPrefix}`, `variants.${variantPrefix}-2x`],
    ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
    ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
  };
  if (categoryLevel1) {
    params.pub_categoryLevel1 = categoryLevel1;
  }

  // Retry on 429 (Sharetribe rate limit) with exponential backoff: 800ms, 1600ms, 3200ms.
  const queryWithRetry = async (attempt = 0) => {
    try {
      return await sdk.listings.query(params);
    } catch (err) {
      const isRateLimited = err && err.status === 429;
      if (isRateLimited && attempt < 3) {
        const delay = 800 * Math.pow(2, attempt);
        await new Promise(resolve => setTimeout(resolve, delay));
        return queryWithRetry(attempt + 1);
      }
      throw err;
    }
  };

  try {
    const response = await queryWithRetry();
    const all = denormalizeListings(response);
    const filtered = all.filter(l => l?.id?.uuid !== currentListingId);
    const randomized = shuffle(filtered).slice(0, MAX_RESULTS);
    dispatch(setSimilarListings({ listingId: currentListingId, listings: randomized }));
  } catch (e) {
    // fail silently
  }
};

export default similarListingsSlice.reducer;
