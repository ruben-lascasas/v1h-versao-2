import React, { useEffect, useState } from 'react';
import { compose } from 'redux';
import { connect, useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';

import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { parse, stringify } from '../../util/urlHelpers';
import { createResourceLocatorString } from '../../util/routes';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import {
  LISTING_UNIT_TYPES,
  LINE_ITEM_HOUR,
  LINE_ITEM_FIXED,
  DATE_TYPE_DATETIME,
  DATE_TYPE_DATE,
} from '../../util/types';
import { subtractTime } from '../../util/dates';
import { getCurrentUserTypeRoles } from '../../util/userHelpers';
import { useConfiguration } from '../../context/configurationContext';

import {
  TX_TRANSITION_ACTOR_CUSTOMER,
  resolveLatestProcessName,
  getProcess,
} from '../../transactions/transaction';
import { selectIsFollowing, toggleFollowAndSync } from '../../ducks/follow.duck';

import { getMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import {
  H2,
  NamedLink,
  Page,
  PaginationLinks,
  IconSpinner,
  IconArrowHead,
  TimeRange,
  LayoutSingleColumn,
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
} from '../../components';

import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './HistoricoReservasPage.module.css';

const bookingData = (tx, lineItemUnitType, timeZone) => {
  const { start, end, displayStart, displayEnd } = tx.booking.attributes;
  const bookingStart = displayStart || start;
  const bookingEndRaw = displayEnd || end;
  const isDayBooking = lineItemUnitType === 'line-item/day';
  const bookingEnd = isDayBooking
    ? subtractTime(bookingEndRaw, 1, 'days', timeZone)
    : bookingEndRaw;
  return { bookingStart, bookingEnd };
};

const BookingTimeInfoMaybe = ({ transaction }) => {
  if (!transaction?.booking?.attributes) return null;

  const processName = resolveLatestProcessName(transaction?.attributes?.processName);
  let process;
  try {
    process = getProcess(processName);
  } catch (e) {
    return null;
  }

  const isInquiry = process.getState(transaction) === process.states.INQUIRY;
  if (isInquiry) return null;

  const lineItems = transaction?.attributes?.lineItems || [];
  const unitLineItem = lineItems.find(
    item => LISTING_UNIT_TYPES.includes(item.code) && !item.reversal
  );
  const lineItemUnitType = unitLineItem ? unitLineItem.code : null;
  const dateType = [LINE_ITEM_HOUR, LINE_ITEM_FIXED].includes(lineItemUnitType)
    ? DATE_TYPE_DATETIME
    : DATE_TYPE_DATE;
  const timeZone = transaction?.listing?.attributes?.availabilityPlan?.timezone || 'Etc/UTC';
  const { bookingStart, bookingEnd } = bookingData(transaction, lineItemUnitType, timeZone);

  // Multi-booking: show "+N reserva(s)" suffix when extra slots are stored
  // in protectedData (multi-booking flow), same as InboxPage does.
  const additionalCount =
    transaction?.attributes?.protectedData?.multipleBookings?.additionalBookings?.length || 0;

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <TimeRange
        startDate={bookingStart}
        endDate={bookingEnd}
        dateType={dateType}
        timeZone={timeZone}
      />
      {additionalCount > 0 ? (
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: '#7C6350',
            background: '#FFF8EE',
            border: '1px solid #BAA38A',
            borderRadius: 4,
            padding: '2px 6px',
            whiteSpace: 'nowrap',
          }}
        >
          +{additionalCount} {additionalCount === 1 ? 'reserva' : 'reservas'}
        </span>
      ) : null}
    </span>
  );
};

const FollowBtn = ({ userId }) => {
  const dispatch = useDispatch();
  const [mounted, setMounted] = useState(false);
  const isFollowing = useSelector(state => selectIsFollowing(state, userId));
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || !userId) return null;
  return (
    <button
      type="button"
      className={isFollowing ? css.bookingCardFollowingBtn : css.bookingCardFollowBtn}
      onClick={e => {
        e.preventDefault();
        e.stopPropagation();
        dispatch(toggleFollowAndSync(userId));
      }}
    >
      {isFollowing ? 'A seguir' : 'Seguir'}
    </button>
  );
};

