import React from 'react';
import classNames from 'classnames';

import { FormattedMessage } from '../../util/reactIntl';
import { propTypes } from '../../util/types';
import { createSlug } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';

import {
  AspectRatioWrapper,
  AvatarMedium,
  H4,
  H6,
  NamedLink,
  ResponsiveImage,
} from '../../components';

import css from './CheckoutPage.module.css';

/**
 * A card that displays the listing and booking details on the checkout page.
 *
 * @component
 * @param {Object} props
 * @param {propTypes.listing} props.listing - The listing
 * @param {string} props.listingTitle - The listing title
 * @param {propTypes.user} props.author - The author
 * @param {propTypes.image} props.firstImage - The first image
 * @param {Object} props.layoutListingImageConfig - The layout listing image config
 * @param {ReactNode} props.speculateTransactionErrorMessage - The speculate transaction error message
 * @param {boolean} props.showPrice - Whether to show the price
 * @param {string} props.processName - The process name
 * @param {ReactNode} props.breakdown - The breakdown
 * @param {intlShape} props.intl - The intl object
 */
const formatLastOnline = isoString => {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 120) return 'Online agora mesmo';
  if (diff < 3600) return `Online há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Online há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Online há ${Math.floor(diff / 86400)}d`;
  return null;
};

const formatSlotRange = (start, end, intl) => {
  const opts = { weekday: 'short', day: 'numeric', month: 'short' };
  const s = intl.formatDate(start, opts);
  const e = intl.formatDate(end, opts);
  return `${s} – ${e}`;
};

const DetailsSideCard = props => {
  const {
    listing,
    listingTitle,
    priceVariantName,
    author,
    firstImage,
    layoutListingImageConfig,
    speculateTransactionErrorMessage,
    showPrice,
    processName,
    breakdown,
    showListingImage,
    intl,
    multipleBookings,
    primaryBookingDates,
  } = props;

  const { price, publicData } = listing?.attributes || {};
  const unitType = publicData.unitType || 'unknown';

  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } =
    layoutListingImageConfig || {};
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter(k => k.startsWith(variantPrefix))
    : [];

  return (
    <div className={css.detailsContainerDesktop} role="complementary">
      {showListingImage && (
        <AspectRatioWrapper
          width={aspectWidth}
          height={aspectHeight}
          className={css.detailsAspectWrapper}
        >
          <ResponsiveImage
            rootClassName={css.rootForImage}
            alt={listingTitle}
            image={firstImage}
            variants={variants}
          />
        </AspectRatioWrapper>
      )}
      <div className={css.listingDetailsWrapper}>
        <div className={classNames(css.avatarWrapper, { [css.noListingImage]: !showListingImage })}>
          <AvatarMedium user={author} disableProfileLink />
          <div className={css.authorInfo}>
            <p className={css.authorName}>
              {author?.attributes?.profile?.displayName || author?.attributes?.profile?.firstName}
            </p>
          </div>
        </div>
        <div
          className={classNames(css.detailsHeadings, { [css.noListingImage]: !showListingImage })}
        >
          <H4 as="h2">
            <NamedLink
              name="ListingPage"
              params={{ id: listing?.id?.uuid, slug: createSlug(listingTitle) }}
            >
              {listingTitle}
            </NamedLink>
          </H4>
          {showPrice ? (
            <div className={css.priceContainer}>
              <p className={css.price}>{formatMoney(intl, price)}</p>
              <div className={css.perUnit}>
                <FormattedMessage
                  id="CheckoutPageWithInquiryProcess.perUnit"
                  values={{ unitType }}
                />
              </div>
            </div>
          ) : null}
        </div>
        {speculateTransactionErrorMessage}
      </div>

      {!!breakdown ? (
        <div className={css.orderBreakdownHeader}>
          {priceVariantName ? (
            <div className={css.bookingPriceVariant}>
              <p>{priceVariantName}</p>
            </div>
          ) : null}

          <H6 as="h3" className={css.orderBreakdownTitle}>
            <FormattedMessage id={`CheckoutPage.${processName}.orderBreakdown`} />
          </H6>
          <hr className={css.totalDivider} />
        </div>
      ) : null}

      {multipleBookings?.additionalBookings?.length > 0 && primaryBookingDates ? (
        <div className={css.multiBookingsList}>
          {[
            {
              start: primaryBookingDates.bookingStart,
              end: primaryBookingDates.bookingEnd,
            },
            ...multipleBookings.additionalBookings.map(s => ({
              start: new Date(s.bookingStart),
              end: new Date(s.bookingEnd),
            })),
          ].map((b, idx, arr) => {
            const dayOpts = { weekday: 'long' };
            const dateOpts = { day: '2-digit', month: '2-digit' };
            // For daily listings the API stores end as exclusive (e.g. user
            // picks 30/04 → stored as 01/05) — show the inclusive last day.
            // For hourly listings the end is the actual booking end time;
            // do not subtract a day.
            const isHourlyListing =
              unitType === 'hour' || multipleBookings?.isHourly === true;
            const endDisplay = new Date(b.end);
            if (!isHourlyListing) {
              endDisplay.setDate(endDisplay.getDate() - 1);
            }
            return (
              <div key={idx} style={{ marginBottom: idx === arr.length - 1 ? 0 : 16 }}>
                <p
                  style={{
                    fontFamily: 'var(--fontFamily)',
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.04em',
                    textTransform: 'uppercase',
                    color: '#7C6350',
                    margin: '0 0 6px 0',
                  }}
                >
                  <FormattedMessage
                    id="DetailsSideCard.bookingNumber"
                    defaultMessage="Reserva {n}"
                    values={{ n: idx + 1 }}
                  />
                </p>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    gap: 12,
                  }}
                >
                  <div>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--colorGrey700)',
                        margin: 0,
                      }}
                    >
                      <FormattedMessage id="OrderBreakdown.bookingStart" />
                    </p>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--colorBlack)',
                        margin: '2px 0 0 0',
                        textTransform: 'capitalize',
                      }}
                    >
                      {intl.formatDate(b.start, dayOpts)}
                    </p>
                    <p
                      style={{ fontSize: 13, color: 'var(--colorGrey700)', margin: '2px 0 0 0' }}
                    >
                      {intl.formatDate(b.start, dateOpts)}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <p
                      style={{
                        fontSize: 12,
                        color: 'var(--colorGrey700)',
                        margin: 0,
                      }}
                    >
                      <FormattedMessage id="OrderBreakdown.bookingEnd" />
                    </p>
                    <p
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: 'var(--colorBlack)',
                        margin: '2px 0 0 0',
                        textTransform: 'capitalize',
                      }}
                    >
                      {intl.formatDate(endDisplay, dayOpts)}
                    </p>
                    <p
                      style={{ fontSize: 13, color: 'var(--colorGrey700)', margin: '2px 0 0 0' }}
                    >
                      {intl.formatDate(endDisplay, dateOpts)}
                    </p>
                  </div>
                </div>
                {idx < arr.length - 1 && (
                  <hr
                    style={{
                      border: 'none',
                      borderTop: '1px solid var(--colorGrey100)',
                      margin: '12px 0 0 0',
                    }}
                  />
                )}
              </div>
            );
          })}
          <hr className={css.totalDivider} />
        </div>
      ) : null}

      {breakdown}
    </div>
  );
};

export default DetailsSideCard;
