import React, { useEffect, useState } from 'react';

import { useLocale } from '../../context/localeContext';
import { NamedLink } from '..';

import css from './CookieConsent.module.css';

// Bump this when categories change to re-prompt all users.
const CONSENT_VERSION = 1;
const STORAGE_KEY = 'v1h_cookie_consent';

const DEFAULT_CONSENT = {
  essential: true,
  preferences: false,
  analytics: false,
  marketing: false,
};

export const readConsent = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
};

const writeConsent = consent => {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...consent, version: CONSENT_VERSION, savedAt: Date.now() })
    );
    window.dispatchEvent(new CustomEvent('v1h:consentChanged', { detail: consent }));
    // If user just granted analytics, the GA <script> needs the page reloaded
    // (or to be injected dynamically) since includeScripts skipped it on initial render.
    // Reload only when going from "no analytics" to "analytics granted" so the change is silent.
    if (consent.analytics && typeof window !== 'undefined') {
      const hadGA = !!window.gtag;
      if (!hadGA) {
        // Small delay so the modal animates out before reload.
        setTimeout(() => window.location.reload(), 250);
      }
    }
  } catch {}
};

export const hasConsent = category => {
  const c = readConsent();
  if (!c) return category === 'essential';
  return !!c[category];
};

const TEXT = {
  pt: {
    bannerTitle: 'Cookies neste site',
    bannerBody:
      'Usamos cookies essenciais para o site funcionar e, com o teu consentimento, cookies opcionais para preferências, analítica e marketing. Podes alterar a tua escolha a qualquer momento no rodapé.',
    learnMore: 'Saber mais na Política de Cookies',
    rejectAll: 'Recusar não-essenciais',
    customize: 'Personalizar',
    acceptAll: 'Aceitar tudo',
    modalTitle: 'Definições de cookies',
    modalIntro:
      'Escolhe quais categorias de cookies queres aceitar. Os cookies essenciais não podem ser desativados porque são necessários ao funcionamento do site.',
    catEssentialTitle: 'Essenciais',
    catEssentialDesc:
      'Sessão de login, segurança, prevenção de fraude no pagamento (Stripe). Sempre ativos.',
    catPreferencesTitle: 'Preferências',
    catPreferencesDesc:
      'Memorizar idioma escolhido, pesquisas recentes e outros ajustes que melhoram a tua experiência.',
    catAnalyticsTitle: 'Analítica',
    catAnalyticsDesc:
      'Estatísticas anónimas e agregadas (ex: Google Analytics) que nos ajudam a perceber como o site é usado e a melhorá-lo.',
    catMarketingTitle: 'Marketing',
    catMarketingDesc:
      'Personalização de comunicações e medição de campanhas publicitárias. Não usamos por defeito; só se ativares aqui.',
    save: 'Guardar escolhas',
    close: 'Fechar',
    enabled: 'Ativo',
    required: 'Obrigatório',
  },
  en: {
    bannerTitle: 'Cookies on this site',
    bannerBody:
      'We use essential cookies to make the site work and, with your consent, optional cookies for preferences, analytics and marketing. You can change your choice anytime from the footer.',
    learnMore: 'Read the Cookie Policy',
    rejectAll: 'Reject non-essential',
    customize: 'Customize',
    acceptAll: 'Accept all',
    modalTitle: 'Cookie settings',
    modalIntro:
      'Choose which categories of cookies you want to accept. Essential cookies cannot be disabled because they are required for the site to work.',
    catEssentialTitle: 'Essential',
    catEssentialDesc:
      'Login session, security, payment fraud prevention (Stripe). Always on.',
    catPreferencesTitle: 'Preferences',
    catPreferencesDesc:
      'Remember chosen language, recent searches and other tweaks that improve your experience.',
    catAnalyticsTitle: 'Analytics',
    catAnalyticsDesc:
      'Anonymous, aggregated statistics (e.g. Google Analytics) that help us understand how the site is used and improve it.',
    catMarketingTitle: 'Marketing',
    catMarketingDesc:
      'Personalised communications and advertising measurement. Off by default; only on if you enable it here.',
    save: 'Save choices',
    close: 'Close',
    enabled: 'On',
    required: 'Required',
  },
};

const Toggle = ({ checked, disabled, onChange, ariaLabel }) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    disabled={disabled}
    onClick={() => !disabled && onChange(!checked)}
    className={
      checked
        ? disabled
          ? `${css.toggle} ${css.toggleOn} ${css.toggleDisabled}`
          : `${css.toggle} ${css.toggleOn}`
        : css.toggle
    }
  >
    <span className={css.toggleKnob} />
  </button>
);

