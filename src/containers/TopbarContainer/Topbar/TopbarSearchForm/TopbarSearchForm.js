import React, { useRef, useState, useEffect, useLayoutEffect } from 'react';
import { Form as FinalForm, Field } from 'react-final-form';
import classNames from 'classnames';

import { useIntl } from '../../../../util/reactIntl';
import { isMainSearchTypeKeywords } from '../../../../util/search';
import { useLocale } from '../../../../context/localeContext';

import { Form, LocationAutocompleteInput } from '../../../../components';
import { saveToSearchHistory } from '../../../../components/LocationAutocompleteInput/LocationAutocompleteInputImpl';

import IconSearchDesktop from './IconSearchDesktop';
import css from './TopbarSearchForm.module.css';

const identity = v => v;

// ── Category search ────────────────────────────────────────────────────────
// Normalize: lowercase, strip accents, replace non-alphanumeric with space
const normalizeTerm = s =>
  s.toLowerCase()
   .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
   .replace(/[^a-z0-9]+/g, ' ')
   .trim();

// Each entry lists all terms (PT full, PT words, EN full, EN words) that map to a slug
const CATEGORY_DATA = [
  {
    label: 'Trabalho & Reuniões',
    slug: 'trabalho-reunioes',
    terms: ['trabalho reunioes', 'trabalho', 'reunioes', 'work meetings', 'work', 'meetings'],
  },
  {
    label: 'Educação & Cultura',
    slug: 'educacao-cultura',
    terms: ['educacao cultura', 'educacao', 'cultura', 'education culture', 'education', 'culture'],
  },
  {
    label: 'Gastronomia & Convívio',
    slug: 'gastronomia-convivio',
    terms: ['gastronomia convivio', 'gastronomia', 'convivio', 'gastronomy social', 'gastronomy', 'social'],
  },
  {
    label: 'Eventos & Festas',
    slug: 'eventos-festas',
    terms: ['eventos festas', 'eventos', 'festas', 'events parties', 'events', 'parties'],
  },
  {
    label: 'Criatividade & Produção',
    slug: 'criatividade-producao',
    terms: ['criatividade producao', 'criatividade', 'producao', 'creativity production', 'creativity', 'production'],
  },
  {
    label: 'Saúde, Bem-estar & Corpo',
    slug: 'saude-bemestar',
    terms: ['saude bemestar corpo', 'saude', 'bemestar', 'bem estar', 'corpo', 'health wellness body', 'health', 'wellness'],
  },
  {
    label: 'Desporto & Actividade Física',
    slug: 'desporto-actividadefisica',
    terms: ['desporto actividadefisica', 'desporto', 'actividade', 'fisica', 'sport physical activity', 'sport', 'physical', 'activity'],
  },
  {
    label: 'Espaços ao Ar Livre',
    slug: 'espaco-arlivre',
    terms: ['espaco ar livre', 'espaco arlivre', 'ar livre', 'arlivre', 'outdoor spaces', 'outdoor', 'outdoors'],
  },
  {
    label: 'Espaços Inusitados & Alternativos',
    slug: 'espacos_inusitados_alternativos',
    terms: ['espacos inusitados alternativos', 'inusitados', 'alternativos', 'unusual alternative', 'unusual', 'alternative'],
  },
];

const findCategoryMatches = search => {
  if (!search || search.length < 2) return [];
  const normalized = normalizeTerm(search);
  return CATEGORY_DATA.filter(cat =>
    cat.terms.some(term => term.startsWith(normalized) || normalized.startsWith(term))
  );
};

// Build flat lookup: normalizedTerm → slug
const CATEGORY_LOOKUP = {};
CATEGORY_DATA.forEach(({ slug, terms }) => {
  terms.forEach(term => {
    CATEGORY_LOOKUP[normalizeTerm(term)] = slug;
  });
});

const findCategorySlug = search => CATEGORY_LOOKUP[normalizeTerm(search)] || null;

// ── Categories for animated placeholder ─────────────────────────────────────

const CATEGORIES = {
  pt: [
    'Trabalho & Reuniões',
    'Educação & Cultura',
    'Gastronomia & Convívio',
    'Eventos & Festas',
    'Criatividade & Produção',
    'Saúde, Bem-estar & Corpo',
    'Desporto & Actividade Física',
    'Espaços ao Ar Livre',
    'Espaços Inusitados & Alternativos',
  ],
  en: [
    'Work & Meetings',
    'Education & Culture',
    'Gastronomy & Social',
    'Events & Parties',
    'Creativity & Production',
    'Health, Wellness & Body',
    'Sport & Physical Activity',
    'Outdoor Spaces',
    'Unusual & Alternative Spaces',
  ],
};

