import React, { useState, useEffect, useRef } from 'react';
import { compose } from 'redux';
import { connect, useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import classNames from 'classnames';

// Contexts
import { useConfiguration } from '../../context/configurationContext';
import { useRouteConfiguration } from '../../context/routeConfigurationContext';
// Utils
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { LISTING_STATE_PENDING_APPROVAL, LISTING_STATE_CLOSED, propTypes } from '../../util/types';
import { types as sdkTypes } from '../../util/sdkLoader';
import { formatMoney } from '../../util/currency';
import { parse, stringify } from '../../util/urlHelpers';
import {
  LISTING_PAGE_DRAFT_VARIANT,
  LISTING_PAGE_PENDING_APPROVAL_VARIANT,
  LISTING_PAGE_PARAM_TYPE_DRAFT,
  LISTING_PAGE_PARAM_TYPE_EDIT,
  createSlug,
  NO_ACCESS_PAGE_USER_PENDING_APPROVAL,
  NO_ACCESS_PAGE_VIEW_LISTINGS,
} from '../../util/urlHelpers';
import {
  isErrorNoViewingPermission,
  isErrorUserPendingApproval,
  isForbiddenError,
} from '../../util/errors.js';
import { hasPermissionToViewData, isUserAuthorized } from '../../util/userHelpers.js';
import { requireListingImage } from '../../util/configHelpers';
import {
  ensureListing,
  ensureOwnListing,
  ensureUser,
  userDisplayNameAsString,
} from '../../util/data';
import { richText } from '../../util/richText';
import {
  getDetailCustomFieldValue,
  isFieldForListingType,
  isFieldForCategory,
  pickCategoryFields,
} from '../../util/fieldHelpers';
import {
  OFFER,
  REQUEST,
  isBookingProcess,
  isNegotiationProcess,
  isPurchaseProcess,
  resolveLatestProcessName,
} from '../../transactions/transaction';

// Global ducks (for Redux actions and thunks)
import { getMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import { manageDisableScrolling, isScrollingDisabled } from '../../ducks/ui.duck';
import { initializeCardPaymentData } from '../../ducks/stripe.duck.js';
import { addToRecentlyViewedAndSync } from '../../ducks/recentlyViewed.duck';
import { selectListingRating, selectListingReviewCount } from '../../ducks/ratings.duck';

// Shared components
import {
  H4,
  H3,
  Page,
  NamedLink,
  NamedRedirect,
  OrderPanel,
  LayoutSingleColumn,
  SectionText,
  IconReviewStar,
} from '../../components';

// Related components and modules
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import NotFoundPage from '../NotFoundPage/NotFoundPage';

import {
  sendInquiry,
  setInitialValues,
  fetchTimeSlots,
  fetchTransactionLineItems,
} from './ListingPage.duck';

import {
  LoadingPage,
  ErrorPage,
  priceData,
  listingImages,
  handleContactUser,
  handleSubmitInquiry,
  handleNavigateToMakeOfferPage,
  handleNavigateToRequestQuotePage,
  handleSubmit,
  priceForSchemaMaybe,
} from './ListingPage.shared';
import ActionBarMaybe from './ActionBarMaybe';
import SectionReviews from './SectionReviews';
import TranslateButton from '../../components/TranslateButton/TranslateButton';
import SimilarListingsSection from '../../components/SimilarListingsSection/SimilarListingsSection';
import ShareButtons from '../../components/ShareButtons/ShareButtons';
import ReportListingModal from '../../components/ReportListingModal/ReportListingModal';
import DestacarPromptModal from '../../components/DestacarPromptModal/DestacarPromptModal';
import SectionAuthorMaybe from './SectionAuthorMaybe';
import SectionMapMaybe from './SectionMapMaybe';
import SectionGallery from './SectionGallery';
import CustomListingFields from './CustomListingFields';
import FavoriteButton from '../../components/FavoriteButton/FavoriteButton';
import { getCategoryIcon, getCategoryLabel } from '../../components/CategoryIcons/CategoryIcons';
import { useLocale } from '../../context/localeContext';

import css from './ListingPage.module.css';

const MIN_LENGTH_FOR_LONG_WORDS_IN_TITLE = 16;

const { UUID } = sdkTypes;

// Mobile-only description with "ver mais" toggle. Mirrors the OrderPanel
// DescriptionSection logic but uses ListingPage's own CSS classes.
const MobileDescriptionSection = ({ description, intl }) => {
  const [expanded, setExpanded] = useState(false);
  const [isClamped, setIsClamped] = useState(false);
  const [translated, setTranslated] = useState(null);
  const textRef = useRef(null);
  const shownDescription = translated || description;

  useEffect(() => {
    if (!textRef.current) return;
    const measure = () => {
      const el = textRef.current;
      if (!el) return;
      setIsClamped(el.scrollHeight > el.clientHeight + 1);
    };
    measure();
    if (typeof document !== 'undefined' && document.fonts?.ready) {
      document.fonts.ready.then(measure).catch(() => {});
    }
    let resizeObserver;
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(measure);
      resizeObserver.observe(textRef.current);
    }
    window.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      if (resizeObserver) resizeObserver.disconnect();
    };
  }, [description, expanded]);

  return (
    <div className={css.mobileDescriptionSection}>
      <p className={css.mobileInfoHeading}>
        {intl.formatMessage({ id: 'ListingPage.descriptionTitle' })}
      </p>
      <div className={css.mobileDescriptionBox}>
        <p
          ref={textRef}
          className={expanded
            ? css.mobileDescriptionText
            : `${css.mobileDescriptionText} ${css.mobileDescriptionTextClamped}`}
        >
          {shownDescription}
        </p>
        <div className={css.mobileDescriptionActions}>
          <TranslateButton
            text={description}
            isShowingOriginal={!translated}
            onResult={setTranslated}
          />
          {(isClamped || expanded) && (
            <button
              type="button"
              className={css.mobileDescriptionToggle}
              onClick={() => setExpanded(prev => !prev)}
            >
              {expanded
                ? intl.formatMessage({ id: 'OrderPanel.descriptionSeeLess' })
                : intl.formatMessage({ id: 'OrderPanel.descriptionSeeMore' })}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export const ListingPageComponent = props => {
  const [inquiryModalOpen, setInquiryModalOpen] = useState(
    props.inquiryModalOpenForListingId === props.params.id
  );
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  // Count of unique logged-in users that opened this listing today. Hydrated
  // from localStorage so we render the last-known number immediately (avoids
  // the badge popping in late on refresh / dark-mode toggle), then refreshed
  // by the GET/POST below.
  const [viewCount, setViewCount] = useState(() => {
    try {
      if (typeof window === 'undefined' || !props.params?.id) return null;
      const raw = window.localStorage.getItem(`v1h_viewCount_${props.params.id}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      // Only trust the cached count if it was saved today; otherwise return
      // null so the badge waits for the network roundtrip (different day =>
      // count resets).
      const today = new Date().toISOString().slice(0, 10);
      if (parsed?.day === today && typeof parsed?.count === 'number') {
        return parsed.count;
      }
      return null;
    } catch (_) {
      return null;
    }
  });
  // Cumulative since-launch viewer count — used to show the owner an eye-emoji
  // badge with how many unique accounts have ever opened their listing.
  // Cached in localStorage so the number renders immediately on refresh
  // (network refresh updates it after).
  const [allTimeViewCount, setAllTimeViewCount] = useState(() => {
    try {
      if (typeof window === 'undefined' || !props.params?.id) return null;
      const raw = window.localStorage.getItem(`v1h_viewAllTime_${props.params.id}`);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return typeof parsed?.count === 'number' ? parsed.count : null;
    } catch (_) {
      return null;
    }
  });
  // True when the gallery is showing the YouTube video slide — used to hide
  // the category badge and favourite heart that would otherwise overlap the
  // player chrome.
  const [isVideoSlide, setIsVideoSlide] = useState(false);
  const savedScrollRef = useRef(0);

  useEffect(() => {
    setMounted(true);
  }, []);

  const closeInquiryModal = () => {
    const y = savedScrollRef.current;
    setInquiryModalOpen(false);
    const restore = () => window.scrollTo({ top: y, left: 0, behavior: 'instant' });
    requestAnimationFrame(() => {
      restore();
      setTimeout(restore, 0);
      setTimeout(restore, 50);
      setTimeout(restore, 150);
    });
  };

  const dispatch = useDispatch();

  const {
    isAuthenticated,
    currentUser,
    getListing,
    getOwnListing,
    intl,
    onManageDisableScrolling,
    params: rawParams,
    location,
    scrollingDisabled,
    showListingError,
    reviews = [],
    fetchReviewsError,
    sendInquiryInProgress,
    sendInquiryError,
    history,
    callSetInitialValues,
    onSendInquiry,
    onInitializeCardPaymentData,
    config,
    routeConfiguration,
    showOwnListingsOnly,
    ...restOfProps
  } = props;

  useEffect(() => {
    if (rawParams.id) {
      dispatch(addToRecentlyViewedAndSync(rawParams.id));
    }
  }, [rawParams.id]);

  // Always call hooks before any conditional returns (rules of hooks)
  const averageRating = useSelector(state => selectListingRating(state, rawParams.id));
  const reviewCount = useSelector(state => selectListingReviewCount(state, rawParams.id));
  const { locale } = useLocale();

  const listingConfig = config.listing;
  const listingId = new UUID(rawParams.id);
  const isVariant = rawParams.variant != null;
  const isPendingApprovalVariant = rawParams.variant === LISTING_PAGE_PENDING_APPROVAL_VARIANT;
  const isDraftVariant = rawParams.variant === LISTING_PAGE_DRAFT_VARIANT;
  const currentListing =
    isPendingApprovalVariant || isDraftVariant || showOwnListingsOnly
      ? ensureOwnListing(getOwnListing(listingId))
      : ensureListing(getListing(listingId));

  // Track unique-viewer count for this listing. Logged-in non-owners POST so
  // the server can register them in today's set; everyone (logged out or
  // owner) does a GET only. Listing owner is skipped client-side too — they
  // shouldn't inflate their own counter.
  const currentUserUuid = currentUser?.id?.uuid;
  const listingAuthorUuid = currentListing?.author?.id?.uuid;
  useEffect(() => {
    if (!rawParams.id) return;
    const cacheCount = count => {
      try {
        if (typeof window === 'undefined') return;
        const today = new Date().toISOString().slice(0, 10);
        window.localStorage.setItem(
          `v1h_viewCount_${rawParams.id}`,
          JSON.stringify({ day: today, count })
        );
      } catch (_) {}
    };
    const cacheAllTime = count => {
      try {
        if (typeof window === 'undefined') return;
        window.localStorage.setItem(
          `v1h_viewAllTime_${rawParams.id}`,
          JSON.stringify({ count })
        );
      } catch (_) {}
    };
    const apply = data => {
      if (typeof data?.todayCount === 'number') {
        setViewCount(data.todayCount);
        cacheCount(data.todayCount);
      }
      if (typeof data?.allTimeCount === 'number') {
        setAllTimeViewCount(data.allTimeCount);
        cacheAllTime(data.allTimeCount);
      }
    };

    // Wait until we know who the listing author is before deciding to POST.
    // If we POSTed too early (while author UUID is still undefined) the owner
    // would accidentally count themselves as a viewer.
    const canDecide = !currentUserUuid || !!listingAuthorUuid;
    const isOwner = currentUserUuid && listingAuthorUuid && currentUserUuid === listingAuthorUuid;

    if (currentUserUuid && canDecide && !isOwner) {
      fetch('/api/listing-views', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listingId: rawParams.id, userId: currentUserUuid }),
      })
        .then(r => r.json())
        .then(apply)
        .catch(() => {});
    } else {
      // Logged out, owner, or author still unknown — just read the count.
      fetch(`/api/listing-views/${encodeURIComponent(rawParams.id)}`)
        .then(r => r.json())
        .then(apply)
        .catch(() => {});
    }
  }, [rawParams.id, currentUserUuid, listingAuthorUuid]);

  const listingSlug = rawParams.slug || createSlug(currentListing.attributes.title || '');
  const params = { slug: listingSlug, ...rawParams };

  const listingPathParamType = isDraftVariant
    ? LISTING_PAGE_PARAM_TYPE_DRAFT
    : LISTING_PAGE_PARAM_TYPE_EDIT;
  const listingTab = isDraftVariant ? 'photos' : 'details';

  const isApproved =
    currentListing.id && currentListing.attributes.state !== LISTING_STATE_PENDING_APPROVAL;

  const pendingIsApproved = isPendingApprovalVariant && isApproved;

  // If a /pending-approval URL is shared, the UI requires
  // authentication and attempts to fetch the listing from own
  // listings. This will fail with 403 Forbidden if the author is
  // another user. We use this information to try to fetch the
  // public listing.
  const pendingOtherUsersListing =
    (isPendingApprovalVariant || isDraftVariant) &&
    showListingError &&
    showListingError.status === 403;
  const shouldShowPublicListingPage = pendingIsApproved || pendingOtherUsersListing;

  if (shouldShowPublicListingPage) {
    return <NamedRedirect name="ListingPage" params={params} search={location.search} />;
  }

  const topbar = <TopbarContainer />;

  if (showListingError && showListingError.status === 404) {
    // 404 listing not found
    return <NotFoundPage staticContext={props.staticContext} />;
  } else if (showListingError) {
    // Other error in fetching listing
    return <ErrorPage topbar={topbar} scrollingDisabled={scrollingDisabled} intl={intl} />;
  } else if (!currentListing.id) {
    // Still loading the listing
    return <LoadingPage topbar={topbar} scrollingDisabled={scrollingDisabled} intl={intl} />;
  }

  const {
    description = '',
    geolocation = null,
    price = null,
    title = '',
    publicData = {},
    metadata = {},
  } = currentListing.attributes;

  const richTitle = (
    <span>
      {richText(title, {
        longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS_IN_TITLE,
        longWordClass: css.longWord,
      })}
    </span>
  );

  // Build amenity chips: collect all multi-enum fields with selected values
  const amenityChips = listingConfig.listingFields
    .filter(f => f.schemaType === 'multi-enum' && publicData[f.key]?.length > 0)
    .flatMap(f =>
      (publicData[f.key] || []).map(val => {
        const opt = f.enumOptions?.find(o => o.option === val);
        return opt ? opt.label : val;
      })
    );

  // Build detail items (enum/long/boolean fields) for sidebar
  const { key: categoryPrefix, categories: listingCategoriesConfig } = config.categoryConfiguration;
  const categoriesObj = pickCategoryFields(publicData, categoryPrefix, 1, listingCategoriesConfig);
  const currentCategories = Object.values(categoriesObj);
  const topCategoryId = currentCategories[0];
  const topCategoryConfig = topCategoryId
    ? listingCategoriesConfig.find(c => c.id === topCategoryId)
    : null;
  const topCategoryLabel = topCategoryId
    ? getCategoryLabel(topCategoryId, topCategoryConfig?.name, locale)
    : null;
  // Backend-only fields (e.g. averageRating, reviewCount) must not appear in the
  // visible "Detalhes" section even though Sharetribe marks them isDetail by default.
  // `featured` / `featuredAt` are written by the "Destacar Anúncio" flow and are
  // not user-facing details — hide them too.
  const HIDDEN_DETAIL_FIELDS = ['averageRating', 'reviewCount', 'featured', 'featuredAt'];
  const detailItems = listingConfig.listingFields.reduce((acc, fieldConfig) => {
    const { key: fieldKey, schemaType, enumOptions, showConfig = {} } = fieldConfig;
    const { isDetail, label } = showConfig;
    if (!isDetail) return acc;
    if (HIDDEN_DETAIL_FIELDS.includes(fieldKey)) return acc;
    const isTargetListingType = isFieldForListingType(publicData.listingType, fieldConfig);
    const isTargetCategory = isFieldForCategory(currentCategories, fieldConfig);
    const value = publicData[fieldKey] !== undefined ? publicData[fieldKey] : metadata[fieldKey];
    if (isTargetListingType && isTargetCategory && value !== undefined && value !== null) {
      const detailValue = getDetailCustomFieldValue(enumOptions, value, schemaType, fieldKey, label, intl, 'ListingPage');
      if (detailValue) acc.push(detailValue);
    }
    return acc;
  }, []);

  const authorAvailable = currentListing && currentListing.author;
  const userAndListingAuthorAvailable = !!(currentUser && authorAvailable);
  const isOwnListing =
    userAndListingAuthorAvailable && currentListing.author.id.uuid === currentUser.id.uuid;

  const { listingType, transactionProcessAlias, unitType } = publicData;
  if (!(listingType && transactionProcessAlias && unitType)) {
    // Listing should always contain listingType, transactionProcessAlias and unitType)
    return (
      <ErrorPage topbar={topbar} scrollingDisabled={scrollingDisabled} intl={intl} invalidListing />
    );
  }
  const validListingTypes = listingConfig.listingTypes;
  const foundListingTypeConfig = validListingTypes.find(conf => conf.listingType === listingType);
  const showListingImage = requireListingImage(foundListingTypeConfig);
  const showDescription = foundListingTypeConfig?.defaultListingFields?.description;

  const processName = resolveLatestProcessName(transactionProcessAlias.split('/')[0]);
  const isBooking = isBookingProcess(processName);
  const isPurchase = isPurchaseProcess(processName);
  const isNegotiation = isNegotiationProcess(processName);
  const processType = isBooking
    ? 'booking'
    : isPurchase
    ? 'purchase'
    : isNegotiation
    ? 'negotiation'
    : 'inquiry';

  const currentAuthor = authorAvailable ? currentListing.author : null;
  const ensuredAuthor = ensureUser(currentAuthor);
  const authorNeedsPayoutDetails =
    ['booking', 'purchase'].includes(processType) || (isNegotiation && unitType === OFFER);
  const noPayoutDetailsSetWithOwnListing =
    isOwnListing && (authorNeedsPayoutDetails && !currentUser?.attributes?.stripeConnected);
  const payoutDetailsWarning = noPayoutDetailsSetWithOwnListing ? (
    <span className={css.payoutDetailsWarning}>
      <FormattedMessage id="ListingPage.payoutDetailsWarning" values={{ processType }} />
      <NamedLink name="StripePayoutPage">
        <FormattedMessage id="ListingPage.payoutDetailsWarningLink" />
      </NamedLink>
    </span>
  ) : null;

  // When user is banned or deleted the listing is also deleted.
  // Because listing can be never showed with banned or deleted user we don't have to provide
  // banned or deleted display names for the function
  const authorDisplayName = userDisplayNameAsString(ensuredAuthor, '');

  const { formattedPrice } = priceData(price, config.currency, intl);

  const commonParams = { params, history, routes: routeConfiguration };
  const onContactUser = handleContactUser({
    ...commonParams,
    currentUser,
    callSetInitialValues,
    location,
    setInitialValues,
    setInquiryModalOpen,
  });
  // Note: this is for inquire transition to inquiry state in booking, purchase and negotiation processes.
  // Inquiry process is handled through handleSubmit.
  const onSubmitInquiry = handleSubmitInquiry({
    ...commonParams,
    getListing,
    onSendInquiry,
    setInquiryModalOpen,
  });
  // This is to navigate to MakeOfferPage when InvokeNegotiationForm is submitted
  const onNavigateToMakeOfferPage = handleNavigateToMakeOfferPage({
    ...commonParams,
    getListing,
  });
  // This is to navigate to MakeOfferPage when InvokeNegotiationForm is submitted
  const onNavigateToRequestQuotePage = handleNavigateToRequestQuotePage({
    ...commonParams,
    getListing,
  });
  const onSubmit = handleSubmit({
    ...commonParams,
    currentUser,
    callSetInitialValues,
    getListing,
    onInitializeCardPaymentData,
  });

  const handleOrderSubmit = values => {
    const isCurrentlyClosed = currentListing.attributes.state === LISTING_STATE_CLOSED;
    if (isOwnListing || isCurrentlyClosed) {
      window.scrollTo(0, 0);
    } else if (isNegotiation && unitType === REQUEST) {
      onNavigateToMakeOfferPage(values);
    } else if (isNegotiation && unitType === OFFER) {
      onNavigateToRequestQuotePage(values);
    } else {
      onSubmit(values);
    }
  };

  const facebookImages = listingImages(currentListing, 'facebook');
  const twitterImages = listingImages(currentListing, 'twitter');
  const schemaImages = listingImages(
    currentListing,
    `${config.layout.listingImage.variantPrefix}-2x`
  ).map(img => img.url);
  const marketplaceName = config.marketplaceName;
  const schemaTitle = intl.formatMessage(
    { id: 'ListingPage.schemaTitle' },
    { title, price: formattedPrice, marketplaceName }
  );
  // You could add reviews, sku, etc. into page schema
  // Read more about product schema
  // https://developers.google.com/search/docs/advanced/structured-data/product
  const productURL = `${config.marketplaceRootURL}${location.pathname}${location.search}${location.hash}`;
  const currentStock = currentListing.currentStock?.attributes?.quantity || 0;
  const schemaAvailability = !currentListing.currentStock
    ? null
    : currentStock > 0
    ? 'https://schema.org/InStock'
    : 'https://schema.org/OutOfStock';

  const availabilityMaybe = schemaAvailability ? { availability: schemaAvailability } : {};
  const noIndexMaybe =
    currentListing.attributes.state === LISTING_STATE_CLOSED ? { noIndex: true } : {};

  return (
    <Page
      title={schemaTitle}
      scrollingDisabled={scrollingDisabled}
      author={authorDisplayName}
      description={description}
      facebookImages={facebookImages}
      twitterImages={twitterImages}
      {...noIndexMaybe}
      schema={{
        '@context': 'http://schema.org',
        '@type': 'Product',
        description: description,
        name: schemaTitle,
        image: schemaImages,
        offers: {
          '@type': 'Offer',
          url: productURL,
          ...priceForSchemaMaybe(price),
          ...availabilityMaybe,
        },
      }}
    >
      <LayoutSingleColumn className={css.pageRoot} topbar={topbar} footer={<FooterContainer />}>
        <div className={css.contentWrapperForProductLayout}>
          <div className={css.mainColumnForProductLayout}>
            {mounted && currentListing.id && noPayoutDetailsSetWithOwnListing ? (
              <ActionBarMaybe
                className={css.actionBarForProductLayout}
                isOwnListing={isOwnListing}
                listing={currentListing}
                showNoPayoutDetailsSet={noPayoutDetailsSetWithOwnListing}
                currentUser={currentUser}
              />
            ) : null}
            {null}
            {showListingImage && (
              <div className={css.galleryWrapper}>
                <SectionGallery
                  listing={currentListing}
                  variantPrefix={config.layout.listingImage.variantPrefix}
                  onSlideChange={(_idx, isVideo) => setIsVideoSlide(!!isVideo)}
                />
                {topCategoryId && topCategoryLabel && !isVideoSlide ? (
                  <NamedLink
                    name="SearchPage"
                    to={{ search: `?pub_categoryLevel1=${encodeURIComponent(topCategoryId)}` }}
                    className={css.listingCategoryBadge}
                  >
                    <span className={css.listingCategoryBadgeIcon}>
                      {getCategoryIcon(topCategoryId, topCategoryConfig?.name)}
                    </span>
                    <span className={css.listingCategoryBadgeLabel}>{topCategoryLabel}</span>
                  </NamedLink>
                ) : null}
                {mounted && currentListing.id && !isVideoSlide ? (
                  <div className={css.favoriteButtonContainer}>
                    <FavoriteButton
                      listingId={currentListing.id.uuid}
                      initialCount={currentListing?.attributes?.publicData?.favoritesCount}
                      readOnly={isOwnListing}
                      className={css.favoriteButtonLarge}
                    />
                  </div>
                ) : null}
                {/* Owner-only "since launch" view counter — bottom-RIGHT of the
                    image. Sits alongside the public Em destaque/Popular/Novo
                    badge (which is bottom-LEFT) so the host sees both: what the
                    public sees about the listing AND their private audience
                    size. */}
                {!isVideoSlide && isOwnListing
                  ? (() => {
                      const ownerCount = allTimeViewCount != null ? allTimeViewCount : 0;
                      const isEn = locale === 'en';
                      const label = isEn
                        ? ownerCount === 1
                          ? 'Your listing has been viewed 1 time'
                          : `Your listing has been viewed ${ownerCount} times`
                        : ownerCount === 1
                          ? 'O seu anúncio foi visto 1 vez'
                          : `O seu anúncio foi visto ${ownerCount} vezes`;
                      return (
                        <div
                          className={`${css.viewCountBadge} ${css.ownerViewCountBadge} ${css.ownerViewCountBadgeRight}`}
                          aria-label={label}
                        >
                          <span>{label}</span>
                        </div>
                      );
                    })()
                  : null}
                {(() => {
                  if (isVideoSlide) return null;

                  const createdAt = currentListing?.attributes?.createdAt;
                  const isNewListing =
                    !!createdAt &&
                    Date.now() - new Date(createdAt).getTime() < 7 * 24 * 60 * 60 * 1000;
                  const isPopular = viewCount != null && viewCount >= 5;
                  // "Em Destaque" wins over Popular and Novo. While the
                  // listing is destacado that's the most relevant signal —
                  // when it expires (publicData.featured flips to 'false'
                  // via the daily cron) the badge naturally falls back to
                  // Popular (if still 5+ views today) or Novo (if <7d).
                  const isFeatured =
                    currentListing?.attributes?.publicData?.featured === 'true';
                  if (!isFeatured && !isNewListing && !isPopular) return null;

                  const isEn = locale === 'en';

                  if (isFeatured) {
                    const featuredLabel = isEn ? 'Featured' : 'Em destaque';
                    return (
                      <div
                        className={`${css.viewCountBadge} ${css.viewCountBadgeFeatured}`}
                        aria-label={featuredLabel}
                      >
                        <span>
                          <strong
                            className={`${css.viewCountBadgeAccent} ${css.viewCountBadgeAccentFeatured}`}
                          >
                            {featuredLabel}
                          </strong>
                        </span>
                      </div>
                    );
                  }

                  // Popular takes priority over Novo: if a brand-new listing
                  // crosses 5 views today it shows "Popular" until midnight,
                  // then resets and reverts to "Novo" for the remainder of
                  // its first week.
                  const showAsNovo = isNewListing && !isPopular;

                  const prefix = showAsNovo
                    ? (isEn ? 'New' : 'Novo')
                    : (isEn ? 'Popular' : 'Popular');
                  // Viewer count only shown when in "Popular" mode — "Novo"
                  // stays clean ("Novo" alone) until the listing actually
                  // crosses the 5-view threshold and flips to Popular.
                  const showViewers = !showAsNovo && viewCount != null && viewCount > 0;
                  const verb = isEn
                    ? (viewCount === 1 ? 'person viewed' : 'people viewed')
                    : (viewCount === 1 ? 'pessoa viu' : 'pessoas viram');
                  const todayWord = isEn ? 'today' : 'hoje';
                  const accentClass = showAsNovo
                    ? `${css.viewCountBadgeAccent} ${css.viewCountBadgeAccentNew}`
                    : css.viewCountBadgeAccent;
                  return (
                    <div
                      className={`${css.viewCountBadge} ${showAsNovo ? css.viewCountBadgeNew : ''}`}
                      aria-label={`${prefix}${showViewers ? ` — ${viewCount} ${verb} ${todayWord}` : ''}`}
                    >
                      <span>
                        <strong className={accentClass}>{prefix}</strong>
                        {showViewers && (
                          <>
                            {' · '}
                            {viewCount} {verb} {todayWord}
                          </>
                        )}
                      </span>
                    </div>
                  );
                })()}
              </div>
            )}
            {!showListingImage && (
              <div className={css.noListingImageHeadingProduct}>
                <H3 as="h1" className={css.orderPanelTitle}>
                  <FormattedMessage id="ListingPage.orderTitle" values={{ title: richTitle }} />
                </H3>
              </div>
            )}
            {/* Mobile-only: listing title + price. On desktop both are shown
                inside OrderPanel titleDesktop, which is hidden on mobile. */}
            {showListingImage && (
              <>
                <H3 as="h1" className={css.mobileListingTitle}>
                  <FormattedMessage id="ListingPage.orderTitle" values={{ title: richTitle }} />
                </H3>
                {currentListing.attributes?.price ? (
                  <div className={css.mobileListingPrice}>
                    <span className={css.mobileListingPriceValue}>
                      {formatMoney(intl, currentListing.attributes.price)}
                    </span>
                    {publicData?.unitType ? (
                      <span className={css.mobileListingPriceUnit}>
                        <FormattedMessage
                          id="OrderPanel.perUnit"
                          values={{ unitType: publicData.unitType }}
                        />
                      </span>
                    ) : null}
                  </div>
                ) : null}
              </>
            )}
            {/* Rating + location row — visible on mobile only (desktop shows inside OrderPanel titleDesktop) */}
            <div className={css.mobileRatingRow}>
              <div className={css.listingRatingLeft}>
                <IconReviewStar className={averageRating != null ? css.listingRatingStar : css.listingRatingStarEmpty} isFilled={averageRating != null} />
                <span className={css.listingRatingValue}>
                  {averageRating != null
                    ? `${averageRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? intl.formatMessage({ id: 'ListingCard.review' }) : intl.formatMessage({ id: 'ListingCard.reviews' })})`
                    : intl.formatMessage({ id: 'ListingCard.noReviews' })}
                </span>
              </div>
              {publicData?.location?.address ? (
                <span className={css.listingLocation}>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0, marginTop: '-1px', fill: '#e53935' }}><path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                  {publicData.location.address}
                  {publicData.location.building ? (
                    <span style={{ marginLeft: 6, color: '#7C6350', fontWeight: 600 }}>
                      · {publicData.location.building}
                    </span>
                  ) : null}
                </span>
              ) : null}
            </div>

            {/* Mobile-only: CTAs right under the rating/location row. */}
            {!isOwnListing && currentListing.attributes?.state !== LISTING_STATE_CLOSED ? (
              <div className={css.mobileCtaRow}>
                <button
                  type="button"
                  className={css.mobileCtaButton}
                  onClick={() => onContactUser && onContactUser()}
                >
                  <FormattedMessage id="OrderPanel.contactCta" defaultMessage="Enviar mensagem" />
                </button>
                <button
                  type="button"
                  className={css.mobileCtaButton}
                  onClick={() => {
                    const { pathname, search, state } = location;
                    const searchString = `?${stringify({ ...parse(search), orderOpen: true })}`;
                    history.push(`${pathname}${searchString}`, state);
                  }}
                >
                  <FormattedMessage id="OrderPanel.ctaButtonMessageBooking" />
                </button>
              </div>
            ) : null}

            <CustomListingFields
              publicData={publicData}
              metadata={metadata}
              listingFieldConfigs={listingConfig.listingFields}
              categoryConfiguration={config.categoryConfiguration}
              intl={intl}
              showDetails={false}
            />

            <div className={css.desktopOnlyMapReviews}>
              <SectionMapMaybe
                geolocation={geolocation}
                publicData={publicData}
                listingId={currentListing.id}
                mapsConfig={config.maps}
              />
              <SectionReviews reviews={reviews} fetchReviewsError={fetchReviewsError} isOwnListing={isOwnListing} />
              {!isOwnListing && currentListing?.id && (
                <div className={css.reportLinkWrapper}>
                  <button
                    type="button"
                    className={css.reportLink}
                    onClick={() => setReportModalOpen(true)}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                      <line x1="4" y1="22" x2="4" y2="15" />
                    </svg>
                    <span><FormattedMessage id="ReportListingModal.triggerLabel" /></span>
                  </button>
                </div>
              )}
            </div>
          </div>
          <div className={css.orderColumnForProductLayout}>
            <OrderPanel
              className={classNames(css.productOrderPanel, {
                [css.imagesEnabled]: showListingImage,
              })}
              listing={currentListing}
              isOwnListing={isOwnListing}
              onSubmit={handleOrderSubmit}
              authorLink={
                <NamedLink
                  className={css.authorNameLink}
                  name={isVariant ? 'ListingPageVariant' : 'ListingPage'}
                  params={params}
                  to={{ hash: '#author' }}
                >
                  {authorDisplayName}
                </NamedLink>
              }
              title={<FormattedMessage id="ListingPage.orderTitle" values={{ title: richTitle }} />}
              titleDesktop={
                <div>
                  <div className={css.listingRatingRow}>
                    <div className={css.listingRatingLeft}>
                      <IconReviewStar className={averageRating != null ? css.listingRatingStar : css.listingRatingStarEmpty} isFilled={averageRating != null} />
                      <span className={css.listingRatingValue}>
                        {averageRating != null
                          ? `${averageRating.toFixed(1)} (${reviewCount} ${reviewCount === 1 ? intl.formatMessage({ id: 'ListingCard.review' }) : intl.formatMessage({ id: 'ListingCard.reviews' })})`
                          : intl.formatMessage({ id: 'ListingCard.noReviews' })}
                      </span>
                    </div>
                    {publicData?.location?.address ? (
                      <span className={css.listingLocation}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" style={{ flexShrink: 0, marginTop: '-1px', fill: '#e53935' }}><path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
                        {publicData.location.address}
                        {publicData.location.building ? (
                          <span style={{ marginLeft: 6, color: '#7C6350', fontWeight: 600 }}>
                            · {publicData.location.building}
                          </span>
                        ) : null}
                      </span>
                    ) : null}
                  </div>
                  <h1 className={css.orderPanelTitle}>
                    <FormattedMessage id="ListingPage.orderTitle" values={{ title: richTitle }} />
                  </h1>
                </div>
              }
              payoutDetailsWarning={payoutDetailsWarning}
              author={ensuredAuthor}
              onManageDisableScrolling={onManageDisableScrolling}
              onContactUser={() => { savedScrollRef.current = window.scrollY; onContactUser(); }}
              amenityChips={amenityChips}
              detailItems={detailItems}
              description={showDescription ? description : null}
              afterDescription={
                <div className={css.mobileOnlyMapSlot}>
                  <SectionMapMaybe
                    geolocation={geolocation}
                    publicData={publicData}
                    listingId={currentListing.id}
                    mapsConfig={config.maps}
                  />
                </div>
              }
              editParams={{
                id: listingId.uuid,
                slug: listingSlug,
                type: listingPathParamType,
                tab: listingTab,
              }}
              {...restOfProps}
              validListingTypes={config.listing.listingTypes}
              marketplaceCurrency={config.currency}
              dayCountAvailableForBooking={config.stripe.dayCountAvailableForBooking}
              marketplaceName={config.marketplaceName}
              showListingImage={showListingImage}
            />
            <ShareButtons title={title} />
            <SectionAuthorMaybe
              title={title}
              listing={currentListing}
              authorDisplayName={authorDisplayName}
              onContactUser={() => { savedScrollRef.current = window.scrollY; onContactUser(); }}
              isInquiryModalOpen={isAuthenticated && inquiryModalOpen}
              onCloseInquiryModal={closeInquiryModal}
              sendInquiryError={sendInquiryError}
              sendInquiryInProgress={sendInquiryInProgress}
              onSubmitInquiry={onSubmitInquiry}
              currentUser={currentUser}
              onManageDisableScrolling={onManageDisableScrolling}
            />
          </div>
          <div className={css.mobileOnlyMapReviews}>
            <SectionReviews reviews={reviews} fetchReviewsError={fetchReviewsError} isOwnListing={isOwnListing} />
            {!isOwnListing && currentListing?.id && (
              <div className={css.reportLinkWrapper}>
                <button
                  type="button"
                  className={css.reportLink}
                  onClick={() => setReportModalOpen(true)}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                    <line x1="4" y1="22" x2="4" y2="15" />
                  </svg>
                  <span><FormattedMessage id="ReportListingModal.triggerLabel" /></span>
                </button>
              </div>
            )}
          </div>
        </div>
        <SimilarListingsSection
          currentListingId={currentListing?.id?.uuid}
          categoryLevel1={publicData?.categoryLevel1}
        />
        <ReportListingModal
          isOpen={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          listing={currentListing}
        />
        <DestacarPromptModal listingId={currentListing?.id?.uuid} />
      </LayoutSingleColumn>
    </Page>
  );
};

/**
 * The ListingPage component with carousel layout.
 *
 * @component
 * @param {Object} props
 * @param {Object} props.params - The path params object
 * @param {string} props.params.id - The listing id
 * @param {string} props.params.slug - The listing slug
 * @param {LISTING_PAGE_DRAFT_VARIANT | LISTING_PAGE_PENDING_APPROVAL_VARIANT} props.params.variant - The listing variant
 * @param {Function} props.onManageDisableScrolling - The on manage disable scrolling function
 * @param {boolean} props.isAuthenticated - Whether the user is authenticated
 * @param {Function} props.getListing - The get listing function
 * @param {Function} props.getOwnListing - The get own listing function
 * @param {Object} props.currentUser - The current user
 * @param {boolean} props.scrollingDisabled - Whether scrolling is disabled
 * @param {string} props.inquiryModalOpenForListingId - The inquiry modal open for the specific listing id
 * @param {propTypes.error} props.showListingError - The show listing error
 * @param {Function} props.callSetInitialValues - The call setInitialValues function, which is given to this function as a parameter
 * @param {Array<propTypes.review>} props.reviews - The reviews
 * @param {propTypes.error} props.fetchReviewsError - The fetch reviews error
 * @param {Object<string, Object>} props.monthlyTimeSlots - The monthly time slots. E.g. { '2019-11': { timeSlots: [], fetchTimeSlotsInProgress: false, fetchTimeSlotsError: null } }
 * @param {Object<string, Object>} props.timeSlotsForDate - The time slots for date. E.g. { '2019-11-01': { timeSlots: [], fetchedAt: 1572566400000, fetchTimeSlotsError: null, fetchTimeSlotsInProgress: false } }
 * @param {boolean} props.sendInquiryInProgress - Whether the send inquiry is in progress
 * @param {propTypes.error} props.sendInquiryError - The send inquiry error
 * @param {Function} props.onSendInquiry - The on send inquiry function
 * @param {Function} props.onInitializeCardPaymentData - The on initialize card payment data function
 * @param {Function} props.onFetchTimeSlots - The on fetch time slots function
 * @param {Function} props.onFetchTransactionLineItems - The on fetch transaction line items function
 * @param {Array<propTypes.transactionLineItem>} props.lineItems - The line items
 * @param {boolean} props.fetchLineItemsInProgress - Whether the fetch line items is in progress
 * @param {propTypes.error} props.fetchLineItemsError - The fetch line items error
 * @returns {JSX.Element} listing page component
 */
const EnhancedListingPage = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = useIntl();
  const history = useHistory();
  const location = useLocation();

  const showListingError = props.showListingError;
  const isVariant = props.params?.variant != null;
  const currentUser = props.currentUser;
  if (isForbiddenError(showListingError) && !isVariant && !currentUser) {
    // This can happen if private marketplace mode is active
    return (
      <NamedRedirect
        name="SignupPage"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  }

  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const isUnauthorizedUser = currentUser && !isUserAuthorized(currentUser);
  const hasNoViewingRights = currentUser && !hasPermissionToViewData(currentUser);
  const hasUserPendingApprovalError = isErrorUserPendingApproval(showListingError);

  if ((isPrivateMarketplace && isUnauthorizedUser) || hasUserPendingApprovalError) {
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_USER_PENDING_APPROVAL }}
      />
    );
  } else if (
    (hasNoViewingRights && isForbiddenError(showListingError)) ||
    isErrorNoViewingPermission(showListingError)
  ) {
    // If the user has no viewing rights, fetching anything but their own listings
    // will return a 403 error. If that happens, redirect to NoAccessPage.
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_VIEW_LISTINGS }}
      />
    );
  }

  return (
    <ListingPageComponent
      config={config}
      routeConfiguration={routeConfiguration}
      intl={intl}
      history={history}
      location={location}
      showOwnListingsOnly={hasNoViewingRights}
      {...props}
    />
  );
};

const mapStateToProps = state => {
  const { isAuthenticated } = state.auth;
  const {
    showListingError,
    reviews,
    fetchReviewsError,
    monthlyTimeSlots,
    timeSlotsForDate,
    sendInquiryInProgress,
    sendInquiryError,
    lineItems,
    fetchLineItemsInProgress,
    fetchLineItemsError,
    inquiryModalOpenForListingId,
  } = state.ListingPage;
  const { currentUser } = state.user;

  const getListing = id => {
    const ref = { id, type: 'listing' };
    const listings = getMarketplaceEntities(state, [ref]);
    return listings.length === 1 ? listings[0] : null;
  };

  const getOwnListing = id => {
    const ref = { id, type: 'ownListing' };
    const listings = getMarketplaceEntities(state, [ref]);
    return listings.length === 1 ? listings[0] : null;
  };

  return {
    isAuthenticated,
    currentUser,
    getListing,
    getOwnListing,
    scrollingDisabled: isScrollingDisabled(state),
    inquiryModalOpenForListingId,
    showListingError,
    reviews,
    fetchReviewsError,
    monthlyTimeSlots, // for OrderPanel
    timeSlotsForDate, // for OrderPanel
    lineItems, // for OrderPanel
    fetchLineItemsInProgress, // for OrderPanel
    fetchLineItemsError, // for OrderPanel
    sendInquiryInProgress,
    sendInquiryError,
  };
};

const mapDispatchToProps = dispatch => ({
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
  callSetInitialValues: (setInitialValues, values, saveToSessionStorage) =>
    dispatch(setInitialValues(values, saveToSessionStorage)),
  onFetchTransactionLineItems: params => dispatch(fetchTransactionLineItems(params)), // for OrderPanel
  onSendInquiry: (listing, message) => dispatch(sendInquiry(listing, message)),
  onInitializeCardPaymentData: () => dispatch(initializeCardPaymentData()),
  onFetchTimeSlots: (listingId, start, end, timeZone, options) =>
    dispatch(fetchTimeSlots(listingId, start, end, timeZone, options)), // for OrderPanel
});

// Note: it is important that the withRouter HOC is **outside** the
// connect HOC, otherwise React Router won't rerender any Route
// components since connect implements a shouldComponentUpdate
// lifecycle hook.
//
// See: https://github.com/ReactTraining/react-router/issues/4671
const ListingPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(EnhancedListingPage);

export default ListingPage;
