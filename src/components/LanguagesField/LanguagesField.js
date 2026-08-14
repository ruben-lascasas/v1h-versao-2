import React from 'react';
import { Field } from 'react-final-form';
import { useLocale } from '../../context/localeContext';
import css from './LanguagesField.module.css';

// `country` is the ISO country code used by the flag-icons library — same one
// used in ContactDetailsForm for the phone number country picker.
export const LANGUAGES = [
  { code: 'pt', country: 'pt', pt: 'Português', en: 'Portuguese' },
  { code: 'en', country: 'gb', pt: 'Inglês',     en: 'English' },
  { code: 'es', country: 'es', pt: 'Espanhol',   en: 'Spanish' },
  { code: 'fr', country: 'fr', pt: 'Francês',    en: 'French' },
  { code: 'de', country: 'de', pt: 'Alemão',     en: 'German' },
  { code: 'it', country: 'it', pt: 'Italiano',   en: 'Italian' },
  { code: 'nl', country: 'nl', pt: 'Holandês',   en: 'Dutch' },
  { code: 'pl', country: 'pl', pt: 'Polaco',     en: 'Polish' },
  { code: 'ru', country: 'ru', pt: 'Russo',      en: 'Russian' },
  { code: 'zh', country: 'cn', pt: 'Chinês',     en: 'Chinese' },
  { code: 'ja', country: 'jp', pt: 'Japonês',    en: 'Japanese' },
  { code: 'ar', country: 'sa', pt: 'Árabe',      en: 'Arabic' },
];

const labelFor = (lang, isEN) => (isEN ? lang.en : lang.pt);

// Multi-select chips field for use inside a react-final-form. Stores the
// selected language codes as an array on the form value `name`.
const LanguagesField = ({ name = 'languagesSpoken', label }) => {
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const heading = label || (isEN ? 'Languages spoken' : 'Línguas que falas');

  return (
    <Field name={name}>
      {({ input }) => {
        const selected = Array.isArray(input.value) ? input.value : [];
        const toggle = code => {
          const next = selected.includes(code)
            ? selected.filter(c => c !== code)
            : [...selected, code];
          input.onChange(next);
        };
        return (
          <div className={css.wrapper}>
            <span className={css.label}>{heading}</span>
            <div className={css.chips}>
              {LANGUAGES.map(lang => {
                const isOn = selected.includes(lang.code);
                return (
                  <button
                    key={lang.code}
                    type="button"
                    className={`${css.chip} ${isOn ? css.chipActive : ''}`}
                    onClick={() => toggle(lang.code)}
                  >
                    <span className={`fi fi-${lang.country} ${css.flag}`} aria-hidden />
                    <span>{labelFor(lang, isEN)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      }}
    </Field>
  );
};

export default LanguagesField;
