import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';

import { useLocale } from '../../context/localeContext';

import css from './DestacarPromptModal.module.css';

const STORAGE_KEY = 'v1h_pending_destacar_prompt';

const t = (isEN, pt, en) => (isEN ? en : pt);

const clearFlag = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* ignore */ }
};

const BoostIcon = () => (
  <svg width="140" height="140" viewBox="0 0 140 140" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    {/* Soft circular halo behind the bolt — brand cream tint. */}
    <circle cx="70" cy="70" r="56" fill="#F5EDE2" />
    {/* Lightning bolt body — same shape used as the destaque badge across the site. */}
    <path
      d="M78 22 L42 78 L66 78 L58 116 L100 56 L74 56 L82 22 Z"
      fill="#F5C84B"
      stroke="#BAA38A"
      strokeWidth="3"
      strokeLinejoin="round"
    />
    {/* Sparkles around the bolt. */}
    <path d="M22 38 L25 44 L31 47 L25 50 L22 56 L19 50 L13 47 L19 44 Z" fill="#F5C84B" />
    <path d="M118 32 L120 37 L125 39 L120 41 L118 46 L116 41 L111 39 L116 37 Z" fill="#F5C84B" />
    <path d="M122 92 L124 96 L128 98 L124 100 L122 104 L120 100 L116 98 L120 96 Z" fill="#BAA38A" />
    <path d="M28 102 L30 106 L34 108 L30 110 L28 114 L26 110 L22 108 L26 106 Z" fill="#BAA38A" />
  </svg>
);

/**
 * Modal shown after a user creates or edits a listing, prompting them to
 * feature it. The trigger is a localStorage flag set by EditListingPage on a
 * successful publish/update — we listen for it on mount and show ourselves.
 *
 * Mounted inside ListingPage so it pops up exactly when the user lands there
 * after finishing the wizard.
 */
const DestacarPromptModal = ({ listingId }) => {
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const history = useHistory();

  const [open, setOpen] = useState(false);
  const [storedId, setStoredId] = useState(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let pending = null;
    try { pending = window.localStorage.getItem(STORAGE_KEY); } catch (_) {}
    if (pending) {
      setStoredId(pending);
      setOpen(true);
    }
  }, []);

  if (!open) return null;

  const close = () => {
    clearFlag();
    setOpen(false);
  };

  const goDestacar = () => {
    clearFlag();
    setOpen(false);
    const id = storedId || listingId;
    const url = id ? `/destacar-anuncio?listing=${encodeURIComponent(id)}` : '/destacar-anuncio';
    history.push(url);
  };

  return (
    <div className={css.overlay} role="dialog" aria-modal="true">
      <div className={css.modal}>
        <button
          type="button"
          className={css.closeBtn}
          onClick={close}
          aria-label={t(isEN, 'Fechar', 'Close')}
        >×</button>
        <div className={css.chartWrap}><BoostIcon /></div>
        <h3 className={css.title}>
          {t(isEN, 'Recebe mais visualizações', 'Get more views')}
        </h3>
        <p className={css.message}>
          {t(isEN,
            'Aumenta a visibilidade do teu anúncio com destaques e chega até mais compradores.',
            'Boost your listing’s visibility and reach more buyers.'
          )}
        </p>
        <button type="button" className={css.primaryBtn} onClick={goDestacar}>
          {t(isEN, 'Destacar', 'Feature it')}
        </button>
        <button type="button" className={css.skipBtn} onClick={close}>
          {t(isEN, 'Saltar', 'Skip')}
        </button>
      </div>
    </div>
  );
};

export default DestacarPromptModal;
