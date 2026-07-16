import React, { useEffect, useState, useRef } from 'react';
import classNames from 'classnames';
import { useHistory } from 'react-router-dom';

import Field, { hasDataInFields } from '../../Field';
import BlockBuilder from '../../BlockBuilder';

import SectionContainer from '../SectionContainer';
import { useConfiguration } from '../../../../context/configurationContext';
import { useLocale } from '../../../../context/localeContext';
import { getCategoryIcon } from '../../../../components/CategoryIcons/CategoryIcons';
import css from './SectionCarousel.module.css';

// Label overrides keyed by category id/name substring
const PT_LABELS = {
  trabalho:    'Trabalho',   reuniao: 'Trabalho',
  cultura:     'Cultura',    educacao: 'Cultura',
  gastronomia: 'Gastronomia', convivio: 'Gastronomia',
  eventos:     'Eventos',    festa: 'Eventos',
  criatividade:'Criatividade', producao: 'Criatividade',
  saude:       'Saúde',      bem: 'Saúde',
  desporto:    'Desporto',   actividade: 'Desporto',
  livre:       'Ar Livre',
  inusitado:   'Inusitados', alternativo: 'Inusitados',
};

const EN_LABELS = {
  trabalho:    'Work',       reuniao: 'Work',
  cultura:     'Culture',    educacao: 'Culture',
  gastronomia: 'Gastronomy', convivio: 'Gastronomy',
  eventos:     'Events',     festa: 'Events',
  criatividade:'Creativity', producao: 'Creativity',
  saude:       'Health',     bem: 'Health',
  desporto:    'Sport',      actividade: 'Sport',
  livre:       'Outdoors',
  inusitado:   'Unusual',    alternativo: 'Unusual',
};

// Shorten a category name to one word (before any "&" or ",")
const shortenName = name => {
  const first = (name || '').split(/[&,]/)[0].trim();
  return first.split(/\s+/)[0];
};

const getLabel = (id = '', name = '', locale = 'pt') => {
  const haystack = (id + ' ' + name).toLowerCase();
  const map = locale === 'en' ? EN_LABELS : PT_LABELS;
  const match = Object.keys(map).find(k => haystack.includes(k));
  return match ? map[match] : shortenName(name);
};

const CategoryButtons = () => {
  const config = useConfiguration();
  const { locale } = useLocale();
  const history = useHistory();
  const [active, setActive] = useState(null);

  const rawCategories = config?.categoryConfiguration?.categories || [];

  if (rawCategories.length === 0) return null;

  const handleClick = (id) => {
    setActive(id);
    history.push(`/s?pub_categoryLevel1=${encodeURIComponent(id)}`);
  };

  return (
    <div className={css.categoryRow}>
      {rawCategories.map((cat) => {
        const label = getLabel(cat.id, cat.name, locale);
        return (
          <button
            key={cat.id}
            className={classNames(css.categoryBtn, { [css.categoryBtnActive]: active === cat.id })}
            onClick={() => handleClick(cat.id)}
          >
            <span className={css.categoryLabel}>{label}</span>
          </button>
        );
      })}
    </div>
  );
};

const KEY_CODE_ARROW_LEFT = 37;
const KEY_CODE_ARROW_RIGHT = 39;

