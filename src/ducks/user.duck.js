import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import { util as sdkUtil } from '../util/sdkLoader';
import { denormalisedResponseEntities, ensureOwnListing } from '../util/data';
import * as log from '../util/log';
import { LISTING_STATE_DRAFT } from '../util/types';
import { storableError } from '../util/errors';
import { isUserAuthorized } from '../util/userHelpers';
import {
  getStatesNeedingProviderAttention,
  getStatesNeedingCustomerAttention,
  getSupportedProcessesInfo,
} from '../transactions/transaction';

import { authInfo } from './auth.duck';
import { updateStripeConnectAccount } from './stripeConnectAccount.duck';
import { initializeFavorites, syncFavoritesToServer } from './favorites.duck';
import {
  mergeServerDeletedListings,
  getDeletedListingIds,
} from '../util/deletedListings';
import { initializeRecentlyViewed, syncRecentlyViewedToServer, loadAndClearPreLoginEntries } from './recentlyViewed.duck';
import { initializeFollowing } from './follow.duck';
import { checkNewListingsFromFollowed } from './notifications.duck';
import { checkSavedSearchMatches } from './savedSearchAlerts.duck';
import { applyPendingFavorite } from '../components/FavoriteButton/FavoriteButton';

// ================ Helper Functions ================ //

const mergeCurrentUser = (oldCurrentUser, newCurrentUser) => {
  const { id: oId, type: oType, attributes: oAttr, ...oldRelationships } = oldCurrentUser || {};
  const { id, type, attributes, ...relationships } = newCurrentUser || {};

  // Passing null will remove currentUser entity.
  // Only relationships are merged.
  // TODO figure out if sparse fields handling needs a better handling.
  return newCurrentUser === null
    ? null
    : oldCurrentUser === null
    ? newCurrentUser
    : { id, type, attributes, ...oldRelationships, ...relationships };
};

// ================ Async Thunks ================ //

//////////////////////////////////////////////////////////////////////
// Fetch ownListings to check if currentUser has published listings //
//////////////////////////////////////////////////////////////////////

const fetchCurrentUserHasListingsPayloadCreator = (_, thunkAPI) => {
  const { getState, extra: sdk, rejectWithValue } = thunkAPI;
  const { currentUser } = getState().user;

  if (!currentUser) {
    return Promise.resolve({ hasListings: false });
  }

  const params = {
    // Since we are only interested in if the user has published
    // listings, we only need at most one result.
    states: 'published',
    page: 1,
    perPage: 1,
  };

  return sdk.ownListings
    .query(params)
    .then(response => {
      const hasListings = response.data.data && response.data.data.length > 0;

      const hasPublishedListings =
        hasListings &&
        ensureOwnListing(response.data.data[0]).attributes.state !== LISTING_STATE_DRAFT;
      return { hasListings: !!hasPublishedListings };
    })
    .catch(e => rejectWithValue(storableError(e)));
};

export const fetchCurrentUserHasListingsThunk = createAsyncThunk(
  'user/fetchCurrentUserHasListings',
  fetchCurrentUserHasListingsPayloadCreator
);

// Backward compatible wrapper for the thunk
export const fetchCurrentUserHasListings = () => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserHasListingsThunk()).unwrap();
};

///////////////////////////////////////////////////////////
// Fetch transactions to check if currentUser has orders //
///////////////////////////////////////////////////////////

const fetchCurrentUserHasOrdersPayloadCreator = (_, { getState, extra: sdk, rejectWithValue }) => {
  if (!getState().user.currentUser) {
    return Promise.resolve({ hasOrders: false });
  }

  const params = {
    only: 'order',
    page: 1,
    perPage: 1,
  };

  return sdk.transactions
    .query(params)
    .then(response => {
      const hasOrders = response.data.data && response.data.data.length > 0;
      return { hasOrders: !!hasOrders };
    })
    .catch(e => rejectWithValue(storableError(e)));
};

export const fetchCurrentUserHasOrdersThunk = createAsyncThunk(
  'user/fetchCurrentUserHasOrders',
  fetchCurrentUserHasOrdersPayloadCreator
);

// Backward compatible wrapper for the thunk
export const fetchCurrentUserHasOrders = () => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserHasOrdersThunk()).unwrap();
};

