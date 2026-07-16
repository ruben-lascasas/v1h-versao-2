import React, { useState, useEffect, useRef } from 'react';
import classNames from 'classnames';

import Field, { hasDataInFields } from '../../Field';
import BlockBuilder from '../../BlockBuilder';

import SectionContainer from '../SectionContainer';
import css from './SectionColumns.module.css';

// IDs of sections that should behave as auto-slideshows
const SLIDESHOW_SECTION_IDS = ['section-3'];
const SLIDE_INTERVAL = 20000;

// The number of columns (numColumns) affects styling and responsive images
const COLUMN_CONFIG = [
  { css: css.oneColumn, responsiveImageSizes: '(max-width: 767px) 100vw, 1200px' },
  { css: css.twoColumns, responsiveImageSizes: '(max-width: 767px) 100vw, 600px' },
  { css: css.threeColumns, responsiveImageSizes: '(max-width: 767px) 100vw, 400px' },
  { css: css.fourColumns, responsiveImageSizes: '(max-width: 767px) 100vw, 265px' },
];
const getIndex = numColumns => numColumns - 1;
const getColumnCSS = numColumns => {
  const config = COLUMN_CONFIG[getIndex(numColumns)];
  return config ? config.css : COLUMN_CONFIG[0].css;
};
const getResponsiveImageSizes = numColumns => {
  const config = COLUMN_CONFIG[getIndex(numColumns)];
  return config ? config.responsiveImageSizes : COLUMN_CONFIG[0].responsiveImageSizes;
};

const SectionColumns = props => {
  const {
    sectionId,
    className,
    rootClassName,
    defaultClasses,
    numColumns,
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
  const hasBlocks = blocks?.length > 0;
  const isSlideshow = SLIDESHOW_SECTION_IDS.includes(sectionId);

  // Slideshow state (only used when isSlideshow is true)
  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(null);
  const isPaused = useRef(false);

  useEffect(() => {
    if (!isSlideshow || blocks.length <= 1) return;
    const interval = setInterval(() => {
      if (isPaused.current) return;
      setCurrent(c => {
        setExiting(c);
        return (c + 1) % blocks.length;
      });
    }, SLIDE_INTERVAL);
    return () => clearInterval(interval);
  }, [isSlideshow, blocks.length]);

  useEffect(() => {
    if (exiting === null) return;
    const timeout = setTimeout(() => setExiting(null), 650);
    return () => clearTimeout(timeout);
  }, [exiting]);

  const goTo = index => {
    if (index === current) return;
    setExiting(current);
    setCurrent(index);
  };

  if (isSlideshow && hasBlocks) {
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
        <div
          className={css.slideshowWrapper}
          onMouseEnter={() => { isPaused.current = true; }}
          onMouseLeave={() => { isPaused.current = false; }}
        >
          <div className={css.slideshowOuter}>
            {blocks.map((block, index) => {
              const isActive = index === current;
              const isExit = index === exiting;
              if (!isActive && !isExit) return null;
              return (
                <div
                  key={block.blockId || index}
                  className={classNames(css.slide, {
                    [css.slideActive]: isActive,
                    [css.slideExiting]: isExit,
                  })}
                >
                  <BlockBuilder
                    ctaButtonClass={defaultClasses.ctaButton}
                    blocks={[block]}
                    sectionId={sectionId}
                    responsiveImageSizes={getResponsiveImageSizes(numColumns)}
                    options={options}
                  />
                </div>
              );
            })}
          </div>
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
      </SectionContainer>
    );
  }

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
      {hasBlocks ? (
        <div
          className={classNames(defaultClasses.blockContainer, getColumnCSS(numColumns), {
            [css.noSidePaddings]: isInsideContainer,
          })}
        >
          <BlockBuilder
            ctaButtonClass={defaultClasses.ctaButton}
            blocks={blocks}
            sectionId={sectionId}
            responsiveImageSizes={getResponsiveImageSizes(numColumns)}
            options={options}
          />
        </div>
      ) : null}
    </SectionContainer>
  );
};

export default SectionColumns;
