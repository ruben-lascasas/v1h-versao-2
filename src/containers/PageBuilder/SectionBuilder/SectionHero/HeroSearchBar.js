import React, { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import classNames from 'classnames';
import { Form as FinalForm, Field } from 'react-final-form';

import { useLocale } from '../../../../context/localeContext';
import { Form, LocationAutocompleteInput } from '../../../../components';

import css from './HeroSearchBar.module.css';

const identity = v => v;

// Categories aligned with the SearchPage filter (pub_categoryLevel1)
const CATEGORIES = [
  { slug: '', labelPt: 'Selecionar categoria', labelEn: 'Select category' },
  { slug: 'trabalho-reunioes', labelPt: 'Trabalho & Reuniões', labelEn: 'Work & Meetings' },
  { slug: 'educacao-cultura', labelPt: 'Educação & Cultura', labelEn: 'Education & Culture' },
  { slug: 'gastronomia-convivio', labelPt: 'Gastronomia & Convívio', labelEn: 'Gastronomy & Social' },
  { slug: 'eventos-festas', labelPt: 'Eventos & Festas', labelEn: 'Events & Parties' },
  { slug: 'criatividade-producao', labelPt: 'Criatividade & Produção', labelEn: 'Creativity & Production' },
  { slug: 'saude-bemestar', labelPt: 'Saúde, Bem-estar & Corpo', labelEn: 'Health, Wellness & Body' },
  { slug: 'desporto-actividadefisica', labelPt: 'Desporto & Actividade Física', labelEn: 'Sport & Physical Activity' },
  { slug: 'espaco-arlivre', labelPt: 'Espaços ao Ar Livre', labelEn: 'Outdoor Spaces' },
  { slug: 'espacos_inusitados_alternativos', labelPt: 'Espaços Inusitados & Alternativos', labelEn: 'Unusual & Alternative Spaces' },
];

const CategoryDropdown = ({ value, onChange, isPt, onInteract }) => {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const handler = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const notifyInteract = () => {
    if (typeof onInteract === 'function') onInteract();
  };

  const selected = CATEGORIES.find(c => c.slug === value) || CATEGORIES[0];
  const selectedLabel = isPt ? selected.labelPt : selected.labelEn;

  return (
    <div className={css.categoryWrapper} ref={wrapperRef}>
      <button
        type="button"
        className={css.categoryTrigger}
        onClick={() => {
          notifyInteract();
          setOpen(o => !o);
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={css.categoryTriggerLabel}>{selectedLabel}</span>
        <span className={classNames(css.categoryChevron, { [css.categoryChevronOpen]: open })}
          aria-hidden="true"
        >
          <svg width="12" height="8" viewBox="0 0 12 8" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M1 1L6 6L11 1"
              fill="none"
              stroke="#2E2E2E"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </button>
      {open && (
        <ul className={css.categoryMenu} role="listbox">
          {CATEGORIES.filter(c => c.slug !== '').map(c => {
            const label = isPt ? c.labelPt : c.labelEn;
            const isSelected = c.slug === value;
            return (
              <li key={c.slug} role="option" aria-selected={isSelected}>
                <button
                  type="button"
                  className={classNames(css.categoryOption, { [css.categoryOptionSelected]: isSelected })}
                  onClick={() => {
                    notifyInteract();
                    onChange(c.slug);
                    setOpen(false);
                  }}
                >
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

const HeroSearchBar = ({ onInteract }) => {
  const { locale } = useLocale();
  const history = useHistory();
  const isPt = !locale || String(locale).toLowerCase().startsWith('pt');

  const [categorySlug, setCategorySlug] = useState('');

  const notifyInteract = () => {
    if (typeof onInteract === 'function') onInteract();
  };

  const goToSearch = values => {
    const location = values?.location;
    const parts = [];
    if (location?.selectedPlace) {
      const { address, bounds } = location.selectedPlace;
      if (address) parts.push(`address=${encodeURIComponent(address)}`);
      if (bounds?.ne && bounds?.sw) {
        const boundsStr = `${bounds.ne.lat},${bounds.ne.lng},${bounds.sw.lat},${bounds.sw.lng}`;
        parts.push(`bounds=${encodeURIComponent(boundsStr)}`);
      }
    } else if (location?.search) {
      parts.push(`keywords=${encodeURIComponent(location.search)}`);
    }
    if (categorySlug) {
      parts.push(`pub_categoryLevel1=${encodeURIComponent(categorySlug)}`);
    }
    history.push(`/s${parts.length ? `?${parts.join('&')}` : ''}`);
  };

  const placeholder = isPt ? 'Onde?' : 'Where?';

  return (
    <FinalForm
      onSubmit={goToSearch}
      render={({ handleSubmit }) => (
        <Form className={css.bar} onSubmit={handleSubmit}>
          <div
            className={css.locationWrapper}
            onMouseDown={notifyInteract}
            onFocus={notifyInteract}
          >
            <Field
              name="location"
              format={identity}
              render={({ input, meta }) => {
                const wrappedOnChange = value => {
                  notifyInteract();
                  input.onChange(value);
                };
                return (
                  <LocationAutocompleteInput
                    id="hero-location"
                    rootClassName={css.locationRoot}
                    inputClassName={css.locationInput}
                    iconClassName={css.locationIcon}
                    predictionsClassName={css.locationPredictions}
                    placeholder={placeholder}
                    closeOnBlur
                    useDefaultPredictions={false}
                    suggestCurrentLocation={false}
                    locationOnlyHistory
                    input={{ ...input, onChange: wrappedOnChange }}
                    meta={meta}
                  />
                );
              }}
            />
          </div>

          <CategoryDropdown
            value={categorySlug}
            onChange={slug => {
              notifyInteract();
              setCategorySlug(slug);
            }}
            isPt={isPt}
            onInteract={onInteract}
          />

          <button type="submit" className={css.submit}>
            {isPt ? 'Procurar' : 'Search'}
          </button>
        </Form>
      )}
    />
  );
};

export default HeroSearchBar;