const CookieConsent = () => {
  const { locale } = useLocale();
  const t = TEXT[String(locale).toLowerCase().startsWith('pt') ? 'pt' : 'en'];

  const [bannerOpen, setBannerOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState(DEFAULT_CONSENT);

  // Decide whether to show the banner on first paint (client-only, avoids SSR mismatch).
  useEffect(() => {
    const existing = readConsent();
    if (!existing) setBannerOpen(true);
    else setDraft(existing);
  }, []);

  // Footer link / external code can call window.__v1hOpenCookiePrefs() to reopen the modal.
  useEffect(() => {
    const open = () => {
      const existing = readConsent() || DEFAULT_CONSENT;
      setDraft({
        essential: true,
        preferences: !!existing.preferences,
        analytics: !!existing.analytics,
        marketing: !!existing.marketing,
      });
      setModalOpen(true);
    };
    window.__v1hOpenCookiePrefs = open;
    return () => {
      try {
        delete window.__v1hOpenCookiePrefs;
      } catch {}
    };
  }, []);

  const acceptAll = () => {
    const all = { essential: true, preferences: true, analytics: true, marketing: true };
    writeConsent(all);
    setBannerOpen(false);
    setModalOpen(false);
  };
  const rejectNonEssential = () => {
    const min = { essential: true, preferences: false, analytics: false, marketing: false };
    writeConsent(min);
    setBannerOpen(false);
    setModalOpen(false);
  };
  const saveDraft = () => {
    writeConsent({ ...draft, essential: true });
    setBannerOpen(false);
    setModalOpen(false);
  };
  const openCustomize = () => {
    setDraft(prev => ({ ...prev, essential: true }));
    setModalOpen(true);
  };

  if (!bannerOpen && !modalOpen) return null;

  return (
    <>
      {bannerOpen && !modalOpen && (
        <div className={css.banner} role="dialog" aria-live="polite" aria-label={t.bannerTitle}>
          <div className={css.bannerInner}>
            <div className={css.bannerText}>
              <strong className={css.bannerTitle}>{t.bannerTitle}</strong>
              <p className={css.bannerBody}>{t.bannerBody}</p>
              <NamedLink name="CookiePolicyPage" className={css.bannerLink}>
                {t.learnMore}
              </NamedLink>
            </div>
            <div className={css.bannerActions}>
              <button
                type="button"
                className={css.btnSecondary}
                onClick={rejectNonEssential}
              >
                {t.rejectAll}
              </button>
              <button type="button" className={css.btnSecondary} onClick={openCustomize}>
                {t.customize}
              </button>
              <button type="button" className={css.btnPrimary} onClick={acceptAll}>
                {t.acceptAll}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOpen && (
        <div
          className={css.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label={t.modalTitle}
          onClick={e => {
            if (e.target === e.currentTarget) setModalOpen(false);
          }}
        >
          <div className={css.modal}>
            <div className={css.modalHeader}>
              <h2 className={css.modalTitle}>{t.modalTitle}</h2>
              <button
                type="button"
                className={css.modalClose}
                onClick={() => setModalOpen(false)}
                aria-label={t.close}
              >
                ×
              </button>
            </div>
            <p className={css.modalIntro}>{t.modalIntro}</p>

            <div className={css.categoryList}>
              <CategoryRow
                title={t.catEssentialTitle}
                desc={t.catEssentialDesc}
                checked
                disabled
                badge={t.required}
                onChange={() => {}}
                t={t}
              />
              <CategoryRow
                title={t.catPreferencesTitle}
                desc={t.catPreferencesDesc}
                checked={draft.preferences}
                onChange={v => setDraft(d => ({ ...d, preferences: v }))}
                t={t}
              />
              <CategoryRow
                title={t.catAnalyticsTitle}
                desc={t.catAnalyticsDesc}
                checked={draft.analytics}
                onChange={v => setDraft(d => ({ ...d, analytics: v }))}
                t={t}
              />
              <CategoryRow
                title={t.catMarketingTitle}
                desc={t.catMarketingDesc}
                checked={draft.marketing}
                onChange={v => setDraft(d => ({ ...d, marketing: v }))}
                t={t}
              />
            </div>

            <div className={css.modalActions}>
              <button type="button" className={css.btnSecondary} onClick={rejectNonEssential}>
                {t.rejectAll}
              </button>
              <button type="button" className={css.btnSecondary} onClick={acceptAll}>
                {t.acceptAll}
              </button>
              <button type="button" className={css.btnPrimary} onClick={saveDraft}>
                {t.save}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

const CategoryRow = ({ title, desc, checked, disabled, badge, onChange, t }) => (
  <div className={css.categoryRow}>
    <div className={css.categoryText}>
      <div className={css.categoryHead}>
        <strong className={css.categoryTitle}>{title}</strong>
        {badge && <span className={css.categoryBadge}>{badge}</span>}
      </div>
      <p className={css.categoryDesc}>{desc}</p>
    </div>
    <Toggle
      checked={!!checked}
      disabled={!!disabled}
      onChange={onChange}
      ariaLabel={title}
    />
  </div>
);

export default CookieConsent;
