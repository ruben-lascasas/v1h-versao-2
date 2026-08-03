// ⚠️ If you modify the styling of this component and you're using the SectionListings component in your marketplace (featured listings)
// please reflect those changes in the calculateCarouselHeight function in SectionListing.js to avoid layout issues
import React, { useEffect } from 'react';
import classNames from 'classnames';
import { useSelector, useDispatch } from 'react-redux';

import { useConfiguration } from '../../context/configurationContext';

import { useIntl } from '../../util/reactIntl';
import { selectListingRating, selectListingReviewCount, fetchListingRating } from '../../ducks/ratings.duck';
import { fetchViewCounts, selectViewCounts } from '../../ducks/recommendations.duck';
import { useLocale } from '../../context/localeContext';
import { requireListingImage } from '../../util/configHelpers';
import { lazyLoadWithDimensions } from '../../util/uiHelpers';
import { createSlug } from '../../util/urlHelpers';
import { listingHighlightsEnabled } from '../../config/configFeatures';

import {
  AspectRatioWrapper,
  NamedLink,
  ResponsiveImage,
  ListingCardThumbnail,
} from '../../components';
import FavoriteButton from '../FavoriteButton/FavoriteButton';
import IconReviewStar from '../IconReviewStar/IconReviewStar';

import { getListingCardTranslations } from './ListingCard.helpers';

import css from './ListingCard.module.css';

const LazyImage = lazyLoadWithDimensions(ResponsiveImage, { loadAfterInitialRendering: 3000 });

/**
 * ListingCardImage
 * Component responsible for rendering the image part of the listing card.
 * It either renders the first image from the listing's images array with lazy loading,
 * or a stylized placeholder if images are disabled for the listing type.
 * Also wraps the image in a fixed aspect ratio container for consistent layout.
 * @component
 * @param {Object} props
 * @param {Object} props.listing listing entity with image data
 * @param {Function?} props.setActivePropsMaybe mouse enter/leave handlers for map highlighting
 * @param {string} props.title listing title for alt text
 * @param {string} props.renderSizes img/srcset size rules
 * @param {number} props.aspectWidth aspect ratio width
 * @param {number} props.aspectHeight aspect ratio height
 * @param {string} props.variantPrefix image variant prefix (e.g. "listing-card")
 * @param {boolean} props.showListingImage whether to show actual listing image or not
 * @param {Object?} props.style the background color for the listing card with no image
 * @returns {JSX.Element} listing image with fixed aspect ratio or fallback preview
 */
const ListingCardImage = props => {
  const {
    listing,
    setActivePropsMaybe,
    title,
    renderSizes,
    aspectWidth,
    aspectHeight,
    variantPrefix,
    aspectRatioClassName,
    lazyLoadImage,
  } = props;

  const firstImage = listing?.images?.[0] || null;
  const variants = firstImage?.attributes?.variants
    ? Object.keys(firstImage.attributes.variants).filter(k => k.startsWith(variantPrefix))
    : [];

  const aspectRatioClass = aspectRatioClassName || css.aspectRatioWrapper;
  const ImageComponent = lazyLoadImage ? LazyImage : ResponsiveImage;

  return (
    <AspectRatioWrapper
      className={aspectRatioClass}
      width={aspectWidth}
      height={aspectHeight}
      {...setActivePropsMaybe}
    >
      <ImageComponent
        rootClassName={css.rootForImage}
        alt={title}
        image={firstImage}
        variants={variants}
        sizes={renderSizes}
      />
    </AspectRatioWrapper>
  );
};

/**
 * ListingCard
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to component's own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string?} props.aspectRatioClassName custom className for AspectRatioWrapper component
 * @param {Object} props.listing API entity: listing or ownListing
 * @param {string?} props.renderSizes for img/srcset
 * @param {Function?} props.setActiveListing
 * @param {boolean?} props.showAuthorInfo
 * @returns {JSX.Element} listing card to be used in search result panel etc.
 */
