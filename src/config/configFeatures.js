//////////////////////////////////////////////////////////
// Feature switches for parts of the marketplace that are //
// built but not in service yet.                          //
//////////////////////////////////////////////////////////

/**
 * "Destacar anúncio" — the paid listing-promotion flow: the Destacar pages and
 * links, the prompt modal after publishing, the "Em destaque" badges on cards
 * and listing pages, and the destaque expiry alerts.
 *
 * Esteve desligado enquanto o fluxo não cobrava nada: a página mostrava um
 * formulário de cartão que era montado e nunca lido, e confirmar apenas marcava
 * o pedido como pendente para aprovação manual. O pagamento passou a ser feito
 * no Checkout do Stripe (server/api/destaque-billing.js), com o destaque a ser
 * activado pelo webhook depois de a cobrança confirmar.
 *
 * Nota: isto esconde a interface. Anúncios que já tenham `featured` em
 * publicData mantêm-no, e a ordenação que a API lhes aplica não é afectada.
 */
export const listingHighlightsEnabled = true;