const formatLastOnline = (isoString, intl) => {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 120) return intl.formatMessage({ id: 'UserCard.onlineJustNow' });
  if (diff < 3600)
    return intl.formatMessage(
      { id: 'UserCard.onlineMinutes' },
      { minutes: Math.floor(diff / 60) }
    );
  if (diff < 86400)
    return intl.formatMessage(
      { id: 'UserCard.onlineHours' },
      { hours: Math.floor(diff / 3600) }
    );
  return intl.formatMessage(
    { id: 'UserCard.onlineDays' },
    { days: Math.floor(diff / 86400) }
  );
};

const TransactionCard = ({ tx, intl, isCustomer }) => {
  const listing = tx?.listing;
  const title = listing?.attributes?.title || 'Anúncio indisponível';
  const listingPublicData = listing?.attributes?.publicData || {};
  // "Anfitrião" só faz sentido quando o anúncio reservado é um espaço — um
  // Prestador de Serviços (catering, limpeza...) não é um anfitrião.
  const isServiceListing = listingPublicData?.listingType === 'servico';
  const listingLocation =
    listingPublicData?.location?.address ||
    (typeof listingPublicData?.location === 'string' ? listingPublicData.location : null) ||
    null;
  const image = listing?.images?.[0];
  const imgUrl =
    image?.attributes?.variants?.['square-small2x']?.url ||
    image?.attributes?.variants?.['square-small']?.url;

  // Price paid/earned — show payin for customers, payout for hosts.
  const moneyToShow = isCustomer
    ? tx?.attributes?.payinTotal
    : tx?.attributes?.payoutTotal;
  const priceLabel =
    moneyToShow && typeof moneyToShow.amount === 'number'
      ? intl.formatNumber(moneyToShow.amount / 100, {
          style: 'currency',
          currency: moneyToShow.currency || 'EUR',
        })
      : null;

  // For the customer view show the provider on the right side; for the host
  // view show the customer on the right side.
  const otherParty = isCustomer ? tx?.provider : tx?.customer;
  const otherPartyId = otherParty?.id?.uuid;
  const otherPartyName = otherParty?.attributes?.profile?.displayName || '';
  const otherPartyImgUrl =
    otherParty?.profileImage?.attributes?.variants?.['square-small2x']?.url ||
    otherParty?.profileImage?.attributes?.variants?.['square-small']?.url;
  const otherPartyPublicData = otherParty?.attributes?.profile?.publicData || {};
  const lastOnline = formatLastOnline(otherPartyPublicData?.lastOnline, intl);

  return (
    <NamedLink
      name={isCustomer ? 'OrderDetailsPage' : 'SaleDetailsPage'}
      params={{ id: tx.id.uuid }}
      className={css.bookingCard}
    >
      <div className={css.bookingCardImage}>
        {imgUrl ? (
          <img src={imgUrl} alt={title} />
        ) : (
          <div className={css.bookingCardPlaceholder} />
        )}
      </div>
      <div className={css.bookingCardInfo}>
        <div className={css.bookingCardTitleRow}>
          <p className={css.bookingCardTitle}>{title}</p>
          <span className={css.bookingCardUserRole}>
            <FormattedMessage
              id={isCustomer
                ? 'HistoricoReservasPage.youWereCustomer'
                : isServiceListing
                ? 'HistoricoReservasPage.youWereServiceProvider'
                : 'HistoricoReservasPage.youWereHost'}
            />
          </span>
        </div>
        {listingLocation ? (
          <p className={css.bookingCardLocation}>
            <svg
              viewBox="0 0 24 24"
              width="10"
              height="10"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
            >
              <path
                fill="#e53e3e"
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
              />
            </svg>
            {listingLocation}
          </p>
        ) : null}
        {tx?.booking ? (
          <div className={css.bookingCardDates}>
            <BookingTimeInfoMaybe transaction={tx} />
          </div>
        ) : null}
        {priceLabel ? <div className={css.bookingCardPrice}>{priceLabel}</div> : null}
      </div>
      <div className={css.bookingCardRight}>
        {otherPartyName ? (
          <div className={css.bookingCardProviderRow}>
            <div className={css.bookingCardProviderAvatar}>
              {otherPartyImgUrl ? (
                <img src={otherPartyImgUrl} alt={otherPartyName} />
              ) : (
                <span>{otherPartyName.charAt(0).toUpperCase()}</span>
              )}
            </div>
            <div className={css.bookingCardProviderInfo}>
              <span className={css.bookingCardProviderName}>{otherPartyName}</span>
              <span
                className={css.bookingCardProviderOnline}
                style={lastOnline ? undefined : { visibility: 'hidden' }}
              >
                {lastOnline || '—'}
              </span>
            </div>
            <div className={css.bookingCardProviderActions}>
              <span className={css.bookingCardProviderRole}>
                <FormattedMessage
                  id={isCustomer
                    ? (isServiceListing
                        ? 'HistoricoReservasPage.roleServiceProvider'
                        : 'HistoricoReservasPage.roleHost')
                    : 'HistoricoReservasPage.roleCustomer'}
                />
              </span>
              <FollowBtn userId={otherPartyId} />
            </div>
          </div>
        ) : null}
        <span className={css.bookingCardArrow}>›</span>
      </div>
    </NamedLink>
  );
};

