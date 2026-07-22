import React, { useMemo, useRef, useState } from 'react';
import { useField } from 'react-final-form';
import classNames from 'classnames';

import { useIntl } from '../../util/reactIntl';
import { PORTUGAL_CITIES } from '../../data/portugalCities';

import css from './CityAutocompleteField.module.css';

// ─── Cidade (autocomplete local, sem geocoder externo) ───────────────────────
// O registo original dependia do Mapbox/Google Maps para sugerir localizações,
// mas essa chave nem sempre está configurada e o serviço é global (sugere o
// mundo inteiro). Como o mercado da V1H é, para já, só Portugal, este campo
// filtra localmente os 308 municípios portugueses à medida que se escreve —
// funciona sempre, sem chamadas de rede nem chave de API.

const MAX_SUGGESTIONS = 8;

const stripAccents = value =>
  (value || '')
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

const getSuggestions = query => {
  const normalizedQuery = stripAccents(query).trim();
  if (!normalizedQuery) return [];

  const startsWith = [];
  const contains = [];
  for (const city of PORTUGAL_CITIES) {
    const normalizedCity = stripAccents(city);
    if (normalizedCity.startsWith(normalizedQuery)) {
      startsWith.push(city);
    } else if (normalizedCity.includes(normalizedQuery)) {
      contains.push(city);
    }
    if (startsWith.length >= MAX_SUGGESTIONS) break;
  }
  return [...startsWith, ...contains].slice(0, MAX_SUGGESTIONS);
};

/**
 * Campo de cidade com autocomplete local (dropdown), restrito aos municípios
 * de Portugal — sem depender de um serviço de geocodificação externo.
 *
 * @component
 * @param {Object} props
 * @param {string} props.name - Nome do campo no Final Form
 * @param {string} props.className - Classe que estende a raiz
 * @param {string} props.formId - Id do formulário (prefixo do id do input)
 * @returns {JSX.Element}
 */
const CityAutocompleteField = props => {
  const { name, className, formId } = props;
  const intl = useIntl();
  const inputRef = useRef(null);
  const listboxId = formId ? `${formId}.${name}-listbox` : `${name}-listbox`;
  const inputId = formId ? `${formId}.${name}` : name;

  const { input } = useField(name, { subscription: { value: true } });
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const suggestions = useMemo(() => getSuggestions(input.value), [input.value]);
  const showDropdown = isOpen && suggestions.length > 0;

  const selectCity = city => {
    input.onChange(city);
    setIsOpen(false);
    setHighlightedIndex(-1);
    inputRef.current?.focus();
  };

  const handleChange = e => {
    input.onChange(e.target.value);
    setIsOpen(true);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = e => {
    if (!showDropdown) {
      if (e.key === 'ArrowDown' && suggestions.length > 0) {
        setIsOpen(true);
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(i => (i + 1) % suggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(i => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === 'Enter' && highlightedIndex >= 0) {
      e.preventDefault();
      selectCity(suggestions[highlightedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setHighlightedIndex(-1);
    }
  };

  return (
    <div className={classNames(css.root, className)}>
      <label className={css.label} htmlFor={inputId}>
        {intl.formatMessage({ id: 'SignupForm.cityLabel' })}
      </label>
      <div className={css.inputWrapper}>
        <input
          {...input}
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="off"
          placeholder={intl.formatMessage({ id: 'SignupForm.cityPlaceholder' })}
          maxLength={60}
          onChange={handleChange}
          onFocus={() => setIsOpen(true)}
          onBlur={e => {
            // Delay so a click/mousedown on a suggestion registers first.
            setTimeout(() => setIsOpen(false), 150);
            input.onBlur(e);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showDropdown}
          aria-controls={listboxId}
        />
        {showDropdown ? (
          <ul className={css.dropdown} id={listboxId} role="listbox">
            {suggestions.map((city, index) => (
              <li
                key={city}
                role="option"
                aria-selected={index === highlightedIndex}
                className={classNames(css.option, {
                  [css.optionHighlighted]: index === highlightedIndex,
                })}
                onMouseDown={e => {
                  // preventDefault keeps focus on the input, so our onBlur
                  // handler above never fires and doesn't race this click.
                  e.preventDefault();
                  selectCity(city);
                }}
                onMouseEnter={() => setHighlightedIndex(index)}
              >
                {city}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
};

export default CityAutocompleteField;
