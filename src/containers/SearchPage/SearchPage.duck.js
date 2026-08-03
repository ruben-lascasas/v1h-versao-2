import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { createImageVariantConfig } from '../../util/sdkLoader';
import { isErrorUserPendingApproval, isForbiddenError, storableError } from '../../util/errors';
import { convertUnitToSubUnit, unitDivisor } from '../../util/currency';
import {
  parseDateFromISO8601,
  getExclusiveEndDate,
  addTime,
  subtractTime,
  daysBetween,
  getStartOf,
} from '../../util/dates';
import { constructQueryParamName, isOriginInUse } from '../../util/search';
import { hasPermissionToViewData, isUserAuthorized } from '../../util/userHelpers';
import { parse } from '../../util/urlHelpers';

import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { setListingRating } from '../../ducks/ratings.duck';

// Pagination page size might need to be dynamic on responsive page layouts
// Current design has max 3 columns 12 is divisible by 2 and 3
// So, there's enough cards to fill all columns on full pagination pages
const RESULT_PAGE_SIZE = 24;

// ================ Helper Functions ================ //

// Module-level throttle for Sharetribe API calls. The V1H plan rate-limits
// aggressively — image variants, listing queries, transitions all share the
// same budget — so we cap concurrent requests at 4 and queue the rest.
const MAX_CONCURRENT = 4;
let activeCount = 0;
const queue = [];
const drain = () => {
  while (activeCount < MAX_CONCURRENT && queue.length > 0) {
    const { fn, resolve, reject } = queue.shift();
    activeCount += 1;
    Promise.resolve()
      .then(fn)
      .then(
        result => {
          activeCount -= 1;
          drain();
          resolve(result);
        },
        err => {
          activeCount -= 1;
          drain();
          reject(err);
        }
      );
  }
};
const runThrottled = fn =>
  new Promise((resolve, reject) => {
    queue.push({ fn, resolve, reject });
    drain();
  });

// In-flight dedup for the main listings query. Two rapid dispatches with
// the same params (common during fast nav, strict-mode double effects, or
// when the URL is set twice in a row) share the same promise instead of
// firing two parallel /listings/query?perPage=24 requests. Different
// params → still triggers a fresh search, so filters / pagination / sort
// continue to work normally.
const _inFlightSearches = new Map(); // fingerprint → Promise
const fingerprintSearchParams = (searchParams = {}) => {
  // Stable key: sort the keys so { a, b } and { b, a } hash the same.
  const sorted = Object.keys(searchParams)
    .sort()
    .reduce((acc, k) => {
      acc[k] = searchParams[k];
      return acc;
    }, {});
  try {
    return JSON.stringify(sorted);
  } catch (_) {
    // searchParams should always be string-keyed primitives; this is just
    // a defensive fallback so dedup never crashes the actual query.
    return null;
  }
};

const resultIds = data => {
  const listings = data.data;
  return listings
    .filter(l => !l.attributes.deleted && l.attributes.state === 'published')
    .map(l => l.id);
};

// ================ Async Thunks ================ //

