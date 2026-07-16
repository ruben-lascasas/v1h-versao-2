/**
 * This is the main entrypoint file for the application.
 *
 * When loaded in the client side, the application is rendered in the
 * #root element.
 *
 * When the bundle created from this file is imported in the server
 * side, the exported `renderApp` function can be used for server side
 * rendering.
 *
 * Note that this file is required for the build process.
 */

// Dependency libs
import React from 'react';
import ReactDOMClient from 'react-dom/client';
import { loadableReady } from '@loadable/component';

// Import default styles before other CSS-related modules are imported
// This ensures that the styles in marketplaceDefaults.css are included
// as first ones in the final build CSS build file.
import './styles/marketplaceDefaults.css';
import './styles/landingDark.css';

// Configs and store setup
import appSettings from './config/settings';
import defaultConfig from './config/configDefault';
import { LoggingAnalyticsHandler, GoogleAnalyticsHandler } from './analytics/handlers';
import configureStore from './store';

// Utils
import { createInstance, types as sdkTypes, tokenStore as sdkTokenStore } from './util/sdkLoader';
import { mergeConfig } from './util/configHelpers';
import { matchPathname } from './util/routes';
import * as apiUtils from './util/api';
import * as log from './util/log';

// Import relevant global duck files
import { authInfo } from './ducks/auth.duck';
import { fetchAppAssets } from './ducks/hostedAssets.duck';
import { fetchCurrentUser } from './ducks/user.duck';
import { initializeFavorites } from './ducks/favorites.duck';
import { initializeRecentlyViewed, loadSessionEntries } from './ducks/recentlyViewed.duck';
import { initializeFollowing, updateLastOnline } from './ducks/follow.duck';

// Route config
import routeConfiguration from './routing/routeConfiguration';
// App it self
import { ClientApp, renderApp } from './app';

const render = (store, shouldHydrate) => {
  // If the server already loaded the auth information, render the app
  // immediately. Otherwise wait for the flag to be loaded and render
  // when auth information is present.
  const state = store.getState();
  const cdnAssetsVersion = state.hostedAssets.version;
  const authInfoLoaded = state.auth.authInfoLoaded;
  const info = authInfoLoaded ? Promise.resolve({}) : store.dispatch(authInfo());

  info
    .then(() => {
      // Ensure that Loadable Components is ready
      // and fetch hosted assets in parallel before initializing the ClientApp
      return Promise.all([
        loadableReady(),
        store.dispatch(fetchAppAssets(defaultConfig.appCdnAssets, cdnAssetsVersion)),
        store.dispatch(fetchCurrentUser()),
      ]);
    })
    .then(([_, fetchedAppAssets, cu]) => {
      const currentUserId = cu?.id?.uuid;
      const { translations: translationsRaw, ...rest } = fetchedAppAssets || {};
      // We'll handle translations as a separate data.
      // It's given to React Intl instead of pushing to config Context
      const translations = translationsRaw?.data || {};

      // Rest of the assets are considered as hosted configs
      const configEntries = Object.entries(rest);
      const hostedConfig = configEntries.reduce((collectedData, [name, content]) => {
        return { ...collectedData, [name]: content.data || {} };
      }, {});

      store.dispatch(initializeFavorites(currentUserId || null));
      const serverFollowing = cu?.attributes?.profile?.privateData?.following || null;
      store.dispatch(initializeFollowing({ userId: currentUserId || null, serverFollowing }));
      if (currentUserId) {
        store.dispatch(updateLastOnline());
      }
      if (currentUserId) {
        store.dispatch(initializeRecentlyViewed(currentUserId));
      } else {
        // Guest: restore entries from sessionStorage (survives hard refresh, not cross-session)
        const sessionEntries = loadSessionEntries();
        store.dispatch(initializeRecentlyViewed({
          userId: null,
          serverEntries: sessionEntries.length > 0 ? sessionEntries : null,
        }));
      }

      // Remove any legacy recently_viewed_* keys left from the old localStorage-based system
      try {
        Object.keys(localStorage)
          .filter(k => k.startsWith('recently_viewed_'))
          .forEach(k => localStorage.removeItem(k));
      } catch (_) {}


      if (shouldHydrate) {
        const container = document.getElementById('root');
        ReactDOMClient.hydrateRoot(
          container,
          <ClientApp store={store} hostedTranslations={translations} hostedConfig={hostedConfig} />,
          { onRecoverableError: log.onRecoverableError }
        );
      } else {
        const container = document.getElementById('root');
        const root = ReactDOMClient.createRoot(container);
        root.render(
          <ClientApp store={store} hostedTranslations={translations} hostedConfig={hostedConfig} />
        );
      }
    })
    .catch(e => {
      log.error(e, 'browser-side-render-failed');
    });
};

