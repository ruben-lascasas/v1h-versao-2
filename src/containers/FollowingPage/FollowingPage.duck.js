import { createSlice } from '@reduxjs/toolkit';
import { addMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { selectFollowing } from '../../ducks/follow.duck';
import { types as sdkTypes } from '../../util/sdkLoader';

const { UUID } = sdkTypes;

const followingPageSlice = createSlice({
  name: 'FollowingPage',
  initialState: {
    userIds: [],
    fetchInProgress: false,
    fetchError: null,
    conversations: [],
    conversationsInProgress: false,
  },
  reducers: {
    fetchUsersRequest: state => {
      state.fetchInProgress = true;
      state.fetchError = null;
    },
    fetchUsersSuccess: (state, action) => {
      state.fetchInProgress = false;
      state.userIds = action.payload;
    },
    fetchUsersError: (state, action) => {
      state.fetchInProgress = false;
      state.fetchError = action.payload;
    },
    fetchConversationsRequest: state => {
      state.conversationsInProgress = true;
    },
    fetchConversationsSuccess: (state, action) => {
      state.conversationsInProgress = false;
      state.conversations = action.payload;
    },
    fetchConversationsError: state => {
      state.conversationsInProgress = false;
    },
  },
});

export const {
  fetchUsersRequest,
  fetchUsersSuccess,
  fetchUsersError,
  fetchConversationsRequest,
  fetchConversationsSuccess,
  fetchConversationsError,
} = followingPageSlice.actions;

export const selectFollowingPageUserIds = state => state.FollowingPage?.userIds || [];
export const selectFollowingPageInProgress = state => state.FollowingPage?.fetchInProgress || false;
export const selectFollowingPageConversations = state => state.FollowingPage?.conversations || [];

export const loadData = () => async (dispatch, getState, sdk) => {
  const following = selectFollowing(getState());

  // Load followed users
  if (!following || following.length === 0) {
    dispatch(fetchUsersSuccess([]));
  } else {
    dispatch(fetchUsersRequest());
    try {
      const results = await Promise.all(
        following.map(id =>
          sdk.users
            .show({
              id: new UUID(id),
              include: ['profileImage'],
              'fields.image': ['variants.square-small', 'variants.square-small2x'],
            })
            .then(r => { dispatch(addMarketplaceEntities(r, {})); return id; })
            .catch(() => null)
        )
      );
      dispatch(fetchUsersSuccess(results.filter(Boolean)));
    } catch (e) {
      dispatch(fetchUsersError(e));
    }
  }

  // Load recent conversations (transactions)
  dispatch(fetchConversationsRequest());
  try {
    const [ordersRes, salesRes] = await Promise.all([
      sdk.transactions.query({
        only: 'order',
        perPage: 8,
        include: ['provider', 'customer', 'provider.profileImage', 'customer.profileImage'],
        'fields.image': ['variants.square-small', 'variants.square-small2x'],
      }).catch(() => null),
      sdk.transactions.query({
        only: 'sale',
        perPage: 8,
        include: ['provider', 'customer', 'provider.profileImage', 'customer.profileImage'],
        'fields.image': ['variants.square-small', 'variants.square-small2x'],
      }).catch(() => null),
    ]);

    const orders = ordersRes?.data?.data || [];
    const sales = salesRes?.data?.data || [];
    const ordersIncluded = ordersRes?.data?.included || [];
    const salesIncluded = salesRes?.data?.included || [];

    // Merge included entities
    const allIncluded = [...ordersIncluded, ...salesIncluded];

    // Build a map of user entities from included
    const userMap = {};
    allIncluded.forEach(entity => {
      if (entity.type === 'user') {
        userMap[entity.id.uuid] = entity;
      }
    });

    // Merge orders + sales, deduplicate by id, sort by lastTransitionedAt
    const allTxs = [...orders.map(tx => ({ ...tx, role: 'customer' })), ...sales.map(tx => ({ ...tx, role: 'sale' }))];
    const seen = new Set();
    const unique = allTxs.filter(tx => {
      if (seen.has(tx.id.uuid)) return false;
      seen.add(tx.id.uuid);
      return true;
    });

    unique.sort((a, b) => {
      const dateA = new Date(a.attributes?.lastTransitionedAt || 0);
      const dateB = new Date(b.attributes?.lastTransitionedAt || 0);
      return dateB - dateA;
    });

    const conversations = unique.slice(0, 8).map(tx => {
      const providerId = tx.relationships?.provider?.data?.id?.uuid;
      const customerId = tx.relationships?.customer?.data?.id?.uuid;
      const otherUserId = tx.role === 'customer' ? providerId : customerId;
      const otherUser = userMap[otherUserId] || null;
      const otherImageRef = otherUser?.relationships?.profileImage?.data;
      const otherImage = otherImageRef ? allIncluded.find(e => e.type === 'image' && e.id.uuid === otherImageRef.uuid) : null;
      const otherName = otherUser?.attributes?.profile?.displayName || otherUser?.attributes?.profile?.firstName || '—';
      const imageUrl = otherImage?.attributes?.variants?.['square-small']?.url || null;

      return {
        id: tx.id.uuid,
        role: tx.role,
        otherName,
        imageUrl,
        lastTransitionedAt: tx.attributes?.lastTransitionedAt,
        lastTransition: tx.attributes?.lastTransition || '',
      };
    });

    dispatch(fetchConversationsSuccess(conversations));
  } catch (e) {
    dispatch(fetchConversationsError());
  }
};

export default followingPageSlice.reducer;
