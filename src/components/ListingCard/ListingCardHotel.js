import React, { useEffect } from 'react';
import classNames from 'classnames';
import { useSelector, useDispatch } from 'react-redux';

import { useConfiguration } from '../../context/configurationContext';
import { useIntl } from '../../util/reactIntl';
import { selectListingRating, selectListingReviewCount, fetchListingRating } from '../../ducks/ratings.duck';
import { createSlug } from '../../util/urlHelpers';
import { formatMoney } from '../../util/currency';

import { NamedLink, ResponsiveImage } from '../../components';
import FavoriteButton from '../FavoriteButton/FavoriteButton';

import css from './ListingCardHotel.module.css';

const getRatingInfo = (score, intl) => {
  if (score == null) return null;
  if (score >= 9.0) return { label: intl.formatMessage({ id: 'ListingCard.ratingExcellent' }), cls: '' };
  if (score >= 8.0) return { label: intl.formatMessage({ id: 'ListingCard.ratingVeryGood' }), cls: css.veryGood };
  if (score >= 7.0) return { label: intl.formatMessage({ id: 'ListingCard.ratingGood' }), cls: css.good };
  return { label: intl.formatMessage({ id: 'ListingCard.ratingOk' }), cls: css.ok };
};

const ListingCardHotel = props => {
  const { listing, renderSizes, lazyLoadImage = true } = props;
  const config = useConfiguration();
  const intl = useIntl();
  const dispatch = useDispatch();

  const id = listing?.id?.uuid;
  const { title = '', price, publicData } = listing?.attributes || {};
  const slug = createSlug(title);

  const averageRating = useSelector(state => selectListingRating(state, id));
  const reviewCount = useSelector(state => selectListingReviewCount(state, id));
  const currentUserId = useSelector(state => state.user?.currentUser?.id?.uuid);
  const isOwnListing = currentUserId && listing?.author?.id?.uuid === currentUserId;

  useEffect(() => {
    if (id && averageRating === undefined) {
      dispatch(fetchListingRating(id));
    }
  }, [id]);

  // Image
  const firstImage = listing?.images?.[0] || null;
  const { aspectWidth = 1, aspectHeight = 1, variantPrefix = 'listing-card' } = config.layout.listingImage;
  const variants = firstImage?.attributes?.variants
    ? Object.keys(firstImage.attributes.variants).filter(k => k.startsWith(variantPrefix))
    : [];

  // Location
  const locationAddress =
    publicData?.location?.address ||
    publicData?.locationAddress ||
    publicData?.city ||
    null;

  // Price
  const formattedPrice = price && price.currency === config.currency
    ? formatMoney(intl, price)
    : null;

  const unitType = publicData?.unitType;
  const perUnitLabel = unitType === 'hour'
    ? intl.formatMessage({ id: 'ListingCard.perHour' })
    : unitType === 'day'
    ? intl.formatMessage({ id: 'ListingCard.perDay' })
    : intl.formatMessage({ id: 'ListingCard.perUnit' }, { unitType: unitType || '' });

  // Rating
  const ratingInfo = getRatingInfo(averageRating, intl);

  return (
    <NamedLink
      className={css.root}
      name="ListingPage"
      params={{ id, slug }}
    >
      {/* Image */}
      <div className={css.imageWrapper}>
        {firstImage ? (
          <ResponsiveImage
            rootClassName={css.image}
            alt={title}
            image={firstImage}
            variants={variants}
            sizes={renderSizes || '(max-width: 767px) 50vw, 280px'}
          />
        ) : (
          <div className={css.imagePlaceholder} />
        )}
        {!isOwnListing && (
          <div className={css.favoriteBtn}>
            <FavoriteButton
              listingId={id}
              initialCount={listing?.attributes?.publicData?.favoritesCount}
            />
          </div>
        )}
      </div>

      {/* Info */}
      <div className={css.info}>
        <div className={css.title}>{title}</div>

        {locationAddress ? (
          <div className={css.location}>
            <svg className={css.locationIcon} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            {locationAddress}
          </div>
        ) : null}

        {/* Rating */}
        <div className={css.ratingRow}>
          {ratingInfo ? (
            <>
              <span className={classNames(css.ratingBadge, ratingInfo.cls)}>
                {averageRating.toFixed(1)}
              </span>
              <span className={css.ratingLabel}>{ratingInfo.label}</span>
              {reviewCount > 0 && (
                <span className={css.ratingCount}>
                  ({reviewCount})
                </span>
              )}
            </>
          ) : (
            <span className={css.noRating}>
              {intl.formatMessage({ id: 'ListingCard.noReviews' })}
            </span>
          )}
        </div>

        {/* Price */}
        {formattedPrice ? (
          <div className={css.priceRow}>
            <span className={css.price}>{formattedPrice}</span>
            <span className={css.perUnit}>{perUnitLabel}</span>
          </div>
        ) : null}
      </div>
    </NamedLink>
  );
};

export default ListingCardHotel;