/////////////////////////////////////////////////////////////////////////////////////
// Fetch transactions in specific states to check if currentUser has notifications //
/////////////////////////////////////////////////////////////////////////////////////

// In-memory cache: avoid re-fetching on every navigation
let _notifCache = null;
let _notifCacheTime = 0;
const NOTIF_CACHE_TTL = 5000; // 5 seconds

// Single-flight: if a notification fetch is already in progress, return the
// same promise instead of starting another one. Was causing 4 parallel
// dispatches → 16 transactions/query calls when routes triggered
// fetchCurrentUserNotifications simultaneously (e.g. topbar + page load +
// auth-change effect firing within ~100ms of each other).
let _notifInFlight = null;

// A transaction is "unread" if its most recent activity is newer than what we last saw.
// Most recent activity = max(latest message createdAt, lastTransitionedAt).
// Messages are authoritative for inquiry conversations (sdk.messages.send does not
// transition state, so lastTransitionedAt alone misses all messages after the first).
const checkUnreadTransactions = (txList, lastReadTimes, latestMessageTimes = {}) => {
  const seen = new Set();
  const unreadIds = [];

  txList.forEach(tx => {
    if (seen.has(tx.id.uuid)) return;
    seen.add(tx.id.uuid);

    const txId = tx.id.uuid;
    const lastRead = lastReadTimes[txId] ? new Date(lastReadTimes[txId]).getTime() : 0;
    const latestMessageAt = latestMessageTimes[txId]
      ? new Date(latestMessageTimes[txId]).getTime()
      : 0;
    const transitionAt = tx.attributes?.lastTransitionedAt
      ? new Date(tx.attributes.lastTransitionedAt).getTime()
      : 0;
    const lastActivity = Math.max(latestMessageAt, transitionAt);

    if (lastActivity > lastRead) unreadIds.push(txId);
  });

  return { count: unreadIds.length, unreadIds };
};

const fetchCurrentUserNotificationsPayloadCreator = async (_, { extra: sdk, rejectWithValue }) => {
  if (_notifCache && Date.now() - _notifCacheTime < NOTIF_CACHE_TTL) {
    return _notifCache;
  }

  // Single-flight: a second/third/fourth dispatch within the same ~1-2s
  // window where the first hasn't filled the cache yet shares the same
  // promise. Without this we were firing 4 parallel runs × 4 sequential
  // queries each = 16 transactions/query bursts.
  if (_notifInFlight) {
    return _notifInFlight;
  }

  const txParams = {
    'fields.transaction': ['lastTransitionedAt', 'processName'],
    page: 1,
    perPage: 100,
  };

  const bookingProcessNames = getSupportedProcessesInfo()
    .map(p => p.name)
    .filter(n => n !== 'default-inquiry');

  let lastReadTimes = {};
  try {
    lastReadTimes = JSON.parse(localStorage.getItem('v1hub_dmLastRead') || '{}');
  } catch {}

  // Each tx.query individually retries on 429 with exponential backoff
  // (1.5s, 3s, 6s, 12s). The 4 queries used to fire in parallel via
  // Promise.all — that burst was instantly tripping the 60/min limit
  // because all 4 hit the rate-limit bucket in the same window. Sequential
  // spreads them temporally so each gets a fair shot at the budget. Total
  // wall time goes from ~max(t) to ~sum(t) (~1-2s instead of ~500ms) but
  // 429s in dev no longer wipe out the inbox dots.
  const txQueryWithRetry = (params, attempt = 0) =>
    sdk.transactions.query(params).catch(err => {
      const isRateLimited = err && err.status === 429;
      if (isRateLimited && attempt < 4) {
        const delay = 1500 * Math.pow(2, attempt);
        return new Promise(r => setTimeout(r, delay)).then(() =>
          txQueryWithRetry(params, attempt + 1)
        );
      }
      return { data: { data: [] } };
    });

  // Wrap the rest in an async IIFE assigned to _notifInFlight so concurrent
  // dispatches share this same promise (single-flight). Cleared in .finally.
  _notifInFlight = (async () => {
    try {
      const inquiryOrders = await txQueryWithRetry({
        ...txParams, processNames: ['default-inquiry'], only: 'order',
      });
      const inquirySales = await txQueryWithRetry({
        ...txParams, processNames: ['default-inquiry'], only: 'sale',
      });
      const bookingOrders = bookingProcessNames.length > 0
        ? await txQueryWithRetry({ ...txParams, processNames: bookingProcessNames, only: 'order' })
        : { data: { data: [] } };
      const bookingSales = bookingProcessNames.length > 0
        ? await txQueryWithRetry({ ...txParams, processNames: bookingProcessNames, only: 'sale' })
        : { data: { data: [] } };

      const inquiryTx = [...(inquiryOrders.data.data || []), ...(inquirySales.data.data || [])];
      const customerTx = bookingOrders.data.data || [];
      const providerTx = bookingSales.data.data || [];

      // Per-tx message timestamp queries inside the notification thunk were
      // the primary cause of 429 cascades on the Basic plan. The inbox-level
      // unread/sort is now driven by InboxPage.duck (fire-and-forget) while
      // the topbar dot relies on lastTransitionedAt only — see
      // project_inbox_notifications_rate_limit memory.
      const dm = checkUnreadTransactions(inquiryTx, lastReadTimes);
      const customer = checkUnreadTransactions(customerTx, lastReadTimes);
      const provider = checkUnreadTransactions(providerTx, lastReadTimes);

      const result = {
        saleNotificationsCount: provider.count,
        orderNotificationsCount: customer.count,
        dmNotificationsCount: dm.count,
        unreadTransactionIds: [...dm.unreadIds, ...customer.unreadIds, ...provider.unreadIds],
      };

      _notifCache = result;
      _notifCacheTime = Date.now();
      return result;
    } catch (e) {
      return rejectWithValue(storableError(e));
    }
  })();

  try {
    return await _notifInFlight;
  } finally {
    _notifInFlight = null;
  }
};

