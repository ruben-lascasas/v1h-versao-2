import React, { useEffect, useMemo, useState } from 'react';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import { useConfiguration } from '../../../context/configurationContext';
import { PrimaryButton } from '../../../components';
import { DateRangePicker } from '../../../components/DatePicker/DatePickers/DateRangePicker';
import { SingleDatePicker } from '../../../components/DatePicker/DatePickers/SingleDatePicker';
import {
  getStartOf,
  getStartHours,
  getEndHours,
  isInRange,
  monthIdString,
  isSameDay,
} from '../../../util/dates';
import { timeSlotsPerDate } from '../../../util/generators';
import { formatMoney } from '../../../util/currency';
import {
  LINE_ITEM_DAY,
  LINE_ITEM_NIGHT,
  LINE_ITEM_HOUR,
  LINE_ITEM_FIXED,
} from '../../../util/types';
import { types as sdkTypes } from '../../../util/sdkLoader';

const { Money } = sdkTypes;

import css from './MultipleBookingsManager.module.css';

/**
 * Phase 1: UI scaffolding for multiple bookings.
 *
 * Self-contained slot picker (date + start time + end time) using HTML5
 * inputs styled to match the single-booking visual look. Slots are stored
 * in local state. The "Send booking request" submit is wired in Phase 2
 * (pricing + checkout).
 */