const setupAnalyticsHandlers = googleAnalyticsId => {
  let handlers = [];

  // Log analytics page views and events in dev mode
  if (appSettings.dev) {
    handlers.push(new LoggingAnalyticsHandler());
  }

  // Add Google Analytics 4 (GA4) handler if tracker ID is found
  if (googleAnalyticsId) {
    if (googleAnalyticsId.indexOf('G-') !== 0) {
      console.warn(
        'Google Analytics 4 (GA4) should have measurement id that starts with "G-" prefix'
      );
    } else {
      handlers.push(new GoogleAnalyticsHandler());
    }
  }

  return handlers;
};

// If we're in a browser already, render the client application.
if (typeof window !== 'undefined') {
  // set up logger with Sentry DSN client key and environment
  log.setup();

  const baseUrl = appSettings.sdk.baseUrl ? { baseUrl: appSettings.sdk.baseUrl } : {};
  const assetCdnBaseUrl = appSettings.sdk.assetCdnBaseUrl
    ? { assetCdnBaseUrl: appSettings.sdk.assetCdnBaseUrl }
    : {};

  // eslint-disable-next-line no-underscore-dangle
  const preloadedState = window.__PRELOADED_STATE__ || '{}';
  const initialState = JSON.parse(preloadedState, sdkTypes.reviver);
  const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000; // 7 days
  const SESSION_KEY = `st_session_expiry_${appSettings.sdk.clientId}`;

  const persistentTokenStore = (() => {
    const inner = sdkTokenStore.browserCookieStore({
      clientId: appSettings.sdk.clientId,
      secure: appSettings.usingSSL,
    });
    return {
      getToken: () => {
        const expiry = localStorage.getItem(SESSION_KEY);
        if (expiry && Date.now() > Number(expiry)) {
          inner.setToken(null);
          localStorage.removeItem(SESSION_KEY);
          return null;
        }
        return inner.getToken();
      },
      setToken: token => {
        if (token) {
          localStorage.setItem(SESSION_KEY, Date.now() + SESSION_MAX_AGE);
        } else {
          localStorage.removeItem(SESSION_KEY);
        }
        return inner.setToken(token);
      },
      // The SDK calls removeToken() on logout (via ClearTokenAfterRevoke).
      // Without this proxy, the call would silently no-op and the auth cookie
      // would survive logout, so the user gets re-authenticated on the next
      // full page load (e.g. after hitting Back from a cross-origin OAuth page).
      removeToken: () => {
        localStorage.removeItem(SESSION_KEY);
        return inner.removeToken();
      },
    };
  })();

  const sdk = createInstance({
    transitVerbose: appSettings.sdk.transitVerbose,
    clientId: appSettings.sdk.clientId,
    secure: appSettings.usingSSL,
    typeHandlers: apiUtils.typeHandlers,
    tokenStore: persistentTokenStore,
    ...baseUrl,
    ...assetCdnBaseUrl,
  });

  // Note: on localhost:3000, you need to use environment variable.
  const googleAnalyticsIdFromSSR = initialState?.hostedAssets?.googleAnalyticsId;
  const googleAnalyticsId = googleAnalyticsIdFromSSR || process.env.REACT_APP_GOOGLE_ANALYTICS_ID;
  const analyticsHandlers = setupAnalyticsHandlers(googleAnalyticsId);
  const store = configureStore({ initialState, sdk, analyticsHandlers });

  require('./util/polyfills');
  render(store, !!window.__PRELOADED_STATE__);

  // Register the service worker that makes the site installable as a PWA.
  // Browsers only offer the install prompt once an active SW with a fetch
  // handler is detected, so this registration is the unlock for the
  // "Instalar app" button in the footer.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/service-worker.js', { scope: '/' })
        .catch(err => {
          // Don't break the app if SW registration fails — the site keeps
          // working as a normal website, just without PWA install.
          // eslint-disable-next-line no-console
          console.warn('Service worker registration failed:', err);
        });
    });
  }

  if (appSettings.dev) {
    // Expose stuff for the browser REPL
    window.app = {
      appSettings,
      defaultConfig,
      sdk,
      sdkTypes,
      store,
    };
  }
}

// Show warning if CSP is not enabled
const CSP = process.env.REACT_APP_CSP;
const cspEnabled = CSP === 'block' || CSP === 'report';

if (CSP === 'report' && process.env.REACT_APP_ENV === 'production') {
  console.warn(
    'Your production environment should use CSP with "block" mode. Read more from: https://www.sharetribe.com/docs/ftw-security/how-to-set-up-csp-for-ftw/'
  );
} else if (!cspEnabled) {
  console.warn(
    "CSP is currently not enabled! You should add an environment variable REACT_APP_CSP with the value 'report' or 'block'. Read more from: https://www.sharetribe.com/docs/ftw-security/how-to-set-up-csp-for-ftw/"
  );
}

// Export the function for server side rendering.
export default renderApp;

// exporting matchPathname and configureStore for server side rendering.
// matchPathname helps to figure out which route is called and if it has preloading needs
// configureStore is used for creating initial store state for Redux after preloading
export {
  matchPathname,
  configureStore,
  routeConfiguration,
  defaultConfig,
  mergeConfig,
  fetchAppAssets,
};