/////////////////////
// Search Listings //
/////////////////////
const searchListingsPayloadCreator = ({ searchParams, config }, thunkAPI) => {
  const { dispatch, rejectWithValue, extra: sdk } = thunkAPI;

  // In-flight dedup: if there's already a parallel call with these exact
  // searchParams, return that promise instead of firing a second identical
  // request. Cleared as soon as the original resolves/rejects so the next
  // navigation with the same params still runs fresh.
  const fingerprint = fingerprintSearchParams(searchParams);
  if (fingerprint && _inFlightSearches.has(fingerprint)) {
    return _inFlightSearches.get(fingerprint);
  }
  // SearchPage can enforce listing query to only those listings with valid listingType
  // NOTE: this only works if you have set 'enum' type search schema to listing's public data fields
  //       - listingType
  //       Same setup could be expanded to 2 other extended data fields:
  //       - transactionProcessAlias
  //       - unitType
  //       ...and then turned enforceValidListingType config to true in configListing.js
  // Read More:
  // https://www.sharetribe.com/docs/how-to/manage-search-schemas-with-flex-cli/#adding-listing-search-schemas
  const searchValidListingTypes = (listingTypes, listingTypePathParam, isListingTypeVariant) => {
    return isListingTypeVariant
      ? {
          pub_listingType: listingTypePathParam,
        }
      : config.listing.enforceValidListingType
      ? {
          pub_listingType: listingTypes.map(l => l.listingType),
          // pub_transactionProcessAlias: listingTypes.map(l => l.transactionType.alias),
          // pub_unitType: listingTypes.map(l => l.transactionType.unitType),
        }
      : {};
  };

  // General region/keyword search (no listing-type-specific route, no
  // explicit pub_listingType filter picked by the customer) should show
  // rentable spaces by default — not complementary "servico" listings mixed
  // in. The ListingTypeFilter sidebar filter lets the customer explicitly
  // switch to Serviços, which sets pub_listingType=servico and is respected
  // here (we never override an explicit choice).
  const defaultToSpaceListingsOnly = (
    listingTypes,
    explicitPubListingType,
    isListingTypeVariant
  ) => {
    const hasExplicitListingType = explicitPubListingType != null && explicitPubListingType !== '';
    if (isListingTypeVariant || hasExplicitListingType) return {};
    const spaceListingTypes = listingTypes
      .map(l => l.listingType)
      .filter(listingType => listingType !== 'servico');
    return spaceListingTypes.length > 0 ? { pub_listingType: spaceListingTypes } : {};
  };

  const constructCategoryPropertiesForAPI = (queryParamPrefix, categories, level, params) => {
    const levelKey = `${queryParamPrefix}${level}`;
    const rawValue =
      typeof params?.[levelKey] !== 'undefined' ? `${params?.[levelKey]}` : undefined;
    if (rawValue == null || rawValue === '') return {};

    // Multi-value: drop ids that aren't in the configured tree.
    const values = rawValue.split(',').map(v => v.trim()).filter(Boolean);
    const validValues = values.filter(v => categories.some(cat => cat.id === v));
    if (validValues.length === 0) return {};

    // Pool subcategories from all selected categories at this level so level 2
    // ids are validated against the union of subtrees.
    const allSubcategories = validValues.flatMap(
      v => categories.find(cat => cat.id === v)?.subcategories || []
    );

    return {
      [levelKey]: validValues.join(','),
      ...constructCategoryPropertiesForAPI(queryParamPrefix, allSubcategories, level + 1, params),
    };
  };

  /**
   * Category filter params are prepared here. We omit invalid category names.
   * I.e. params that are not part of the currently configured category tree.
   *
   * @param {string} paramName - The name of the parameter to prepare.
   * @param {Object} params - The search params object.
   * @returns {Object} The prepared parameter object.
   */
  const prepareCategoryParams = (paramName, params) => {
    const categoryConfig = config.search.defaultFilters?.find(f => f.schemaType === 'category');
    const categories = config.categoryConfiguration.categories;
    const { key, scope } = categoryConfig || {};
    const categoryParamPrefix = constructQueryParamName(key, scope);
    return paramName.startsWith(categoryParamPrefix)
      ? constructCategoryPropertiesForAPI(categoryParamPrefix, categories, 1, params)
      : {};
  };

  const constructIntegerRangePropertyForAPI = (queryParamPrefix, params) => {
    const integerValue = params?.[queryParamPrefix];
    const [min, max] = integerValue ? integerValue.split(',') : [];
    // NOTE: long filter needs exclusive max value on API side
    const inclusiveMin = Number.parseInt(min, 10);
    const exclusiveMax = Number.parseInt(max, 10) + 1;

    // NOTE: currently we don't validate the range values against the integer range config,
    // but we might want to do that in the future.

    return Number.isInteger(inclusiveMin) && Number.isInteger(exclusiveMax)
      ? { [queryParamPrefix]: [inclusiveMin, exclusiveMax].join(',') }
      : {};
  };

  /**
   * Integer range filter values are converted to API params of type 'long'.
   *
   * The range end must be exclusive. E.g. 1000,2000 -> 1000,2001
   *
   * NOTE: currently we don't validate the range values against the integer range config,
   * but we might want to do that in the future.
   *
   * @param {string} paramName - The name of the parameter to prepare.
   * @param {Object} params - The search params object.
   * @returns {Object} The prepared parameter object.
   */
  const prepareIntegerRangeParam = (paramName, params) => {
    const integerRangeConfig = config.listing.listingFields?.find(f => f.schemaType === 'long');
    const { key, scope } = integerRangeConfig || {};
    const integerParamPrefix = constructQueryParamName(key, scope);
    return paramName.startsWith(integerParamPrefix)
      ? constructIntegerRangePropertyForAPI(integerParamPrefix, params)
      : {};
  };

  // This function goes through given params and if there's a specific handler for the parameter type,
  // it calls the handler to prepare the property for API.
  // Otherwise, it just passes the param through.
  const prepareAPIParams = (params, paramHandlers) => {
    const pickedKeys = Object.entries(params).reduce((picked, [k, v]) => {
      const preparedParams = paramHandlers.reduce((picked, fn) => {
        return { ...picked, ...fn(k, params) };
      }, {});

      // If the param is not handled by any of the handlers, we pass it through.
      const currentParam = Object.keys(preparedParams).length > 0 ? preparedParams : { [k]: v };

      return { ...picked, ...currentParam };
    }, {});

    return pickedKeys;
  };

  const priceSearchParams = priceParam => {
    const inSubunits = value => convertUnitToSubUnit(value, unitDivisor(config.currency));
    const values = priceParam ? priceParam.split(',') : [];
    return priceParam && values.length === 2
      ? {
          price: [inSubunits(values[0]), inSubunits(values[1]) + 1].join(','),
        }
      : {};
  };

  const datesSearchParams = datesParam => {
    const searchTZ = 'Etc/UTC';
    const datesFilter = config.search.defaultFilters.find(f => f.key === 'dates');
    const values = datesParam ? datesParam.split(',') : [];
    const hasValues = datesFilter && datesParam && values.length === 2;
    const { dateRangeMode, availability } = datesFilter || {};
    const isNightlyMode = dateRangeMode === 'night';
    const isEntireRangeAvailable = availability === 'time-full';

    // SearchPage need to use a single time zone but listings can have different time zones
    // We need to expand/prolong the time window (start & end) to cover other time zones too.
    //
    // NOTE: you might want to consider changing UI so that
    //   1) location is always asked first before date range
    //   2) use some 3rd party service to convert location to time zone (IANA tz name)
    //   3) Make exact dates filtering against that specific time zone
    //   This setup would be better for dates filter,
    //   but it enforces a UX where location is always asked first and therefore configurability
    const getProlongedStart = date => subtractTime(date, 14, 'hours', searchTZ);
    const getProlongedEnd = date => addTime(date, 12, 'hours', searchTZ);

    const startDate = hasValues ? parseDateFromISO8601(values[0], searchTZ) : null;
    const endRaw = hasValues ? parseDateFromISO8601(values[1], searchTZ) : null;
    const endDate =
      hasValues && isNightlyMode
        ? endRaw
        : hasValues
        ? getExclusiveEndDate(endRaw, searchTZ)
        : null;

    const today = getStartOf(new Date(), 'day', searchTZ);
    const possibleStartDate = subtractTime(today, 14, 'hours', searchTZ);
    const hasValidDates =
      hasValues &&
      startDate.getTime() >= possibleStartDate.getTime() &&
      startDate.getTime() <= endDate.getTime();

    const dayCount = isEntireRangeAvailable ? daysBetween(startDate, endDate) : 1;
    const day = 1440;
    const hour = 60;
    // V1H mixes hour-priced and day-priced listings. Using a strict
    // `dayCount*day-hour` minDuration would silently exclude hourly venues that
    // only open part of a day (e.g. a coworking 9-18 = 9h slot < 23h required).
    // We default to 1 hour minimum so any listing with at least some availability
    // in the selected window shows up — works for both unit types.
    // The unit-type-specific filter (hour vs day) is handled separately in the UI.
    const minDuration = hour;
    return hasValidDates
      ? {
          start: getProlongedStart(startDate),
          end: getProlongedEnd(endDate),
          // Availability can be time-full or time-partial.
          // However, due to prolonged time window, we need to use time-partial.
          availability: 'time-partial',
          // minDuration uses minutes
          minDuration,
        }
      : {};
  };

  const stockFilters = datesMaybe => {
    const hasDatesFilterInUse = Object.keys(datesMaybe).length > 0;

    // If dates filter is not in use,
    //   1) Add minStock filter with default value (1)
    //   2) Add relaxed stockMode: "match-undefined"
    // The latter is used to filter out all the listings that explicitly are out of stock,
    // but keeps bookable and inquiry listings.
    return hasDatesFilterInUse ? {} : { minStock: 1, stockMode: 'match-undefined' };
  };

  const seatsSearchParams = (seats, datesMaybe) => {
    const seatsFilter = config.search.defaultFilters.find(f => f.key === 'seats');
    const hasDatesFilterInUse = Object.keys(datesMaybe).length > 0;

    // Seats filter cannot be applied without dates
    return hasDatesFilterInUse && seatsFilter ? { seats } : {};
  };

  const {
    perPage,
    page,
    price,
    dates,
    seats,
    sort,
    mapSearch,
    rseed,
    unitType,
    listingTypePathParam,
    isListingTypeVariant,
    ...restOfParams
  } = searchParams;

  const requestedPage = Math.max(1, parseInt(page, 10) || 1);

  // The params related to default filters are prepared one-by-one
  // We could consider moving them to the prepareAPIParams function too.
  // pub_averageRating is indexed in Sharetribe (Listing field) — filtered server-side.
  // We only strip it from the request body when ratingSort is active (we still
  // need to fetch per-listing review averages to sort by precise float values).
  const filteredRestOfParams = restOfParams;
  const minRating = null;

  const priceMaybe = priceSearchParams(price);
  const datesMaybe = datesSearchParams(dates);
  const stockMaybe = stockFilters(datesMaybe);
  const seatsMaybe = seatsSearchParams(seats, datesMaybe);
  const ratingSort = sort === 'bestRating' || sort === 'worstRating';
  const randomSort = sort === 'random';
  const nearestSort = sort === 'nearest';
  const capacitySort = sort === 'mostCapacity' || sort === 'leastCapacity';

  const apiSort = capacitySort
    ? sort === 'mostCapacity'
      ? 'pub_numero_pessoas'
      : '-pub_numero_pessoas'
    : sort;

  const sortMaybe =
    sort === config.search.sortConfig.relevanceKey ||
    ratingSort ||
    randomSort ||
    nearestSort
      ? {}
      : { sort: apiSort };

  // Detect "cross-branch" category selection: pendingL1 has top-levels and
  // pendingL2 has subs from OTHER top-levels (per CategoryMultiFilter's
  // per-branch UI). Sharetribe API only supports AND across params, so we
  // can't get the union of (L1 unrestricted) ∪ (specific subs of other L1)
  // in a single query — we split into two and merge.
  const rawL1 = filteredRestOfParams.pub_categoryLevel1;
  const rawL2 = filteredRestOfParams.pub_categoryLevel2;
  const isCrossBranchCase = (() => {
    if (!rawL2) return false;
    if (!rawL1) return true; // Only subs picked → query L2 alone (no L1 restriction).
    const categories = config.categoryConfiguration?.categories || [];
    const l1Ids = String(rawL1).split(',').map(s => s.trim()).filter(Boolean);
    const l2Ids = String(rawL2).split(',').map(s => s.trim()).filter(Boolean);
    const findParent = subId =>
      categories.find(c => (c.subcategories || []).some(s => s.id === subId))?.id;
    // If any L2 has a parent NOT in L1 → cross-branch.
    return l2Ids.some(subId => {
      const parent = findParent(subId);
      return parent && !l1Ids.includes(parent);
    });
  })();

  // Params shared between any single-query OR cross-branch query.
  // We strip pub_categoryLevel1/2 here because they are added per-query below.
  const restWithoutCategoryParams = Object.fromEntries(
    Object.entries(filteredRestOfParams).filter(
      ([k]) => k !== 'pub_categoryLevel1' && k !== 'pub_categoryLevel2'
    )
  );
  // Sorts that finalise the order client-side (random shuffle, rating sort by
  // exact float, or cross-branch merge) need the FULL result set in memory
  // before we can paginate, otherwise page 2 would shuffle/sort a partial
  // slice. We fetch up to MAX_FULL_FETCH_PAGES of FULL_FETCH_PER_PAGE listings
  // (Sharetribe's max page size), then page client-side from that buffer.
  // unitType is filtered client-side because it isn't indexed in Sharetribe
  // by default. Treat it like the other client-side filters and fetch the
  // full result set so pagination still works after we filter it down.
  const unitTypeValues = (unitType || '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
  const hasUnitTypeFilter = unitTypeValues.length > 0 && unitTypeValues.length < 2;
  // Featured listings always come first across all sorts (Opção C). To do
  // that reliably we need the full multi-page result set client-side —
  // otherwise page 1 would only surface the destaques that happen to fall
  // on the API's own first page. Forcing full-fetch is acceptable for
  // V1H's catalog size (tens of listings → 1-2 SDK requests max, capped
  // by MAX_FULL_FETCH_PAGES = 5 × 100 = 500 listings).
  const needsFullResultSet = true;
  // Retained for traceability — these still gate behaviours that depend on
  // having all results loaded (rating sort needs to fetch per-listing
  // reviews; cross-branch needs to merge two queries; etc).
  // eslint-disable-next-line no-unused-vars
  const _legacyFullSetTriggers = { randomSort, ratingSort, isCrossBranchCase, hasUnitTypeFilter };
  const FULL_FETCH_PER_PAGE = 100;
  const MAX_FULL_FETCH_PAGES = 5;
  const effectivePerPage = needsFullResultSet ? FULL_FETCH_PER_PAGE : perPage;
  // We control pagination ourselves when needsFullResultSet — drop any
  // incoming `page=N` so we always start from page 1 in the fetch loop.
  const restWithoutCategoryParamsAndPage = needsFullResultSet
    ? Object.fromEntries(
        Object.entries(restWithoutCategoryParams).filter(([k]) => k !== 'page')
      )
    : restWithoutCategoryParams;

  const sharedParams = {
    ...prepareAPIParams(restWithoutCategoryParamsAndPage, [prepareIntegerRangeParam]),
    ...searchValidListingTypes(
      config.listing.listingTypes,
      listingTypePathParam,
      isListingTypeVariant
    ),
    ...defaultToSpaceListingsOnly(
      config.listing.listingTypes,
      restOfParams.pub_listingType,
      isListingTypeVariant
    ),
    ...priceMaybe,
    ...datesMaybe,
    ...stockMaybe,
    ...seatsMaybe,
    ...sortMaybe,
    perPage: effectivePerPage,
    // For server-side sorts we paginate via the API directly. For client-side
    // sorts (random/rating/cross-branch) fetchAllPagesWithRetry overrides
    // page to walk every page itself, so this value is ignored there.
    ...(needsFullResultSet ? {} : { page: requestedPage }),
  };

  // Single-query category params (legacy: validates L2 against L1 subtree).
  const singleQueryCategoryParams = isCrossBranchCase
    ? {}
    : prepareAPIParams(
        Object.fromEntries(
          Object.entries(filteredRestOfParams).filter(
            ([k]) => k === 'pub_categoryLevel1' || k === 'pub_categoryLevel2'
          )
        ),
        [prepareCategoryParams]
      );

  const params = {
    ...sharedParams,
    ...singleQueryCategoryParams,
  };

  // Retry on 429 (Sharetribe rate limit) with exponential backoff:
  // 1.5s, 3s, 6s, 12s, 24s = up to ~46s of total retry time.
  // Throttled via runThrottled so we never fire more than 4 in parallel.
  const queryWithRetry = (queryParams, attempt = 0) =>
    runThrottled(() => sdk.listings.query(queryParams)).catch(err => {
      const isRateLimited = err && err.status === 429;
      if (isRateLimited && attempt < 5) {
        const delay = 1500 * Math.pow(2, attempt);
        return new Promise(resolve => setTimeout(resolve, delay)).then(() =>
          queryWithRetry(queryParams, attempt + 1)
        );
      }
      throw err;
    });

  // Fetch all pages of a query (up to MAX_FULL_FETCH_PAGES) and merge into
  // one synthetic response. Used for client-side sort/merge cases so we
  // operate over the full result set, then page locally.
  // Sequential (not Promise.all) — V1H's Sharetribe plan trips 429 easily
  // when the main search runs alongside category counts + transitions.
  const fetchAllPagesWithRetry = async queryParams => {
    const first = await queryWithRetry({ ...queryParams, page: 1 });
    const apiTotalPages = first?.data?.meta?.totalPages || 1;
    const pagesToFetch = Math.min(apiTotalPages, MAX_FULL_FETCH_PAGES);
    if (pagesToFetch <= 1) return first;

    const restPages = [];
    for (let i = 2; i <= pagesToFetch; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const resp = await queryWithRetry({ ...queryParams, page: i });
      restPages.push(resp);
    }

    const seenIds = new Set();
    const mergedData = [];
    [first, ...restPages].forEach(resp => {
      (resp.data?.data || []).forEach(l => {
        const uuid = l?.id?.uuid;
        if (uuid && !seenIds.has(uuid)) {
          seenIds.add(uuid);
          mergedData.push(l);
        }
      });
    });
    const includedSeen = new Set();
    const mergedIncluded = [];
    [first, ...restPages].forEach(resp => {
      (resp.data?.included || []).forEach(i => {
        const key = `${i.type}:${i.id?.uuid}`;
        if (!includedSeen.has(key)) {
          includedSeen.add(key);
          mergedIncluded.push(i);
        }
      });
    });
    return {
      ...first,
      data: {
        data: mergedData,
        included: mergedIncluded,
        meta: {
          ...(first.data?.meta || {}),
          totalItems: mergedData.length,
          totalPages: 1,
          page: 1,
          perPage: mergedData.length || FULL_FETCH_PER_PAGE,
        },
      },
    };
  };

  // Cross-branch: 2 queries, merge results, dedupe by listing id.
  const mergeResponses = (respA, respB) => {
    const seenIds = new Set();
    const mergedData = [];
    [...(respA.data?.data || []), ...(respB.data?.data || [])].forEach(l => {
      const uuid = l?.id?.uuid;
      if (uuid && !seenIds.has(uuid)) {
        seenIds.add(uuid);
        mergedData.push(l);
      }
    });
    const includedSeen = new Set();
    const mergedIncluded = [];
    [...(respA.data?.included || []), ...(respB.data?.included || [])].forEach(i => {
      const key = `${i.type}:${i.id?.uuid}`;
      if (key && !includedSeen.has(key)) {
        includedSeen.add(key);
        mergedIncluded.push(i);
      }
    });
    return {
      ...respA,
      data: {
        data: mergedData,
        included: mergedIncluded,
        meta: {
          ...(respA.data?.meta || {}),
          totalItems: mergedData.length,
          totalPages: 1,
          page: 1,
          perPage: mergedData.length || perPage,
        },
      },
    };
  };

  const runQuery = () => {
    if (!isCrossBranchCase) {
      return needsFullResultSet
        ? fetchAllPagesWithRetry(params)
        : queryWithRetry(params);
    }
    // Cross-branch: at least one of rawL1 / rawL2 is present (L2 always
    // present when isCrossBranchCase is true; L1 may or may not be).
    // Cross-branch always implies needsFullResultSet, so fetch all pages.
    if (rawL1 && rawL2) {
      const paramsA = { ...sharedParams, pub_categoryLevel1: rawL1 };
      const paramsB = { ...sharedParams, pub_categoryLevel2: rawL2 };
      // Sequential to avoid hammering the API and tripping 429.
      return fetchAllPagesWithRetry(paramsA).then(respA =>
        fetchAllPagesWithRetry(paramsB).then(respB => mergeResponses(respA, respB))
      );
    }
    // Only L2 → single query with just the L2 filter.
    return fetchAllPagesWithRetry({ ...sharedParams, pub_categoryLevel2: rawL2 });
  };

  const searchPromise = runQuery()
    .then(async response => {
      const listingFields = config?.listing?.listingFields;
      const sanitizeConfig = { listingFields };
      dispatch(addMarketplaceEntities(response, sanitizeConfig));

      let processedData = response.data?.data || [];

      // unitType filter — keep only listings whose publicData.unitType matches
      // one of the selected values. Both/neither selected = no filter.
      if (hasUnitTypeFilter) {
        processedData = processedData.filter(l =>
          unitTypeValues.includes(l?.attributes?.publicData?.unitType)
        );
      }

      // Sort by rating (best/worst) requires fetching per-listing review averages
      // because the indexed `averageRating` is a floor integer — too coarse for sort.
      if (ratingSort) {
        const allListings = processedData.filter(
          l => !l.attributes.deleted && l.attributes.state === 'published'
        );

        const ratingMap = {};
        await Promise.all(
          allListings.map(async listing => {
            const listingId = listing.id.uuid;
            try {
              const reviewsResponse = await sdk.reviews.query({
                listing_id: listingId,
                state: 'public',
              });
              const reviews = reviewsResponse?.data?.data || [];
              dispatch(
                setListingRating({
                  listingId,
                  reviews: reviews.map(r => ({ attributes: r.attributes })),
                })
              );
              const ratings = reviews.map(r => r?.attributes?.rating).filter(r => r != null);
              ratingMap[listingId] =
                ratings.length > 0 ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
            } catch (_) {
              dispatch(setListingRating({ listingId, reviews: [] }));
              ratingMap[listingId] = null;
            }
          })
        );

        processedData = [...processedData].sort((a, b) => {
          const avgA = ratingMap[a.id?.uuid] ?? -1;
          const avgB = ratingMap[b.id?.uuid] ?? -1;
          return sort === 'bestRating' ? avgB - avgA : avgA - avgB;
        });
      }

      // Random sort — shuffle the full (multi-page) result set with a seeded
      // PRNG so the order is STABLE across page navigations. The seed lives
      // in the URL (`rseed`); a new seed is generated only when the user
      // re-selects "Aleatório" in the sort dropdown.
      if (randomSort) {
        // Mulberry32: tiny, fast, decent-quality seedable PRNG.
        const seedStr = rseed || 'default';
        let seedNum = 0;
        for (let i = 0; i < seedStr.length; i += 1) {
          seedNum = (seedNum * 31 + seedStr.charCodeAt(i)) | 0;
        }
        let s = seedNum >>> 0;
        const rand = () => {
          s = (s + 0x6d2b79f5) >>> 0;
          let t = s;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const items = [...processedData];
        for (let i = items.length - 1; i > 0; i -= 1) {
          const j = Math.floor(rand() * (i + 1));
          [items[i], items[j]] = [items[j], items[i]];
        }
        processedData = items;
      }

      // Featured-first re-ordering: pull every destaque to the top of the
      // result set, preserving the internal order each group already has
      // from the user's chosen sort. Same UX as OLX/Idealista — destaques
      // are anchored to the front but still respect "Preço mais baixo",
      // "Aleatório", etc within their own group.
      {
        const featured = [];
        const others = [];
        processedData.forEach(l => {
          if (l?.attributes?.publicData?.featured === 'true') featured.push(l);
          else others.push(l);
        });
        processedData = [...featured, ...others];
      }

      // For client-side pagination cases, slice the processed result set to
      // the requested page and report accurate pagination meta. We strip
      // paginationUnsupported / paginationLimit because Sharetribe sets these
      // when sort isn't server-side (which is exactly our case here) — leaking
      // them through would force PaginationLinks to clamp to a single page.
      if (needsFullResultSet) {
        const totalItems = processedData.length;
        const totalPages = Math.max(1, Math.ceil(totalItems / perPage));
        const safePage = Math.min(requestedPage, totalPages);
        const startIdx = (safePage - 1) * perPage;
        const pagedData = processedData.slice(startIdx, startIdx + perPage);
        const {
          paginationUnsupported: _pu,
          paginationLimit: _pl,
          ...restMeta
        } = response.data?.meta || {};
        return {
          ...response,
          data: {
            ...response.data,
            data: pagedData,
            meta: {
              ...restMeta,
              totalItems,
              totalPages,
              page: safePage,
              perPage,
              paginationUnsupported: false,
            },
          },
        };
      }

      return response;
    })
    .catch(e => {
      const error = storableError(e);
      if (!(isErrorUserPendingApproval(error) || isForbiddenError(error))) {
        return rejectWithValue(error);
      }
      return rejectWithValue(error);
    });

  // Register the in-flight promise so an exact-duplicate dispatch (same
  // searchParams) within this window short-circuits to the same promise
  // instead of firing a second /listings/query. Cleared in .finally so
  // future dispatches with the same params still trigger a fresh fetch.
  if (fingerprint) {
    _inFlightSearches.set(fingerprint, searchPromise);
    searchPromise.finally(() => {
      // Only clear if THIS promise is still the registered one (a later
      // dispatch with the same fingerprint may have already replaced it).
      if (_inFlightSearches.get(fingerprint) === searchPromise) {
        _inFlightSearches.delete(fingerprint);
      }
    });
  }
  return searchPromise;
};

export const searchListings = createAsyncThunk(
  'SearchPage/searchListings',
  searchListingsPayloadCreator
);

// ================ Category Counts ================ //

// Shared count-query helper: retries silently on 429 with exponential backoff.
// Goes through runThrottled so it shares the global concurrency budget.
const queryCountFor = (sdk, params, attempt = 0) =>
  runThrottled(() =>
    sdk.listings.query({ ...params, perPage: 1, minStock: 1, stockMode: 'match-undefined' })
  )
    .then(res => res?.data?.meta?.totalItems ?? 0)
    .catch(err => {
      if (err?.status === 429 && attempt < 5) {
        const delay = 1500 * Math.pow(2, attempt);
        return new Promise(r => setTimeout(r, delay)).then(() =>
          queryCountFor(sdk, params, attempt + 1)
        );
      }
      return 0;
    });

// Top-level category counts. The V1H Sharetribe plan trips 429 if we fire 9
// counts on every page navigation, so we:
//   1. Cache results in localStorage (categories are public data, not user-
//      specific — sessionStorage was being nuked on logout which forced a
//      full refetch of every category right after auth).
//   2. Cache TTL of 1h — category counts change rarely enough that a stale
//      number isn't a big deal, and reading from localStorage is free.
//   3. Run the queries SEQUENTIALLY (not parallel) on a fresh load.
//   4. Dedupe in-flight thunk dispatches so navigating between Search-like
//      pages quickly doesn't kick off 3 parallel "loop through every
//      category" runs (which is what was triggering desporto-actividadefisica
//      to fire 3× back-to-back in the user's logs).
const CATEGORY_COUNTS_CACHE_KEY = 'v1h_category_counts_v2';
const CATEGORY_COUNTS_TTL_MS = 60 * 60 * 1000; // 1 hour
let _inFlightCategoryCounts = null; // shared promise — dedupes parallel dispatches

const readCountsCache = () => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(CATEGORY_COUNTS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (Date.now() - (parsed.ts || 0) > CATEGORY_COUNTS_TTL_MS) return null;
    return parsed.data || null;
  } catch (_) {
    return null;
  }
};

const writeCountsCache = counts => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      CATEGORY_COUNTS_CACHE_KEY,
      JSON.stringify({ ts: Date.now(), data: counts })
    );
  } catch (_) {
    /* quota exceeded — non-fatal */
  }
};