export const fetchCurrentUserNotificationsThunk = createAsyncThunk(
  'user/fetchCurrentUserNotifications',
  fetchCurrentUserNotificationsPayloadCreator
);

// Invalidate the notification cache (call this when user reads a conversation)
export const invalidateNotificationCache = () => {
  _notifCache = null;
  _notifCacheTime = 0;
};

// Backward compatible wrapper for the thunk
export const fetchCurrentUserNotifications = () => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserNotificationsThunk()).unwrap();
};

const fetchCurrentUserPayloadCreator = (options, thunkAPI) => {
  const { getState, dispatch, extra: sdk, rejectWithValue } = thunkAPI;
  const state = getState();
  const { currentUserHasListings, currentUserShowTimestamp } = state.user || {};
  const { isAuthenticated } = state.auth;
  const {
    callParams = null,
    updateHasListings = true,
    updateNotifications = true,
    afterLogin,
    enforce = false, // Automatic emailVerification might be called too fast
  } = options || {};

  // Double fetch might happen when e.g. profile page is making a full page load
  const aSecondAgo = new Date().getTime() - 1000;
  if (!enforce && currentUserShowTimestamp > aSecondAgo) {
    return Promise.resolve(state.user.currentUser);
  }

  if (!isAuthenticated && !afterLogin) {
    // Make sure current user is null
    return Promise.resolve(null);
  }

  const parameters = callParams || {
    include: ['effectivePermissionSet', 'profileImage', 'stripeAccount'],
    'fields.image': [
      'variants.square-small',
      'variants.square-small2x',
      'variants.square-xsmall',
      'variants.square-xsmall2x',
    ],
    'imageVariant.square-xsmall': sdkUtil.objectQueryString({
      w: 40,
      h: 40,
      fit: 'crop',
    }),
    'imageVariant.square-xsmall2x': sdkUtil.objectQueryString({
      w: 80,
      h: 80,
      fit: 'crop',
    }),
  };

  return sdk.currentUser
    .show(parameters)
    .then(response => {
      const entities = denormalisedResponseEntities(response);
      if (entities.length !== 1) {
        throw new Error('Expected a resource in the sdk.currentUser.show response');
      }
      const currentUser = entities[0];

      // Save stripeAccount to store.stripe.stripeAccount if it exists
      if (currentUser.stripeAccount) {
        dispatch(updateStripeConnectAccount(currentUser.stripeAccount));
      }

      // set current user id to the logger
      log.setUserId(currentUser.id.uuid);

      // A língua escolhida vive no localStorage, que o servidor não vê. Espelha
      // no perfil quem já tinha sessão iniciada antes disto existir — sem isto,
      // só quem trocasse de língua de novo é que passaria a receber emails na
      // língua certa.
      try {
        const doBrowser = localStorage.getItem('v1h_locale');
        const noPerfil = currentUser.attributes?.profile?.publicData?.locale;
        if (doBrowser && doBrowser !== noPerfil) {
          dispatch(saveUserLocale(doBrowser));
        }
      } catch (e) {
        /* localStorage indisponível — a preferência fica para a próxima */
      }

      // Initialize favorites and recently viewed for the current user
      // Load server favorites and merge with any local favorites
      const serverFavorites =
        currentUser.attributes?.profile?.privateData?.favorites || null;
      dispatch(initializeFavorites({ userId: currentUser.id.uuid, serverFavorites }));
      // Pull any listings that were "deleted" on another device into this
      // one's localStorage so the Manage Listings filter applies everywhere.
      const serverDeletedListings =
        currentUser.attributes?.profile?.privateData?.deletedListings || null;
      if (Array.isArray(serverDeletedListings)) {
        mergeServerDeletedListings(currentUser.id.uuid, serverDeletedListings);
      }
      const serverFollowing =
        currentUser.attributes?.profile?.privateData?.following || null;
      dispatch(initializeFollowing({ userId: currentUser.id.uuid, serverFollowing }));
      dispatch(checkNewListingsFromFollowed(currentUser.id.uuid, { force: true }));
      dispatch(checkSavedSearchMatches(currentUser.id.uuid, { force: true }));
      const serverRecentlyViewed =
        currentUser.attributes?.profile?.privateData?.recentlyViewed || null;
      // Check for pre-login entries saved before an OAuth redirect (Google/Facebook).
      // loadAndClearPreLoginEntries reads sessionStorage and immediately clears it.
      const preLoginEntries = loadAndClearPreLoginEntries();
      const serverEntries = preLoginEntries.length > 0
        ? [...preLoginEntries, ...(serverRecentlyViewed || [])]
        : serverRecentlyViewed;
      dispatch(initializeRecentlyViewed({ userId: currentUser.id.uuid, serverEntries }));
      // Apply any favorite that was pending before login, then sync all to server
      applyPendingFavorite(dispatch);
      if (afterLogin || preLoginEntries.length > 0) {
        dispatch(syncFavoritesToServer());
        dispatch(syncRecentlyViewedToServer());
      }
      
      return currentUser;
    })
    .then(currentUser => {
      // If currentUser is not active (e.g. in 'pending-approval' state),
      // then they don't have listings or transactions that we care about.
      if (isUserAuthorized(currentUser)) {
        if (currentUserHasListings === false && updateHasListings !== false) {
          dispatch(fetchCurrentUserHasListings());
        }

        if (updateNotifications !== false) {
          dispatch(fetchCurrentUserNotifications());
        }

        if (!currentUser.attributes.emailVerified) {
          dispatch(fetchCurrentUserHasOrders());
        }
      }

      // Make sure auth info is up to date
      dispatch(authInfo());
      return currentUser;
    })
    .catch(e => {
      // Make sure auth info is up to date
      dispatch(authInfo());
      log.error(e, 'fetch-current-user-failed');
      return rejectWithValue(storableError(e));
    });
};

