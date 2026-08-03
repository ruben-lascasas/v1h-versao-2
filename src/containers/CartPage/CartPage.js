import React, { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { useIntl, FormattedMessage } from '../../util/reactIntl';
import { createResourceLocatorString } from '../../util/routes';
import { createSlug } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';
import { daysBetween, minutesBetween, timestampToDate } from '../../util/dates';
import { types as sdkTypes } from '../../util/sdkLoader';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import { initializeCardPaymentData } from '../../ducks/stripe.duck';
import {
  fetchNearbyServiceListings,
  fetchServiceTimeSlots,
  selectServiceListings,
  selectServiceTimeSlots,
} from '../../ducks/serviceListings.duck';

import {
  Page,
  LayoutSingleColumn,
  IconSpinner,
  NamedRedirect,
  NamedLink,
  ResponsiveImage,
  Button,
  H1,
} from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import { handlePageData, storeData, clearData } from '../CheckoutPage/CheckoutPageSessionHelpers';
import { CART_STORAGE_KEY } from './cartStorageKey';
import { storeCartQueue } from './cartQueueStorage';

import css from './CartPage.module.css';

const { Money } = sdkTypes;

const SLOT_STEP_MINUTES = 30;

const minutesToLabel = mins => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const labelToMinutes = label => {
  const [h, m] = label.split(':').map(Number);
  return h * 60 + m;
};

// Minutes-from-midnight of a Date, relative to the same local day the cart
// builds its day list in, so slots and day boundaries are compared the same way.
const minutesIntoDay = (date, dayStart) => Math.round((date - dayStart) / 60000);

/**
 * Turns the provider's raw time slots into, for each day of the stay, the
 * bookable half-hour marks. A slot of type 'day' means the whole day is open.
 * Returns { [dayIndex]: number[] } of minutes-from-midnight.
 */
const buildAvailableMarksByDay = (slots, days) => {
  const marksByDay = {};
  days.forEach((day, index) => {
    const dayStart = new Date(day);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const marks = new Set();
    (slots || []).forEach(slot => {
      if (slot.seats != null && slot.seats < 1) return;
      const slotStart = new Date(slot.start);
      const slotEnd = new Date(slot.end);
      if (slotEnd <= dayStart || slotStart >= dayEnd) return;

      if (slot.type === 'time-slot/day' || slot.type === 'day') {
        for (let m = 0; m <= 24 * 60; m += SLOT_STEP_MINUTES) marks.add(m);
        return;
      }
      const from = Math.max(0, minutesIntoDay(slotStart, dayStart));
      const to = Math.min(24 * 60, minutesIntoDay(slotEnd, dayStart));
      const first = Math.ceil(from / SLOT_STEP_MINUTES) * SLOT_STEP_MINUTES;
      for (let m = first; m <= to; m += SLOT_STEP_MINUTES) marks.add(m);
    });

    const sorted = [...marks].sort((a, b) => a - b);
    // A day is only offerable if there is room for at least one booking
    // (two marks = one 30-minute block).
    if (sorted.length > 1) marksByDay[index] = sorted;
  });
  return marksByDay;
};

// Start marks are every mark that has a later contiguous mark after it.
const startMarksFrom = marks =>
  (marks || []).filter((m, i) => marks[i + 1] === m + SLOT_STEP_MINUTES);

// End marks run from just after `start` up to the end of that contiguous block.
const endMarksFrom = (marks, startMark) => {
  const out = [];
  let expected = startMark + SLOT_STEP_MINUTES;
  while ((marks || []).includes(expected)) {
    out.push(expected);
    expected += SLOT_STEP_MINUTES;
  }
  return out;
};

// First bookable window of a day: earliest start, and up to 2h later if the
// provider is free that long, otherwise the longest that fits.
const defaultSlotForDay = marks => {
  const start = startMarksFrom(marks)[0];
  const ends = endMarksFrom(marks, start);
  const preferred = ends.find(e => e === start + 120) || ends[ends.length - 1];
  return { startHour: minutesToLabel(start), endHour: minutesToLabel(preferred) };
};

// Resolves the main listing's chosen booking period from orderData, tagged
// with its own granularity (whole days vs a specific time-of-day range) so
// it's never misapplied to a listing priced in the other unit — e.g. a
// multi-day space booking must never be reinterpreted as "N hours" for an
// hourly-priced complementary service.
const resolveBookingRange = orderData => {
  const { bookingDates, bookingStartTime, bookingEndTime } = orderData || {};
  if (bookingDates?.bookingStart && bookingDates?.bookingEnd) {
    return { start: bookingDates.bookingStart, end: bookingDates.bookingEnd, isDateRange: true };
  }
  if (bookingStartTime && bookingEndTime) {
    return {
      start: timestampToDate(bookingStartTime),
      end: timestampToDate(bookingEndTime),
      isTimeRange: true,
    };
  }
  return null;
};

// Every day of the space booking a service can be scheduled on. For a date
// range the checkout day itself is excluded (27→31 July is 27, 28, 29, 30);
// for a single-day/hourly space booking there is exactly one day.
const enumerateDays = range => {
  if (!range) return [];
  if (range.isTimeRange) {
    const day = new Date(range.start);
    day.setHours(0, 0, 0, 0);
    return [day];
  }
  const count = Math.max(1, daysBetween(range.start, range.end));
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(range.start);
    d.setDate(d.getDate() + i);
    d.setHours(0, 0, 0, 0);
    return d;
  });
};