const fetchCategoryCountsPayloadCreator = async ({ categories, config }, thunkAPI) => {
  const { extra: sdk } = thunkAPI;
  const categoryConfig = config.search.defaultFilters?.find(f => f.schemaType === 'category');
  if (!categoryConfig) return {};
  const { key, scope } = categoryConfig;
  const paramName = constructQueryParamName(key, scope) + '1';

  const cached = readCountsCache();
  if (cached) {
    // Confirm cache covers the current category set; if a new category was
    // added since the cache was written, fall through to refetch missing ids.
    const cachedIds = Object.keys(cached);
    const allCovered = categories.every(c => cachedIds.includes(c.id));
    if (allCovered) return cached;
  }

  // In-flight dedup: if another dispatch already kicked off the full loop,
  // return the same promise instead of re-running the sequential queries.
  // Without this, 3 navigations within ~5 seconds caused 3× the queries
  // (visible in the user's network log as desporto-actividadefisica firing
  // 3 times back-to-back).
  if (_inFlightCategoryCounts) return _inFlightCategoryCounts;

  const run = (async () => {
    try {
      const results = { ...(cached || {}) };
      for (const cat of categories) {
        if (results[cat.id] != null) continue;
        // eslint-disable-next-line no-await-in-loop
        const count = await queryCountFor(sdk, { [paramName]: cat.id });
        results[cat.id] = count;
      }
      writeCountsCache(results);
      return results;
    } finally {
      _inFlightCategoryCounts = null;
    }
  })();
  _inFlightCategoryCounts = run;
  return run;
};

