import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import { FormattedMessage } from '../../../../util/reactIntl';
import { ACCOUNT_SETTINGS_PAGES } from '../../../../routing/routeConfiguration';
import {
  Avatar,
  InlineTextButton,
  Menu,
  MenuLabel,
  MenuContent,
  MenuItem,
  NamedLink,
} from '../../../../components';

import TopbarSearchForm from '../TopbarSearchForm/TopbarSearchForm';
import CustomLinksMenu from './CustomLinksMenu/CustomLinksMenu';
import { useLocale } from '../../../../context/localeContext';
import { useDarkMode } from '../../../../context/darkModeContext';
import { updateLastOnline } from '../../../../ducks/follow.duck';
import { checkNewListingsFromFollowed } from '../../../../ducks/notifications.duck';
import { fetchCurrentUserNotifications } from '../../../../ducks/user.duck';

import logoBlack from '../../../../assets/images/V1H-LOGO-BLACK.png';
import css from './TopbarDesktop.module.css';

const LanguageSwitcher = () => {
  const { locale, setLocale } = useLocale();
  const currentLang = locale === 'pt' ? 'PT' : 'EN';
  const languages = ['PT', 'EN'];

  // `translate="no"` + the `notranslate` class tell browser auto-translators
  // (Chrome/Edge "Translate this page", Google Translate widget) to skip these
  // labels — otherwise they translate "EN" into "PT" and the dropdown ends up
  // showing "PT" twice.
  return (
    <Menu>
      <MenuLabel className={css.langSwitcherLabel} isOpenClassName={css.langSwitcherOpen}>
        <span className={`${css.langSwitcherText} notranslate`} translate="no">{currentLang}</span>
        <span className={css.langSwitcherArrow}>▾</span>
      </MenuLabel>
      <MenuContent className={css.langSwitcherContent}>
        {languages.map(lang => (
          <MenuItem key={lang}>
            <button
              className={classNames(css.langOption, 'notranslate', { [css.langOptionActive]: lang === currentLang })}
              translate="no"
              onClick={() => setLocale(lang.toLowerCase())}
            >
              {lang}
            </button>
          </MenuItem>
        ))}
      </MenuContent>
    </Menu>
  );
};