// Returns { text, visible } — cycles base then through every category in order:
//   base → cat[0] → cat[1] → ... → cat[N-1] → base → cat[0] → ...
const useAnimatedPlaceholder = (base, categories) => {
  const [step, setStep] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setStep(s => s + 1);
        setVisible(true);
      }, 380);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const total = categories.length + 1;
  const idx = step % total;
  const text = idx === 0 ? base : categories[idx - 1];
  return { text, visible };
};

// ── Animated placeholder overlay ─────────────────────────────────────────────
// Measures the real input's left edge so the overlay aligns perfectly.

const AnimatedOverlay = ({ inputEl, wrapperEl, text, visible }) => {
  const [left, setLeft] = useState(null);

  useLayoutEffect(() => {
    if (!inputEl || !wrapperEl) return;
    const measure = () => {
      const iRect = inputEl.getBoundingClientRect();
      const wRect = wrapperEl.getBoundingClientRect();
      setLeft(iRect.left - wRect.left);
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [inputEl, wrapperEl]);

  if (left === null) return null;

  return (
    <span
      className={css.animatedPlaceholder}
      style={{ left, opacity: visible ? 1 : 0 }}
    >
      {text}
    </span>
  );
};

// ── KeywordSearchField ────────────────────────────────────────────────────────

const KeywordSearchField = props => {
  const { keywordSearchWrapperClasses, iconClass, intl, isMobile = false, inputRef } = props;
  const { locale } = useLocale();

  const wrapperRef = useRef(null);
  const [inputEl, setInputEl] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(false);

  const base = intl.formatMessage({ id: 'TopbarSearchForm.placeholder' });
  const categories = CATEGORIES[locale] || CATEGORIES.pt;
  const { text, visible } = useAnimatedPlaceholder(base, categories);

  const showOverlay = !isFocused && !hasValue;

  return (
    <div className={keywordSearchWrapperClasses} ref={wrapperRef}>
      <button
        className={css.searchSubmit}
        aria-label={intl.formatMessage({ id: 'TopbarDesktop.screenreader.search' })}
      >
        <div className={iconClass}>
          <IconSearchDesktop />
        </div>
      </button>
      <Field
        name="keywords"
        render={({ input, meta }) => (
          <input
            className={isMobile ? css.mobileInput : css.desktopInput}
            {...input}
            id={isMobile ? 'keyword-search-mobile' : 'keyword-search'}
            data-testid={isMobile ? 'keyword-search-mobile' : 'keyword-search'}
            ref={el => {
              if (typeof inputRef === 'function') inputRef(el);
              else if (inputRef) inputRef.current = el;
              setInputEl(el);
            }}
            type="text"
            placeholder=""
            autoComplete="off"
            onFocus={e => { setIsFocused(true); input.onFocus?.(e); }}
            onBlur={e => { setIsFocused(false); input.onBlur?.(e); }}
            onChange={e => { input.onChange(e); setHasValue(e.target.value.length > 0); }}
          />
        )}
      />
      {showOverlay && (
        <AnimatedOverlay
          inputEl={inputEl}
          wrapperEl={wrapperRef.current}
          text={text}
          visible={visible}
        />
      )}
    </div>
  );
};

// ── Submit + Location ─────────────────────────────────────────────────────────

const SubmitButton = props => {
  const intl = useIntl();
  return (
    <button
      className={css.searchSubmit}
      aria-label={intl.formatMessage({ id: 'TopbarDesktop.screenreader.search' })}
      type="submit"
      {...props}
    >
      <IconSearchDesktop />
    </button>
  );
};

const LocationSearchField = props => {
  const { desktopInputRootClass, intl, isMobile = false, inputRef, onLocationChange, onCategorySelect, onKeywordSelect, initialSearch = '' } = props;
  const { locale } = useLocale();

  const wrapperRef = useRef(null);
  const [inputEl, setInputEl] = useState(null);
  const [isFocused, setIsFocused] = useState(false);
  const [hasValue, setHasValue] = useState(!!initialSearch);
  const [categoryMatches, setCategoryMatches] = useState([]);

  const base = intl.formatMessage({ id: 'TopbarSearchForm.placeholder' });
  const categories = CATEGORIES[locale] || CATEGORIES.pt;
  const { text, visible } = useAnimatedPlaceholder(base, categories);

  const showOverlay = !isFocused && !hasValue;

  return (
    <div
      ref={wrapperRef}
      className={classNames(isMobile ? css.mobileInputRoot : desktopInputRootClass, css.locationWrapper)}
    >
      <Field
        name="location"
        format={identity}
        render={({ input, meta }) => {
          const { onChange, ...restInput } = input;

          const searchOnChange = value => {
            onChange(value);
            onLocationChange(value);
            setHasValue(!!(value?.search));
            setCategoryMatches(findCategoryMatches(value?.search || ''));
          };

          return (
            <LocationAutocompleteInput
              id={isMobile ? 'location-search-mobile' : 'location-search'}
              className={isMobile ? css.mobileInputRoot : desktopInputRootClass}
              iconClassName={isMobile ? css.mobileIcon : css.desktopIcon}
              inputClassName={isMobile ? css.mobileInput : css.desktopInput}
              predictionsClassName={isMobile ? css.mobilePredictions : css.desktopPredictions}
              predictionsAttributionClassName={isMobile ? css.mobilePredictionsAttribution : null}
              placeholder=""
              closeOnBlur={!isMobile}
              inputRef={el => {
                if (typeof inputRef === 'function') inputRef(el);
                else if (inputRef) inputRef.current = el;
                setInputEl(el);
              }}
              input={{ ...restInput, onChange: searchOnChange }}
              meta={meta}
              submitButton={SubmitButton}
              ariaLabel={intl.formatMessage({ id: 'TopbarDesktop.screenreader.search' })}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              categoryMatches={categoryMatches}
              onCategorySelect={onCategorySelect}
              onKeywordSelect={onKeywordSelect}
            />
          );
        }}
      />
      {showOverlay && (
        <AnimatedOverlay
          inputEl={inputEl}
          wrapperEl={wrapperRef.current}
          text={text}
          visible={visible}
        />
      )}
    </div>
  );
};

// ── TopbarSearchForm ──────────────────────────────────────────────────────────

const TopbarSearchForm = props => {
  const searchInpuRef = useRef(null);
  const intl = useIntl();
  const { appConfig, onSubmit, ...restOfProps } = props;

  const onChange = location => {
    if (!isMainSearchTypeKeywords(appConfig) && location.selectedPlace) {
      onSubmit({ location });
      searchInpuRef?.current?.blur();
    }
  };

  const onKeywordSubmit = values => {
    if (isMainSearchTypeKeywords(appConfig)) {
      onSubmit({ keywords: values.keywords });
      searchInpuRef?.current?.blur();
    }
  };

  const onLocationSubmit = values => {
    if (!isMainSearchTypeKeywords(appConfig)) {
      const location = values.location;
      if (location?.selectedPlace) {
        onSubmit({ location });
      } else if (location?.search) {
        const categorySlug = findCategorySlug(location.search);
        if (categorySlug) {
          // Typed text matches a known category — filter by it
          onSubmit({ pub_categoryLevel1: categorySlug });
        } else {
          // Free-text keyword search — persist it so it shows up in "Pesquisas recentes".
          saveToSearchHistory({ type: 'keyword', label: location.search });
          onSubmit({ keywords: location.search });
        }
      } else {
        // Nothing typed — show all listings
        onSubmit({ location: null });
      }
    }
  };

  const isKeywordsSearch = isMainSearchTypeKeywords(appConfig);
  const submit = isKeywordsSearch ? onKeywordSubmit : onLocationSubmit;

  return (
    <FinalForm
      {...restOfProps}
      onSubmit={submit}
      render={formRenderProps => {
        const {
          rootClassName,
          className,
          desktopInputRoot,
          isMobile = false,
          handleSubmit,
          values,
        } = formRenderProps;
        const classes = classNames(rootClassName, className);
        const desktopInputRootClass = desktopInputRoot || css.desktopInputRoot;

        const keywordSearchWrapperClasses = classNames(
          css.keywordSearchWrapper,
          isMobile ? css.mobileInputRoot : desktopInputRootClass
        );

        return (
          <Form className={classes} onSubmit={handleSubmit} enforcePagePreloadFor="SearchPage">
            {isKeywordsSearch ? (
              <KeywordSearchField
                keywordSearchWrapperClasses={keywordSearchWrapperClasses}
                iconClass={classNames(isMobile ? css.mobileIcon : css.desktopIcon || css.icon)}
                intl={intl}
                isMobile={isMobile}
                inputRef={searchInpuRef}
              />
            ) : (
              <LocationSearchField
                desktopInputRootClass={desktopInputRootClass}
                intl={intl}
                isMobile={isMobile}
                inputRef={searchInpuRef}
                onLocationChange={onChange}
                onCategorySelect={slug => onSubmit({ pub_categoryLevel1: slug })}
                onKeywordSelect={kw => onSubmit({ keywords: kw })}
                initialSearch={values?.location?.search || ''}
              />
            )}
          </Form>
        );
      }}
    />
  );
};

export default TopbarSearchForm;