// Lazy fetch: subcategory counts for a single parent. Triggered when the user
// expands a top-level category, never upfront. Skips ids that are already cached.
const fetchSubcategoryCountsPayloadCreator = async (
  { subcategories, alreadyCachedIds = [], config },
  thunkAPI
) => {
  const { extra: sdk } = thunkAPI;
  const categoryConfig = config.search.defaultFilters?.find(f => f.schemaType === 'category');
  if (!categoryConfig || !Array.isArray(subcategories) || subcategories.length === 0) {
    return {};
  }
  const { key, scope } = categoryConfig;
  const paramName = constructQueryParamName(key, scope) + '2';

  const targets = subcategories.filter(sub => !alreadyCachedIds.includes(sub.id));
  if (targets.length === 0) return {};

  // Batches of 3 to stay well under rate limits — one parent expansion is small.
  const BATCH = 3;
  const results = {};
  for (let i = 0; i < targets.length; i += BATCH) {
    const slice = targets.slice(i, i + BATCH);
    const counts = await Promise.all(
      slice.map(sub =>
        queryCountFor(sdk, { [paramName]: sub.id }).then(count => ({ id: sub.id, count }))
      )
    );
    counts.forEach(({ id, count }) => {
      results[id] = count;
    });
  }
  return results;
};