export const fetchCurrentUserThunk = createAsyncThunk(
  'user/fetchCurrentUser',
  fetchCurrentUserPayloadCreator
);
// Backward compatible wrapper for the thunk
/**
 * Fetch currentUser API entity.
 *
 * @param {Object} options
 * @param {Object} [options.callParams]           Optional parameters for the currentUser.show().
 * @param {boolean} [options.updateHasListings]   Make extra call for fetchCurrentUserHasListings()?
 * @param {boolean} [options.updateNotifications] Make extra call for fetchCurrentUserNotifications()?
 * @param {boolean} [options.afterLogin]          Fetch is no-op for unauthenticated users except after login() call
 * @param {boolean} [options.enforce]             Enforce the call even if the currentUser entity is freshly fetched.
 */
export const fetchCurrentUser = options => (dispatch, getState, sdk) => {
  return dispatch(fetchCurrentUserThunk(options)).unwrap();
};

// Push the local "deleted listings" list to the current user's privateData
// so the hide applies on every device they log in on. Fire-and-forget; the
// local state remains authoritative if the push fails.
export const syncDeletedListingsToServer = () => async (dispatch, getState, sdk) => {
  const state = getState();
  if (!state.auth?.isAuthenticated) return;
  const userId = state.user?.currentUser?.id?.uuid;
  if (!userId) return;
  const ids = getDeletedListingIds(userId);
  try {
    await sdk.currentUser.updateProfile({ privateData: { deletedListings: ids } });
  } catch {}
};

