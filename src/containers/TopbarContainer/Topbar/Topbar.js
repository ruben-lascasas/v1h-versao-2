import React, { useState, useEffect } from 'react';
import classNames from 'classnames';

import appSettings from '../../../config/settings';
import { useConfiguration } from '../../../context/configurationContext';
import { useRouteConfiguration } from '../../../context/routeConfigurationContext';

import { pickBy } from '../../../util/common';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { isMainSearchTypeKeywords, isOriginInUse } from '../../../util/search';
import { parse, stringify } from '../../../util/urlHelpers';
import { createResourceLocatorString, matchPathname, pathByRouteName } from '../../../util/routes';
import {
  Avatar,
  Button,
  IconArrowHead,
  LimitedAccessBanner,
  LinkedLogo,
  Modal,
  ModalMissingInformation,
} from '../../../components';
import { getSearchPageResourceLocatorStringParams } from '../../SearchPage/SearchPage.shared';

import MenuIcon from './MenuIcon';
import SearchIcon from './SearchIcon';
import TopbarSearchForm from './TopbarSearchForm/TopbarSearchForm';
import { setSearchHistoryUserId } from '../../../components/LocationAutocompleteInput/LocationAutocompleteInputImpl';
import TopbarMobileMenu from './TopbarMobileMenu/TopbarMobileMenu';
import TopbarMobileNav from './TopbarMobileNav/TopbarMobileNav';
import MobileBottomBar from './MobileBottomBar/MobileBottomBar';
import TopbarDesktop from './TopbarDesktop/TopbarDesktop';
import MobileCategoryTicker from './MobileCategoryTicker/MobileCategoryTicker';
import MobileSearchCard from './MobileSearchCard/MobileSearchCard';

import css from './Topbar.module.css';
import { getCurrentUserTypeRoles, showCreateListingLinkForUser } from '../../../util/userHelpers';
import WelcomeModal from '../../../components/WelcomeModal/WelcomeModal';

const MAX_MOBILE_SCREEN_WIDTH = 1024;

const SEARCH_DISPLAY_ALWAYS = 'always';
const SEARCH_DISPLAY_NOT_LANDING_PAGE = 'notLandingPage';
const SEARCH_DISPLAY_ONLY_SEARCH_PAGE = 'onlySearchPage';
const MOBILE_MENU_BUTTON_ID = 'mobileMenuButton';
const MOBILE_SEARCH_BUTTON_ID = 'mobileSearchButton';

const redirectToURLWithModalState = (history, location, modalStateParam) => {
  const { pathname, search, state } = location;
  const searchString = `?${stringify({ [modalStateParam]: 'open', ...parse(search) })}`;
  history.push(`${pathname}${searchString}`, state);
};

const redirectToURLWithoutModalState = (history, location, modalStateParam) => {
  const { pathname, search, state } = location;
  const queryParams = pickBy(parse(search), (v, k) => {
    return k !== modalStateParam;
  });
  const stringified = stringify(queryParams);
  const searchString = stringified ? `?${stringified}` : '';
  history.push(`${pathname}${searchString}`, state);
};

const isPrimary = o => o.group === 'primary';
const isSecondary = o => o.group === 'secondary';
const compareGroups = (a, b) => {
  const isAHigherGroupThanB = isPrimary(a) && isSecondary(b);
  const isALesserGroupThanB = isSecondary(a) && isPrimary(b);
  // Note: sort order is stable in JS
  return isAHigherGroupThanB ? -1 : isALesserGroupThanB ? 1 : 0;
};
// Returns links in order where primary links are returned first
const sortCustomLinks = customLinks => {
  const links = Array.isArray(customLinks) ? [...customLinks] : [];
  return links.sort(compareGroups);
};

// Resolves in-app links against route configuration
const getResolvedCustomLinks = (customLinks, routeConfiguration) => {
  const links = Array.isArray(customLinks) ? customLinks : [];
  return links.map(linkConfig => {
    const { type, href } = linkConfig;
    const isInternalLink = type === 'internal' || href.charAt(0) === '/';
    if (isInternalLink) {
      // Internal link
      try {
        const testURL = new URL('http://my.marketplace.com' + href);
        const matchedRoutes = matchPathname(testURL.pathname, routeConfiguration);
        if (matchedRoutes.length > 0) {
          const found = matchedRoutes[0];
          const to = { search: testURL.search, hash: testURL.hash };
          return {
            ...linkConfig,
            route: {
              name: found.route?.name,
              params: found.params,
              to,
            },
          };
        }
      } catch (e) {
        return linkConfig;
      }
    }
    return linkConfig;
  });
};

