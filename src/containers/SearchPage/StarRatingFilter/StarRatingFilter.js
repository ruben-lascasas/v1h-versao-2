import React, { useState, useEffect } from 'react';
import classNames from 'classnames';

import IconPlus from '../IconPlus/IconPlus';
import css from './StarRatingFilter.module.css';

const PARAM_NAME = 'pub_averageRating';

const parseMin = value => {
  if (!value) return null;
  const [min] = value.split(',').map(Number);
  return isNaN(min) ? null : min;
};

const StarRatingFilter = props => {
  const {
    id,
    label,
    intl,
    queryParamNames = [PARAM_NAME],
    initialValues,
    onSubmit,
    isDesktop = false,
  } = props;

  const paramName = queryParamNames[0] || PARAM_NAME;
  const committedMin = parseMin(initialValues?.[paramName]);

  const [isOpen, setIsOpen] = useState(true);
  const [hovered, setHovered] = useState(null);
  const [pending, setPending] = useState(committedMin);

  useEffect(() => {
    setPending(committedMin);
  }, [committedMin]);

  const displayStar = hovered ?? pending ?? 0;
  const isSelected = committedMin != null;
  // Title shows pending (preview) when the user is choosing, falling back to
  // the committed URL value otherwise. This way the title updates as soon as
  // a star is clicked, even before CONFIRMAR.
  const displayMin = pending ?? committedMin;
  const showInTitle = displayMin != null;

  const handleConfirm = () => {
    onSubmit(pending != null ? { [paramName]: `${pending},5` } : { [paramName]: null });
  };

  const handleClear = () => {
    setPending(null);
    onSubmit({ [paramName]: null });
  };

  return (
    <div className={css.root}>
      <div className={css.filterHeader}>
        <button
          className={css.labelButton}
          onClick={() => setIsOpen(o => !o)}
          aria-expanded={isOpen}
        >
          <span className={css.labelButtonContent}>
            <span className={css.labelWrapper}>
              <span className={css.label}>
                {label || intl?.formatMessage({ id: 'FilterComponent.ratingLabel' })}
                {showInTitle && (
                  <span className={css.labelSelected}>
                    {': '}
                    {displayMin === 5
                      ? intl?.formatMessage({ id: 'StarRatingFilter.selectionMax' })
                      : intl?.formatMessage(
                          { id: 'StarRatingFilter.selectionMin' },
                          { count: displayMin }
                        )}
                  </span>
                )}
              </span>
            </span>
            <span className={css.openSign}>
              <IconPlus isOpen={isOpen} isSelected={isSelected} />
            </span>
          </span>
        </button>
      </div>

      {isOpen && (
        <div className={css.plain}>
          <div
            className={css.stars}
            onMouseLeave={() => setHovered(null)}
          >
            {[1, 2, 3, 4, 5].map(star => (
              <button
                key={star}
                type="button"
                className={classNames(css.star, { [css.filled]: star <= displayStar })}
                onClick={() => {
                  const next = star === pending ? null : star;
                  setPending(next);
                  // Mobile auto-commits (no CONFIRMAR button). Desktop waits
                  // for CONFIRMAR — but the title shows the pending value as
                  // a preview, see `displayMin` below.
                  if (!isDesktop) {
                    onSubmit(next != null ? { [paramName]: `${next},5` } : { [paramName]: null });
                  }
                }}
                onMouseEnter={() => setHovered(star)}
                aria-label={intl?.formatMessage(
                  { id: 'StarRatingFilter.starAria' },
                  { count: star }
                )}
              >
                ★
              </button>
            ))}
          </div>
          <div className={css.actionsRow}>
            <button type="button" className={css.clearButton} onClick={handleClear}>
              {intl?.formatMessage({ id: 'StarRatingFilter.clear' })}
            </button>
            {isDesktop && (
              <button type="button" className={css.confirmButton} onClick={handleConfirm}>
                {intl?.formatMessage({ id: 'StarRatingFilter.confirm' })}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default StarRatingFilter;
