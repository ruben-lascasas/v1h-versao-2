/**
 *  TopbarMobileMenu prints the menu content for authenticated user or
 * shows login actions for those who are not authenticated.
 */
import React from 'react';
import { useLocation } from 'react-router-dom';
import classNames from 'classnames';

import { ACCOUNT_SETTINGS_PAGES } from '../../../../routing/routeConfiguration';
import { FormattedMessage } from '../../../../util/reactIntl';
import { ensureCurrentUser } from '../../../../util/data';

import {
  AvatarLarge,
  ExternalLink,
  InlineTextButton,
  LinkedLogo,
  NamedLink,
  NotificationBadge,
} from '../../../../components';

import { useLocale } from '../../../../context/localeContext';

import css from './TopbarMobileMenu.module.css';

const MobileLanguageSwitcher = () => {
  const { locale, setLocale } = useLocale();
  const languages = ['PT', 'EN'];
  return (
    <div className={css.langSwitcher}>
      {languages.map(lang => {
        const code = lang.toLowerCase();
        const isActive = locale === code;
        return (
          <button
            key={lang}
            type="button"
            translate="no"
            className={classNames(css.langOption, 'notranslate', { [css.langOptionActive]: isActive })}
            onClick={() => setLocale(code)}
          >
            {lang}
          </button>
        );
      })}
    </div>
  );
};

const CustomLinkComponent = ({ linkConfig, currentPage }) => {
  const { group, text, type, href, route } = linkConfig;
  const getCurrentPageClass = page => {
    const hasPageName = name => currentPage?.indexOf(name) === 0;
    const isCMSPage = pageId => hasPageName('CMSPage') && currentPage === `${page}:${pageId}`;
    const isInboxPage = tab => hasPageName('InboxPage') && currentPage === `${page}:${tab}`;
    const isCurrentPage = currentPage === page;

    return isCMSPage(route?.params?.pageId) || isInboxPage(route?.params?.tab) || isCurrentPage
      ? css.currentPage
      : null;
  };

  // Note: if the config contains 'route' keyword,
  // then in-app linking config has been resolved already.
  if (type === 'internal' && route) {
    // Internal link
    const { name, params, to } = route || {};
    const className = classNames(css.navigationLink, getCurrentPageClass(name));
    return (
      <li className={className}>
        <NamedLink name={name} params={params} to={to}>
          <span className={css.menuItemBorder} />
          {text}
        </NamedLink>
      </li>
    );
  }
  return (
    <li className={css.navigationLink}>
      <ExternalLink href={href}>
        <span className={css.menuItemBorder} />
        {text}
      </ExternalLink>
    </li>
  );
};

/**
 * Menu for mobile layout (opens through hamburger icon)
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.isAuthenticated
 * @param {string?} props.currentPage
 * @param {boolean} props.currentUserHasListings
 * @param {Object?} props.currentUser API entity
 * @param {number} props.notificationCount
 * @param {Array<Object>} props.customLinks Contains object like { group, text, type, href, route }
 * @param {Function} props.onLogout
 * @returns {JSX.Element} search icon
 */
