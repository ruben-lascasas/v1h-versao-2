import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { parse } from '../../util/urlHelpers';
import { getProcess, getSupportedProcessesInfo } from '../../transactions/transaction';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';

const HISTORICO_PAGE_SIZE = 50;

// In-memory cache so navigating away and back doesn't refetch immediately.
// Helps avoid Sharetribe 429 (rate limit) errors on the Basic plan.
let _historicoCache = null;
let _historicoCacheKey = null;
let _historicoCacheTime = 0;
const HISTORICO_CACHE_TTL = 60000; // 60s

// Server-side sorts supported by the Sharetribe API for transactions.
// Other client-facing sort keys (price, booking date, alphabetical) are
// applied in the component after fetch.
const SERVER_SORT_FOR_KEY = {
  recent: '-lastTransitionedAt',
  oldest: 'lastTransitionedAt',
};
const DEFAULT_SERVER_SORT = '-lastTransitionedAt';

// Build the union of all transitions that mark a transaction as "completed"
// across every supported process (booking, purchase, negotiation).
// We use these as `lastTransitions` filter so the API only returns
// transactions whose current state is one of the "completed" states.
const getCompletedTransitions = () => {
  const transitions = [];
  getSupportedProcessesInfo()
    .filter(p => p.name !== 'default-inquiry')
    .forEach(p => {
      try {
        const proc = getProcess(p.name);
        Object.values(proc.transitions || {}).forEach(t => {
          if (proc.isCompleted && proc.isCompleted(t) && !transitions.includes(t)) {
            transitions.push(t);
          }
        });
      } catch (e) {
        // Process not loadable — skip silently.
      }
    });
  return transitions;
};

// ================ Helpers ================ //

const entityRefs = entities =>
  entities.map(entity => ({
    id: entity.id,
    type: entity.type,
  }));

// ================ Slice ================ //

const slice = createSlice({
  name: 'HistoricoReservasPage',
  initialState: {
    fetchInProgress: false,
    fetchError: null,
    pagination: null,
    transactionRefs: [],
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(loadDataThunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchError = null;
      })
      .addCase(loadDataThunk.fulfilled, (state, action) => {
        const transactions = action.payload.data.data;
        state.fetchInProgress = false;
        state.transactionRefs = entityRefs(transactions);
        state.pagination = action.payload.data.meta;
      })
      .addCase(loadDataThunk.rejected, (state, action) => {
        console.error(action.payload || action.error); // eslint-disable-line
        state.fetchInProgress = false;
        state.fetchError = action.payload;
      });
  },
});

export default slice.reducer;

// ================ Load data ================ //

const loadDataPayloadCreator = (
  { search },
  { dispatch, rejectWithValue, extra: sdk }
) => {
  const { page = 1, sort } = parse(search);
  const serverSort = SERVER_SORT_FOR_KEY[sort] || DEFAULT_SERVER_SORT;
  const processNames = getSupportedProcessesInfo()
    .map(p => p.name)
    .filter(name => name !== 'default-inquiry');

  const completedTransitions = getCompletedTransitions();

  const apiQueryParams = {
    processNames,
    // Defensive: only apply the filter if we actually collected transitions;
    // otherwise the API would return zero results for a misconfigured project.
    ...(completedTransitions.length > 0 ? { lastTransitions: completedTransitions } : {}),
    include: [
      'listing',
      'listing.images',
      'provider',
      'provider.profileImage',
      'customer',
      'customer.profileImage',
      'booking',
    ],
    'fields.transaction': [
      'processName',
      'lastTransition',
      'lastTransitionedAt',
      'transitions',
      'payinTotal',
      'payoutTotal',
      'lineItems',
      'protectedData',
    ],
    'fields.listing': [
      'title',
      'availabilityPlan',
      'publicData.listingType',
      'publicData.location',
    ],
    'fields.user': [
      'profile.displayName',
      'profile.abbreviatedName',
      'profile.publicData',
      'deleted',
      'banned',
    ],
    'fields.image': ['variants.square-small', 'variants.square-small2x'],
    'fields.booking': ['displayStart', 'displayEnd', 'start', 'end'],
    page,
    perPage: HISTORICO_PAGE_SIZE,
    sort: serverSort,
  };

  // Serve from cache if we already fetched the same query recently.
  const cacheKey = `${serverSort}|${page}`;
  if (
    _historicoCache &&
    _historicoCacheKey === cacheKey &&
    Date.now() - _historicoCacheTime < HISTORICO_CACHE_TTL
  ) {
    // Re-hydrate marketplaceData from cache so list still renders.
    _historicoCache._cachedResponses?.forEach(resp => dispatch(addMarketplaceEntities(resp)));
    return _historicoCache;
  }

  // Fetch BOTH sides (as customer + as host) sequentially (not in parallel)
  // so we don't fire two heavy queries at once — that's a fast path to a 429.
  return sdk.transactions
    .query({ ...apiQueryParams, only: 'order' })
    .then(ordersResp =>
      sdk.transactions
        .query({ ...apiQueryParams, only: 'sale' })
        .then(salesResp => [ordersResp, salesResp])
    )
    .then(([ordersResp, salesResp]) => {
      dispatch(addMarketplaceEntities(ordersResp));
      dispatch(addMarketplaceEntities(salesResp));

      const allTx = [...ordersResp.data.data, ...salesResp.data.data];
      const seen = new Set();
      const merged = allTx.filter(tx => {
        if (seen.has(tx.id.uuid)) return false;
        seen.add(tx.id.uuid);
        return true;
      });
      merged.sort(
        (a, b) =>
          new Date(b.attributes?.lastTransitionedAt || 0).getTime() -
          new Date(a.attributes?.lastTransitionedAt || 0).getTime()
      );

      const result = {
        data: {
          data: merged,
          meta: {
            totalItems: merged.length,
            totalPages: 1,
            page: 1,
            perPage: merged.length,
          },
        },
        _cachedResponses: [ordersResp, salesResp],
      };

      _historicoCache = result;
      _historicoCacheKey = cacheKey;
      _historicoCacheTime = Date.now();

      return result;
    })
    .catch(e => {
      // On error (especially 429), serve the previous cache if we have one,
      // so the user sees their last-known list instead of an error screen.
      if (_historicoCache) {
        _historicoCache._cachedResponses?.forEach(resp => dispatch(addMarketplaceEntities(resp)));
        return _historicoCache;
      }
      return rejectWithValue(storableError(e));
    });
};

// Allow other code to invalidate the cache (e.g. after a new review submission).
export const invalidateHistoricoCache = () => {
  _historicoCache = null;
  _historicoCacheKey = null;
  _historicoCacheTime = 0;
};

export const loadDataThunk = createAsyncThunk(
  'HistoricoReservasPage/loadData',
  loadDataPayloadCreator
);

export const loadData = (params, search) => dispatch =>
  dispatch(loadDataThunk({ params, search }));
