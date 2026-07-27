import React, { useEffect, useState } from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import css from './ListingTypeFilter.module.css';

// Spaces are the marketplace's default result set; "servico" listings are
// complementary services and are only shown when explicitly picked here.
// Radio-style (single choice) rather than checkboxes: mixing both back
// together is what this filter exists to prevent.
const SPACES = 'spaces';
const SERVICES = 'servico';

const RadioIcon = ({ checked }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" role="presentation">
    <circle
      cx="8"
      cy="8"
      r="6.5"
      fill="none"
      stroke={checked ? '#3F3131' : '#C4C4C4'}
      strokeWidth="2"
    />
    {checked ? <circle cx="8" cy="8" r="3.5" fill="#3F3131" /> : null}
  </svg>
);

const ListingTypeFilter = props => {
  const { className, urlValue, onSubmit } = props;

  const selected = urlValue === SERVICES ? SERVICES : SPACES;
  const [isOpen, setIsOpen] = useState(true);
  const [pending, setPending] = useState(selected);

  useEffect(() => {
    setPending(selected);
  }, [selected]);

  const options = [
    { value: SPACES, labelId: 'ListingTypeFilter.spaces' },
    { value: SERVICES, labelId: 'ListingTypeFilter.services' },
  ];

  const pick = value => {
    setPending(value);
    // Spaces is the default (no param); services sets pub_listingType.
    onSubmit(value === SERVICES ? SERVICES : null);
  };

  const selectedLabelId = options.find(o => o.value === pending)?.labelId;

  return (
    <div className={classNames(css.root, className)}>
      <button type="button" className={css.header} onClick={() => setIsOpen(!isOpen)}>
        <span className={css.headerLabel}>
          <FormattedMessage id="ListingTypeFilter.label" />
          {selectedLabelId ? (
            <>
              {': '}
              <FormattedMessage id={selectedLabelId} />
            </>
          ) : null}
        </span>
        <span className={css.headerToggle} aria-hidden>
          {isOpen ? '–' : '+'}
        </span>
      </button>
      <ul className={classNames(css.options, { [css.optionsCollapsed]: !isOpen })}>
        {options.map(opt => {
          const checked = pending === opt.value;
          return (
            <li key={opt.value}>
              <label className={checked ? css.optionSelected : css.option}>
                <span className={css.radio}>
                  <RadioIcon checked={checked} />
                </span>
                <input
                  type="radio"
                  name="listingTypeFilter"
                  checked={checked}
                  onChange={() => pick(opt.value)}
                  style={{ display: 'none' }}
                />
                <FormattedMessage id={opt.labelId} />
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default ListingTypeFilter;