const TopbarMobileMenu = props => {
  const {
    isAuthenticated,
    currentPage,
    inboxTab,
    currentUser,
    notificationCount = 0,
    customLinks,
    onLogout,
    showCreateListingsLink,
  } = props;

  const location = useLocation();
  const currentFrom = location.pathname + location.search;
  const user = ensureCurrentUser(currentUser);

  const currentPageClass = page => {
    const isAccountSettingsPage =
      page === 'AccountSettingsPage' && ACCOUNT_SETTINGS_PAGES.includes(currentPage);
    const isInboxPage = currentPage?.indexOf('InboxPage') === 0 && page?.indexOf('InboxPage') === 0;
    return currentPage === page || isAccountSettingsPage || isInboxPage ? css.currentPage : null;
  };

  const extraLinks = customLinks.map((linkConfig, index) => {
    return (
      <CustomLinkComponent
        key={`${linkConfig.text}_${index}`}
        linkConfig={linkConfig}
        currentPage={currentPage}
      />
    );
  });

  const createListingsLinkMaybe = showCreateListingsLink ? (
    <NamedLink className={css.createNewListingLink} name="NewListingPage">
      <FormattedMessage id="TopbarMobileMenu.newListingLink" />
    </NamedLink>
  ) : null;

  if (!isAuthenticated) {
    return (
      <nav className={css.root}>
        <div className={css.unauthContent}>
          <div className={css.unauthLogo}>
            <LinkedLogo layout="desktop" logoClassName={css.logoImage} />
          </div>

          <div className={css.unauthHeading}>
            <FormattedMessage id="TopbarMobileMenu.unauthTitle" />
          </div>
          <p className={css.unauthSubtitle}>
            <FormattedMessage id="TopbarMobileMenu.unauthSubtitle" />
          </p>

          <div className={css.authButtons}>
            <NamedLink
              name="SignupPage"
              to={{ state: { from: currentFrom } }}
              className={css.signupButton}
            >
              <FormattedMessage id="TopbarMobileMenu.signupLink" />
            </NamedLink>

            <div className={css.divider}>
              <span className={css.dividerLine} />
              <span className={css.dividerText}>
                <FormattedMessage id="TopbarMobileMenu.or" />
              </span>
              <span className={css.dividerLine} />
            </div>

            <NamedLink
              name="LoginPage"
              to={{ state: { from: currentFrom } }}
              className={css.loginButton}
            >
              <FormattedMessage id="TopbarMobileMenu.loginLink" />
            </NamedLink>
          </div>

          {extraLinks.length > 0 && (
            <ul className={css.customLinksWrapper}>{extraLinks}</ul>
          )}
        </div>
      </nav>
    );
  }

  const notificationCountBadge =
    notificationCount > 0 ? (
      <NotificationBadge className={css.notificationBadge} count={notificationCount} />
    ) : null;

  const displayName = user.attributes.profile.firstName;

  const publicarAnuncioLinkMaybe = (
    <li className={classNames(css.navigationLink, currentPageClass('NewListingPage'))}>
      <NamedLink name="NewListingPage">
        <FormattedMessage id="TopbarDesktop.createListing" />
      </NamedLink>
    </li>
  );

  const meuPerfilLinkMaybe = user?.id?.uuid ? (
    <li className={classNames(css.navigationLink, currentPageClass('ProfilePage'))}>
      <NamedLink name="ProfilePage" params={{ id: user.id.uuid }}>
        <FormattedMessage id="TopbarDesktop.viewProfileLink" />
      </NamedLink>
    </li>
  ) : null;

  const manageListingsLinkMaybe = showCreateListingsLink ? (
    <li className={classNames(css.navigationLink, currentPageClass('ManageListingsPage'))}>
      <NamedLink name="ManageListingsPage">
        <FormattedMessage id="TopbarMobileMenu.yourListingsLink" />
      </NamedLink>
    </li>
  ) : null;

  return (
    <div className={css.root}>
      <div className={css.content}>
        <AvatarLarge className={css.avatar} user={currentUser} />
        <span className={css.greeting}>
          <FormattedMessage id="TopbarMobileMenu.greeting" values={{ displayName }} />
        </span>
        <InlineTextButton rootClassName={css.logoutButton} onClick={onLogout}>
          <FormattedMessage id="TopbarMobileMenu.logoutLink" />
        </InlineTextButton>

        <ul className={css.accountLinksWrapper}>
          {publicarAnuncioLinkMaybe}
          <li className={classNames(css.inbox, currentPageClass(`InboxPage:${inboxTab}`))}>
            <NamedLink name="InboxPage" params={{ tab: inboxTab }}>
              <FormattedMessage id="TopbarMobileMenu.inboxLink" />
              {notificationCountBadge}
            </NamedLink>
          </li>
          {meuPerfilLinkMaybe}
          <li className={classNames(css.navigationLink, currentPageClass('AccountSettingsPage'))}>
            <NamedLink name="AccountSettingsPage">
              <FormattedMessage id="TopbarMobileMenu.accountSettingsLink" />
            </NamedLink>
          </li>
          {manageListingsLinkMaybe}
          <li className={classNames(css.navigationLink, currentPageClass('FavoritesPage'))}>
            <NamedLink name="FavoritesPage">
              <FormattedMessage id="TopbarMobileMenu.yourFavoritesLink" />
            </NamedLink>
          </li>
          <li className={classNames(css.navigationLink, currentPageClass('HistoricoReservasPage'))}>
            <NamedLink name="HistoricoReservasPage">
              <FormattedMessage id="TopbarMobileMenu.historicoReservasLink" />
            </NamedLink>
          </li>
          <li className={classNames(css.navigationLink, currentPageClass('SavedSearchesPage'))}>
            <NamedLink name="SavedSearchesPage">
              <FormattedMessage id="TopbarDesktop.savedSearchesLink" />
            </NamedLink>
          </li>
          <li className={classNames(css.navigationLink, currentPageClass('FollowingPage'))}>
            <NamedLink name="FollowingPage">
              <FormattedMessage id="TopbarDesktop.followingLink" />
            </NamedLink>
          </li>
          <li className={classNames(css.navigationLink, currentPageClass('ContactPage'))}>
            <NamedLink name="ContactPage">
              <FormattedMessage id="TopbarMobileMenu.helpLink" />
            </NamedLink>
          </li>
        </ul>

        {extraLinks.length > 0 && (
          <ul className={css.customLinksWrapper}>{extraLinks}</ul>
        )}

        <div className={css.spacer} />
      </div>
    </div>
  );
};

export default TopbarMobileMenu;