export const ListingCard = props => {
  const config = useConfiguration();
  const intl = props.intl || useIntl();

  const {
    className,
    rootClassName,
    aspectRatioClassName,
    darkMode,
    listing,
    renderSizes,
    setActiveListing,
    showAuthorInfo = true,
    lazyLoadImage = true,
  } = props;

  const translations = getListingCardTranslations(listing, config, intl);
  const {
    titlePlain,
    titleFormatted,
    cardAriaLabel,
    showPrice,
    priceTooltip,
    priceMessage,
    authorName,
  } = translations;

  const classes = classNames(rootClassName || css.root, className);

  const id = listing?.id?.uuid;
  const { title = '', publicData } = listing?.attributes || {};
  const dispatch = useDispatch();
  const averageRating = useSelector(state => selectListingRating(state, id));
  const reviewCount = useSelector(state => selectListingReviewCount(state, id));
  const currentUserId = useSelector(state => state.user?.currentUser?.id?.uuid);
  const viewCounts = useSelector(selectViewCounts);
  const { locale } = useLocale();
  const isEN = locale === 'en';

  useEffect(() => {
    if (id && averageRating === undefined) {
      dispatch(fetchListingRating(id));
    }
  }, [id]);

  // One-shot bulk fetch of /api/listing-views the first time any ListingCard
  // mounts in this session. Idempotent — the thunk early-returns on second
  // call.
  useEffect(() => {
    dispatch(fetchViewCounts());
  }, [dispatch]);

  // Priority: Em Destaque > Popular (5+ unique views today) > Novo (<7d).
  // Mirrors the badge logic on ListingPageCarousel so users see the same
  // signal across grid and detail.
  const todayCount = viewCounts?.[id]?.todayCount || 0;
  const isFeatured =
    listingHighlightsEnabled && listing?.attributes?.publicData?.featured === 'true';
  const createdAt = listing?.attributes?.createdAt;
  const isNewListing =
    !!createdAt &&
    Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
  const isPopular = todayCount >= 5;
  const cardBadge = isFeatured
    ? { kind: 'featured', label: isEN ? 'Featured' : 'Em destaque' }
    : isPopular
      ? { kind: 'popular', label: isEN ? 'Popular' : 'Popular' }
      : isNewListing
        ? { kind: 'novo', label: isEN ? 'New' : 'Novo' }
        : null;
  const isOwnListing = currentUserId && listing?.author?.id?.uuid === currentUserId;
  const slug = createSlug(title);

  const { listingType, cardStyle } = publicData || {};
  const rawAddress = publicData?.location?.address || publicData?.city || null;
  const extractCity = addr => {
    if (!addr) return null;
    const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    // Mapbox/Google formats typically end with ", Country" — city is the segment before it.
    // Fall back to the only part if it's a one-segment string (e.g. just "Lisboa").
    const candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    // Strip Portuguese postal codes ("1500-560 Lisboa") and generic leading digits.
    return candidate.replace(/^\d{4}-\d{3}\s+/, '').replace(/^\d+\s+/, '').trim();
  };
  const cityLabel = extractCity(rawAddress);
  const validListingTypes = config.listing.listingTypes || [];
  const foundListingTypeConfig = validListingTypes.find(conf => conf.listingType === listingType);
  // Render the listing image only if listing images are enabled in the listing type
  const showListingImage = requireListingImage(foundListingTypeConfig);

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;

  // Sets the listing as active in the search map when hovered (if the search map is enabled)
  const setActivePropsMaybe = setActiveListing
    ? {
        onMouseEnter: () => setActiveListing(listing?.id),
        onMouseLeave: () => setActiveListing(null),
      }
    : null;

  return (
    <NamedLink
      className={classes}
      name="ListingPage"
      params={{ id, slug }}
      ariaLabel={cardAriaLabel}
    >
      {!isOwnListing && (
        <div className={css.favoriteButtonWrapper}>
          <FavoriteButton
            listingId={id}
            initialCount={listing?.attributes?.publicData?.favoritesCount}
          />
        </div>
      )}
      {cardBadge ? (
        <div
          className={classNames(css.cardBadge, {
            [css.cardBadgeFeatured]: cardBadge.kind === 'featured',
            [css.cardBadgePopular]: cardBadge.kind === 'popular',
            [css.cardBadgeNovo]: cardBadge.kind === 'novo',
          })}
          aria-label={cardBadge.label}
        >
          {cardBadge.label}
        </div>
      ) : null}
      {showListingImage ? (
        <ListingCardImage
          renderSizes={renderSizes}
          title={titlePlain}
          listing={listing}
          setActivePropsMaybe={setActivePropsMaybe}
          aspectWidth={aspectWidth}
          aspectHeight={aspectHeight}
          variantPrefix={variantPrefix}
          aspectRatioClassName={aspectRatioClassName}
          lazyLoadImage={lazyLoadImage}
        />
      ) : (
        <ListingCardThumbnail
          style={cardStyle}
          listingTitle={title}
          className={aspectRatioClassName}
          width={aspectWidth}
          height={aspectHeight}
          setActivePropsMaybe={setActivePropsMaybe}
        />
      )}
      <div className={css.info}>
        <div className={css.mainInfo}>
          {showListingImage && (
            <div className={classNames(css.title, { [css.lightText]: darkMode })}>
              {titleFormatted}
            </div>
          )}
          {showPrice ? (
            <div className={css.price} title={priceTooltip}>
              {priceMessage}
            </div>
          ) : null}
          <div className={css.locationRow}>
            {cityLabel ? (
              <>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  width="12"
                  height="12"
                  className={css.locationIcon}
                >
                  <path
                    fill="#e53935"
                    d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                  />
                </svg>
                <span className={css.locationCity}>{cityLabel}</span>
              </>
            ) : null}
          </div>
          <div className={css.ratingRow}>
            <IconReviewStar className={averageRating != null ? css.ratingStar : css.ratingStarEmpty} isFilled={averageRating != null} />
            <span className={css.ratingValue}>
              {averageRating != null
                ? `${averageRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? intl.formatMessage({ id: 'ListingCard.review' }) : intl.formatMessage({ id: 'ListingCard.reviews' })})`
                : intl.formatMessage({ id: 'ListingCard.noReviews' })}
            </span>
          </div>
        </div>
      </div>
    </NamedLink>
  );
};

export default ListingCard;
