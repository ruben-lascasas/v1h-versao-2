import React, { useEffect, useRef, useState } from 'react';
import classNames from 'classnames';

import { IconArrowHead } from '../../../components';

import { getMonths } from './DatePicker.helpers';

import css from './DatePicker.module.css';

// IconArrowHead component might not be defined if exposed directly to the file.
// This component is called before IconArrowHead component in components/index.js
const PrevIcon = props => (
  <IconArrowHead {...props} direction="left" rootClassName={css.arrowIcon} />
);
const NextIcon = props => (
  <IconArrowHead {...props} direction="right" rootClassName={css.arrowIcon} />
);

const DatePickerHeader = props => {
  const {
    monthClassName,
    currentDate,
    showMonthStepper,
    showPreviousMonthStepper,
    showNextMonthStepper,
    nextMonth,
    previousMonth,
    previousMonthDisabled,
    nextMonthDisabled,
    onJumpToMonth,
    minMonth,
    maxMonth,
    disabled,
    intl,
  } = props;

  const isMonthBeforeMin = (year, monthIdx) => {
    if (!minMonth) return false;
    if (year < minMonth.getFullYear()) return true;
    if (year === minMonth.getFullYear() && monthIdx < minMonth.getMonth()) return true;
    return false;
  };
  const isMonthAfterMax = (year, monthIdx) => {
    if (!maxMonth) return false;
    if (year > maxMonth.getFullYear()) return true;
    if (year === maxMonth.getFullYear() && monthIdx > maxMonth.getMonth()) return true;
    return false;
  };
  const isYearBeforeMin = year => minMonth && year < minMonth.getFullYear();
  const isYearAfterMax = year => maxMonth && year > maxMonth.getFullYear();

  const [pickerOpen, setPickerOpen] = useState(false);
  const [viewYear, setViewYear] = useState(currentDate ? currentDate.getFullYear() : new Date().getFullYear());
  const wrapperRef = useRef(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onDocClick = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [pickerOpen]);

  const togglePicker = () => {
    if (disabled || !onJumpToMonth) return;
    setViewYear(currentDate.getFullYear());
    setPickerOpen(o => !o);
  };

  const handleMonthClick = monthIdx => {
    if (isMonthBeforeMin(viewYear, monthIdx) || isMonthAfterMax(viewYear, monthIdx)) return;
    onJumpToMonth(new Date(viewYear, monthIdx, 1));
    setPickerOpen(false);
  };

  const getTitle = () => {
    if (!currentDate) {
      return;
    }

    const dateFormattingOptions = {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    };

    return intl.formatDate(currentDate, dateFormattingOptions);
  };

  const months = getMonths(intl);

  return (
    <div className={css.header} ref={wrapperRef} style={{ position: 'relative' }}>
      <span aria-atomic="true" aria-live="polite" className={css.hidden}>
        {getTitle()}
      </span>

      {showMonthStepper && showPreviousMonthStepper ? (
        <button
          aria-label={intl.formatMessage({ id: 'DatePicker.screenreader.previousMonthButton' })}
          className={classNames(css.previousMonthButton, {
            [css.monthStepperDisabled]: previousMonthDisabled,
          })}
          disabled={disabled || previousMonthDisabled}
          onClick={previousMonth}
          type="button"
        >
          <PrevIcon />
        </button>
      ) : showMonthStepper ? (
        <span className={css.previousMonthSpacer}></span>
      ) : null}

      <span className={css.currentMonth}>
        <strong
          className={classNames(css.monthName, monthClassName)}
          onClick={togglePicker}
          role={onJumpToMonth ? 'button' : undefined}
          tabIndex={onJumpToMonth ? 0 : undefined}
          onKeyDown={
            onJumpToMonth
              ? e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    togglePicker();
                  }
                }
              : undefined
          }
          style={onJumpToMonth ? { cursor: 'pointer' } : undefined}
        >
          {months[currentDate.getMonth()]} {currentDate.getFullYear()}
        </strong>
      </span>

      {showMonthStepper && showNextMonthStepper ? (
        <button
          aria-label={intl.formatMessage({ id: 'DatePicker.screenreader.nextMonthButton' })}
          className={classNames(css.nextMonthButton, {
            [css.monthStepperDisabled]: nextMonthDisabled,
          })}
          disabled={disabled || nextMonthDisabled}
          onClick={nextMonth}
          type="button"
        >
          <NextIcon />
        </button>
      ) : showMonthStepper ? (
        <span className={css.nextMonthSpacer}></span>
      ) : null}

      {pickerOpen && onJumpToMonth ? (
        <div className={css.monthYearPicker}>
          <div className={css.monthYearPickerYearRow}>
            <button
              type="button"
              className={classNames(css.monthYearPickerYearArrow, {
                [css.monthStepperDisabled]: isYearBeforeMin(viewYear - 1),
              })}
              disabled={isYearBeforeMin(viewYear - 1)}
              onClick={() => setViewYear(y => y - 1)}
              aria-label="Previous year"
            >
              <PrevIcon />
            </button>
            <span className={css.monthYearPickerYearLabel}>{viewYear}</span>
            <button
              type="button"
              className={classNames(css.monthYearPickerYearArrow, {
                [css.monthStepperDisabled]: isYearAfterMax(viewYear + 1),
              })}
              disabled={isYearAfterMax(viewYear + 1)}
              onClick={() => setViewYear(y => y + 1)}
              aria-label="Next year"
            >
              <NextIcon />
            </button>
          </div>
          <div className={css.monthYearPickerGrid}>
            {months.map((m, idx) => {
              const isActive =
                idx === currentDate.getMonth() && viewYear === currentDate.getFullYear();
              const isOutOfRange =
                isMonthBeforeMin(viewYear, idx) || isMonthAfterMax(viewYear, idx);
              return (
                <button
                  key={m}
                  type="button"
                  disabled={isOutOfRange}
                  className={classNames(css.monthYearPickerMonth, {
                    [css.monthYearPickerMonthActive]: isActive,
                    [css.monthYearPickerMonthDisabled]: isOutOfRange,
                  })}
                  onClick={() => handleMonthClick(idx)}
                >
                  {m.length > 3 ? m.slice(0, 3) : m}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DatePickerHeader;