export const fetchCategoryCounts = createAsyncThunk(
  'SearchPage/fetchCategoryCounts',
  fetchCategoryCountsPayloadCreator
);

export const fetchSubcategoryCounts = createAsyncThunk(
  'SearchPage/fetchSubcategoryCounts',
  fetchSubcategoryCountsPayloadCreator
);

// ================ Slice ================ //

const searchPageSlice = createSlice({
  name: 'SearchPage',
  initialState: {
    pagination: null,
    searchParams: null,
    searchInProgress: false,
    searchListingsError: null,
    currentPageResultIds: [],
    activeListingId: null,
    categoryCounts: {},
  },
  reducers: {
    setActiveListing: (state, action) => {
      state.activeListingId = action.payload;
    },
  },
  extraReducers: builder => {
    // Search Listings
    builder
      .addCase(searchListings.pending, (state, action) => {
        state.searchParams = action.meta.arg.searchParams;
        state.searchInProgress = true;
        state.searchListingsError = null;
      })
      .addCase(searchListings.fulfilled, (state, action) => {
        state.currentPageResultIds = resultIds(action.payload.data);
        state.pagination = action.payload.data.meta;
        state.searchInProgress = false;
      })
      .addCase(searchListings.rejected, (state, action) => {
        // eslint-disable-next-line no-console
        console.error(action.payload);
        state.searchInProgress = false;
        state.searchListingsError = action.payload;
      })
      .addCase(fetchCategoryCounts.fulfilled, (state, action) => {
        state.categoryCounts = { ...state.categoryCounts, ...action.payload };
      })
      .addCase(fetchSubcategoryCounts.fulfilled, (state, action) => {
        state.categoryCounts = { ...state.categoryCounts, ...action.payload };
      });
  },
});