const DarkModeToggle = () => {
  const { isDark, toggleDark } = useDarkMode();
  return (
    <button
      type="button"
      className={css.darkToggle}
      onClick={toggleDark}
      aria-label={isDark ? 'Desativar modo escuro' : 'Ativar modo escuro'}
      title={isDark ? 'Modo claro' : 'Modo escuro'}
    >
      {isDark ? (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ) : (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
};

const SignupLink = ({ from, currentPage }) => (
  <NamedLink
    id="signup-link"
    name="SignupPage"
    to={{ state: { from } }}
    className={classNames(css.signupLink, { [css.activeSignupLink]: currentPage === 'SignupPage' })}
  >
    <FormattedMessage id="TopbarDesktop.signup" />
  </NamedLink>
);

const HelpLink = ({ currentPage, intl }) => (
  <NamedLink
    name="ContactPage"
    className={classNames(css.helpLink, { [css.activeHelpLink]: currentPage === 'ContactPage' })}
    title={intl.formatMessage({ id: 'TopbarDesktop.helpLink' })}
  >
    <svg
      className={css.helpIcon}
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  </NamedLink>
);

const LoginLink = ({ from, currentPage }) => (
  <NamedLink
    id="login-link"
    name="LoginPage"
    to={{ state: { from } }}
    className={classNames(css.loginLink, { [css.activeTopbarLink]: currentPage === 'LoginPage' })}
  >
    <FormattedMessage id="TopbarDesktop.login" />
  </NamedLink>
);

const InboxLink = ({ notificationCount, inboxTab, currentPage }) => {
  const badge = notificationCount > 0
    ? <span className={css.notificationBadge}>{notificationCount > 4 ? '4+' : notificationCount}</span>
    : null;
  const isActive = currentPage?.startsWith('InboxPage');
  return (
    <NamedLink
      id="inbox-link"
      className={classNames(css.topbarLink, { [css.activeTopbarLink]: isActive })}
      name="InboxPage"
      params={{ tab: inboxTab }}
    >
      <span className={css.topbarLinkLabel}>
        <FormattedMessage id="TopbarDesktop.inbox" />
        {badge}
      </span>
    </NamedLink>
  );
};

const ProfileMenu = ({ currentPage, currentUser, onLogout, showManageListingsLink, intl }) => {
  const location = useLocation();
  const isOwnProfilePage =
    currentPage === 'ProfilePage' &&
    currentUser?.id?.uuid &&
    location.pathname.includes(currentUser.id.uuid);

  const currentPageClass = page => {
    const isAccountSettingsPage =
      page === 'AccountSettingsPage' && ACCOUNT_SETTINGS_PAGES.includes(currentPage);
    if (page === 'ProfilePage') return isOwnProfilePage ? css.currentPage : null;
    return currentPage === page || isAccountSettingsPage ? css.currentPage : null;
  };

  return (
    <Menu skipFocusOnNavigation={true} contentPosition="left">
      <MenuLabel
        id="profile-menu-label"
        className={css.profileMenuLabel}
        isOpenClassName={css.profileMenuIsOpen}
        ariaLabel={intl.formatMessage({ id: 'TopbarDesktop.screenreader.profileMenu' })}
      >
        <Avatar className={css.avatar} user={currentUser} disableProfileLink initialsClassName={css.avatarInitials} />
      </MenuLabel>
      <MenuContent className={css.profileMenuContent}>
        {currentUser?.id?.uuid ? (
          <MenuItem key="ProfilePage">
            <NamedLink
              className={classNames(css.menuLink, currentPageClass('ProfilePage'))}
              name="ProfilePage"
              params={{ id: currentUser.id.uuid }}
            >
              <span className={css.menuItemBorder} />
              <FormattedMessage id="TopbarDesktop.viewProfileLink" />
            </NamedLink>
          </MenuItem>
        ) : null}
        <MenuItem key="AccountSettingsPage">
          <NamedLink className={classNames(css.menuLink, currentPageClass('AccountSettingsPage'))} name="AccountSettingsPage">
              <span className={css.menuItemBorder} />
              <FormattedMessage id="TopbarDesktop.accountSettingsLink" />
          </NamedLink>
        </MenuItem>
        {showManageListingsLink ? (
          <MenuItem key="ManageListingsPage2">
            <NamedLink className={classNames(css.menuLink, currentPageClass('ManageListingsPage'))} name="ManageListingsPage">
              <span className={css.menuItemBorder} />
              <FormattedMessage id="TopbarDesktop.yourListingsLink" />
            </NamedLink>
          </MenuItem>
        ) : null}
        <MenuItem key="FavoritesPage">
          <NamedLink className={classNames(css.menuLink, currentPageClass('FavoritesPage'))} name="FavoritesPage">
            <span className={css.menuItemBorder} />
            <FormattedMessage id="TopbarDesktop.yourFavoritesLink" />
          </NamedLink>
        </MenuItem>
        <MenuItem key="HistoricoReservasPage">
          <NamedLink className={classNames(css.menuLink, currentPageClass('HistoricoReservasPage'))} name="HistoricoReservasPage">
            <span className={css.menuItemBorder} />
            <FormattedMessage id="TopbarDesktop.historicoReservasLink" />
          </NamedLink>
        </MenuItem>
        <MenuItem key="SavedSearchesPage">
          <NamedLink className={classNames(css.menuLink, currentPageClass('SavedSearchesPage'))} name="SavedSearchesPage">
            <span className={css.menuItemBorder} />
            <FormattedMessage id="TopbarDesktop.savedSearchesLink" defaultMessage="Pesquisas guardadas" />
          </NamedLink>
        </MenuItem>
        <MenuItem key="FollowingPage">
          <NamedLink className={classNames(css.menuLink, currentPageClass('FollowingPage'))} name="FollowingPage">
            <span className={css.menuItemBorder} />
            <FormattedMessage id="TopbarDesktop.followingLink" />
          </NamedLink>
        </MenuItem>
        <MenuItem key="help">
          <NamedLink className={classNames(css.menuLink, currentPageClass('ContactPage'))} name="ContactPage">
            <span className={css.menuItemBorder} />
            <FormattedMessage id="TopbarDesktop.helpLink" />
          </NamedLink>
        </MenuItem>
        <MenuItem key="logout">
          <InlineTextButton rootClassName={css.logoutButton} onClick={onLogout}>
            <span className={css.menuItemBorder} />
            <FormattedMessage id="TopbarDesktop.logout" />
          </InlineTextButton>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
};

const TopbarDesktop = props => {
  const {
    className,
    config,
    customLinks,
    currentUser,
    currentPage,
    rootClassName,
    notificationCount = 0,
    intl,
    isAuthenticated,
    onLogout,
    onSearchSubmit,
    initialSearchFormValues = {},
    showSearchForm,
    showCreateListingsLink,
    inboxTab,
  } = props;

  const location = useLocation();
  const currentFrom = location.pathname + location.search;
  const [mounted, setMounted] = useState(false);
  const dispatch = useDispatch();

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isAuthenticated) {
      dispatch(updateLastOnline());
      const userId = currentUser?.id?.uuid;
      if (userId) dispatch(checkNewListingsFromFollowed(userId));
      dispatch(fetchCurrentUserNotifications());
    }
  }, [location.pathname, isAuthenticated]);

  const authenticatedOnClientSide = mounted && isAuthenticated;
  const isAuthenticatedOrJustHydrated = isAuthenticated || !mounted;
  const classes = classNames(rootClassName || css.root, className);

  return (
    <nav className={classes} aria-label={intl.formatMessage({ id: 'TopbarDesktop.screenreader.topbarNavigation' })}>

      {/* Logo — always force a navigation back to the landing page, even
          when the user is already on it (a refresh) so it never feels dead. */}
      <a
        href="/"
        className={css.logoLink}
        onClick={e => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
          e.preventDefault();
          if (typeof window !== 'undefined') {
            // Hard navigation back to the landing page so the page reliably
            // refreshes / scrolls to top regardless of where the user was.
            window.location.assign('/');
          }
        }}
      >
        <img src={logoBlack} alt="Venue1Hub" className={css.logoImage} />
      </a>

      {/* Search */}
      {showSearchForm ? (
        <TopbarSearchForm
          className={css.searchLink}
          desktopInputRoot={css.topbarSearchWithLeftPadding}
          onSubmit={onSearchSubmit}
          initialValues={initialSearchFormValues}
          appConfig={config}
        />
      ) : (
        <div className={classNames(css.spacer, css.topbarSearchWithLeftPadding)} />
      )}

      {/* Language switcher + dark mode toggle */}
      <LanguageSwitcher />
      <DarkModeToggle />
      <span className={css.navDivider} />

      {/* Custom links (Publicar) */}
      <CustomLinksMenu
        currentPage={currentPage}
        customLinks={customLinks}
        intl={intl}
        hasClientSideContentReady={authenticatedOnClientSide || !isAuthenticatedOrJustHydrated}
        showCreateListingsLink={showCreateListingsLink}
      />

      {/* Auth links */}
      {authenticatedOnClientSide ? (
        <span className={css.navDivider} />
      ) : null}
      {authenticatedOnClientSide ? (
        <InboxLink notificationCount={notificationCount} inboxTab={inboxTab} currentPage={currentPage} />
      ) : null}

      {authenticatedOnClientSide ? (
        <span className={css.navDivider} />
      ) : null}
      {authenticatedOnClientSide ? (
        <ProfileMenu
          currentPage={currentPage}
          currentUser={currentUser}
          onLogout={onLogout}
          showManageListingsLink={showCreateListingsLink}
          intl={intl}
        />
      ) : null}

      {!isAuthenticatedOrJustHydrated ? <span className={css.navDivider} /> : null}
      {!isAuthenticatedOrJustHydrated ? <LoginLink from={currentFrom} currentPage={currentPage} /> : null}
      {!isAuthenticatedOrJustHydrated ? <span className={css.navDivider} /> : null}
      {!isAuthenticatedOrJustHydrated ? <SignupLink from={currentFrom} currentPage={currentPage} /> : null}
      {!isAuthenticatedOrJustHydrated ? <span className={css.navDivider} /> : null}
      {!isAuthenticatedOrJustHydrated ? <HelpLink currentPage={currentPage} intl={intl} /> : null}

    </nav>
  );
};

export default TopbarDesktop;