const SORT_KEYS = ['recent', 'oldest', 'price-desc', 'price-asc', 'booking-date'];
const DEFAULT_SORT = 'recent';

const SortDropdown = ({ options, currentSort, onSelect, intl }) => {
  const [isOpen, setIsOpen] = useState(false);
  const current = options.find(o => o.key === currentSort);
  const currentLabel = current ? current.label : '';
  const iconClass = `${css.iconArrow}${isOpen ? ` ${css.iconArrowAnimation}` : ''}`;
  return (
    <div className={css.sortByWrapper}>
      <span className={css.sortByLabel}>
        {intl.formatMessage({ id: 'HistoricoReservasPage.sortByHeading' })}:
      </span>
      <Menu
        useArrow={false}
        contentPlacementOffset={-14}
        contentPosition="left"
        onToggleActive={setIsOpen}
        isOpen={isOpen}
        preferScreenWidthOnMobile
      >
        <MenuLabel rootClassName={css.sortLabel}>
          <span className={css.sortLabelText}>{currentLabel}</span>
          <IconArrowHead className={iconClass} direction="down" size="tiny" />
        </MenuLabel>
        <MenuContent className={css.menuContent}>
          {options.map(option => {
            const selected = option.key === currentSort;
            const itemClass = `${css.menuItem}${selected ? ` ${css.menuItemSelected}` : ''}`;
            return (
              <MenuItem key={option.key}>
                <button
                  type="button"
                  className={itemClass}
                  onClick={() => {
                    setIsOpen(false);
                    if (!selected) onSelect('sort', option.key);
                  }}
                >
                  {option.label}
                </button>
              </MenuItem>
            );
          })}
        </MenuContent>
      </Menu>
    </div>
  );
};

const isTxCustomer = (tx, currentUserId) =>
  tx?.customer?.id?.uuid === currentUserId;

const getMoneyAmount = (tx, currentUserId) => {
  // Use payin if the current user is the customer; payout if they're the host.
  const m = isTxCustomer(tx, currentUserId)
    ? tx?.attributes?.payinTotal
    : tx?.attributes?.payoutTotal;
  return typeof m?.amount === 'number' ? m.amount : 0;
};

const getBookingStartTime = tx => {
  const t = tx?.booking?.attributes?.displayStart || tx?.booking?.attributes?.start;
  return t ? new Date(t).getTime() : 0;
};

const sortTransactions = (txs, sortKey, currentUserId) => {
  const arr = [...txs];
  switch (sortKey) {
    case 'oldest':
      return arr.sort(
        (a, b) =>
          new Date(a.attributes?.lastTransitionedAt || 0).getTime() -
          new Date(b.attributes?.lastTransitionedAt || 0).getTime()
      );
    case 'price-desc':
      return arr.sort(
        (a, b) => getMoneyAmount(b, currentUserId) - getMoneyAmount(a, currentUserId)
      );
    case 'price-asc':
      return arr.sort(
        (a, b) => getMoneyAmount(a, currentUserId) - getMoneyAmount(b, currentUserId)
      );
    case 'booking-date':
      return arr.sort((a, b) => getBookingStartTime(b) - getBookingStartTime(a));
    case 'recent':
    default:
      return arr.sort(
        (a, b) =>
          new Date(b.attributes?.lastTransitionedAt || 0).getTime() -
          new Date(a.attributes?.lastTransitionedAt || 0).getTime()
      );
  }
};

