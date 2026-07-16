import React from 'react';

import Field, { hasDataInFields } from '../../Field';
import SectionContainer from '../SectionContainer';
import { useLocale } from '../../../../context/localeContext';

import css from './SectionWhyUs.module.css';

/* Headset / 24-7 support icon */
const Icon24h = () => (
  <svg width="33" height="33" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C7.06 2 3 6.06 3 11v4c0 1.1.9 2 2 2h1a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1H5v-1a7 7 0 0 1 14 0v1h-1a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h1c1.1 0 2-.9 2-2v-4c0-4.94-4.06-9-9-9z" />
  </svg>
);

/* Certified bookings — shield with checkmark */
const IconCheck = () => (
  <svg width="33" height="33" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2L4 6v5c0 4.97 3.4 9.63 8 10.93C16.6 20.63 20 15.97 20 11V6l-8-4zm-1 13l-3-3 1.41-1.41L11 12.17l4.59-4.58L17 9l-6 6z" />
  </svg>
);

/* Secure payment — credit card with lock */
const IconCard = () => (
  <svg width="33" height="33" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2zm0 4H4V8h16v.01zm0 2v8H4v-8h16z" />
    <path d="M13.5 14a1.5 1.5 0 0 1 3 0v.5h.5v2h-4v-2h.5V14zm1.5-1a.5.5 0 0 0-.5.5V14h1v-.5a.5.5 0 0 0-.5-.5z" />
  </svg>
);

const BADGES = {
  pt: [
    { icon: <Icon24h />, line1: 'Serviço', line2: '24/7' },
    { icon: <IconCheck />, line1: 'Reservas', line2: 'Certificadas' },
    { icon: <IconCard />, line1: 'Pagamento', line2: 'Seguro' },
  ],
  en: [
    { icon: <Icon24h />, line1: '24/7', line2: 'Service' },
    { icon: <IconCheck />, line1: 'Certified', line2: 'Bookings' },
    { icon: <IconCard />, line1: 'Secure', line2: 'Payment' },
  ],
};

const SectionWhyUs = props => {
  const {
    rootClassName,
    className,
    appearance,
    title,
    description,
    staticImages = [],
    blocks = [],
    options,
  } = props;

  const { locale } = useLocale();
  const badges = BADGES[locale] || BADGES.pt;
  const fieldOptions = options;
  const hasTitle = hasDataInFields([title], fieldOptions);
  const hasDescription = hasDataInFields([description], fieldOptions);

  const photos = staticImages.length > 0 ? staticImages.slice(0, 3) : null;
  const blockPhotos = !photos ? blocks.slice(0, 3) : [];

  const renderPolaroid = (src, index) => (
    <div key={index} className={`${css.polaroid} ${css['p' + (index + 1)]}`}>
      <div className={css.polaroidPhoto}>
        <img src={src} alt="" className={css.polaroidImg} />
      </div>
    </div>
  );

  const renderEmptyPolaroid = (index) => (
    <div key={index} className={`${css.polaroid} ${css['p' + (index + 1)]}`}>
      <div className={css.polaroidPhoto}>
        <div className={css.polaroidEmpty} />
      </div>
    </div>
  );

  return (
    <SectionContainer
      id="section-why-us"
      rootClassName={rootClassName || css.root}
      className={className}
      appearance={appearance}
    >
      {/* Title row with bars on both sides */}
      <div className={css.titleBarRow}>
        <div className={css.topBarLeft} />
        <div className={css.titleWrapper}>
          {hasTitle && <Field data={title} className={css.titleField} options={fieldOptions} />}
        </div>
        <div className={css.topBar} />
      </div>

      {/* Main content */}
      <div className={css.inner}>
        {/* Left side */}
        <div className={css.left}>
          {hasDescription && (
            <Field data={description} className={css.descriptionField} options={fieldOptions} />
          )}
          <div className={css.badges}>
            {badges.map((b, i) => (
              <div key={i} className={css.badge}>
                <div className={css.badgeIcon}>{b.icon}</div>
                <span className={css.badgeLabel}>{b.line1}<br />{b.line2}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right side – polaroid photos */}
        <div className={css.right}>
          {photos
            ? photos.map((url, i) => renderPolaroid(url, i))
            : blockPhotos.length > 0
              ? blockPhotos.map((block, i) => (
                  <div key={block.blockId || i} className={`${css.polaroid} ${css['p' + (i + 1)]}`}>
                    <div className={css.polaroidPhoto}>
                      <Field data={block.media} options={fieldOptions} className={css.polaroidImg} />
                    </div>
                  </div>
                ))
              : [0, 1, 2].map(i => renderEmptyPolaroid(i))}
        </div>
      </div>

      {/* Bottom bar */}
      <div className={css.bottomBar} />
    </SectionContainer>
  );
};

export default SectionWhyUs;
