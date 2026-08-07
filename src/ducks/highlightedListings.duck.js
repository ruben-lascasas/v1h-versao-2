// Duck for user-highlighted listings (added via "Destacar Anúncio" flow)

import * as log from '../util/log';

const ADD_HIGHLIGHTED = 'app/highlightedListings/ADD';
const CLEAR_HIGHLIGHTED = 'app/highlightedListings/CLEAR';

const STORAGE_KEY = 'sharetribe_highlighted_listings';

// ── LocalStorage helpers ──────────────────────────────────────────────────────

const loadFromStorage = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
};

const saveToStorage = listings => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(listings));
  } catch (e) {
    // quota exceeded or private browsing — silently ignore
  }
};

// ── Initial state (hydrated from localStorage) ────────────────────────────────

const initialState = {
  listings: loadFromStorage(),
};

// ── Selectors ─────────────────────────────────────────────────────────────────
export const selectHighlightedListings = state => state.highlightedListings?.listings || [];

// ── Action creators ───────────────────────────────────────────────────────────

/**
 * Add a listing to the highlighted list.
 * @param {Object} listingData - { id, slug, title, description, priceFormatted,
 *   location, imageUrl, extraImageUrls, hostName, hostInitial, amenityChips, rating, reviewCount }
 */
export const addHighlightedListing = listingData => ({
  type: ADD_HIGHLIGHTED,
  payload: listingData,
});

export const clearHighlightedListings = () => ({ type: CLEAR_HIGHLIGHTED });

// Grava publicData.featured=true no Sharetribe para que a listagem apareça
// para todos os dispositivos via API. Requer que o campo "featured" esteja
// configurado como pesquisável no Sharetribe Console (Listing fields).
//
// Após a gravação, dispara uma chamada (fire-and-forget) ao endpoint do
// V1H `/api/notify-admin` para que o admin receba um email a avisar do
// novo destaque, com link direto para o Sharetribe Console.
/**
 * Guarda o texto e as comodidades que o anfitrião editou na página de destaque,
 * sem pedir destaque nenhum.
 *
 * Existe separado do `featureListing` porque o destaque passou a ser pago: o
 * anfitrião é encaminhado para o Stripe e pode desistir a meio. Marcar
 * `featuredPending` antes de haver pagamento deixava pedidos pendentes por
 * pagar à espera de aprovação.
 */
export const saveDestaqueDetails = (listingId, { description, amenityKeys } = {}) => (
  dispatch,
  getState,
  sdk
) =>
  sdk.ownListings.update({
    id: listingId,
    publicData: {
      featuredDescription: description || null,
      featuredAmenityKeys: amenityKeys?.length > 0 ? amenityKeys : null,
    },
  });

export const featureListing = (listingId, { description, amenityKeys } = {}) => (dispatch, getState, sdk) => {
  return sdk.ownListings
    .update(
      {
        id: listingId,
        publicData: {
          // Marca o pedido como pendente — só passa a 'true' após aprovação do admin
          // via /api/approve-destaque (server/api/approve-destaque.js).
          featuredPending: 'true',
          // Clear any previous "3-day warning sent" flag so the new cycle
          // re-arms cleanly after approval (server/jobs/expireFeaturedListingsJob.js).
          destaqueWarningSent: null,
          // Persist description/amenities so they're available cross-browser via API.
          featuredDescription: description || null,
          featuredAmenityKeys: amenityKeys?.length > 0 ? amenityKeys : null,
        },
      },
      // expand: true so the response includes the listing attributes
      // (used by the admin notification email to fill in the title).
      { expand: true }
    )
    .then(response => {
      try {
        const listing = response?.data?.data;
        const listingTitle = listing?.attributes?.title || null;
        const state = getState();
        const currentUser = state?.user?.currentUser;
        const userId = currentUser?.id?.uuid || null;
        const userName =
          currentUser?.attributes?.profile?.displayName ||
          currentUser?.attributes?.profile?.firstName ||
          null;
        if (typeof fetch === 'function') {
          fetch('/api/notify-admin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'destaque',
              listingId,
              listingTitle,
              userId,
              userName,
            }),
          }).catch(() => {});
        }
      } catch (_) {
        // Fire-and-forget — never block / break the destaque flow because
        // the notification email failed.
      }
      return response;
    })
    .catch(err => {
      log.error(err, 'feature-listing-update-failed', { listingId });
    });
};

// ── Reducer ───────────────────────────────────────────────────────────────────
export default function reducer(state = initialState, action = {}) {
  switch (action.type) {
    case ADD_HIGHLIGHTED: {
      const alreadyExists = state.listings.some(l => l.id === action.payload.id);
      const nextListings = alreadyExists
        ? state.listings.map(l => (l.id === action.payload.id ? action.payload : l))
        : [...state.listings, action.payload];
      saveToStorage(nextListings);
      return { ...state, listings: nextListings };
    }
    case CLEAR_HIGHLIGHTED:
      saveToStorage([]);
      return { ...state, listings: [] };
    default:
      return state;
  }
}
