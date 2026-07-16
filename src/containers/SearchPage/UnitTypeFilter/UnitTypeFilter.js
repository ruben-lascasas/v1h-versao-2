import React, { useEffect, useMemo, useState } from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../../util/reactIntl';
import css from './UnitTypeFilter.module.css';

const OPTIONS = [
  { value: 'hour', labelId: 'UnitTypeFilter.hour' },
  { value: 'day', labelId: 'UnitTypeFilter.day' },
];

const parseValue = raw => {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
};

// Same SVG checkbox used in CategoryMultiFilter, kept inline so the styling
// stays in sync with the categories filter exactly.
const CheckboxIcon = ({ checked }) => (
  <svg width="16" height="16" xmlns="http://www.w3.org/2000/svg" role="presentation">
    <g fill="none" fillRule="evenodd">
      <g transform="translate(2 2)">
        {checked ? (
          <path
            fill="#3F3131"
            d="M9.9992985 1.5048549l-.0194517 6.9993137C9.977549 9.3309651 9.3066522 10 8.4798526 10H1.5001008c-.8284271 0-1.5-.6715729-1.5-1.5l-.000121-7c0-.8284271.6715728-1.5 1.5-1.5h.000121l6.9993246.0006862c.8284272.000067 1.4999458.671694 1.499879 1.5001211a1.5002208 1.5002208 0 0 1-.0000059.0040476z"
          />
        ) : null}
        <path
          stroke={checked ? '#3F3131' : '#C4C4C4'}
          strokeWidth="2"
          fill="none"
          d="M10.9992947 1.507634l-.0194518 6.9993137C10.9760133 9.8849417 9.8578519 11 8.4798526 11H1.5001008c-1.3807119 0-2.5-1.1192881-2.5-2.4999827L-1.0000202 1.5c0-1.3807119 1.119288-2.5 2.500098-2.5l6.9994284.0006862c1.3807118.0001115 2.4999096 1.11949 2.4997981 2.5002019-.0000018.003373-.0000018.003373-.0000096.0067458z"
        />
      </g>
      {checked ? (
        <path
          fill="#FFF"
          d="M5.636621 10.7824771L3.3573694 8.6447948c-.4764924-.4739011-.4764924-1.2418639 0-1.7181952.4777142-.473901 1.251098-.473901 1.7288122 0l1.260291 1.1254782 2.8256927-4.5462307c.3934117-.5431636 1.1545778-.6695372 1.7055985-.278265.5473554.3912721.6731983 1.150729.2797866 1.6951077l-3.6650524 5.709111c-.2199195.306213-.5803433.5067097-.9920816.5067097-.3225487 0-.6328797-.1263736-.8637952-.3560334z"
        />
      ) : null}
    </g>
  </svg>
);

const UnitTypeFilter = props => {
  const { className, urlValue, onSubmit, isDesktop } = props;

  const initialSelected = useMemo(() => parseValue(urlValue), [urlValue]);
  const [pending, setPending] = useState(initialSelected);
  const [isOpen, setIsOpen] = useState(true);

  useEffect(() => {
    setPending(initialSelected);
  }, [initialSelected]);

  const isChecked = v => pending.includes(v);

  const commitValue = next => {
    // Both checked / both unchecked → no filter (clear param).
    const both = next.length === 2 || next.length === 0;
    onSubmit(both ? null : next.join(','));
  };

  const toggle = v => {
    const next = isChecked(v) ? pending.filter(x => x !== v) : [...pending, v];
    setPending(next);
    if (!isDesktop) commitValue(next);
  };

  const onConfirm = () => commitValue(pending);
  const onClear = () => {
    setPending([]);
    onSubmit(null);
  };

  // Show the picked option(s) inline in the title, like the rating filter
  // ("Avaliações: 4+ estrelas") and the integer range ("Número de pessoas: 1 - 23").
  // Both checked / both unchecked is treated as "no filter" — no suffix shown.
  const titleSuffix =
    pending.length === 1
      ? OPTIONS.find(o => o.value === pending[0])?.labelId
      : null;

  return (
    <div className={classNames(css.root, className)}>
      <button type="button" className={css.header} onClick={() => setIsOpen(!isOpen)}>
        <span className={css.headerLabel}>
          <FormattedMessage id="UnitTypeFilter.label" />
          {titleSuffix ? (
            <>
              {': '}
              <FormattedMessage id={titleSuffix} />
            </>
          ) : null}
        </span>
        <span className={css.headerToggle} aria-hidden>
          {isOpen ? '–' : '+'}
        </span>
      </button>
      <ul className={classNames(css.options, { [css.optionsCollapsed]: !isOpen })}>
        {OPTIONS.map(opt => {
          const checked = isChecked(opt.value);
          return (
            <li key={opt.value}>
              <label className={checked ? css.optionSelected : css.option}>
                <span className={css.checkbox}>
                  <CheckboxIcon checked={checked} />
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggle(opt.value)}
                  style={{ display: 'none' }}
                />
                <FormattedMessage id={opt.labelId} />
              </label>
            </li>
          );
        })}
      </ul>
      {isDesktop && isOpen ? (
        <div className={css.actions}>
          <button type="button" className={css.clearBtn} onClick={onClear}>
            <FormattedMessage id="UnitTypeFilter.clear" />
          </button>
          <button type="button" className={css.confirmBtn} onClick={onConfirm}>
            <FormattedMessage id="UnitTypeFilter.confirm" />
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default UnitTypeFilter;