// The number of columns (numColumns) affects styling and responsive images
const COLUMN_CONFIG = [
  { css: css.oneColumn, responsiveImageSizes: '(max-width: 767px) 100vw, 1200px' },
  { css: css.twoColumns, responsiveImageSizes: '(max-width: 767px) 100vw, 600px' },
  { css: css.threeColumns, responsiveImageSizes: '(max-width: 767px) 100vw, 400px' },
  { css: css.fourColumns, responsiveImageSizes: '(max-width: 767px) 100vw, 290px' },
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

/**
 * @typedef {Object} BlockConfig
 * @property {string} blockId
 * @property {string} blockName
 * @property {'defaultBlock' | 'footerBlock' | 'socialMediaLink'} blockType
 */

/**
 * @typedef {Object} FieldComponentConfig
 * @property {ReactNode} component
 * @property {Function} pickValidProps
 */

/**
 * Section component that's able to show blocks in a carousel.
 * The number blocks visible is defined by "numColumns" prop.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {Object} props.defaultClasses
 * @param {string} props.defaultClasses.sectionDetails
 * @param {string} props.defaultClasses.title
 * @param {string} props.defaultClasses.description
 * @param {string} props.defaultClasses.ctaButton
 * @param {string} props.sectionId id of the section
 * @param {'carousel'} props.sectionType
 * @param {number?} props.numColumns
 * @param {Object?} props.title
 * @param {Object?} props.description
 * @param {Object?} props.appearance
 * @param {Object?} props.callToAction
 * @param {Array<BlockConfig>?} props.blocks array of block configs
 * @param {boolean?} props.isInsideContainer
 * @param {Object} props.options extra options for the section component (e.g. custom fieldComponents)
 * @param {Object<string,FieldComponentConfig>?} props.options.fieldComponents custom fields
 * @returns {JSX.Element} Section for article content
 */
const SLIDE_INTERVAL = 12000;
const TRANSITION_DURATION = 2200;
const SLIDE_BACKGROUNDS = ['#BAA38A', '#3F3131', '#2E2E2E', '#7C6350'];

const SectionCarousel = props => {
  const {
    sectionId,
    className,
    rootClassName,
    defaultClasses,
    numColumns = 1,
    title,
    description,
    appearance,
    callToAction,
    blocks = [],
    options,
  } = props;

  const carouselConfig = useConfiguration();
  const carouselHistory = useHistory();
  const { locale: carouselLocale } = useLocale();
  const rawCategories = carouselConfig?.categoryConfiguration?.categories || [];
  const sliderContainerId = `${props.sectionId}-container`;
  const sliderId = `${props.sectionId}-slider`;
  const numberOfBlocks = blocks?.length;
  const hasBlocks = numberOfBlocks > 0;
  const isSlideshowMode = numColumns === 1;

  // Slideshow state (only used when numColumns === 1)
  const [current, setCurrent] = useState(0);
  const [exiting, setExiting] = useState(null);
  const [isPrefading, setIsPrefading] = useState(false);
  const [exitWasPrefade, setExitWasPrefade] = useState(false);
  const currentRef = useRef(0);
  const touchStartX = useRef(null);

  // Keep ref in sync with state
  useEffect(() => {
    currentRef.current = current;
  }, [current]);

  // Schedule prefade → advance on each slide change
  useEffect(() => {
    if (!isSlideshowMode || blocks.length <= 1) return;
    setIsPrefading(false);

    const preTimer = setTimeout(() => {
      setIsPrefading(true);
    }, SLIDE_INTERVAL - TRANSITION_DURATION);

    const advTimer = setTimeout(() => {
      const curr = currentRef.current;
      const next = (curr + 1) % blocks.length;
      setIsPrefading(false);
      setExitWasPrefade(true);
      setExiting(curr);
      setCurrent(next);
    }, SLIDE_INTERVAL);

    return () => {
      clearTimeout(preTimer);
      clearTimeout(advTimer);
    };
  }, [current, isSlideshowMode, blocks.length]);

  // Clear exiting — instantly if slide already prefaded, else after transition
  useEffect(() => {
    if (exiting === null) return;
    const delay = exitWasPrefade ? 50 : TRANSITION_DURATION;
    const timeout = setTimeout(() => {
      setExiting(null);
      setExitWasPrefade(false);
    }, delay);
    return () => clearTimeout(timeout);
  }, [exiting, exitWasPrefade]);

  const goTo = index => {
    if (index === current) return;
    setIsPrefading(false);
    setExitWasPrefade(true);
    setExiting(current);
    setCurrent(index);
  };

  const onTouchStart = e => {
    touchStartX.current = e.touches[0].clientX;
  };

  const onTouchEnd = e => {
    if (touchStartX.current === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartX.current = null;
    if (Math.abs(dx) < 40) return;
    if (dx < 0) {
      goTo((currentRef.current + 1) % blocks.length);
    } else {
      goTo((currentRef.current - 1 + blocks.length) % blocks.length);
    }
  };

  const isGridMode = numberOfBlocks > numColumns;

  useEffect(() => {
    if (isSlideshowMode || isGridMode) return;
    const setCarouselWidth = () => {
      if (hasBlocks) {
        const elem = window.document.getElementById(sliderContainerId);
        if (!elem) return;
        const windowWidth = window.innerWidth;
        const scrollbarWidth = window.innerWidth - document.body.clientWidth;
        const elementWidth =
          elem.clientWidth >= windowWidth - scrollbarWidth ? windowWidth : elem.clientWidth;
        const carouselWidth = elementWidth - scrollbarWidth;
        elem.style.setProperty('--carouselWidth', `${carouselWidth}px`);
      }
    };
    setCarouselWidth();

    window.addEventListener('resize', setCarouselWidth);
    return () => window.removeEventListener('resize', setCarouselWidth);
  }, [isSlideshowMode, isGridMode]);

  // If external mapping has been included for fields
  // E.g. { h1: { component: MyAwesomeHeader } }
  const fieldComponents = options?.fieldComponents;
  const fieldOptions = { fieldComponents };

  const hasHeaderFields = hasDataInFields([title, description, callToAction], fieldOptions);

  const onSlideLeft = e => {
    var slider = window.document.getElementById(sliderId);
    const slideWidth = numColumns * slider?.firstChild?.clientWidth;
    slider.scrollLeft = slider.scrollLeft - slideWidth;
    // Fix for Safari
    e.target.focus();
  };

  const onSlideRight = e => {
    var slider = window.document.getElementById(sliderId);
    const slideWidth = numColumns * slider?.firstChild?.clientWidth;
    slider.scrollLeft = slider.scrollLeft + slideWidth;
    // Fix for Safari
    e.target.focus();
  };

  const onKeyDown = e => {
    if (e.keyCode === KEY_CODE_ARROW_LEFT) {
      // Prevent changing cursor position in input
      e.preventDefault();
      onSlideLeft(e);
    } else if (e.keyCode === KEY_CODE_ARROW_RIGHT) {
      // Prevent changing cursor position in input
      e.preventDefault();
      onSlideRight(e);
    }
  };

  // Slideshow mode (numColumns === 1)
  if (isSlideshowMode) {
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
            className={css.slideshowOuter}
            style={{ backgroundColor: SLIDE_BACKGROUNDS[current % SLIDE_BACKGROUNDS.length] }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {blocks.map((block, index) => {
              const isActive = index === current;
              const isExiting = index === exiting;
              if (!isActive && !isExiting) return null;
              return (
                <div
                  key={block.blockId || index}
                  className={classNames({
                    [css.slideActive]: isActive && !isPrefading,
                    [css.slidePrefading]: isActive && isPrefading,
                    [css.slideExiting]: isExiting && !exitWasPrefade,
                    [css.slideGone]: isExiting && exitWasPrefade,
                    [css.slideFirst]: index === 0,
                  })}
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
  }

  // Default carousel mode (numColumns > 1)
  return (
    <SectionContainer
      id={sectionId}
      className={className}
      rootClassName={rootClassName}
      appearance={appearance}
      options={fieldOptions}
    >
      {hasHeaderFields ? (
        <header className={classNames(defaultClasses.sectionDetails, css.gridHeader)}>
          <Field data={title} className={classNames(defaultClasses.title, css.gridHeaderTitle)} options={fieldOptions} />
          <Field data={description} className={defaultClasses.description} options={fieldOptions} />
          <Field data={callToAction} className={defaultClasses.ctaButton} options={fieldOptions} />
        </header>
      ) : null}

      <CategoryButtons />

      {hasBlocks && isGridMode ? (
        <div
          className={css.gridContainer}
          style={{ '--cols': numColumns }}
        >
          {blocks.map((block, index) => {
            const catId = rawCategories[index]?.id;
            return (
              <div
                key={block.blockId || index}
                className={css.gridBlockClickable}
                onClick={() => catId && carouselHistory.push(`/s?pub_categoryLevel1=${encodeURIComponent(catId)}`)}
                role={catId ? 'button' : undefined}
                tabIndex={catId ? 0 : undefined}
                onKeyDown={e => {
                  if (catId && (e.key === 'Enter' || e.key === ' ')) {
                    carouselHistory.push(`/s?pub_categoryLevel1=${encodeURIComponent(catId)}`);
                  }
                }}
              >
                <BlockBuilder
                  rootClassName={css.gridBlock}
                  ctaButtonClass={defaultClasses.ctaButton}
                  blocks={[{
                    ...block,
                    callToAction: undefined,
                    media: block.media ? { ...block.media, link: undefined } : block.media,
                  }]}
                  sectionId={sectionId}
                  responsiveImageSizes={getResponsiveImageSizes(numColumns)}
                  options={options}
                />
                {catId && (
                  <div className={css.categoryBadge}>
                    <span className={css.categoryBadgeIcon}>
                      {getCategoryIcon(catId, rawCategories[index]?.name)}
                    </span>
                    <span className={css.categoryBadgeLabel}>
                      {getLabel(catId, rawCategories[index]?.name, carouselLocale)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : hasBlocks ? (
        <div className={css.carouselContainer} id={sliderContainerId}>
          <div
            className={classNames(css.carouselArrows, {
              [css.notEnoughBlocks]: numberOfBlocks <= numColumns,
            })}
          >
            <button className={css.carouselArrowPrev} onClick={onSlideLeft} onKeyDown={onKeyDown}>
              ‹
            </button>
            <button className={css.carouselArrowNext} onClick={onSlideRight} onKeyDown={onKeyDown}>
              ›
            </button>
          </div>
          <div className={getColumnCSS(numColumns)} id={sliderId}>
            <BlockBuilder
              rootClassName={css.block}
              ctaButtonClass={defaultClasses.ctaButton}
              blocks={blocks}
              sectionId={sectionId}
              responsiveImageSizes={getResponsiveImageSizes(numColumns)}
              options={options}
            />
          </div>
        </div>
      ) : null}
    </SectionContainer>
  );
};

export default SectionCarousel;
