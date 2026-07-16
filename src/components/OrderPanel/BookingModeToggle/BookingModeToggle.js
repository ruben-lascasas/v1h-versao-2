import React from 'react';
import classNames from 'classnames';
import { FormattedMessage } from '../../../util/reactIntl';

import css from './BookingModeToggle.module.css';

/**
 * Toggle between "Single booking" and "Multiple bookings" modes on the
 * order panel. Phase 1: visual toggle only — when "multiple" is selected,
 * the parent renders the MultipleBookingsManager.
 */
const BookingModeToggle = props => {
  const { mode, onChange } = props;
  return (
    <div className={css.root} role="tablist" aria-label="Booking mode">
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'single'}
        className={classNames(css.tab, { [css.active]: mode === 'single' })}
        onClick={() => onChange('single')}
      >
        <FormattedMessage
          id="BookingModeToggle.single"
          defaultMessage="Reserva única"
        />
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'multiple'}
        className={classNames(css.tab, { [css.active]: mode === 'multiple' })}
        onClick={() => onChange('multiple')}
      >
        <FormattedMessage
          id="BookingModeToggle.multiple"
          defaultMessage="Múltiplas reservas"
        />
      </button>
    </div>
  );
};

export default BookingModeToggle;
