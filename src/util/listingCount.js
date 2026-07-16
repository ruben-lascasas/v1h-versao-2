import { createInstance, types, tokenStore } from 'sharetribe-flex-sdk';
import Decimal from 'decimal.js';

// Singleton public SDK instance (client-side, just clientId — no auth needed
// for `listings.query` count lookups). Used by the topbar autocomplete to
// show the number of matching listings next to recent searches and geocoder
// predictions.
const typeHandlers = [
  {
    type: types.BigDecimal,
    customType: Decimal,
    writer: v => new types.BigDecimal(v.toString()),
    reader: v => new Decimal(v.value),
  },
];

let cachedSdk = null;
const getSdk = () => {
  if (cachedSdk) return cachedSdk;
  const baseUrl = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
  cachedSdk = createInstance({
    clientId: process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID,
    // The SDK needs a token store even for "anonymous" public endpoints —
    // without one, every call returns 401 because the SDK never asks the
    // auth API for a guest token. memoryStore is fine for client-side use.
    tokenStore: tokenStore.memoryStore(),
    typeHandlers,
    ...(baseUrl ? { baseUrl } : {}),
  });
  return cachedSdk;
};

// In-memory cache keyed by canonical params JSON. Cleared on full page reload.
const countCache = new Map();
const inFlight = new Map();

const canonicalKey = params => {
  const sorted = Object.keys(params)
    .sort()
    .reduce((acc, k) => {
      const v = params[k];
      if (v == null || v === '') return acc;
      // Stringify SDK types like LatLngBounds in a stable way.
      acc[k] = typeof v === 'object' && v !== null ? JSON.stringify(v) : v;
      return acc;
    }, {});
  return JSON.stringify(sorted);
};

/**
 * Fetch the number of published listings matching the given params. Cached
 * per-session so repeat lookups (e.g. re-opening the dropdown) are free.
 *
 * Returns a Promise<number>. Returns 0 on errors / rate-limit failures so the
 * UI never breaks.
 */
export const getListingCount = params => {
  const key = canonicalKey(params);
  if (countCache.has(key)) return Promise.resolve(countCache.get(key));
  if (inFlight.has(key)) return inFlight.get(key);

  const sdk = getSdk();
  const promise = sdk.listings
    .query({
      ...params,
      perPage: 1,
      minStock: 1,
      stockMode: 'match-undefined',
    })
    .then(res => {
      const count = res?.data?.meta?.totalItems ?? 0;
      countCache.set(key, count);
      inFlight.delete(key);
      return count;
    })
    .catch(() => {
      inFlight.delete(key);
      // Don't cache zero on errors — let the next try refetch.
      return 0;
    });
  inFlight.set(key, promise);
  return promise;
};
