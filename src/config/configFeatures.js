//////////////////////////////////////////////////////////
// Feature switches for parts of the marketplace that are //
// built but not in service yet.                          //
//////////////////////////////////////////////////////////

/**
 * "Destacar anúncio" — the paid listing-promotion flow: the Destacar pages and
 * links, the prompt modal after publishing, the "Em destaque" badges on cards
 * and listing pages, and the destaque expiry alerts.
 *
 * Turned off while the flow has no payment provider wired up. Nothing was
 * deleted: flip this to `true` to bring the whole feature back.
 *
 * Note: this hides the UI. Listings already carrying `featured` public data
 * keep it, and the ordering the API applies to them is unaffected.
 */
export const listingHighlightsEnabled = false;