const hoursBetweenStrings = (start, end) => {
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  const minutes = eh * 60 + em - (sh * 60 + sm);
  return minutes > 0 ? minutes / 60 : 0;
};

const estimateQuantity = (unitType, range) => {
  if (!range) return 1;
  if (unitType === 'hour' && range.isTimeRange) {
    const minutes = minutesBetween(range.start, range.end);
    return Math.max(1, Math.round(minutes / 60));
  }
  if ((unitType === 'day' || unitType === 'night') && range.isDateRange) {
    return Math.max(1, daysBetween(range.start, range.end));
  }
  return 1;
};

// Display-only estimate for the space itself (price × unit count). The real,
// authoritative total is computed by the API on the CheckoutPage.
const estimateSpaceTotal = (listing, range) => {
  const price = listing?.attributes?.price;
  if (!price) return null;
  const unitType = listing?.attributes?.publicData?.unitType;
  return new Money(price.amount * estimateQuantity(unitType, range), price.currency);
};

// A service's estimate is driven entirely by the days (and, when priced by
// the hour, the time range per day) the customer picked for it — never by the
// space's own booking shape, which is a different unit.
const estimateServiceTotal = (listing, schedule) => {
  const price = listing?.attributes?.price;
  if (!price || !schedule) return null;
  const unitType = listing?.attributes?.publicData?.unitType;
  const days = Object.values(schedule.days || {});
  if (days.length === 0) return new Money(0, price.currency);

  if (unitType === 'hour') {
    const totalHours = days.reduce(
      (sum, day) => sum + Math.max(0.5, hoursBetweenStrings(day.startHour, day.endHour)),
      0
    );
    return new Money(Math.round(price.amount * totalHours), price.currency);
  }
  return new Money(price.amount * days.length, price.currency);
};

const isHourly = listing => listing?.attributes?.publicData?.unitType === 'hour';

