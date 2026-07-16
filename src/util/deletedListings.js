// Per-user list of listing IDs the owner has chosen to hide permanently
// from their own "Manage Listings" view. Sharetribe's Marketplace API does
// not allow deleting a published listing (transaction history would break),
// so we pair `closeListing` with this flag: the listing is closed on the
// backend (invisible to everyone in the marketplace) and also filtered out
// of the owner's management view.
//
// Storage strategy:
//   - localStorage for fast read on every render (no extra API call)
//   - Sharetribe user `privateData.deletedListings` so deletions persist
//     across devices and sessions. On login we merge server into local;
//     on add we push local back to server.

const keyFor = userId =>
  userId ? `v1hub_deletedListings_${userId}` : 'v1hub_deletedListings';

export const getDeletedListingIds = userId => {
  if (typeof window === 'undefined' || !window.localStorage) return [];
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const saveDeletedListingIds = (userId, ids) => {
  if (typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(keyFor(userId), JSON.stringify(ids));
  } catch {}
};

export const addDeletedListingId = (userId, listingId) => {
  if (!listingId) return getDeletedListingIds(userId);
  const list = getDeletedListingIds(userId);
  if (!list.includes(listingId)) {
    list.push(listingId);
    saveDeletedListingIds(userId, list);
  }
  return list;
};

export const isListingDeleted = (userId, listingId) =>
  getDeletedListingIds(userId).includes(listingId);

// Merge the list the server has into local (server is source of truth for
// entries it knows about; any local-only entries are preserved). Call once
// after fetching the current user.
export const mergeServerDeletedListings = (userId, serverIds) => {
  if (!Array.isArray(serverIds)) return getDeletedListingIds(userId);
  const local = getDeletedListingIds(userId);
  const merged = [...new Set([...serverIds, ...local])];
  saveDeletedListingIds(userId, merged);
  return merged;
};

// Fire-and-forget push of the local list to the user's privateData. Failures
// don't roll back the local state — the next successful sync reconciles it.
export const pushDeletedListingsToServer = async (sdk, ids) => {
  if (!sdk) return;
  try {
    await sdk.currentUser.updateProfile({ privateData: { deletedListings: ids } });
  } catch {}
};