const isCMSPage = found =>
  found.route?.name === 'CMSPage' ? `CMSPage:${found.params?.pageId}` : null;
const isInboxPage = found =>
  found.route?.name === 'InboxPage' ? `InboxPage:${found.params?.tab}` : null;
// Find the name of the current route/pathname.
// It's used as handle for currentPage check.
const getResolvedCurrentPage = (location, routeConfiguration) => {
  const matchedRoutes = matchPathname(location.pathname, routeConfiguration);
  if (matchedRoutes.length > 0) {
    const found = matchedRoutes[0];
    const cmsPageName = isCMSPage(found);
    const inboxPageName = isInboxPage(found);
    return cmsPageName ? cmsPageName : inboxPageName ? inboxPageName : `${found.route?.name}`;
  }
};

const GenericError = props => {
  const { show } = props;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (show) {
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 5000);
      return () => clearTimeout(timer);
    }
  }, [show]);

  const classes = classNames(css.genericError, {
    [css.genericErrorVisible]: visible,
  });
  return visible ? (
    <div className={classes} role="alert" onClick={() => setVisible(false)} style={{ cursor: 'pointer' }}>
      <div className={css.genericErrorContent}>
        <p className={css.genericErrorText}>
          <FormattedMessage id="Topbar.genericError" />
        </p>
      </div>
    </div>
  ) : null;
};

