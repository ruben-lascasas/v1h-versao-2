import React, { useState, useEffect } from 'react';
import classNames from 'classnames';

import Field, { hasDataInFields } from '../../Field';
import BlockBuilder from '../../BlockBuilder';
import SectionContainer from '../SectionContainer';
import css from './SectionSlideshow.module.css';

const SLIDE_INTERVAL = 4000;

const SectionSlideshow = props => {
  const {
    sectionId,
    className,
    rootClassName,
    defaultClasses,
    title,
    description,
    appearance,
    callToAction,
    blocks = [],
    isInsideContainer = false,
    options,
  } = props;

  const fieldComponents = options?.fieldComponents;
  const fieldOptions = { fieldComponents };
  const hasHeaderFields = hasDataInFields([title, description, callToAction], fieldOptions);

  const [current, setCurrent] = useState(0);
  useEffect(() => {
    if (blocks.length <= 1) return;

    const interval = setInterval(() => {
      setCurrent(c => (c + 1) % blocks.length);
    }, SLIDE_INTERVAL);

    return () => clearInterval(interval);
  }, [blocks.length]);

  const slideBackgrounds = ['#f5f5f5', '#ededed', '#e5e5e5', '#dcdcdc', '#d4d4d4'];

  const goTo = index => {
    if (index === current) return;
    setCurrent(index);
  };

  return (
    <SectionContainer
      id={sectionId}
      className={className}
      rootClassName={rootClassName}
      appearance={appearance}
      options={fieldOptions}
    >
      {hasHeaderFields ? (
        <header className={defaultClasses.sectionDetails}>
          <Field data={title} className={defaultClasses.title} options={fieldOptions} />
          <Field data={description} className={defaultClasses.description} options={fieldOptions} />
          <Field data={callToAction} className={defaultClasses.ctaButton} options={fieldOptions} />
        </header>
      ) : null}

      {blocks.length > 0 ? (
        <div
          className={css.slideshowOuter}
          style={{ backgroundColor: slideBackgrounds[current % slideBackgrounds.length] }}
        >
          {blocks.map((block, index) => {
            if (index !== current) return null;

            return (
              <div
                key={block.blockId || index}
                className={css.slideActive}
              >
                <BlockBuilder
                  ctaButtonClass={defaultClasses.ctaButton}
                  blocks={[block]}
                  sectionId={sectionId}
                  responsiveImageSizes="(max-width: 767px) 100vw, 800px"
                  options={options}
                />
              </div>
            );
          })}

          {blocks.length > 1 ? (
            <div className={css.dots}>
              {blocks.map((_, index) => (
                <button
                  key={index}
                  className={classNames(css.dot, { [css.dotActive]: index === current })}
                  onClick={() => goTo(index)}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionContainer>
  );
};

export default SectionSlideshow;