// Export the action creator
export const { setActiveListing } = searchPageSlice.actions;

export default searchPageSlice.reducer;

// ================ Load data ================ //

export const loadData = (params, search, config) => (dispatch, getState, sdk) => {
  // In private marketplace mode, this page won't fetch data if the user is unauthorized
  const { listingType: listingTypePathParam } = params || {};
  const state = getState();
  const currentUser = state.user?.currentUser;
  const isAuthorized = currentUser && isUserAuthorized(currentUser);
  const hasViewingRights = currentUser && hasPermissionToViewData(currentUser);
  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const canFetchData =
    !isPrivateMarketplace || (isPrivateMarketplace && isAuthorized && hasViewingRights);
  if (!canFetchData) {
    return Promise.resolve();
  }

  const queryParams = parse(search, {
    latlng: ['origin'],
    latlngBounds: ['bounds'],
  });

  const { page = 1, address, origin, ...rest } = queryParams;
  // Normally origin is only forwarded when `sortSearchByDistance` is on, but
  // the "Mais próximos de mim" sort needs the origin even when that config
  // is off — the API can only sort by distance if it has an origin to measure
  // against.
  const isNearestSort = rest.sort === 'nearest';
  const originMaybe = (isOriginInUse(config) || isNearestSort) && origin ? { origin } : {};

  const listingTypeVariantMaybe = listingTypePathParam
    ? { listingTypePathParam, isListingTypeVariant: true }
    : {};

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const aspectRatio = aspectHeight / aspectWidth;

  const searchListingsCall = searchListings({
    searchParams: {
      ...rest,
      ...originMaybe,
      ...listingTypeVariantMaybe,
      page,
      perPage: RESULT_PAGE_SIZE,
      include: ['author', 'images'],
      'fields.listing': [
        'title',
        'geolocation',
        'price',
        'deleted',
        'state',
        'publicData.listingType',
        'publicData.transactionProcessAlias',
        'publicData.unitType',
        'publicData.cardStyle',
        // These help rendering of 'purchase' listings,
        // when transitioning from search page to listing page
        'publicData.pickupEnabled',
        'publicData.shippingEnabled',
        'publicData.priceVariationsEnabled',
        'publicData.priceVariants',
        'publicData.location',
        'publicData.favoritesCount',
        // Needed by ListingCard to render the "Em destaque" badge with
        // priority over Popular / Novo.
        'publicData.featured',
      ],
      'fields.user': ['profile.displayName', 'profile.abbreviatedName'],
      'fields.image': [
        'variants.scaled-small',
        'variants.scaled-medium',
        `variants.${variantPrefix}`,
        `variants.${variantPrefix}-2x`,
        `variants.${variantPrefix}-4x`,
      ],
      ...createImageVariantConfig(`${variantPrefix}`, 400, aspectRatio),
      ...createImageVariantConfig(`${variantPrefix}-2x`, 800, aspectRatio),
      ...createImageVariantConfig(`${variantPrefix}-4x`, 1600, aspectRatio),
      'limit.images': 1,
    },
    config,
  });

  const categories = config.categoryConfiguration?.categories;
  if (categories?.length > 0) {
    dispatch(fetchCategoryCounts({ categories, config }));
  }

  return dispatch(searchListingsCall);
};