const TopbarComponent = props => {
  const {
    className,
    rootClassName,
    desktopClassName,
    mobileRootClassName,
    mobileClassName,
    isAuthenticated,
    isLoggedInAs,
    authScopes = [],
    authInProgress,
    currentUser,
    currentUserHasListings,
    currentUserHasOrders,
    currentPage,
    notificationCount = 0,
    intl,
    history,
    location,
    onManageDisableScrolling,
    onResendVerificationEmail,
    sendVerificationEmailInProgress,
    sendVerificationEmailError,
    showGenericError,
    config,
    routeConfiguration,
  } = props;

  // Sync the search-history "active user" with the currently authenticated
  // user so all search bars across the site (topbar, hero, 404, profile…)
  // see only this user's recent searches and don't leak between accounts.
  useEffect(() => {
    setSearchHistoryUserId(currentUser?.id?.uuid || null);
  }, [currentUser?.id?.uuid]);

  // While the welcome flag is set, suppress the "verify your email" reminder
  // so the user sees Welcome first; the reminder reappears as soon as
  // Welcome closes. Re-read on every currentUser change because the Topbar
  // is already mounted when signup completes (the flag is set after).
  const [welcomePending, setWelcomePending] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readFlag = () => {
      try {
        setWelcomePending(window.localStorage.getItem('v1h_welcome_pending') === '1');
      } catch (_) { /* noop */ }
    };
    readFlag();
    // Listen for the custom event dispatched after signup so the suppression
    // kicks in immediately, even before currentUser updates.
    window.addEventListener('v1h:welcomeFlagSet', readFlag);
    return () => window.removeEventListener('v1h:welcomeFlagSet', readFlag);
  }, [currentUser?.id?.uuid]);

  const handleSubmit = values => {
    const { currentSearchParams, history, location, config, routeConfiguration } = props;

    const topbarSearchParams = () => {
      if (isMainSearchTypeKeywords(config)) {
        return { keywords: values?.keywords };
      }
      // Category filter submitted directly
      if (values?.pub_categoryLevel1) {
        return {
          pub_categoryLevel1: values.pub_categoryLevel1,
          keywords: undefined,
          address: undefined,
          bounds: undefined,
          origin: undefined,
        };
      }
      // Keyword search submitted directly (no location selected)
      if (values?.keywords) {
        return { keywords: values.keywords, address: undefined, bounds: undefined, origin: undefined };
      }
      const { search, selectedPlace } = values?.location || {};
      const { origin, bounds } = selectedPlace || {};
      const originMaybe = isOriginInUse(config) ? { origin } : {};
      return { ...originMaybe, address: search, bounds };
    };
    const searchParams = {
      ...currentSearchParams,
      ...topbarSearchParams(),
    };

    const { routeName, pathParams } = getSearchPageResourceLocatorStringParams(
      routeConfiguration,
      location
    );

    history.push(
      createResourceLocatorString(routeName, routeConfiguration, pathParams, searchParams)
    );
  };

  const handleLogout = () => {
    const { onLogout, history, routeConfiguration } = props;
    onLogout().then(() => {
      const path = pathByRouteName('LandingPage', routeConfiguration);

      // In production we ensure that data is really lost,
      // but in development mode we use stored values for debugging
      if (appSettings.dev) {
        history.push(path);
      } else if (typeof window !== 'undefined') {
        window.location = path;
      }

      console.log('logged out'); // eslint-disable-line
    });
  };

  const showCreateListingsLink = showCreateListingLinkForUser(config, currentUser);
  const { customer: isCustomer, provider: isProvider } = getCurrentUserTypeRoles(
    config,
    currentUser
  );

  /**
   * Determine which tab to use in the inbox link:
   * - if only provider role – sales
   * - if only customer role – orders
   * - if both roles – determine by currentUserHasListings value
   */
  const topbarInboxTab = !isCustomer
    ? 'sales'
    : !isProvider
    ? 'orders'
    : currentUserHasListings
    ? 'sales'
    : 'orders';

  const { mobilemenu, mobilesearch, mobilenav, keywords, address, origin, bounds, pub_categoryLevel1 } = parse(location.search, {
    latlng: ['origin'],
    latlngBounds: ['bounds'],
  });

  // When the search page is filtered by a single top-level category (and there
  // is no address/keywords yet), surface that category's name in the topbar
  // search input so the user can see what's being filtered + the live count.
  const categoryLabelForUrl = (() => {
    if (!pub_categoryLevel1 || keywords || address) return null;
    const slug = String(pub_categoryLevel1).split(',')[0].trim();
    if (!slug) return null;
    const cats = props.config?.categoryConfiguration?.categories || [];
    const found = cats.find(c => c.id === slug);
    return found ? found.name : null;
  })();

  // Custom links are sorted so that group="primary" are always at the beginning of the list.
  const sortedCustomLinks = sortCustomLinks(config.topbar?.customLinks);
  const customLinks = getResolvedCustomLinks(sortedCustomLinks, routeConfiguration);
  const resolvedCurrentPage = currentPage || getResolvedCurrentPage(location, routeConfiguration);

  const notificationDot = notificationCount > 0 ? <div className={css.notificationDot} /> : null;

  const hasMatchMedia = typeof window !== 'undefined' && window?.matchMedia;
  const isMobileLayout = hasMatchMedia
    ? window.matchMedia(`(max-width: ${MAX_MOBILE_SCREEN_WIDTH}px)`)?.matches
    : true;
  const isMobileMenuOpen = isMobileLayout && mobilemenu === 'open';
  const isMobileSearchOpen = isMobileLayout && mobilesearch === 'open';
  const isMobileNavOpen = isMobileLayout && mobilenav === 'open';

  const mobileMenu = (
    <TopbarMobileMenu
      isAuthenticated={isAuthenticated}
      currentUser={currentUser}
      onLogout={handleLogout}
      notificationCount={notificationCount}
      currentPage={resolvedCurrentPage}
      customLinks={customLinks}
      showCreateListingsLink={showCreateListingsLink}
      inboxTab={topbarInboxTab}
    />
  );

  const topbarSearcInitialValues = () => {
    if (isMainSearchTypeKeywords(config)) {
      return { keywords };
    }

    // Only render current search if full place object is available in the URL params
    const locationFieldsPresent = isOriginInUse(config)
      ? address && origin && bounds
      : address && bounds;
    if (locationFieldsPresent) {
      return {
        location: {
          search: address,
          selectedPlace: { address, origin, bounds },
        },
      };
    }
    // Fallback: if a keyword search was submitted via the location bar (no
    // selectedPlace), keep the typed text visible in the input so the user
    // sees what they searched for.
    if (keywords) {
      return {
        location: {
          search: keywords,
          selectedPlace: null,
        },
      };
    }
    // Category-only URL → show the category name in the input.
    if (categoryLabelForUrl) {
      return {
        location: {
          search: categoryLabelForUrl,
          selectedPlace: null,
        },
      };
    }
    return { location: null };
  };
  const initialSearchFormValues = topbarSearcInitialValues();

  const classes = classNames(rootClassName || css.root, className);

  const { display: searchFormDisplay = SEARCH_DISPLAY_ALWAYS } = config?.topbar?.searchBar || {};

  // Search form is shown conditionally depending on configuration and
  // the current page.
  const showSearchOnAllPages = searchFormDisplay === SEARCH_DISPLAY_ALWAYS;
  const showSearchOnSearchPage =
    searchFormDisplay === SEARCH_DISPLAY_ONLY_SEARCH_PAGE &&
    ['SearchPage', 'SearchPageWithListingType'].includes(resolvedCurrentPage);
  const showSearchNotOnLandingPage =
    searchFormDisplay === SEARCH_DISPLAY_NOT_LANDING_PAGE && resolvedCurrentPage !== 'LandingPage';

  const showSearchForm =
    showSearchOnAllPages || showSearchOnSearchPage || showSearchNotOnLandingPage;

  const mobileSearchButtonMaybe = showSearchForm ? (
    <Button
      id={MOBILE_SEARCH_BUTTON_ID}
      rootClassName={css.searchMenu}
      onClick={() => redirectToURLWithModalState(history, location, 'mobilesearch')}
      title={intl.formatMessage({ id: 'Topbar.searchIcon' })}
    >
      <SearchIcon
        className={css.searchMenuIcon}
        ariaLabel={intl.formatMessage({ id: 'Topbar.searchIcon' })}
      />
    </Button>
  ) : (
    <div className={css.searchMenu} />
  );

  const handleSkipToMainContent = e => {
    e.preventDefault();
    const mainContent = document.getElementById('main-content');
    if (mainContent) {
      mainContent.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Focus the main content for screen readers
      mainContent.setAttribute('tabindex', '-1');
      mainContent.focus();
      // Remove tabindex after blur to avoid tabbing into it later
      mainContent.addEventListener(
        'blur',
        () => {
          mainContent.removeAttribute('tabindex');
        },
        { once: true }
      );
    }
  };

  return (
    <div className={classes}>
      <Button onClick={handleSkipToMainContent} className={css.skipToMainContent}>
        <FormattedMessage id="Topbar.skipToMainContent" />
        <IconArrowHead direction="right" size="small" rootClassName={css.skiptoMainArrow} />
      </Button>
      <LimitedAccessBanner
        isAuthenticated={isAuthenticated}
        isLoggedInAs={isLoggedInAs}
        authScopes={authScopes}
        currentUser={currentUser}
        onLogout={handleLogout}
        currentPage={resolvedCurrentPage}
      />
      <nav className={classNames(mobileRootClassName || css.container, mobileClassName)}>
        <LinkedLogo
          id="logo-topbar-mobile"
          layout={'mobile'}
          alt={intl.formatMessage({ id: 'Topbar.logoIcon' })}
          linkToExternalSite={config?.topbar?.logoLink}
        />
        <div className={css.mobileActions}>
          <Button
            rootClassName={classNames(css.accountMenu, { [css.accountMenuNotLogged]: !isAuthenticated && resolvedCurrentPage === 'LandingPage' })}
            onClick={() => redirectToURLWithModalState(history, location, 'mobilemenu')}
            title={intl.formatMessage({ id: 'Topbar.accountIcon' })}
          >
            {isAuthenticated && currentUser ? (
              <Avatar
                className={css.accountMenuAvatar}
                user={currentUser}
                disableProfileLink
              />
            ) : (
              <svg
                className={css.accountMenuIcon}
                width="18"
                height="18"
                viewBox="0 0 18 18"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="9" cy="5.5" r="2.8" />
                <path d="M2.8 15.5c0-2.6 2.8-4.6 6.2-4.6s6.2 2 6.2 4.6" />
              </svg>
            )}
            {notificationDot}
          </Button>
          <Button
            id={MOBILE_MENU_BUTTON_ID}
            rootClassName={css.menu}
            onClick={() => redirectToURLWithModalState(history, location, 'mobilenav')}
            title={intl.formatMessage({ id: 'Topbar.menuIcon' })}
          >
            <MenuIcon
              className={css.menuIcon}
              ariaLabel={intl.formatMessage({ id: 'Topbar.menuIcon' })}
            />
          </Button>
        </div>
      </nav>
      {resolvedCurrentPage === 'LandingPage' ? (
        <>
          <MobileCategoryTicker />
          <MobileSearchCard />
        </>
      ) : null}
      <div className={css.desktop}>
        <TopbarDesktop
          className={desktopClassName}
          currentUserHasListings={currentUserHasListings}
          currentUser={currentUser}
          currentPage={resolvedCurrentPage}
          initialSearchFormValues={initialSearchFormValues}
          intl={intl}
          isAuthenticated={isAuthenticated}
          notificationCount={notificationCount}
          onLogout={handleLogout}
          onSearchSubmit={handleSubmit}
          config={config}
          customLinks={customLinks}
          showSearchForm={showSearchForm}
          showCreateListingsLink={showCreateListingsLink}
          inboxTab={topbarInboxTab}
        />
      </div>
      <Modal
        id="TopbarMobileMenu"
        containerClassName={css.modalContainer}
        isOpen={isMobileMenuOpen}
        onClose={() => redirectToURLWithoutModalState(history, location, 'mobilemenu')}
        usePortal
        lightCloseButton
        onManageDisableScrolling={onManageDisableScrolling}
        focusElementId={MOBILE_MENU_BUTTON_ID}
      >
        {authInProgress ? null : mobileMenu}
      </Modal>
      <Modal
        id="TopbarMobileNav"
        containerClassName={css.modalContainerNav}
        isOpen={isMobileNavOpen}
        onClose={() => redirectToURLWithoutModalState(history, location, 'mobilenav')}
        usePortal
        lightCloseButton
        onManageDisableScrolling={onManageDisableScrolling}
        focusElementId={MOBILE_MENU_BUTTON_ID}
      >
        <TopbarMobileNav currentPage={resolvedCurrentPage} />
      </Modal>
      <Modal
        id="TopbarMobileSearch"
        containerClassName={css.modalContainerSearchForm}
        isOpen={isMobileSearchOpen}
        onClose={() => redirectToURLWithoutModalState(history, location, 'mobilesearch')}
        usePortal
        onManageDisableScrolling={onManageDisableScrolling}
        focusElementId={MOBILE_SEARCH_BUTTON_ID}
      >
        <div className={css.searchContainer}>
          <TopbarSearchForm
            onSubmit={handleSubmit}
            initialValues={initialSearchFormValues}
            isMobile
            appConfig={config}
          />
          <p className={css.mobileHelp}>
            <FormattedMessage id="Topbar.mobileSearchHelp" />
          </p>
        </div>
      </Modal>
      {welcomePending ? null : (
        <ModalMissingInformation
          id="MissingInformationReminder"
          containerClassName={css.missingInformationModal}
          currentUser={currentUser}
          currentUserHasListings={currentUserHasListings}
          currentUserHasOrders={currentUserHasOrders}
          location={location}
          onManageDisableScrolling={onManageDisableScrolling}
          onResendVerificationEmail={onResendVerificationEmail}
          sendVerificationEmailInProgress={sendVerificationEmailInProgress}
          sendVerificationEmailError={sendVerificationEmailError}
        />
      )}

      <WelcomeModal onClose={() => setWelcomePending(false)} />

      <GenericError show={showGenericError} />
      {resolvedCurrentPage === 'LandingPage' ? <MobileBottomBar /> : null}
    </div>
  );
};

/**
 * Topbar containing logo, main search and navigation links.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {Object} props.desktopClassName add more style rules for TopbarDesktop
 * @param {Object} props.mobileRootClassName overwrite mobile layout root classes
 * @param {Object} props.mobileClassName add more style rules for mobile layout
 * @param {boolean} props.isAuthenticated
 * @param {boolean} props.isLoggedInAs
 * @param {Object} props.currentUser
 * @param {boolean} props.currentUserHasListings
 * @param {boolean} props.currentUserHasOrders
 * @param {string} props.currentPage
 * @param {number} props.notificationCount
 * @param {Function} props.onLogout
 * @param {Function} props.onManageDisableScrolling
 * @param {Function} props.onResendVerificationEmail
 * @param {Object} props.sendVerificationEmailInProgress
 * @param {Object} props.sendVerificationEmailError
 * @param {boolean} props.showGenericError
 * @param {Object} props.history
 * @param {Function} props.history.push
 * @param {Object} props.location
 * @param {string} props.location.search '?foo=bar'
 * @returns {JSX.Element} topbar component
 */
const Topbar = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();
  return (
    <TopbarComponent
      config={config}
      routeConfiguration={routeConfiguration}
      intl={intl}
      {...props}
    />
  );
};

export default Topbar;
