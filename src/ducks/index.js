/**
 * Import reducers from shared ducks modules (default export)
 * We are following Ducks module proposition:
 * https://github.com/erikras/ducks-modular-redux
 */

import auth from './auth.duck';
import emailVerification from './emailVerification.duck';
import routing from './routing.duck';
import ui from './ui.duck';
import hostedAssets from './hostedAssets.duck';
import featuredListings from './featuredListings.duck';
import marketplaceData from './marketplaceData.duck';
import paymentMethods from './paymentMethods.duck';
import stripe from './stripe.duck';
import stripeConnectAccount from './stripeConnectAccount.duck';
import user from './user.duck';
import favorites from './favorites.duck';
import recentlyViewed from './recentlyViewed.duck';
import ratings from './ratings.duck';
import follow from './follow.duck';
import notifications from './notifications.duck';
import savedSearchAlerts from './savedSearchAlerts.duck';
import favoriteAlerts from './favoriteAlerts.duck';
import followAlerts from './followAlerts.duck';
import extraAlerts from './extraAlerts.duck';
import highlightedListings from './highlightedListings.duck';
import similarListings from './similarListings.duck';
import mapListings from './mapListings.duck';
import recommendations from './recommendations.duck';

export {
  auth,
  emailVerification,
  routing,
  ui,
  hostedAssets,
  featuredListings,
  marketplaceData,
  paymentMethods,
  stripe,
  stripeConnectAccount,
  user,
  favorites,
  recentlyViewed,
  ratings,
  follow,
  notifications,
  savedSearchAlerts,
  favoriteAlerts,
  followAlerts,
  extraAlerts,
  highlightedListings,
  similarListings,
  mapListings,
  recommendations,
};