export const HistoricoReservasPageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();
  const routeConfiguration = useRouteConfiguration();
  const {
    currentUser,
    fetchInProgress,
    fetchError,
    pagination,
    scrollingDisabled,
    transactions,
  } = props;

  const title = intl.formatMessage({ id: 'HistoricoReservasPage.title' });

  const currentUserId = currentUser?.id?.uuid;
  // Keep only transactions where the current user is either the customer or
  // the provider (i.e. their own history regardless of role).
  const filtered = transactions.filter(tx => {
    if (!currentUserId) return false;
    const customerId = tx?.customer?.id?.uuid;
    const providerId = tx?.provider?.id?.uuid;
    return customerId === currentUserId || providerId === currentUserId;
  });

  const { sort: sortFromUrl } = parse(location.search);
  const currentSort = SORT_KEYS.includes(sortFromUrl) ? sortFromUrl : DEFAULT_SORT;
  // For mixed list we sort by "customer view" semantics: price = payinTotal.
  // (sortTransactions accepts an isCustomer arg but it only affects price sort,
  // which we evaluate per-tx using whichever side the user is on inside the
  // sort util — keep simple: use false here so payoutTotal is used as
  // fallback. Better behaviour will use payin or payout based on role:)
  const sortedFiltered = sortTransactions(filtered, currentSort, currentUserId);

  const sortOptions = [
    { key: 'recent', label: intl.formatMessage({ id: 'HistoricoReservasPage.sortRecent' }) },
    { key: 'oldest', label: intl.formatMessage({ id: 'HistoricoReservasPage.sortOldest' }) },
    { key: 'price-desc', label: intl.formatMessage({ id: 'HistoricoReservasPage.sortPriceDesc' }) },
    { key: 'price-asc', label: intl.formatMessage({ id: 'HistoricoReservasPage.sortPriceAsc' }) },
    { key: 'booking-date', label: intl.formatMessage({ id: 'HistoricoReservasPage.sortBookingDate' }) },
  ];

  const handleSortSelect = (_urlParam, nextSortKey) => {
    const newSearch = stringify({ ...parse(location.search), sort: nextSortKey, page: undefined });
    const newPath = createResourceLocatorString(
      'HistoricoReservasPage',
      routeConfiguration,
      {},
      {}
    );
    history.push(`${newPath}?${newSearch}`);
  };

  const paginationLinks =
    pagination && pagination.totalPages > 1 ? (
      <PaginationLinks
        className={css.pagination}
        pageName="HistoricoReservasPage"
        pagePathParams={{}}
        pagination={pagination}
      />
    ) : null;

  const hasNoResults = !fetchInProgress && sortedFiltered.length === 0 && !fetchError;

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled} className={css.pageRoot}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <div className={css.headingWrapper}>
            <H2 as="h1" className={css.title}>
              <FormattedMessage id="HistoricoReservasPage.title" />
            </H2>
            <SortDropdown
              options={sortOptions}
              currentSort={currentSort}
              onSelect={handleSortSelect}
              intl={intl}
            />
          </div>
        {fetchError ? (
          <p className={css.error}>
            <FormattedMessage id="HistoricoReservasPage.fetchFailed" />
          </p>
        ) : null}
        {fetchInProgress && sortedFiltered.length === 0 ? (
          <div className={css.listLoading}>
            <IconSpinner />
          </div>
        ) : hasNoResults ? (
          <p className={css.empty}>
            <FormattedMessage id="HistoricoReservasPage.noResults" />
          </p>
        ) : (
          <div className={css.list}>
            {sortedFiltered.map(tx => (
              <TransactionCard
                key={tx.id.uuid}
                tx={tx}
                intl={intl}
                isCustomer={isTxCustomer(tx, currentUserId)}
              />
            ))}
          </div>
        )}
        {paginationLinks}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const { fetchInProgress, fetchError, pagination, transactionRefs } = state.HistoricoReservasPage;
  const { currentUser } = state.user;
  return {
    currentUser,
    fetchInProgress,
    fetchError,
    pagination,
    scrollingDisabled: isScrollingDisabled(state),
    transactions: getMarketplaceEntities(state, transactionRefs),
  };
};

const HistoricoReservasPage = compose(connect(mapStateToProps))(HistoricoReservasPageComponent);

export default HistoricoReservasPage;
