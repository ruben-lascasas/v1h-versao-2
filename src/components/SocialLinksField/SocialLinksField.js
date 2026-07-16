import React from 'react';
import { Field } from 'react-final-form';
import { useLocale } from '../../context/localeContext';
import css from './SocialLinksField.module.css';

// Dark monochrome V1H icons (the base versions in /src/assets/images).
import iconInstagram from '../../assets/images/VH1-ICON_INST.png';
import iconFacebook from '../../assets/images/VH1-ICON_FB.png';
import iconLinkedin from '../../assets/images/VH1-ICON_LKIN.png';
import iconTiktok from '../../assets/images/VH1-ICON_TKTK.png';
import iconYoutube from '../../assets/images/VH1-ICON_YT.png';
// Beige V1H hover variants (same icons but with brand-brown background).
import iconInstagramHover from '../../assets/images/VH1-ICON_INST-2.png';
import iconFacebookHover from '../../assets/images/VH1-ICON_FB-2.png';
import iconLinkedinHover from '../../assets/images/VH1-ICON_LKIN-2.png';
import iconTiktokHover from '../../assets/images/VH1-ICON_TKTK-2.png';
import iconYoutubeHover from '../../assets/images/VH1-ICON_YT-2.png';

// Each platform has a key (used in publicData), label, placeholder URL pattern,
// optional URL prefix appended automatically when the user enters just a
// handle, and an inline SVG icon.
export const SOCIAL_PLATFORMS = [
  {
    key: 'instagram',
    label: 'Instagram',
    placeholder: 'instagram.com/teu-utilizador',
    handlePrefix: 'https://instagram.com/',
    iconSrc: iconInstagram,
    iconHoverSrc: iconInstagramHover,
    // Full URL (any subdomain like www. or m.) OR bare handle. Instagram
    // usernames officially allow letters, digits, periods and underscores
    // and are 1-30 characters long. URL paths can be anything.
    pattern: /^(?:(?:https?:\/\/)?(?:[a-z]+\.)?instagram\.com\/.+|@?[a-zA-Z0-9._]{1,30})$/i,
  },
  {
    key: 'facebook',
    label: 'Facebook',
    placeholder: 'facebook.com/teu-utilizador',
    handlePrefix: 'https://facebook.com/',
    iconSrc: iconFacebook,
    iconHoverSrc: iconFacebookHover,
    // Full facebook.com / fb.com / m.facebook.com URL OR a public username
    // (5-50 characters, letters/digits/dots) — Facebook doesn't allow
    // hyphens or underscores in custom URLs.
    pattern: /^(?:(?:https?:\/\/)?(?:[a-z]+\.)?(?:facebook|fb)\.com\/.+|[a-zA-Z0-9.]{5,50})$/i,
  },
  {
    key: 'linkedin',
    label: 'LinkedIn',
    placeholder: 'linkedin.com/in/teu-utilizador',
    handlePrefix: 'https://linkedin.com/in/',
    iconSrc: iconLinkedin,
    iconHoverSrc: iconLinkedinHover,
    // Full linkedin.com URL (any path: in/, company/, pub/, school/) OR a
    // bare handle (3-100 chars, letters/digits/hyphens — LinkedIn allows
    // hyphens but not dots or underscores in vanity URLs).
    pattern: /^(?:(?:https?:\/\/)?(?:[a-z]+\.)?linkedin\.com\/.+|[a-zA-Z0-9\-]{3,100})$/i,
  },
  {
    key: 'tiktok',
    label: 'TikTok',
    placeholder: 'tiktok.com/@teu-utilizador',
    handlePrefix: 'https://tiktok.com/@',
    iconSrc: iconTiktok,
    iconHoverSrc: iconTiktokHover,
    // Full tiktok.com / vm.tiktok.com URL OR @handle (2-24 chars,
    // letters/digits/dots/underscores per TikTok's username rules).
    pattern: /^(?:(?:https?:\/\/)?(?:[a-z]+\.)?tiktok\.com\/.+|@?[a-zA-Z0-9._]{2,24})$/i,
  },
  {
    key: 'youtube',
    label: 'YouTube',
    placeholder: 'youtube.com/@teu-canal',
    handlePrefix: 'https://youtube.com/@',
    iconSrc: iconYoutube,
    iconHoverSrc: iconYoutubeHover,
    // Full youtube.com / youtu.be / m.youtube.com URL OR @handle (3-30
    // chars: letters/digits/dots/underscores/hyphens per YouTube's rules).
    pattern: /^(?:(?:https?:\/\/)?(?:[a-z]+\.)?(?:youtube\.com|youtu\.be)\/.+|@?[a-zA-Z0-9._\-]{3,30})$/i,
  },
];

// Validate a value against the platform pattern. Empty values are valid (the
// field is optional). The pattern is permissive enough to accept either bare
// handles ("@joao", "joao.silva") or full URLs ("https://instagram.com/joao").
export const isValidSocialValue = (value, platform) => {
  const v = String(value || '').trim();
  if (!v) return true;
  if (!platform?.pattern) return true;
  return platform.pattern.test(v);
};

// react-final-form validate function — returns an object with per-platform
// error keys when any of the social entries fails its pattern. Returning
// undefined means the field is valid.
export const validateSocialLinks = value => {
  if (!value || typeof value !== 'object') return undefined;
  const errors = {};
  SOCIAL_PLATFORMS.forEach(p => {
    if (!isValidSocialValue(value[p.key], p)) {
      errors[p.key] = 'invalid';
    }
  });
  return Object.keys(errors).length > 0 ? errors : undefined;
};

// Normalise a user-entered value into a clean absolute URL. If they typed only
// a handle / domain with no protocol, prepend the platform's known prefix so
// the resulting link is always clickable.
export const normaliseSocialUrl = (rawValue, prefix) => {
  const value = String(rawValue || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  if (prefix && value.startsWith(prefix.replace(/^https?:\/\//, ''))) {
    return `https://${value}`;
  }
  return `${prefix || 'https://'}${value.replace(/^@/, '')}`;
};

const SocialLinksField = ({ name = 'socialLinks', label }) => {
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const heading = label || (isEN ? 'Social media' : 'Redes sociais');

  return (
    <Field name={name} validate={validateSocialLinks}>
      {({ input }) => {
        const value = input.value && typeof input.value === 'object' ? input.value : {};
        const setOne = (key, v) => input.onChange({ ...value, [key]: v });
        return (
          <div className={css.wrapper}>
            <span className={css.label}>{heading}</span>
            <div className={css.rows}>
              {SOCIAL_PLATFORMS.map(p => {
                const fieldValue = value[p.key] || '';
                const hasError = fieldValue.trim().length > 0 && !isValidSocialValue(fieldValue, p);
                return (
                  <div key={p.key} className={css.row}>
                    <span className={css.icon} aria-hidden>
                      {p.iconSrc ? (
                        <img src={p.iconSrc} alt="" className={css.iconImg} />
                      ) : (
                        p.icon
                      )}
                    </span>
                    <div className={css.inputWrap}>
                      <input
                        type="text"
                        className={`${css.input} ${hasError ? css.inputError : ''}`}
                        placeholder={p.placeholder}
                        value={fieldValue}
                        onChange={e => setOne(p.key, e.target.value)}
                      />
                      {hasError && (
                        <span className={css.error}>
                          {isEN
                            ? `Enter a valid ${p.label} URL or username`
                            : `Indica um URL ou nome de utilizador válido do ${p.label}`}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      }}
    </Field>
  );
};

export default SocialLinksField;
