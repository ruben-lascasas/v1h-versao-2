import { createSlice } from '@reduxjs/toolkit';
import { createImageVariantConfig } from '../util/sdkLoader';

const MAX_RESULTS = 12;
const FETCH_POOL_SIZE = 50;
const MAX_DISTANCE_KM = 40;
const SERVICE_LISTING_TYPE = 'servico';

// Haversine distance between two {lat,lng} points, in kilometers.
const distanceKm = (a, b) => {
  if (!a || !b) return Infinity;
  const toRad = deg => (deg * Math.PI) / 180;
  const R = 6371;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
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
    const images = imageRefs.map(ref => includedMap[`image:${ref.id.uuid}`]).filter(Boolean);

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

const serviceListingsSlice = createSlice({
  name: 'serviceListings',
  initialState: {
    listingsByListingId: {}, // { [currentListingId]: [listings] }
  },
  reducers: {
    setServiceListings: (state, action) => {
      const { listingId, listings } = action.payload;
      state.listingsByListingId[listingId] = listings;
    },
    clearServiceListings: state => {
      state.listingsByListingId = {};
    },
  },
});

export const { setServiceListings, clearServiceListings } = serviceListingsSlice.actions;

export const selectServiceListings = (state, listingId) =>
  state.serviceListings?.listingsByListingId?.[listingId] || [];

/**
 * Busca anúncios de tipo "servico" perto de um ponto (geolocation do
 * espaço), para mostrar como "Complementos" na ListingPage.
 *
 * Não há filtro server-side por cidade (publicData.location.address não é
 * indexado) — em vez disso pedimos os serviços ordenados por distância a
 * partir da geolocation do espaço (`origin`/`sort: 'origin'`, suportado
 * nativamente pela Marketplace API) e cortamos client-side pelos que ficam
 * dentro de MAX_DISTANCE_KM. Isto aproxima "mesma cidade" sem depender de
 * comparar strings de morada, e sem precisar de outro listing field.
 *
 * @param {string} currentListingId - uuid do espaço a partir do qual se navega
 * @param {{lat:number,lng:number}} geolocation - geolocation do espaço
 * @param {Object} config - app config (para o tamanho de imagem do cartão)
 */
export const fetchNearbyServiceListings = (currentListingId, geolocation, config) => async (
  dispatch,
  getState,
  sdk
) => {
  if (!currentListingId || !geolocation) return;

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config?.layout?.listingImage || {};
  const aspectRatio = aspectHeight / aspectWidth;

  const params = {
    perPage: FETCH_POOL_SIZE,
    pub_listingType: SERVICE_LISTING_TYPE,
    // The API sorts by distance automatically whenever `origin` is present
    // (and rejects an explicit `sort` param in combination with it).
    origin: geolocation,
    include: ['author', 'author.profileImage', 'images'],
    'fields.listing': [
      'title',
      'geolocation',
      'price',
      'state',
      'publicData.listingType',
      'publicData.categoria_de_servico',
      'publicData.location',
      'publicData.unitType',
    ],
    'fields.image': [`variants.${variantPrefix}`, `variants.${variantPrefix}-2x`],
    ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
    ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
  };

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
    const nearby = all
      .filter(l => l?.id?.uuid !== currentListingId)
      .map(l => ({ listing: l, distance: distanceKm(geolocation, l?.attributes?.geolocation) }))
      .filter(({ distance }) => distance <= MAX_DISTANCE_KM)
      .sort((a, b) => a.distance - b.distance)
      .slice(0, MAX_RESULTS)
      .map(({ listing }) => listing);
    dispatch(setServiceListings({ listingId: currentListingId, listings: nearby }));
  } catch (e) {
    // fail silently — a broken "complementos" fetch must never break the listing page
  }
};

export default serviceListingsSlice.reducer;
