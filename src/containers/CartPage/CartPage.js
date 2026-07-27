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
import { fetchNearbyServiceListings, selectServiceListings } from '../../ducks/serviceListings.duck';

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

// Business-hours window offered for hour-priced complementary services, in
// 30-minute steps. There is no real per-provider availability check yet
// (that would need each service's own availabilityPlan/timeSlots) — this is
// a reasonable fixed window, not a slot-conflict guarantee.
const TIME_OPTIONS = Array.from({ length: (22 - 8) * 2 + 1 }, (_, i) => {
  const totalMinutes = 8 * 60 + i * 30;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
});
const DEFAULT_START_HOUR = '10:00';
const DEFAULT_END_HOUR = '12:00';

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
  const { listing, schedule, days, onChange, intl } = props;
  const hourly = isHourly(listing);
  const selectedIndexes = Object.keys(schedule.days).map(Number).sort((a, b) => a - b);

  const toggleDay = index => {
    const next = { ...schedule.days };
    if (next[index]) {
      // Keep at least one day selected — a checked service with zero days is
      // an invalid state, so we make it unreachable instead of validating it.
      if (selectedIndexes.length === 1) return;
      delete next[index];
    } else {
      const template = selectedIndexes.length > 0 ? schedule.days[selectedIndexes[0]] : null;
      next[index] = {
        startHour: template?.startHour || DEFAULT_START_HOUR,
        endHour: template?.endHour || DEFAULT_END_HOUR,
      };
    }
    onChange({ ...schedule, days: next });
  };

  const setDayTime = (index, patch) => {
    const current = schedule.days[index];
    const updated = { ...current, ...patch };
    // End time must stay after start time.
    if (updated.endHour <= updated.startHour) {
      updated.endHour = TIME_OPTIONS.find(t => t > updated.startHour) || updated.startHour;
    }
    if (schedule.sameTimeForAll) {
      const synced = {};
      Object.keys(schedule.days).forEach(k => {
        synced[k] = { ...updated };
      });
      onChange({ ...schedule, days: synced });
      return;
    }
    onChange({ ...schedule, days: { ...schedule.days, [index]: updated } });
  };

  const toggleSameTimeForAll = () => {
    const nextFlag = !schedule.sameTimeForAll;
    if (!nextFlag) {
      onChange({ ...schedule, sameTimeForAll: false });
      return;
    }
    const first = schedule.days[selectedIndexes[0]];
    const synced = {};
    selectedIndexes.forEach(k => {
      synced[k] = { ...first };
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
          const selected = !!schedule.days[index];
          return (
            <button
              key={day.toISOString()}
              type="button"
              className={selected ? css.dayChipSelected : css.dayChip}
              onClick={() => toggleDay(index)}
              aria-pressed={selected}
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
              const endOptions = TIME_OPTIONS.filter(t => t > day.startHour);
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
                    {TIME_OPTIONS.map(t => (
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

  const unitLabel = hourly
    ? intl.formatMessage({ id: 'CartPage.perHour' })
    : intl.formatMessage({ id: 'CartPage.perDay' });
  const total = checked ? estimateServiceTotal(listing, schedule) : null;

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
              variants={['listing-card', 'listing-card-2x']}
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
        <ServiceScheduler
          listing={listing}
          schedule={schedule}
          days={days}
          onChange={next => onChangeSchedule(id, next)}
          intl={intl}
        />
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
      // Checking a service pre-selects the first day of the stay, so the
      // customer always starts from a valid, priceable selection.
      return {
        ...prev,
        [id]: {
          sameTimeForAll: false,
          days: { 0: { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR } },
        },
      };
    });
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
                          variants={['listing-card', 'listing-card-2x']}
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
