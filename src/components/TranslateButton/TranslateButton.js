import React, { useState } from 'react';
import { useLocale } from '../../context/localeContext';
import css from './TranslateButton.module.css';

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

const TranslateButton = ({ text, onResult, isShowingOriginal = true }) => {
  const { locale } = useLocale();
  const target = locale === 'en' ? 'en' : 'pt';
  const isEN = target === 'en';

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [cached, setCached] = useState(null);

  const handleClick = async () => {
    setError(null);
    if (!isShowingOriginal) {
      onResult(null);
      return;
    }
    if (cached) {
      onResult(cached);
      return;
    }
    if (!text || typeof text !== 'string') return;
    setBusy(true);
    try {
      const url =
        GOOGLE_TRANSLATE_URL +
        `?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(text.trim())}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error('upstream-failed');
      const data = await res.json();
      const translated = data?.[0]?.map(chunk => chunk?.[0] || '').join('') || '';
      if (!translated) throw new Error('no-translation');
      setCached(translated);
      onResult(translated);
    } catch (_) {
      setError(
        isEN ? 'Translation failed. Try again.' : 'Tradução falhou. Tenta de novo.'
      );
    } finally {
      setBusy(false);
    }
  };

  const label = busy
    ? isEN ? 'Translating…' : 'A traduzir…'
    : isShowingOriginal
      ? isEN ? 'Translate' : 'Traduzir'
      : isEN ? 'See original' : 'Ver original';

  return (
    <>
      <button
        type="button"
        className={css.root}
        onClick={handleClick}
        disabled={busy || !text}
      >
        {label}
      </button>
      {error ? <span className={css.error}>{error}</span> : null}
    </>
  );
};

export default TranslateButton;