const ServiceScheduler = props => {
  const { listing, schedule, days, marksByDay, onChange, intl } = props;
  const hourly = isHourly(listing);
  const selectedIndexes = Object.keys(schedule.days).map(Number).sort((a, b) => a - b);

  const toggleDay = index => {
    if (!marksByDay[index]) return; // provider isn't available that day
    const next = { ...schedule.days };
    if (next[index]) {
      // Keep at least one day selected — a checked service with zero days is
      // an invalid state, so we make it unreachable instead of validating it.
      if (selectedIndexes.length === 1) return;
      delete next[index];
    } else {
      next[index] = defaultSlotForDay(marksByDay[index]);
    }
    onChange({ ...schedule, days: next });
  };

  const setDayTime = (index, patch) => {
    const marks = marksByDay[index] || [];
    const updated = { ...schedule.days[index], ...patch };
    // Snap the end to the first valid mark after the start within the same
    // contiguous block, so an out-of-range combination can't be produced.
    const validEnds = endMarksFrom(marks, labelToMinutes(updated.startHour));
    if (!validEnds.includes(labelToMinutes(updated.endHour))) {
      updated.endHour = minutesToLabel(validEnds[0]);
    }
    if (schedule.sameTimeForAll) {
      const synced = {};
      selectedIndexes.forEach(k => {
        // Only mirror onto days that can actually host that same window.
        const ends = endMarksFrom(marksByDay[k] || [], labelToMinutes(updated.startHour));
        synced[k] = ends.includes(labelToMinutes(updated.endHour))
          ? { ...updated }
          : schedule.days[k];
      });
      onChange({ ...schedule, days: synced });
      return;
    }
    onChange({ ...schedule, days: { ...schedule.days, [index]: updated } });
  };

  const toggleSameTimeForAll = () => {
    if (schedule.sameTimeForAll) {
      onChange({ ...schedule, sameTimeForAll: false });
      return;
    }
    const first = schedule.days[selectedIndexes[0]];
    const synced = {};
    selectedIndexes.forEach(k => {
      const ends = endMarksFrom(marksByDay[k] || [], labelToMinutes(first.startHour));
      synced[k] = ends.includes(labelToMinutes(first.endHour)) ? { ...first } : schedule.days[k];
    });
    onChange({ sameTimeForAll: true, days: synced });
  };

  return (
    <div className={css.scheduler}>
      <div className={css.schedulerLabel}>
        <FormattedMessage id="CartPage.whichDays" />
      </div>
      <div className={css.dayChips}>
        {days.map((day, index) => {
          const available = !!marksByDay[index];
          const selected = !!schedule.days[index];
          const className = !available
            ? css.dayChipUnavailable
            : selected
            ? css.dayChipSelected
            : css.dayChip;
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={className}
              onClick={() => toggleDay(index)}
              disabled={!available}
              aria-pressed={selected}
              title={
                available ? undefined : intl.formatMessage({ id: 'CartPage.dayUnavailable' })
              }
            >
              {intl.formatDate(day, { weekday: 'short', day: 'numeric', month: 'short' })}
            </button>
          );
        })}
      </div>

      {hourly ? (
        <>
          {selectedIndexes.length > 1 ? (
            <label className={css.sameTimeToggle}>
              <span className={css.sameTimeLabel}>
                <FormattedMessage id="CartPage.sameTimeForAll" />
              </span>
              <input
                type="checkbox"
                checked={!!schedule.sameTimeForAll}
                onChange={toggleSameTimeForAll}
              />
            </label>
          ) : null}

          <div className={css.timeRows}>
            {(schedule.sameTimeForAll ? selectedIndexes.slice(0, 1) : selectedIndexes).map(index => {
              const day = schedule.days[index];
              const marks = marksByDay[index] || [];
              const startOptions = startMarksFrom(marks).map(minutesToLabel);
              const endOptions = endMarksFrom(marks, labelToMinutes(day.startHour)).map(
                minutesToLabel
              );
              return (
                <div className={css.timeRow} key={index}>
                  <span className={css.timeRowDay}>
                    {schedule.sameTimeForAll ? (
                      <FormattedMessage id="CartPage.allDays" />
                    ) : (
                      intl.formatDate(days[index], { weekday: 'short', day: 'numeric', month: 'short' })
                    )}
                  </span>
                  <select
                    className={css.timeSelect}
                    value={day.startHour}
                    onChange={e => setDayTime(index, { startHour: e.target.value })}
                    aria-label={intl.formatMessage({ id: 'CartPage.scheduleStart' })}
                  >
                    {startOptions.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <span className={css.timeSep}>–</span>
                  <select
                    className={css.timeSelect}
                    value={day.endHour}
                    onChange={e => setDayTime(index, { endHour: e.target.value })}
                    aria-label={intl.formatMessage({ id: 'CartPage.scheduleEnd' })}
                  >
                    {endOptions.map(t => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
};

const ServiceCard = props => {
  const { listing, checked, onToggle, schedule, onChangeSchedule, days, intl } = props;
  const { title } = listing?.attributes || {};
  const authorName = listing?.author?.attributes?.profile?.displayName;
  const firstImage = listing?.images?.[0] || null;
  const id = listing?.id?.uuid;
  const price = listing?.attributes?.price;
  const hourly = isHourly(listing);

  const timeSlots = useSelector(state => selectServiceTimeSlots(state, id));
  const marksByDay = useMemo(
    () => (timeSlots?.slots ? buildAvailableMarksByDay(timeSlots.slots, days) : {}),
    [timeSlots, days]
  );
  const availabilityLoading = !timeSlots || timeSlots.loading;
  const availabilityError = timeSlots?.error;
  const hasAnyAvailability = Object.keys(marksByDay).length > 0;
  const hasPickedDays = Object.keys(schedule?.days || {}).length > 0;

  // Once the provider's real availability arrives, start the customer off on
  // the first day they're actually free rather than a guessed default.
  useEffect(() => {
    if (!checked || availabilityLoading || hasPickedDays || !hasAnyAvailability) return;
    const firstIndex = Object.keys(marksByDay).map(Number).sort((a, b) => a - b)[0];
    onChangeSchedule(id, {
      sameTimeForAll: false,
      days: { [firstIndex]: defaultSlotForDay(marksByDay[firstIndex]) },
    });
  }, [checked, availabilityLoading, hasPickedDays, hasAnyAvailability, marksByDay, id]);

  const unitLabel = hourly
    ? intl.formatMessage({ id: 'CartPage.perHour' })
    : intl.formatMessage({ id: 'CartPage.perDay' });
  const total = checked && hasPickedDays ? estimateServiceTotal(listing, schedule) : null;

  return (
    <div className={checked ? css.serviceCardSelected : css.serviceCard}>
      <label className={css.serviceRow} htmlFor={`cart-service-${id}`}>
        <input
          id={`cart-service-${id}`}
          type="checkbox"
          className={css.checkbox}
          checked={checked}
          onChange={() => onToggle(id)}
        />
        <div className={css.serviceImageWrapper}>
          {firstImage ? (
            <ResponsiveImage
              rootClassName={css.serviceImage}
              alt={title}
              image={firstImage}
              variants={['listing-card', 'listing-card-2x', 'listing-card-4x']}
              sizes="64px"
            />
          ) : (
            <div className={css.serviceImagePlaceholder} />
          )}
        </div>
        <div className={css.serviceInfo}>
          <div className={css.serviceTitle}>{title}</div>
          {authorName ? <div className={css.serviceProvider}>{authorName}</div> : null}
        </div>
        <div className={css.servicePriceWrapper}>
          {total ? (
            <span className={css.servicePriceTotal}>{formatMoney(intl, total)}</span>
          ) : price ? (
            <span className={css.servicePriceUnit}>
              {formatMoney(intl, price)}
              <span className={css.servicePriceUnitLabel}>{unitLabel}</span>
            </span>
          ) : null}
        </div>
      </label>

      {checked && days.length > 0 ? (
        availabilityLoading ? (
          <div className={css.availabilityNotice}>
            <FormattedMessage id="CartPage.checkingAvailability" />
          </div>
        ) : availabilityError ? (
          <div className={css.availabilityNoticeError}>
            <FormattedMessage id="CartPage.availabilityError" />
          </div>
        ) : !hasAnyAvailability ? (
          <div className={css.availabilityNoticeError}>
            <FormattedMessage id="CartPage.noAvailability" />
          </div>
        ) : (
          <ServiceScheduler
            listing={listing}
            schedule={schedule}
            days={days}
            marksByDay={marksByDay}
            onChange={next => onChangeSchedule(id, next)}
            intl={intl}
          />
        )
      ) : null}
    </div>
  );
};

const CartPage = () => {
  const config = useConfiguration();
  const routes = useRouteConfiguration();
  const intl = useIntl();
  const history = useHistory();
  const dispatch = useDispatch();

  const [pageData, setPageData] = useState(null);
  const [isDataLoaded, setIsDataLoaded] = useState(false);
  const [scheduleByServiceId, setScheduleByServiceId] = useState({});
  const [isSpaceRemoved, setIsSpaceRemoved] = useState(false);

  const scrollingDisabled = useSelector(isScrollingDisabled);

  useEffect(() => {
    const data = handlePageData({}, CART_STORAGE_KEY, history);
    setPageData(data || {});
    setIsDataLoaded(true);
  }, []);

  const listing = pageData?.listing;
  const orderData = pageData?.orderData;
  const bookingDates = orderData?.bookingDates;
  const bookingRange = useMemo(() => resolveBookingRange(orderData), [orderData]);
  const days = useMemo(() => enumerateDays(bookingRange), [bookingRange]);
  const mainListingId = listing?.id?.uuid;
  const geolocation = listing?.attributes?.geolocation;

  const nearbyServices = useSelector(state => selectServiceListings(state, mainListingId));
  const servicesFetched = useSelector(state =>
    Boolean(mainListingId && state.serviceListings?.listingsByListingId?.[mainListingId])
  );

  useEffect(() => {
    if (mainListingId && geolocation) {
      dispatch(fetchNearbyServiceListings(mainListingId, geolocation, config));
    }
  }, [mainListingId]);

  const hasRequiredData = !!(listing?.id && orderData);
  const shouldRedirectHome = isDataLoaded && !hasRequiredData;
  const shouldAutoProceed =
    isDataLoaded && hasRequiredData && servicesFetched && nearbyServices.length === 0;

  const proceedToCheckout = (checkoutListing, checkoutOrderData) => {
    dispatch(initializeCardPaymentData());
    storeData(checkoutOrderData, checkoutListing, null, 'CheckoutPage');
    history.push(
      createResourceLocatorString(
        'CheckoutPage',
        routes,
        { id: checkoutListing.id.uuid, slug: createSlug(checkoutListing.attributes.title) },
        {}
      )
    );
  };

  useEffect(() => {
    if (shouldAutoProceed) {
      clearData(CART_STORAGE_KEY);
      proceedToCheckout(listing, orderData);
    }
  }, [shouldAutoProceed]);

  const toggleService = id => {
    setScheduleByServiceId(prev => {
      if (prev[id]) {
        const { [id]: _removed, ...rest } = prev;
        return rest;
      }
      // Starts empty: the first day/time is filled in once the provider's real
      // availability comes back (see ServiceCard), so we never pre-select a
      // slot they aren't free for.
      return { ...prev, [id]: { sameTimeForAll: false, days: {} } };
    });

    const service = nearbyServices.find(s => s.id.uuid === id);
    const alreadySelected = !!scheduleByServiceId[id];
    if (service && !alreadySelected && days.length > 0) {
      const rangeStart = new Date(days[0]);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(days[days.length - 1]);
      rangeEnd.setHours(0, 0, 0, 0);
      rangeEnd.setDate(rangeEnd.getDate() + 1);
      dispatch(fetchServiceTimeSlots(service.id, rangeStart, rangeEnd));
    }
  };

  const updateSchedule = (id, schedule) => {
    setScheduleByServiceId(prev => ({ ...prev, [id]: schedule }));
  };

  const selectedServiceIds = Object.keys(scheduleByServiceId);

  // One transaction per (service, day) pair — Sharetribe books one period per
  // transaction, so a service used on 3 days is 3 separate bookings. Building
  // the list here keeps the summary, the total and the checkout queue in sync.
  const serviceBookings = useMemo(() => {
    const items = [];
    nearbyServices.forEach(service => {
      const schedule = scheduleByServiceId[service.id.uuid];
      if (!schedule) return;
      const price = service.attributes?.price;
      const hourly = isHourly(service);
      Object.keys(schedule.days)
        .map(Number)
        .sort((a, b) => a - b)
        .forEach(dayIndex => {
          const day = days[dayIndex];
          if (!day) return;
          const dayDetail = schedule.days[dayIndex];
          let amount = price?.amount || 0;
          let itemOrderData;
          if (hourly) {
            const hours = Math.max(0.5, hoursBetweenStrings(dayDetail.startHour, dayDetail.endHour));
            amount = Math.round((price?.amount || 0) * hours);
            const [sh, sm] = dayDetail.startHour.split(':').map(Number);
            const [eh, em] = dayDetail.endHour.split(':').map(Number);
            const start = new Date(day);
            start.setHours(sh, sm, 0, 0);
            const end = new Date(day);
            end.setHours(eh, em, 0, 0);
            itemOrderData = { bookingStartTime: start.getTime(), bookingEndTime: end.getTime() };
          } else {
            const start = new Date(day);
            const end = new Date(day);
            end.setDate(end.getDate() + 1);
            itemOrderData = { bookingDates: { bookingStart: start, bookingEnd: end } };
          }
          items.push({
            listing: service,
            day,
            dayIndex,
            detail: hourly ? dayDetail : null,
            total: price ? new Money(amount, price.currency) : null,
            orderData: itemOrderData,
          });
        });
    });
    return items;
  }, [nearbyServices, scheduleByServiceId, days]);

  const spaceTotal = useMemo(() => estimateSpaceTotal(listing, bookingRange), [
    listing,
    bookingRange,
  ]);

  const currency = spaceTotal?.currency || config.currency;
  const totalAmount =
    (isSpaceRemoved ? 0 : spaceTotal?.amount || 0) +
    serviceBookings.reduce((sum, item) => sum + (item.total?.amount || 0), 0);
  const formattedTotal = formatMoney(intl, new Money(totalAmount, currency));

  // Ordered list of everything being paid for: the space first (when kept),
  // then each service booking. The first one goes straight to checkout, the
  // rest are queued and offered one at a time after each payment.
  const checkoutItems = [
    ...(isSpaceRemoved ? [] : [{ listing, orderData }]),
    ...serviceBookings.map(item => ({ listing: item.listing, orderData: item.orderData })),
  ];

  const handleFinalize = () => {
    if (checkoutItems.length === 0) return;
    const [first, ...rest] = checkoutItems;
    storeCartQueue(rest);
    clearData(CART_STORAGE_KEY);
    proceedToCheckout(first.listing, first.orderData);
  };

  if (shouldRedirectHome) {
    return <NamedRedirect name="LandingPage" />;
  }

  const topbar = <TopbarContainer />;
  const isLoading = !isDataLoaded || !hasRequiredData || !servicesFetched || shouldAutoProceed;

  if (isLoading) {
    return (
      <Page
        title={intl.formatMessage({ id: 'CartPage.title' })}
        scrollingDisabled={scrollingDisabled}
      >
        <LayoutSingleColumn topbar={topbar} footer={<FooterContainer />} hideRecentlyViewed>
          <div className={css.loading}>
            <IconSpinner />
          </div>
        </LayoutSingleColumn>
      </Page>
    );
  }

  const { title } = listing.attributes;
  const firstImage = listing.images?.[0] || null;
  const formattedSpacePrice = spaceTotal ? formatMoney(intl, spaceTotal) : null;
  const nightCount = days.length;

  const bookingDatesLabel =
    bookingDates?.bookingStart && bookingDates?.bookingEnd
      ? `${intl.formatDate(bookingDates.bookingStart, {
          day: 'numeric',
          month: 'short',
        })} — ${intl.formatDate(bookingDates.bookingEnd, { day: 'numeric', month: 'short' })}`
      : null;

  return (
    <Page
      title={intl.formatMessage({ id: 'CartPage.title' })}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn topbar={topbar} footer={<FooterContainer />} hideRecentlyViewed>
        <div className={css.root}>
          <header className={css.pageHeader}>
            <H1 className={css.heading}>
              <FormattedMessage id="CartPage.heading" />
            </H1>
            <p className={css.subheading}>
              <FormattedMessage id="CartPage.subheading" />
            </p>
          </header>

          <div className={css.layout}>
            <div className={css.mainColumn}>
              <section className={css.section}>
                <h2 className={css.sectionTitle}>
                  <FormattedMessage id="CartPage.yourBooking" />
                </h2>

                {isSpaceRemoved ? (
                  <div className={css.removedNotice}>
                    <span>
                      <FormattedMessage id="CartPage.spaceRemoved" />
                    </span>
                    <button
                      type="button"
                      className={css.undoButton}
                      onClick={() => setIsSpaceRemoved(false)}
                    >
                      <FormattedMessage id="CartPage.undoRemove" />
                    </button>
                  </div>
                ) : (
                  <div className={css.spaceCard}>
                    <div className={css.spaceImageWrapper}>
                      {firstImage ? (
                        <ResponsiveImage
                          rootClassName={css.spaceImage}
                          alt={title}
                          image={firstImage}
                          variants={['listing-card', 'listing-card-2x', 'listing-card-4x']}
                          sizes="112px"
                        />
                      ) : (
                        <div className={css.spaceImagePlaceholder} />
                      )}
                    </div>
                    <div className={css.spaceInfo}>
                      <div className={css.spaceTitle}>{title}</div>
                      {bookingDatesLabel ? (
                        <div className={css.spaceMeta}>
                          {bookingDatesLabel}
                          {nightCount > 0 ? (
                            <>
                              {' · '}
                              <FormattedMessage
                                id="CartPage.nightCount"
                                values={{ count: nightCount }}
                              />
                            </>
                          ) : null}
                        </div>
                      ) : null}
                      <button
                        type="button"
                        className={css.removeButton}
                        onClick={() => setIsSpaceRemoved(true)}
                      >
                        <FormattedMessage id="CartPage.remove" />
                      </button>
                    </div>
                    {formattedSpacePrice ? (
                      <div className={css.spacePrice}>{formattedSpacePrice}</div>
                    ) : null}
                  </div>
                )}
              </section>

              {nearbyServices.length > 0 ? (
                <section className={css.section}>
                  <h2 className={css.sectionTitle}>
                    <FormattedMessage id="CartPage.servicesHeading" />
                  </h2>
                  <p className={css.sectionSubtitle}>
                    <FormattedMessage id="CartPage.servicesSubheading" />
                  </p>
                  <div className={css.servicesList}>
                    {nearbyServices.map(service => (
                      <ServiceCard
                        key={service.id.uuid}
                        listing={service}
                        checked={selectedServiceIds.includes(service.id.uuid)}
                        onToggle={toggleService}
                        schedule={scheduleByServiceId[service.id.uuid]}
                        onChangeSchedule={updateSchedule}
                        days={days}
                        intl={intl}
                      />
                    ))}
                  </div>
                </section>
              ) : null}
            </div>

            <aside className={css.summaryColumn}>
              <div className={css.summaryCard}>
                <h2 className={css.summaryTitle}>
                  <FormattedMessage id="CartPage.summaryTitle" />
                </h2>

                {checkoutItems.length === 0 ? (
                  <p className={css.emptyText}>
                    <FormattedMessage id="CartPage.emptyCart" />
                  </p>
                ) : (
                  <>
                    <div className={css.summaryLines}>
                      {isSpaceRemoved ? null : (
                        <div className={css.summaryLine}>
                          <div className={css.summaryLineLabelWrapper}>
                            <span className={css.summaryLineLabel}>{title}</span>
                            {bookingDatesLabel ? (
                              <span className={css.summaryLineSublabel}>{bookingDatesLabel}</span>
                            ) : null}
                          </div>
                          <span className={css.summaryLineAmount}>{formattedSpacePrice}</span>
                        </div>
                      )}
                      {serviceBookings.map(item => (
                        <div
                          className={css.summaryLine}
                          key={`${item.listing.id.uuid}-${item.dayIndex}`}
                        >
                          <div className={css.summaryLineLabelWrapper}>
                            <span className={css.summaryLineLabel}>
                              {item.listing.attributes.title}
                            </span>
                            <span className={css.summaryLineSublabel}>
                              {intl.formatDate(item.day, { day: 'numeric', month: 'short' })}
                              {item.detail
                                ? `, ${item.detail.startHour}–${item.detail.endHour}`
                                : ''}
                            </span>
                          </div>
                          <span className={css.summaryLineAmount}>
                            {item.total ? formatMoney(intl, item.total) : null}
                          </span>
                        </div>
                      ))}
                    </div>

                    <div className={css.summaryDivider} />

                    <div className={css.summaryTotalRow}>
                      <span className={css.summaryTotalLabel}>
                        <FormattedMessage id="CartPage.totalLabel" />
                      </span>
                      <span className={css.summaryTotalAmount}>{formattedTotal}</span>
                    </div>
                    <p className={css.summaryTotalNote}>
                      <FormattedMessage
                        id="CartPage.paymentCountNote"
                        values={{ count: checkoutItems.length }}
                      />
                    </p>

                    <Button className={css.finalizeButton} onClick={handleFinalize}>
                      <FormattedMessage id="CartPage.finalizeButton" />
                    </Button>
                  </>
                )}

                {checkoutItems.length === 0 ? (
                  <NamedLink name="SearchPage" className={css.emptyCta}>
                    <FormattedMessage id="CartPage.backToSearch" />
                  </NamedLink>
                ) : null}
              </div>
            </aside>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default CartPage;
