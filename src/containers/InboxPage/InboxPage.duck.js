import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { storableError } from '../../util/errors';
import { parse, getValidInboxSort } from '../../util/urlHelpers';
import { getSupportedProcessesInfo } from '../../transactions/transaction';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { fetchCurrentUserNotifications } from '../../ducks/user.duck';
import { fetchLatestMessageTimes } from '../../util/messagesApi';

const INBOX_PAGE_SIZE = 10;

// ================ Helper functions ================ //

const entityRefs = entities =>
  entities.map(entity => ({
    id: entity.id,
    type: entity.type,
  }));

// ================ Slice ================ //

const inboxPageSlice = createSlice({
  name: 'InboxPage',
  initialState: {
    fetchInProgress: false,
    fetchOrdersOrSalesError: null,
    pagination: null,
    transactionRefs: [],
  },
  reducers: {},
  extraReducers: builder => {
    builder
      .addCase(loadDataThunk.pending, state => {
        state.fetchInProgress = true;
        state.fetchOrdersOrSalesError = null;
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
        state.fetchOrdersOrSalesError = action.payload;
      });
  },
});

export default inboxPageSlice.reducer;

// ================ Load data ================ //

const loadDataPayloadCreator = (
  { params, search },
  { dispatch, getState, rejectWithValue, extra: sdk }
) => {
  const { tab } = params;

  const onlyFilterValues = {
    orders: 'order',
    sales: 'sale',
  };

  // ── "Outras Mensagens" tab: fetch all inquiry transactions (both sides) ──
  if (tab === 'messages') {
    const { sort } = parse(search);
    const sortKey = ['createdAt', 'lastMessageAt', 'lastTransitionedAt'].includes(sort)
      ? sort
      : 'createdAt';

    const inquiryParams = {
      processNames: ['default-inquiry'],
      include: [
        'listing',
        'provider',
        'provider.profileImage',
        'customer',
        'customer.profileImage',
      ],
      'fields.transaction': [
        'processName',
        'lastTransition',
        'lastTransitionedAt',
        'createdAt',
        'protectedData',
      ],
      'fields.listing': ['title'],
      'fields.user': ['profile.displayName', 'profile.abbreviatedName', 'profile.publicData', 'deleted', 'banned'],
      'fields.image': ['variants.square-small', 'variants.square-small2x'],
      page: 1,
      perPage: 50,
    };

    return Promise.all([
      sdk.transactions.query({ ...inquiryParams, only: 'order' }),
      sdk.transactions.query({ ...inquiryParams, only: 'sale' }),
    ])
      .then(async ([ordersResp, salesResp]) => {
        dispatch(addMarketplaceEntities(ordersResp));
        dispatch(addMarketplaceEntities(salesResp));

        const allTx = [...ordersResp.data.data, ...salesResp.data.data];
        const seen = new Set();
        const uniqueTx = allTx.filter(tx => {
          if (seen.has(tx.id.uuid)) return false;
          seen.add(tx.id.uuid);
          return true;
        });

        // Resolve a timestamp (ms) per tx based on the chosen sort key.
        // `lastMessageAt` isn't exposed on the transaction attributes, so fetch
        // the latest message per tx only when that option is selected.
        const messageTimes =
          sortKey === 'lastMessageAt'
            ? await fetchLatestMessageTimes(sdk, uniqueTx.map(tx => tx.id.uuid))
            : {};
        const keyOf = tx => {
          if (sortKey === 'createdAt') {
            return tx.attributes?.createdAt ? new Date(tx.attributes.createdAt).getTime() : 0;
          }
          if (sortKey === 'lastMessageAt') {
            const m = messageTimes[tx.id.uuid];
            const t = tx.attributes?.lastTransitionedAt;
            return Math.max(
              m ? new Date(m).getTime() : 0,
              t ? new Date(t).getTime() : 0
            );
          }
          return tx.attributes?.lastTransitionedAt
            ? new Date(tx.attributes.lastTransitionedAt).getTime()
            : 0;
        };

        // Deduplicate by counterparty (the other user). Multiple inquiry
        // transactions can exist between the same pair of users (e.g. one
        // profile DM + one listing inquiry). In "Outras Mensagens" we want a
        // single row per person. Prefer the tx currently marked as unread so
        // the red dot never gets lost; otherwise keep the most recent.
        const currentUserId = getState().user?.currentUser?.id?.uuid;
        const unreadSet = new Set(getState().user?.unreadTransactionIds || []);
        const bestPerUser = new Map();
        const orphans = [];
        uniqueTx.forEach(tx => {
          const customerId = tx.relationships?.customer?.data?.id?.uuid;
          const providerId = tx.relationships?.provider?.data?.id?.uuid;
          const otherId =
            currentUserId && customerId === currentUserId ? providerId : customerId;
          if (!otherId) {
            orphans.push(tx);
            return;
          }
          const existing = bestPerUser.get(otherId);
          if (!existing) {
            bestPerUser.set(otherId, tx);
            return;
          }
          const newUnread = unreadSet.has(tx.id.uuid);
          const existingUnread = unreadSet.has(existing.id.uuid);
          if (newUnread && !existingUnread) {
            bestPerUser.set(otherId, tx);
          } else if (newUnread === existingUnread && keyOf(tx) > keyOf(existing)) {
            bestPerUser.set(otherId, tx);
          }
        });
        const dedupedTx = [...bestPerUser.values(), ...orphans];
        dedupedTx.sort((a, b) => keyOf(b) - keyOf(a));

        return {
          data: {
            data: dedupedTx,
            meta: {
              totalItems: dedupedTx.length,
              totalPages: 1,
              page: 1,
              perPage: dedupedTx.length,
            },
          },
        };
      })
      .catch(e => rejectWithValue(storableError(e)));
  }

  const onlyFilter = onlyFilterValues[tab];
  if (!onlyFilter) {
    return Promise.reject(new Error(`Invalid tab for InboxPage: ${tab}`));
  }

  const { page = 1, sort } = parse(search);
  const processNames = getSupportedProcessesInfo()
    .map(p => p.name)
    .filter(name => name !== 'default-inquiry');

  const apiQueryParams = {
    only: onlyFilter,
    processNames,
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
    'fields.listing': ['title', 'availabilityPlan', 'publicData.listingType', 'publicData.location'],
    'fields.user': ['profile.displayName', 'profile.abbreviatedName', 'profile.publicData', 'deleted', 'banned'],
    'fields.image': ['variants.square-small', 'variants.square-small2x'],
    page,
    perPage: INBOX_PAGE_SIZE,
    ...getValidInboxSort(sort),
  };

  return sdk.transactions
    .query(apiQueryParams)
    .then(response => {
      dispatch(addMarketplaceEntities(response));
      return response;
    })
    .catch(e => {
      return rejectWithValue(storableError(e));
    });
};

export const loadDataThunk = createAsyncThunk('InboxPage/loadData', loadDataPayloadCreator);

// Backward compatible wrapper for the thunk
export const loadData = (params, search) => (dispatch, getState, sdk) => {
  return dispatch(loadDataThunk({ params, search }));
};