const MultipleBookingsManager = props => {
  const {
    isHourly = false,
    timeZone,
    monthlyTimeSlots,
    onFetchTimeSlots,
    dayCountAvailableForBooking,
    listingId,
    price,
    marketplaceCurrency,
    lineItemUnitType,
    onSubmitSlot,
    onContactUser,
  } = props;
  const intl = useIntl();
  const config = useConfiguration();

  // Convert an inclusive end date (user picked 30/04) to the exclusive
  // end date required by the booking API (01/05). This matches what the
  // single-booking flow does via `getExclusiveEndDate`.
  const toExclusiveEnd = inclusiveDate => {
    const d = new Date(inclusiveDate);
    d.setDate(d.getDate() + 1);
    d.setHours(0, 0, 0, 0);
    return d;
  };

  // Build the values shape that the listing's onSubmit (handleSubmit) expects.
  const buildSubmitValues = slot => {
    if (isHourly) {
      return {
        bookingStartTime: slot.bookingStart.getTime(),
        bookingEndTime: slot.bookingEnd.getTime(),
      };
    }
    return {
      bookingDates: {
        startDate: slot.bookingStart,
        endDate: toExclusiveEnd(slot.bookingEnd),
      },
    };
  };

  // Submit ALL slots in one transaction. The first slot becomes the
  // primary booking; the rest are passed via `multipleBookings` so the
  // backend can sum line items and the checkout/transaction pages can
  // display every slot.
  const onSendRequest = () => {
    if (slots.length === 0 || !onSubmitSlot) return;
    const [firstSlot, ...remaining] = slots;
    const baseValues = buildSubmitValues(firstSlot);
    // For daily listings, convert remaining slots' end dates to exclusive
    // (matches Sharetribe API) so the backend's day-count math is correct.
    const additionalBookings = remaining.map(s => {
      const end = isHourly ? s.bookingEnd : toExclusiveEnd(s.bookingEnd);
      return {
        bookingStart: s.bookingStart.toISOString(),
        bookingEnd: end.toISOString(),
      };
    });
    onSubmitSlot({
      ...baseValues,
      multipleBookings: {
        isHourly,
        additionalBookings,
      },
    });
  };

  // Compute units (hours / days / nights) for a slot.
  // For daily/night listings, the picker stores the end date as the last
  // inclusive day picked by the user (e.g. 29/04 - 30/04 = 2 days), so we
  // add 1 to the diff to count both endpoints.
  const slotUnits = slot => {
    if (!slot?.bookingStart || !slot?.bookingEnd) return 0;
    const ms = slot.bookingEnd.getTime() - slot.bookingStart.getTime();
    if (lineItemUnitType === LINE_ITEM_HOUR) {
      return Math.max(1, Math.round(ms / (60 * 60 * 1000)));
    }
    if (
      lineItemUnitType === LINE_ITEM_DAY ||
      lineItemUnitType === LINE_ITEM_NIGHT
    ) {
      return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)) + 1);
    }
    if (lineItemUnitType === LINE_ITEM_FIXED) {
      return 1;
    }
    return 1;
  };

  // Estimate the slot price in subunits (cents) using the listing price.
  // This is a frontend estimate only — the backend will calculate the
  // actual price at checkout.
  const slotPriceSubunits = slot => {
    if (!price?.amount || price?.currency !== marketplaceCurrency) return 0;
    return price.amount * slotUnits(slot);
  };

  // Fetch month time slots using the same signature single booking uses:
  // onFetchTimeSlots(listingId, start, end, timeZone, options).
  const fetchMonthSlots = month => {
    if (!onFetchTimeSlots || !listingId || !timeZone || !month) return;
    const today = new Date();
    const monthStart = getStartOf(month, 'month', timeZone);
    const start = monthStart < today ? today : monthStart;
    const nextMonth = getStartOf(monthStart, 'month', timeZone, 1, 'months');
    const horizon = getStartOf(today, 'day', timeZone, dayCountAvailableForBooking || 730, 'days');
    const end = nextMonth > horizon ? horizon : nextMonth;
    // Fetch all time slots for the month (no maxPerInterval limit) so all
    // available windows on a day (e.g. 01:00-02:00 AND 20:00-21:00) are
    // returned, not just one. The default helper paginates with perPage=500.
    onFetchTimeSlots(listingId, start, end, timeZone, {
      extraQueryParams: { perPage: 500, page: 1 },
    });
  };
  const [slots, setSlots] = useState([]);
  const [isAddingSlot, setIsAddingSlot] = useState(false);
  // Date range as an array — empty, [start], or [start, end].
  const [draftRange, setDraftRange] = useState([]);
  // For hourly listings: separate date + start/end times.
  const [draftDate, setDraftDate] = useState(null);
  const [draftStartTime, setDraftStartTime] = useState('');
  const [draftEndTime, setDraftEndTime] = useState('');

  // Maximum number of bookings allowed in a single multi-request.
  const MAX_SLOTS = 10;
  const isLimitReached = slots.length >= MAX_SLOTS;

  // Total estimated price across all saved slots.
  const totalSubunits = slots.reduce((sum, s) => sum + slotPriceSubunits(s), 0);
  const formattedTotal =
    price && marketplaceCurrency && totalSubunits > 0
      ? formatMoney(intl, new Money(totalSubunits, marketplaceCurrency))
      : null;

  // Fetch month slots when a date is picked.
  useEffect(() => {
    if (!isHourly || !draftDate) return;
    fetchMonthSlots(draftDate);
  }, [isHourly, draftDate]);

  // Also fetch the current month when the slot picker opens.
  useEffect(() => {
    if (!isHourly || !isAddingSlot) return;
    fetchMonthSlots(new Date());
  }, [isHourly, isAddingSlot]);

  // Find the time slots that cover the selected date. Uses the same helper
  // as the single-booking flow so we correctly handle slots that start and
  // end on the same day (e.g. 20:00–21:00).
  const timeSlotsOnSelectedDate = useMemo(() => {
    if (!isHourly || !draftDate || !timeZone || !monthlyTimeSlots) return [];
    const monthId = monthIdString(draftDate, timeZone);
    const slotsForMonth = monthlyTimeSlots[monthId]?.timeSlots || [];
    const dayStart = getStartOf(draftDate, 'day', timeZone);
    const dayEnd = getStartOf(dayStart, 'day', timeZone, 1, 'days');
    const perDate = timeSlotsPerDate(dayStart, dayEnd, slotsForMonth, timeZone);
    const dayId = Object.keys(perDate)[0];
    return perDate[dayId]?.timeSlots || [];
  }, [isHourly, draftDate, timeZone, monthlyTimeSlots]);

  // Compute available start hours for the selected date. Excludes hours
  // that fall within an already-saved slot on the same day.
  const availableStartHours = useMemo(() => {
    if (!isHourly || !draftDate || timeSlotsOnSelectedDate.length === 0) return [];
    const dayStart = getStartOf(draftDate, 'day', timeZone);
    const allHours = timeSlotsOnSelectedDate.reduce((acc, t) => {
      const s = t.attributes.start;
      const e = t.attributes.end;
      const startLimit = s > dayStart ? s : dayStart;
      const endLimit = e;
      return acc.concat(getStartHours(startLimit, endLimit, timeZone, intl));
    }, []);
    // Filter out hours that overlap any already-saved slot for this date.
    const sameDaySlots = slots.filter(slot => {
      if (!slot.bookingStart || !slot.bookingEnd) return false;
      const slotDay = getStartOf(slot.bookingStart, 'day', timeZone);
      return slotDay.getTime() === dayStart.getTime();
    });
    if (sameDaySlots.length === 0) return allHours;
    return allHours.filter(h => {
      const hourTs = h.timestamp;
      return !sameDaySlots.some(
        slot => hourTs >= slot.bookingStart.getTime() && hourTs < slot.bookingEnd.getTime()
      );
    });
  }, [isHourly, draftDate, timeSlotsOnSelectedDate, timeZone, intl, slots]);

  // Auto-select the first available start time when a date is picked
  // (mirrors the single-booking behavior where the picker is never empty).
  useEffect(() => {
    if (!isHourly || !draftDate) return;
    if (!draftStartTime && availableStartHours.length > 0) {
      const firstStart = availableStartHours[0];
      setDraftStartTime(firstStart.timeOfDay);
      // Also auto-fill end time
      const startDateTime = new Date(firstStart.timestamp);
      const slot = timeSlotsOnSelectedDate.find(t => {
        const s = t.attributes.start;
        const e = t.attributes.end;
        return startDateTime >= s && startDateTime < e;
      });
      if (slot) {
        const endHours = getEndHours(startDateTime, slot.attributes.end, timeZone, intl);
        setDraftEndTime(endHours[0]?.timeOfDay || '');
      }
    }
  }, [isHourly, draftDate, availableStartHours, draftStartTime, timeSlotsOnSelectedDate, timeZone, intl]);

  // Compute available end hours given the selected start time.
  const availableEndHours = useMemo(() => {
    if (!isHourly || !draftStartTime || timeSlotsOnSelectedDate.length === 0) return [];
    // Find the slot that contains the selected start hour
    const [sh] = draftStartTime.split(':').map(Number);
    const startDateTime = new Date(draftDate);
    startDateTime.setHours(sh, 0, 0, 0);
    const slot = timeSlotsOnSelectedDate.find(t => {
      const s = t.attributes.start;
      const e = t.attributes.end;
      return startDateTime >= s && startDateTime < e;
    });
    if (!slot) return [];
    return getEndHours(startDateTime, slot.attributes.end, timeZone, intl);
  }, [isHourly, draftDate, draftStartTime, timeSlotsOnSelectedDate, timeZone, intl]);

  // Multi-bookings are limited to <=90 days from today. Long-term (>90 days)
  // reservations require the single-booking flow because their payment is
  // deferred (Stripe holds funds at most 90 days), which can't be combined
  // with short-term slots in a single transaction.
  const MULTI_BOOKING_HORIZON_DAYS = 90;

  // Block past dates, dates beyond 90 days, and dates already included
  // in any previously saved slot.
  const isDayBlocked = day => {
    const start = getStartOf(new Date(), 'day');
    const end = getStartOf(start, 'day', null, MULTI_BOOKING_HORIZON_DAYS, 'days');
    if (!isInRange(day, start, end, 'day')) return true;

    // For daily/night listings, block any date that's already in another
    // saved slot (same day = same booking unit). For hourly listings,
    // multiple slots on the same day at different times are allowed —
    // hour-level conflicts are filtered later in the time dropdowns.
    if (!isHourly) {
      const dayStart = getStartOf(day, 'day');
      const overlapsExisting = slots.some(slot => {
        if (!slot.bookingStart || !slot.bookingEnd) return false;
        const slotStart = getStartOf(slot.bookingStart, 'day');
        const slotEnd = getStartOf(slot.bookingEnd, 'day');
        return dayStart >= slotStart && dayStart <= slotEnd;
      });
      if (overlapsExisting) return true;
    }

    // Block dates without any time slot covering them (for both hourly and
    // daily listings — the listing owner's availability plan rules apply).
    if (timeZone && monthlyTimeSlots) {
      const monthId = monthIdString(day, timeZone);
      const slotsForMonth = monthlyTimeSlots[monthId]?.timeSlots;
      // If month not fetched yet for hourly, block defensively. For daily,
      // allow (daily availability is less granular and pre-fetch is heavier).
      if (!slotsForMonth) return isHourly;
      const dayStart = getStartOf(day, 'day', timeZone);
      const dayEnd = getStartOf(dayStart, 'day', timeZone, 1, 'days');
      const perDate = timeSlotsPerDate(dayStart, dayEnd, slotsForMonth, timeZone);
      const dayId = Object.keys(perDate)[0];
      const slotsOnDay = perDate[dayId]?.timeSlots || [];
      if (slotsOnDay.length === 0) return true;
    }

    return false;
  };

  const isDraftValid = isHourly
    ? !!draftDate && !!draftStartTime && !!draftEndTime && draftStartTime < draftEndTime
    : draftRange.length === 2 && draftRange[0] <= draftRange[1];

  const onSaveSlot = () => {
    if (!isDraftValid) return;
    if (isHourly) {
      const [sh, sm] = draftStartTime.split(':').map(Number);
      const [eh, em] = draftEndTime.split(':').map(Number);
      const start = new Date(draftDate);
      start.setHours(sh, sm, 0, 0);
      const end = new Date(draftDate);
      end.setHours(eh, em, 0, 0);
      setSlots(prev => [...prev, { bookingStart: start, bookingEnd: end }]);
    } else {
      setSlots(prev => [
        ...prev,
        { bookingStart: draftRange[0], bookingEnd: draftRange[1] },
      ]);
    }
    setDraftRange([]);
    setDraftDate(null);
    setDraftStartTime('');
    setDraftEndTime('');
    setIsAddingSlot(false);
  };

  const onCancelSlot = () => {
    setDraftRange([]);
    setDraftDate(null);
    setDraftStartTime('');
    setDraftEndTime('');
    setIsAddingSlot(false);
  };

  const onRemoveSlot = idx => {
    setSlots(prev => prev.filter((_, i) => i !== idx));
  };

  const formatSlot = slot => {
    if (!slot) return '';
    const { bookingStart, bookingEnd } = slot;
    if (!bookingStart || !bookingEnd) return '';
    const dateOpts = { weekday: 'short', day: 'numeric', month: 'short' };
    const timeOpts = { hour: '2-digit', minute: '2-digit' };
    if (isHourly) {
      const dateStr = intl.formatDate(bookingStart, dateOpts);
      const startStr = intl.formatTime(bookingStart, timeOpts);
      const endStr = intl.formatTime(bookingEnd, timeOpts);
      return `${dateStr} · ${startStr} – ${endStr}`;
    }
    const startStr = intl.formatDate(bookingStart, dateOpts);
    const endStr = intl.formatDate(bookingEnd, dateOpts);
    return `${startStr} – ${endStr}`;
  };

  return (
    <div className={css.root}>
      <p className={css.horizonNotice}>
        <FormattedMessage
          id="MultipleBookingsManager.horizonNotice"
          defaultMessage="Reservas múltiplas suportam apenas datas até 90 dias. Datas mais distantes só estão disponíveis em 'Reserva única'."
        />
      </p>

      {slots.length === 0 && !isAddingSlot && (
        <p className={css.emptyHint}>
          <FormattedMessage
            id="MultipleBookingsManager.emptyHint"
            defaultMessage="Adiciona a primeira reserva para começar..."
          />
        </p>
      )}

      {slots.length > 0 && (
        <ul className={css.slotList}>
          {slots.map((slot, idx) => {
            const subunits = slotPriceSubunits(slot);
            const formattedSlotPrice =
              subunits > 0
                ? formatMoney(intl, new Money(subunits, marketplaceCurrency))
                : null;
            const units = slotUnits(slot);
            const formattedUnitPrice =
              price && marketplaceCurrency
                ? formatMoney(intl, new Money(price.amount, marketplaceCurrency))
                : null;
            const unitLabel = isHourly
              ? intl.formatMessage(
                  { id: 'MultipleBookingsManager.unitsHours', defaultMessage: '{n} horas' },
                  { n: units }
                )
              : intl.formatMessage(
                  { id: 'MultipleBookingsManager.unitsDays', defaultMessage: '{n} dias' },
                  { n: units }
                );
            const dayOpts = { weekday: 'long' };
            const dateOpts = { day: '2-digit', month: '2-digit' };
            return (
              <li key={idx} className={css.slotItem}>
                <div className={css.slotHeader}>
                  <span className={css.slotIndex}>
                    <FormattedMessage
                      id="MultipleBookingsManager.bookingNumber"
                      defaultMessage="Reserva {n}"
                      values={{ n: idx + 1 }}
                    />
                  </span>
                  <button
                    type="button"
                    className={css.removeSlotBtn}
                    onClick={() => onRemoveSlot(idx)}
                    aria-label={intl.formatMessage({
                      id: 'MultipleBookingsManager.removeSlot',
                      defaultMessage: 'Remover',
                    })}
                  >
                    ×
                  </button>
                </div>
                <div className={css.slotPeriod}>
                  <div className={css.slotPeriodCol}>
                    <span className={css.slotDayLabel}>
                      <FormattedMessage
                        id="OrderBreakdown.bookingStart"
                        defaultMessage="Início da reserva"
                      />
                    </span>
                    <span className={css.slotDay}>
                      {intl.formatDate(slot.bookingStart, dayOpts)}
                    </span>
                    <span className={css.slotDate}>
                      {intl.formatDate(slot.bookingStart, dateOpts)}
                    </span>
                  </div>
                  <div className={css.slotPeriodCol}>
                    <span className={css.slotDayLabel}>
                      <FormattedMessage
                        id="OrderBreakdown.bookingEnd"
                        defaultMessage="Fim da reserva"
                      />
                    </span>
                    <span className={css.slotDay}>
                      {intl.formatDate(slot.bookingEnd, dayOpts)}
                    </span>
                    <span className={css.slotDate}>
                      {intl.formatDate(slot.bookingEnd, dateOpts)}
                    </span>
                  </div>
                </div>
                {formattedSlotPrice && formattedUnitPrice && (
                  <div className={css.slotBreakdown}>
                    <span className={css.slotBreakdownLeft}>
                      {formattedUnitPrice} x {unitLabel}
                    </span>
                    <span className={css.slotBreakdownRight}>{formattedSlotPrice}</span>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {isAddingSlot ? (
        <div className={css.slotFormWrapper}>
          {isHourly ? (
            <>
              <div className={css.field}>
                <span className={css.fieldLabel}>
                  <FormattedMessage
                    id="MultipleBookingsManager.dateLabel"
                    defaultMessage="Escolher data"
                  />
                </span>
                <SingleDatePicker
                  id="MultipleBookingsManager.date"
                  name="multiBookingDate"
                  value={draftDate}
                  onChange={d => setDraftDate(d)}
                  isDayBlocked={isDayBlocked}
                  hasFocusOnMount={false}
                  onMonthChange={month => {
                    fetchMonthSlots(month);
                    // Pre-fetch the next month so navigation feels instant.
                    if (timeZone) {
                      const next = getStartOf(month, 'month', timeZone, 1, 'months');
                      fetchMonthSlots(next);
                    }
                  }}
                  placeholderText={intl.formatDate(new Date(), {
                    day: '2-digit',
                    month: '2-digit',
                    year: 'numeric',
                  })}
                />
              </div>
              <div className={css.timeRow}>
                <label className={css.field}>
                  <span className={css.fieldLabel}>
                    <FormattedMessage
                      id="FieldDateAndTimeInput.startTime"
                      defaultMessage="Hora de início"
                    />
                  </span>
                  <select
                    value={draftStartTime}
                    onChange={e => {
                      const newStart = e.target.value;
                      setDraftStartTime(newStart);
                      // Auto-fill end time with the next available hour, mimicking
                      // single-booking behavior (e.g. start 01:00 → end 02:00).
                      if (newStart) {
                        const [sh] = newStart.split(':').map(Number);
                        const startDateTime = new Date(draftDate);
                        startDateTime.setHours(sh, 0, 0, 0);
                        const slot = timeSlotsOnSelectedDate.find(t => {
                          const s = t.attributes.start;
                          const e2 = t.attributes.end;
                          return startDateTime >= s && startDateTime < e2;
                        });
                        if (slot) {
                          const endHours = getEndHours(
                            startDateTime,
                            slot.attributes.end,
                            timeZone,
                            intl
                          );
                          setDraftEndTime(endHours[0]?.timeOfDay || '');
                        } else {
                          setDraftEndTime('');
                        }
                      } else {
                        setDraftEndTime('');
                      }
                    }}
                    disabled={!draftDate || availableStartHours.length === 0}
                    className={`${css.timeSelect}${!draftStartTime ? ' ' + css.placeholderShown : ''}`}
                  >
                    {availableStartHours.length === 0 && (
                      <option value="">08:00</option>
                    )}
                    {availableStartHours.map(h => (
                      <option key={h.timestamp} value={h.timeOfDay}>
                        {h.timeOfDay}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={css.field}>
                  <span className={css.fieldLabel}>
                    <FormattedMessage
                      id="FieldDateAndTimeInput.endTime"
                      defaultMessage="Hora de fim"
                    />
                  </span>
                  <select
                    value={draftEndTime}
                    onChange={e => setDraftEndTime(e.target.value)}
                    disabled={!draftStartTime || availableEndHours.length === 0}
                    className={`${css.timeSelect}${!draftEndTime ? ' ' + css.placeholderShown : ''}`}
                  >
                    {availableEndHours.length === 0 && (
                      <option value="">08:00</option>
                    )}
                    {availableEndHours.map(h => (
                      <option key={h.timestamp} value={h.timeOfDay}>
                        {h.timeOfDay}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </>
          ) : (
            <>
              <div className={css.rangeLabels}>
                <span className={css.fieldLabel}>
                  <FormattedMessage
                    id="MultipleBookingsManager.startDateLabel"
                    defaultMessage="Data de início"
                  />
                </span>
                <span className={css.fieldLabel}>
                  <FormattedMessage
                    id="MultipleBookingsManager.endDateLabel"
                    defaultMessage="Data de fim"
                  />
                </span>
              </div>
              <DateRangePicker
                startDateId="MultipleBookingsManager.startDate"
                endDateId="MultipleBookingsManager.endDate"
                value={draftRange}
                onChange={arr => setDraftRange(Array.isArray(arr) ? arr : [])}
                isDayBlocked={isDayBlocked}
                isBlockedBetween={() => false}
                hasFocusOnMount={false}
                onMonthChange={month => {
                  fetchMonthSlots(month);
                  if (timeZone) {
                    fetchMonthSlots(getStartOf(month, 'month', timeZone, 1, 'months'));
                  }
                }}
              />
            </>
          )}
          <div className={css.draftActions}>
            <button type="button" className={css.cancelBtn} onClick={onCancelSlot}>
              <FormattedMessage
                id="MultipleBookingsManager.cancel"
                defaultMessage="Cancelar"
              />
            </button>
            <button
              type="button"
              className={css.saveBtn}
              onClick={onSaveSlot}
            >
              <FormattedMessage
                id="MultipleBookingsManager.saveSlot"
                defaultMessage="Guardar"
              />
            </button>
          </div>
        </div>
      ) : (
        <>
          <button
            type="button"
            className={css.addSlotBtn}
            onClick={() => !isLimitReached && setIsAddingSlot(true)}
          >
            <span className={css.addSlotPlus}>+</span>
            <FormattedMessage
              id="MultipleBookingsManager.addBooking"
              defaultMessage="Adicionar nova reserva"
            />
          </button>
          <p className={css.slotCounter}>
            <FormattedMessage
              id="MultipleBookingsManager.slotCounter"
              defaultMessage="{n} de {max} reservas"
              values={{ n: slots.length, max: MAX_SLOTS }}
            />
          </p>
        </>
      )}

      {slots.length > 0 && !isAddingSlot && formattedTotal && (
        <div className={css.totalRow}>
          <span className={css.totalLabel}>
            <FormattedMessage
              id="MultipleBookingsManager.totalLabel"
              defaultMessage="Total estimado"
            />
          </span>
          <span className={css.totalValue}>{formattedTotal}</span>
        </div>
      )}

      {!isAddingSlot && onContactUser && (
        <div className={css.contactWrapper}>
          <PrimaryButton type="button" onClick={() => onContactUser()}>
            <FormattedMessage id="OrderPanel.ctaButtonMessageInquiry" />
          </PrimaryButton>
        </div>
      )}

      {slots.length > 0 && !isAddingSlot && (
        <div className={css.submitWrapper}>
          <PrimaryButton type="button" onClick={onSendRequest}>
            <FormattedMessage
              id="MultipleBookingsManager.sendRequest"
              defaultMessage="Enviar pedido de reserva"
            />
          </PrimaryButton>
          <p className={css.notChargedYet}>
            {slots.length > 1 ? (
              <FormattedMessage
                id="MultipleBookingsManager.sequentialNote"
                defaultMessage="Vais reservar cada slot individualmente. Após pagar a primeira reserva, vais ser convidado a continuar com a próxima."
              />
            ) : (
              <FormattedMessage
                id="MultipleBookingsManager.notChargedYet"
                defaultMessage="Não será cobrado ainda"
              />
            )}
          </p>
        </div>
      )}
    </div>
  );
};

export default MultipleBookingsManager;