/////////////////////////////////////////////
// Send verification email to currentUser //
/////////////////////////////////////////////

const sendVerificationEmailPayloadCreator = (_, { extra: sdk, rejectWithValue }) => {
  return sdk.currentUser
    .sendVerificationEmail()
    .then(() => ({}))
    .catch(e => rejectWithValue(storableError(e)));
};
export const sendVerificationEmailThunk = createAsyncThunk(
  'user/sendVerificationEmail',
  sendVerificationEmailPayloadCreator,
  {
    condition: (_, { getState }) => {
      return !getState()?.user?.sendVerificationEmailInProgress;
    },
  }
);

// Backward compatible wrapper for the thunk
export const sendVerificationEmail = () => (dispatch, getState, sdk) => {
  return dispatch(sendVerificationEmailThunk()).unwrap();
};

// ================ Slice ================ //

const userSlice = createSlice({
  name: 'user',
  initialState: {
    currentUser: null,
    currentUserShowTimestamp: 0,
    currentUserShowError: null,
    currentUserHasListings: false,
    currentUserHasListingsError: null,
    currentUserSaleNotificationCount: 0,
    currentUserOrderNotificationCount: 0,
    currentUserDMNotificationCount: 0,
    unreadTransactionIds: [],
    currentUserNotificationCountError: null,
    currentUserHasOrders: null, // This is not fetched unless unverified emails exist
    currentUserHasOrdersError: null,
    sendVerificationEmailInProgress: false,
    sendVerificationEmailError: null,
  },
  reducers: {
    clearCurrentUser: state => {
      state.currentUser = null;
      state.currentUserShowError = null;
      state.currentUserHasListings = false;
      state.currentUserHasListingsError = null;
      state.currentUserSaleNotificationCount = 0;
      state.currentUserOrderNotificationCount = 0;
      state.currentUserDMNotificationCount = 0;
      state.currentUserNotificationCountError = null;
    },
    decrementSaleNotificationCount: state => {
      if (state.currentUserSaleNotificationCount > 0) {
        state.currentUserSaleNotificationCount -= 1;
      }
    },
    decrementOrderNotificationCount: state => {
      if (state.currentUserOrderNotificationCount > 0) {
        state.currentUserOrderNotificationCount -= 1;
      }
    },
    setCurrentUser: (state, action) => {
      state.currentUser = mergeCurrentUser(state.currentUser, action.payload);
    },
    setCurrentUserHasOrders: state => {
      state.currentUserHasOrders = true;
    },
  },
  extraReducers: builder => {
    builder
      // fetchCurrentUser
      .addCase(fetchCurrentUserThunk.pending, state => {
        state.currentUserShowError = null;
      })
      .addCase(fetchCurrentUserThunk.fulfilled, (state, action) => {
        state.currentUser = mergeCurrentUser(state.currentUser, action.payload);
        state.currentUserShowTimestamp = action.payload ? new Date().getTime() : 0;
      })
      .addCase(fetchCurrentUserThunk.rejected, (state, action) => {
        // eslint-disable-next-line no-console
        console.error(action.payload);
        state.currentUserShowError = action.payload;
      })
      // fetchCurrentUserHasListings
      .addCase(fetchCurrentUserHasListingsThunk.pending, state => {
        state.currentUserHasListingsError = null;
      })
      .addCase(fetchCurrentUserHasListingsThunk.fulfilled, (state, action) => {
        state.currentUserHasListings = action.payload.hasListings;
      })
      .addCase(fetchCurrentUserHasListingsThunk.rejected, (state, action) => {
        console.error(action.payload); // eslint-disable-line
        state.currentUserHasListingsError = action.payload;
      })
      // fetchCurrentUserNotifications
      .addCase(fetchCurrentUserNotificationsThunk.pending, state => {
        state.currentUserNotificationCountError = null;
      })
      .addCase(fetchCurrentUserNotificationsThunk.fulfilled, (state, action) => {
        state.currentUserSaleNotificationCount = action.payload.saleNotificationsCount;
        state.currentUserOrderNotificationCount = action.payload.orderNotificationsCount;
        state.currentUserDMNotificationCount = action.payload.dmNotificationsCount ?? 0;
        state.unreadTransactionIds = action.payload.unreadTransactionIds || [];
      })
      .addCase(fetchCurrentUserNotificationsThunk.rejected, (state, action) => {
        console.error(action.payload); // eslint-disable-line
        state.currentUserNotificationCountError = action.payload;
      })
      // fetchCurrentUserHasOrders
      .addCase(fetchCurrentUserHasOrdersThunk.pending, state => {
        state.currentUserHasOrdersError = null;
      })
      .addCase(fetchCurrentUserHasOrdersThunk.fulfilled, (state, action) => {
        state.currentUserHasOrders = action.payload.hasOrders;
      })
      .addCase(fetchCurrentUserHasOrdersThunk.rejected, (state, action) => {
        console.error(action.payload); // eslint-disable-line
        state.currentUserHasOrdersError = action.payload;
      })
      // sendVerificationEmail
      .addCase(sendVerificationEmailThunk.pending, state => {
        state.sendVerificationEmailInProgress = true;
        state.sendVerificationEmailError = null;
      })
      .addCase(sendVerificationEmailThunk.fulfilled, state => {
        state.sendVerificationEmailInProgress = false;
      })
      .addCase(sendVerificationEmailThunk.rejected, (state, action) => {
        state.sendVerificationEmailInProgress = false;
        state.sendVerificationEmailError = action.payload;
      });
  },
});

