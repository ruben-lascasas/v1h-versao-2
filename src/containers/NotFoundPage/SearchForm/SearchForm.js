import React, { useState } from 'react';
import { Form as FinalForm, Field } from 'react-final-form';
import classNames from 'classnames';

import { useIntl } from '../../../util/reactIntl';
import { Form, LocationAutocompleteInput } from '../../../components';

import IconSearchDesktop from './IconSearchDesktop';

import css from './SearchForm.module.css';

const identity = v => v;

// Same category data as the topbar so the 404 search shows the 9 brand tags
// when the user starts typing. Keeping a local copy avoids reaching into the
// topbar's module just for a constant.
const normalizeTerm = s =>
  s.toLowerCase()
   .normalize('NFD').replace(/[̀-ͯ]/g, '')
   .replace(/[^a-z0-9]+/g, ' ')
   .trim();

const CATEGORY_DATA = [
  { label: 'Trabalho & Reuniões', slug: 'trabalho-reunioes', terms: ['trabalho reunioes', 'trabalho', 'reunioes', 'work meetings', 'work', 'meetings'] },
  { label: 'Educação & Cultura', slug: 'educacao-cultura', terms: ['educacao cultura', 'educacao', 'cultura', 'education culture', 'education', 'culture'] },
  { label: 'Gastronomia & Convívio', slug: 'gastronomia-convivio', terms: ['gastronomia convivio', 'gastronomia', 'convivio', 'gastronomy social', 'gastronomy', 'social'] },
  { label: 'Eventos & Festas', slug: 'eventos-festas', terms: ['eventos festas', 'eventos', 'festas', 'events parties', 'events', 'parties'] },
  { label: 'Criatividade & Produção', slug: 'criatividade-producao', terms: ['criatividade producao', 'criatividade', 'producao', 'creativity production', 'creativity', 'production'] },
  { label: 'Saúde, Bem-estar & Corpo', slug: 'saude-bemestar', terms: ['saude bemestar corpo', 'saude', 'bemestar', 'bem estar', 'corpo', 'health wellness body', 'health', 'wellness'] },
  { label: 'Desporto & Actividade Física', slug: 'desporto-actividadefisica', terms: ['desporto actividadefisica', 'desporto', 'actividade', 'fisica', 'sport physical activity', 'sport', 'physical', 'activity'] },
  { label: 'Espaços ao Ar Livre', slug: 'espaco-arlivre', terms: ['espaco ar livre', 'espaco arlivre', 'ar livre', 'arlivre', 'outdoor spaces', 'outdoor', 'outdoors'] },
  { label: 'Espaços Inusitados & Alternativos', slug: 'espacos_inusitados_alternativos', terms: ['espacos inusitados alternativos', 'inusitados', 'alternativos', 'unusual alternative', 'unusual', 'alternative'] },
];

const findCategoryMatches = search => {
  if (!search || search.length < 2) return [];
  const normalized = normalizeTerm(search);
  return CATEGORY_DATA.filter(cat =>
    cat.terms.some(term => term.startsWith(normalized) || normalized.startsWith(term))
  );
};

const KeywordSearchField = props => {
  const { intl, inputRef } = props;
  return (
    <div className={css.keywordSearchWrapper}>
      <button
        className={css.searchSubmit}
        aria-label={intl.formatMessage({ id: 'NotFoundPage.screenreader.search' })}
      >
        <div className={css.searchInputIcon}>
          <IconSearchDesktop />
        </div>
      </button>
      <Field
        name="keywords"
        render={({ input, meta }) => {
          return (
            <input
              className={css.keywordInput}
              {...input}
              id={'keyword-search-404'}
              type="text"
              placeholder={intl.formatMessage({
                id: 'NotFoundPage.SearchForm.placeholder',
              })}
              autoComplete="off"
            />
          );
        }}
      />
    </div>
  );
};

const LocationSearchField = props => {
  const { intl, handleChange, onCategorySelect, onKeywordSelect } = props;
  const [categoryMatches, setCategoryMatches] = useState([]);

  const submitButton = ({}) => (
    <button
      className={css.searchSubmit}
      aria-label={intl.formatMessage({ id: 'NotFoundPage.screenreader.search' })}
    >
      <IconSearchDesktop />
    </button>
  );
  return (
    <Field
      name="location"
      format={identity}
      render={({ input, meta }) => {
        const { onChange, ...restInput } = input;

        const searchOnChange = value => {
          onChange(value);
          handleChange(value);
          setCategoryMatches(findCategoryMatches(value?.search || ''));
        };

        const searchInput = { ...restInput, onChange: searchOnChange };
        return (
          <LocationAutocompleteInput
            id="location-search-404"
            placeholder={intl.formatMessage({ id: 'NotFoundPage.SearchForm.placeholder' })}
            iconClassName={css.searchInputIcon}
            inputClassName={css.searchInput}
            input={searchInput}
            meta={meta}
            submitButton={submitButton}
            ariaLabel={intl.formatMessage({ id: 'NotFoundPage.screenreader.search' })}
            closeOnBlur
            categoryMatches={categoryMatches}
            onCategorySelect={onCategorySelect}
            onKeywordSelect={onKeywordSelect}
          />
        );
      }}
    />
  );
};

/**
 * Search form
 *
 * @param {Object} props
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {function} props.onSubmit - The function to submit the form
 * @param {boolean} props.isKeywordSearch - Whether the search is a keyword search
 * @returns {JSX.Element} Search form component
 */
const SearchForm = props => {
  const intl = useIntl();
  const handleChange = location => {
    if (location.selectedPlace) {
      props.onSubmit({ location });
    }
  };

  const handleCategorySelect = slug => {
    props.onSubmit({ pub_categoryLevel1: slug });
  };
  const handleKeywordSelect = kw => {
    props.onSubmit({ keywords: kw });
  };

  return (
    <FinalForm
      {...props}
      render={formRenderProps => {
        const { rootClassName, className, isKeywordSearch, handleSubmit } = formRenderProps;
        const classes = classNames(rootClassName || css.root, className);

        return (
          <Form className={classes} onSubmit={handleSubmit}>
            {isKeywordSearch ? (
              <KeywordSearchField intl={intl} />
            ) : (
              <LocationSearchField
                intl={intl}
                handleChange={handleChange}
                onCategorySelect={handleCategorySelect}
                onKeywordSelect={handleKeywordSelect}
              />
            )}
          </Form>
        );
      }}
    />
  );
};

export default SearchForm;
