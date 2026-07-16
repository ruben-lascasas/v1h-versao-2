import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../../util/reactIntl';
import { LinkedLogo, NamedLink } from '../../../../components';
import { useLocale } from '../../../../context/localeContext';
import { useDarkMode } from '../../../../context/darkModeContext';

import css from './TopbarMobileNav.module.css';

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

const MoonIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

const SunIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
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
);

const MobileDarkModeToggle = () => {
  const { isDark, toggleDark } = useDarkMode();
  return (
    <div className={css.darkModeToggle}>
      <button
        type="button"
        className={classNames(css.darkModeOption, { [css.darkModeOptionActive]: !isDark })}
        onClick={() => { if (isDark) toggleDark(); }}
        aria-label="Modo claro"
      >
        <SunIcon />
      </button>
      <button
        type="button"
        className={classNames(css.darkModeOption, { [css.darkModeOptionActive]: isDark })}
        onClick={() => { if (!isDark) toggleDark(); }}
        aria-label="Modo escuro"
      >
        <MoonIcon />
      </button>
    </div>
  );
};

const NAV_LINKS = [
  { name: 'LandingPage',        intlId: 'TopbarMobileNav.homeLink' },
  { name: 'SearchPage',         intlId: 'TopbarMobileNav.searchLink' },
  { name: 'NewListingPage',     intlId: 'TopbarMobileNav.newListingLink' },
  { name: 'AboutPage',          intlId: 'TopbarMobileNav.aboutLink' },
  { name: 'ContactPage',        intlId: 'TopbarMobileNav.contactLink' },
  { name: 'ComoFuncionaPage',   intlId: 'TopbarMobileNav.faqLink', hash: '#faq' },
  { name: 'TermsOfServicePage', intlId: 'TopbarMobileNav.termsLink' },
  { name: 'PrivacyPolicyPage',  intlId: 'TopbarMobileNav.privacyLink' },
  { name: 'CookiePolicyPage',   intlId: 'TopbarMobileNav.cookiePolicyLink' },
];

const openCookiePrefs = () => {
  if (typeof window !== 'undefined' && typeof window.__v1hOpenCookiePrefs === 'function') {
    window.__v1hOpenCookiePrefs();
  }
};

const TopbarMobileNav = ({ currentPage }) => {
  const isCurrentPage = page => (currentPage === page ? css.currentPage : null);

  return (
    <nav className={css.root}>
      <div className={css.logoRow}>
        <LinkedLogo layout="desktop" logoClassName={css.logoImage} />
      </div>

      <MobileLanguageSwitcher />
      <MobileDarkModeToggle />

      <ul className={css.navLinks}>
        {NAV_LINKS.map(({ name, intlId, hash }) => (
          <li key={`${name}${hash || ''}`} className={classNames(css.navItem, isCurrentPage(name))}>
            <NamedLink name={name} {...(hash ? { to: { hash } } : {})}>
              <FormattedMessage id={intlId} />
            </NamedLink>
          </li>
        ))}
        <li className={css.navItem}>
          <button type="button" className={css.cookieSettingsButton} onClick={openCookiePrefs}>
            <FormattedMessage id="TopbarMobileNav.cookieSettingsLink" />
          </button>
        </li>
      </ul>

      <div className={css.spacer} />
    </nav>
  );
};

export default TopbarMobileNav;