export default userSlice.reducer;

export const {
  clearCurrentUser,
  setCurrentUser,
  setCurrentUserHasOrders,
  decrementSaleNotificationCount,
  decrementOrderNotificationCount,
} = userSlice.actions;

// ================ Selectors ================ //

// Errors caused by Sharetribe API rate limiting (HTTP 429) are transient and not
// caused by the user — surfacing them as a generic "something went wrong" toast just
// confuses people. Ignore them so the toast only fires for real failures.
const isRateLimitError = err => err && err.status === 429;

export const hasCurrentUserErrors = state => {
  const { user } = state;
  const errors = [
    user.currentUserShowError,
    user.currentUserHasListingsError,
    user.currentUserNotificationCountError,
    user.currentUserHasOrdersError,
  ];
  return errors.some(e => e && !isRateLimitError(e));
};

/**
 * Guarda a língua escolhida no perfil do utilizador.
 *
 * Sem isto, `publicData.locale` nunca era escrito por ninguém — e cinco emails
 * do servidor lêem-no com `|| 'pt'`. Resultado: as traduções inglesas desses
 * emails existiam mas nunca chegavam a ser usadas, porque o servidor concluía
 * sempre que o destinatário era português.
 *
 * A escolha vive no localStorage do browser, que o servidor não vê. Isto passa
 * a espelhá-la no perfil.
 *
 * Best-effort de propósito: falhar a gravar a preferência de língua não é razão
 * para estragar o que o utilizador estava a fazer.
 */
export const saveUserLocale = locale => (dispatch, getState, sdk) => {
  const currentUser = getState()?.user?.currentUser;
  if (!currentUser?.id || !locale) return Promise.resolve();

  const guardada = currentUser.attributes?.profile?.publicData?.locale;
  if (guardada === locale) return Promise.resolve();

  return sdk.currentUser
    .updateProfile({ publicData: { locale } })
    .catch(e => console.warn('[locale] não foi possível guardar no perfil:', e?.message || e));
};
