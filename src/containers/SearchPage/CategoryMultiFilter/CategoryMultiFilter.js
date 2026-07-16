import React, { useState, useEffect } from 'react';
import { useDispatch } from 'react-redux';
import classNames from 'classnames';

import { useConfiguration } from '../../../context/configurationContext';

import IconPlus from '../IconPlus/IconPlus';
import { fetchSubcategoryCounts } from '../SearchPage.duck';
import css from './CategoryMultiFilter.module.css';

const parseList = value => {
  if (!value) return [];
  return String(value)
    .replace(/^has_(any|all):/, '')
    .split(',')
    .map(v => v.trim())
    .filter(Boolean);
};

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

const CategoryMultiFilter = props => {
  const {
    label,
    intl,
    listingCategories = [],
    optionCounts = {},
    initialValues,
    queryParamNames,
    onSubmit,
    isDesktop = false,
  } = props;

  const level1Param = queryParamNames?.[0];
  const level2Param = queryParamNames?.[1];

  const committedL1 = parseList(initialValues?.[level1Param]);
  const committedL2 = parseList(initialValues?.[level2Param]);

  const [isOpen, setIsOpen] = useState(true);
  const [pendingL1, setPendingL1] = useState(committedL1);
  const [pendingL2, setPendingL2] = useState(committedL2);

  useEffect(() => {
    setPendingL1(committedL1);
    setPendingL2(committedL2);
  }, [initialValues?.[level1Param], initialValues?.[level2Param]]);

  // For any L1 already committed in the URL, kick off a subcount fetch (skips cached).
  useEffect(() => {
    committedL1.forEach(catId => {
      const cat = listingCategories.find(c => c.id === catId);
      const subs = cat?.subcategories || [];
      if (subs.length === 0) return;
      const cachedIds = subs.filter(s => optionCounts[s.id] != null).map(s => s.id);
      const missing = subs.filter(s => !cachedIds.includes(s.id));
      if (missing.length > 0) {
        dispatch(
          fetchSubcategoryCounts({ subcategories: subs, alreadyCachedIds: cachedIds, config })
        );
      }
    });
  }, [committedL1.join(',')]);

  const isSelected = pendingL1.length > 0 || pendingL2.length > 0;
  const totalSelected = pendingL1.length + pendingL2.length;

  const dispatch = useDispatch();
  const config = useConfiguration();

  // Per-branch semantics:
  // - pendingL1 = top-level categories the user wants in full (no specific sub picked)
  // - pendingL2 = specific subs picked (from any branches not in pendingL1)
  // Picking a sub auto-unchecks its parent L1 (the sub becomes the more
  // specific filter for that branch). Re-checking an L1 wipes any of its
  // currently-picked subs.
  // The query layer (SearchPage.duck) splits these into 2 API calls and
  // unions the results — so different branches can coexist independently.

  // Branches that should render their subs: either checked, or have a sub picked.
  const parentOfSub = subId =>
    listingCategories.find(c => (c.subcategories || []).some(s => s.id === subId))?.id;
  const branchesExpanded = new Set([
    ...pendingL1,
    ...pendingL2.map(parentOfSub).filter(Boolean),
  ]);

  // Mobile (no isDesktop) doesn't show LIMPAR/CONFIRMAR — every toggle is
  // committed live so the modal's "VER N ANÚNCIOS" reflects the right count.
  const submitState = (nextL1, nextL2) => {
    onSubmit({
      [level1Param]: nextL1.length > 0 ? nextL1.join(',') : null,
      ...(level2Param
        ? { [level2Param]: nextL2.length > 0 ? nextL2.join(',') : null }
        : {}),
    });
  };

  const toggleL1 = id => {
    const cat = listingCategories.find(c => c.id === id);
    const newCatSubs = cat?.subcategories || [];
    const newCatSubIds = newCatSubs.map(s => s.id);
    const willCheck = !pendingL1.includes(id);

    const nextL1 = willCheck ? [...pendingL1, id] : pendingL1.filter(x => x !== id);
    const nextL2 = pendingL2.filter(s => !newCatSubIds.includes(s));

    setPendingL1(nextL1);
    setPendingL2(nextL2);

    if (willCheck) {
      const cachedIds = newCatSubs.filter(s => optionCounts[s.id] != null).map(s => s.id);
      const missing = newCatSubs.filter(s => !cachedIds.includes(s.id));
      if (missing.length > 0) {
        dispatch(
          fetchSubcategoryCounts({ subcategories: newCatSubs, alreadyCachedIds: cachedIds, config })
        );
      }
    }
    if (!isDesktop) submitState(nextL1, nextL2);
  };

  const toggleL2 = id => {
    const willCheck = !pendingL2.includes(id);
    let nextL1 = pendingL1;
    let nextL2 = pendingL2;
    if (willCheck) {
      const parentId = parentOfSub(id);
      if (parentId && pendingL1.includes(parentId)) {
        nextL1 = pendingL1.filter(x => x !== parentId);
      }
      nextL2 = [...pendingL2, id];
    } else {
      nextL2 = pendingL2.filter(x => x !== id);
    }
    setPendingL1(nextL1);
    setPendingL2(nextL2);
    if (!isDesktop) submitState(nextL1, nextL2);
  };

  const handleConfirm = () => {
    onSubmit({
      [level1Param]: pendingL1.length > 0 ? pendingL1.join(',') : null,
      ...(level2Param
        ? { [level2Param]: pendingL2.length > 0 ? pendingL2.join(',') : null }
        : {}),
    });
  };

  const handleClear = () => {
    setPendingL1([]);
    setPendingL2([]);
    onSubmit({
      [level1Param]: null,
      ...(level2Param ? { [level2Param]: null } : {}),
    });
  };

  return (
    <div className={css.root}>
      <div className={css.filterHeader}>
        <button
          type="button"
          className={css.labelButton}
          onClick={() => setIsOpen(o => !o)}
          aria-expanded={isOpen}
        >
          <span className={css.labelButtonContent}>
            <span className={css.label}>
              {label}
              {isSelected && (
                <span className={css.labelSelected}>
                  {' · '}
                  {totalSelected}
                </span>
              )}
            </span>
            <span className={css.openSign}>
              <IconPlus isOpen={isOpen} isSelected={isSelected} />
            </span>
          </span>
        </button>
      </div>

      {isOpen && (
        <div className={css.plain}>
          <ul className={css.optionList}>
            {listingCategories.map(cat => {
              const checked = pendingL1.includes(cat.id);
              const count = optionCounts[cat.id];
              const subs = cat.subcategories || [];
              return (
                <li key={cat.id} className={css.option}>
                  <button
                    type="button"
                    className={classNames(css.optionBtn, {
                      [css.optionBtnSelected]: checked,
                    })}
                    onClick={() => toggleL1(cat.id)}
                  >
                    <span className={css.optionRow}>
                      <span className={css.optionCheckbox}>
                        <CheckboxIcon checked={checked} />
                      </span>
                      <span className={css.optionLabelText}>{cat.name}</span>
                      {count != null && (
                        <span className={css.optionCount}>{count}</span>
                      )}
                    </span>
                  </button>

                  {branchesExpanded.has(cat.id) && subs.length > 0 && (
                    <ul className={css.subOptionList}>
                      {subs.map(sub => {
                        const subSelected = pendingL2.includes(sub.id);
                        const subCount = optionCounts[sub.id];
                        const isInert = subCount === 0;
                        return (
                          <li key={sub.id} className={css.subOption}>
                            <button
                              type="button"
                              className={classNames(css.subOptionBtn, {
                                [css.subOptionBtnSelected]: subSelected,
                              })}
                              onClick={() => {
                                if (subCount === 0) return;
                                toggleL2(sub.id);
                              }}
                            >
                              <span className={css.subOptionRow}>
                                <span className={css.subOptionLabel}>{sub.name}</span>
                                {subCount != null && (
                                  <span className={css.subOptionCount}>{subCount}</span>
                                )}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <div className={css.actionsRow}>
            <button type="button" className={css.clearButton} onClick={handleClear}>
              {intl?.formatMessage({ id: 'StarRatingFilter.clear' }) || 'LIMPAR'}
            </button>
            {isDesktop && (
              <button type="button" className={css.confirmButton} onClick={handleConfirm}>
                {intl?.formatMessage({ id: 'StarRatingFilter.confirm' }) || 'CONFIRMAR'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CategoryMultiFilter;
