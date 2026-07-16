import React from 'react';
import { useHistory } from 'react-router-dom';
import { useSelector, useDispatch } from 'react-redux';
import { useEffect } from 'react';
import { selectHighlightedListings } from '../../../ducks/highlightedListings.duck';
import {
  selectListingRating,
  selectListingReviewCount,
  fetchListingRating,
} from '../../../ducks/ratings.duck';
import classNames from 'classnames';

import { useConfiguration } from '../../../context/configurationContext';
import { useRouteConfiguration } from '../../../context/routeConfigurationContext';
import { FormattedMessage, useIntl } from '../../../util/reactIntl';
import {
  displayPrice,
  isPriceVariationsEnabled,
  requireListingImage,
} from '../../../util/configHelpers';
import {
  LISTING_STATE_PENDING_APPROVAL,
  LISTING_STATE_CLOSED,
  LISTING_STATE_DRAFT,
  propTypes,
  STOCK_MULTIPLE_ITEMS,
} from '../../../util/types';
import { formatMoney } from '../../../util/currency';
import { ensureOwnListing } from '../../../util/data';
import {
  LISTING_PAGE_PENDING_APPROVAL_VARIANT,
  LISTING_PAGE_DRAFT_VARIANT,
  LISTING_PAGE_PARAM_TYPE_DRAFT,
  LISTING_PAGE_PARAM_TYPE_EDIT,
  createSlug,
} from '../../../util/urlHelpers';
import { createResourceLocatorString, findRouteByRouteName } from '../../../util/routes';
import { isBookingProcessAlias, isPurchaseProcessAlias } from '../../../transactions/transaction';

import {
  AspectRatioWrapper,
  InlineTextButton,
  NamedLink,
  IconSpinner,
  PrimaryButtonInline,
  ResponsiveImage,
  ListingCardThumbnail,
} from '../../../components';
import IconEdit from '../../../components/IconEdit/IconEdit';
import IconReviewStar from '../../../components/IconReviewStar/IconReviewStar';

import Overlay from './Overlay';
import css from './ManageListingCard.module.css';

// Menu content needs the same padding
const MENU_CONTENT_OFFSET = -12;
const MAX_LENGTH_FOR_WORDS_IN_TITLE = 7;
const MOBILE_MAX_WIDTH = 550;

const priceData = (price, currency, intl) => {
  if (price?.currency === currency) {
    const formattedPrice = formatMoney(intl, price);
    return { formattedPrice, priceTitle: formattedPrice };
  } else if (price) {
    return {
      formattedPrice: intl.formatMessage(
        { id: 'ManageListingCard.unsupportedPrice' },
        { currency: price.currency }
      ),
      priceTitle: intl.formatMessage(
        { id: 'ManageListingCard.unsupportedPriceTitle' },
        { currency: price.currency }
      ),
    };
  }
  return {};
};

const createListingURL = (routes, listing) => {
  const id = listing.id.uuid;
  const slug = createSlug(listing.attributes.title);
  const isPendingApproval = listing.attributes.state === LISTING_STATE_PENDING_APPROVAL;
  const isDraft = listing.attributes.state === LISTING_STATE_DRAFT;
  const variant = isDraft
    ? LISTING_PAGE_DRAFT_VARIANT
    : isPendingApproval
    ? LISTING_PAGE_PENDING_APPROVAL_VARIANT
    : null;

  const linkProps =
    isPendingApproval || isDraft
      ? {
          name: 'ListingPageVariant',
          params: {
            id,
            slug,
            variant,
          },
        }
      : {
          name: 'ListingPage',
          params: { id, slug },
        };

  return createResourceLocatorString(linkProps.name, routes, linkProps.params, {});
};

// Cards are not fixed sizes - So, long words in title make flexboxed items to grow too big.
// 1. We split title to an array of words and spaces.
//    "foo bar".split(/([^\s]+)/gi) => ["", "foo", " ", "bar", ""]
// 2. Then we break long words by adding a '<span>' with word-break: 'break-all';
const formatTitle = (title, maxLength) => {
  const nonWhiteSpaceSequence = /([^\s]+)/gi;
  return title.split(nonWhiteSpaceSequence).map((word, index) => {
    return word.length > maxLength ? (
      <span key={index} style={{ wordBreak: 'break-all' }}>
        {word}
      </span>
    ) : (
      word
    );
  });
};

const ShowFinishDraftOverlayMaybe = props => {
  const {
    isDraft,
    title,
    id,
    slug,
    hasImage,
    intl,
    actionsInProgressListingId,
    currentListingId,
    onDiscardDraft,
  } = props;

  return isDraft ? (
    <React.Fragment>
      <div className={classNames({ [css.draftNoImage]: !hasImage })} />
      <Overlay
        message={intl.formatMessage(
          { id: 'ManageListingCard.draftOverlayText' },
          { listingTitle: title }
        )}
      >
        <NamedLink
          className={css.finishListingDraftLink}
          name="EditListingPage"
          params={{ id, slug, type: LISTING_PAGE_PARAM_TYPE_DRAFT, tab: 'photos' }}
          ariaLabel={`${intl.formatMessage({
            id: 'ManageListingCard.finishListingDraft',
          })}: ${title}`}
        >
          <FormattedMessage id="ManageListingCard.finishListingDraft" />
        </NamedLink>
        <div className={css.alternativeActionText}>
          {intl.formatMessage(
            { id: 'ManageListingCard.discardDraftText' },
            {
              discardDraftLink: (
                <InlineTextButton
                  key="discardDraftLink"
                  id={`discardButton_${currentListingId.uuid}`}
                  rootClassName={css.alternativeActionLink}
                  disabled={!!actionsInProgressListingId}
                  onClick={() => {
                    if (!actionsInProgressListingId) {
                      onDiscardDraft(currentListingId);
                    }
                  }}
                >
                  <FormattedMessage id="ManageListingCard.discardDraftLinkText" />
                </InlineTextButton>
              ),
            }
          )}
        </div>
      </Overlay>
    </React.Fragment>
  ) : null;
};

const ShowClosedOverlayMaybe = props => {
  const {
    isClosed,
    title,
    actionsInProgressListingId,
    currentListingId,
    onOpenListing,
    intl,
  } = props;

  return isClosed ? (
    <Overlay
      message={intl.formatMessage(
        { id: 'ManageListingCard.closedListing' },
        { listingTitle: title }
      )}
    >
      <PrimaryButtonInline
        className={css.openListingButton}
        disabled={!!actionsInProgressListingId}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();
          if (!actionsInProgressListingId) {
            onOpenListing(currentListingId);
          }
        }}
      >
        <FormattedMessage id="ManageListingCard.openListing" />
      </PrimaryButtonInline>
    </Overlay>
  ) : null;
};

const ShowPendingApprovalOverlayMaybe = props => {
  const { isPendingApproval, title, intl } = props;

  return isPendingApproval ? (
    <Overlay
      message={intl.formatMessage(
        { id: 'ManageListingCard.pendingApproval' },
        { listingTitle: title }
      )}
    />
  ) : null;
};

const ShowOutOfStockOverlayMaybe = props => {
  const {
    showOutOfStockOverlay,
    title,
    id,
    slug,
    actionsInProgressListingId,
    currentListingId,
    hasStockManagementInUse,
    onCloseListing,
    intl,
  } = props;

  return showOutOfStockOverlay ? (
    <Overlay
      message={intl.formatMessage(
        { id: 'ManageListingCard.outOfStockOverlayText' },
        { listingTitle: title }
      )}
    >
      {hasStockManagementInUse ? (
        <>
          <NamedLink
            className={css.finishListingDraftLink}
            name="EditListingPage"
            params={{ id, slug, type: LISTING_PAGE_PARAM_TYPE_EDIT, tab: 'pricing-and-stock' }}
          >
            <FormattedMessage id="ManageListingCard.setPriceAndStock" />
          </NamedLink>

          <div className={css.alternativeActionText}>
            {intl.formatMessage(
              { id: 'ManageListingCard.closeListingTextOr' },
              {
                closeListingLink: (
                  <InlineTextButton
                    key="closeListingLink"
                    className={css.alternativeActionLink}
                    disabled={!!actionsInProgressListingId}
                    onClick={() => {
                      if (!actionsInProgressListingId) {
                        onCloseListing(currentListingId);
                      }
                    }}
                  >
                    <FormattedMessage id="ManageListingCard.closeListingText" />
                  </InlineTextButton>
                ),
              }
            )}
          </div>
        </>
      ) : (
        <div className={css.alternativeActionText}>
          <InlineTextButton
            key="closeListingLink"
            className={css.alternativeActionText}
            disabled={!!actionsInProgressListingId}
            onClick={() => {
              if (!actionsInProgressListingId) {
                onCloseListing(currentListingId);
              }
            }}
          >
            <FormattedMessage id="ManageListingCard.closeListingText" />
          </InlineTextButton>
        </div>
      )}
    </Overlay>
  ) : null;
};

const LinkToStockOrAvailabilityTab = props => {
  const {
    id,
    slug,
    title,
    editListingLinkType,
    isBookable,
    hasListingType,
    hasStockManagementInUse,
    currentStock,
    intl,
  } = props;

  if (!hasListingType || !(isBookable || hasStockManagementInUse)) {
    return null;
  }

  return (
    <>
      <span className={css.manageLinksSeparator}>{' • '}</span>

      {isBookable ? (
        <NamedLink
          className={css.manageLink}
          name="EditListingPage"
          params={{ id, slug, type: editListingLinkType, tab: 'availability' }}
          ariaLabel={`${intl.formatMessage({
            id: 'ManageListingCard.manageAvailability',
          })}: ${title}`}
        >
          <FormattedMessage id="ManageListingCard.manageAvailability" />
        </NamedLink>
      ) : (
        <NamedLink
          className={css.manageLink}
          name="EditListingPage"
          params={{ id, slug, type: editListingLinkType, tab: 'pricing-and-stock' }}
        >
          {currentStock == null
            ? intl.formatMessage({ id: 'ManageListingCard.setPriceAndStock' })
            : intl.formatMessage({ id: 'ManageListingCard.manageStock' }, { currentStock })}
        </NamedLink>
      )}
    </>
  );
};

const PriceMaybe = props => {
  const { price, publicData, config, intl, foundListingTypeConfig } = props;

  const showPrice = displayPrice(foundListingTypeConfig);
  if (showPrice && !price) {
    return (
      <div className={css.noPrice}>
        <FormattedMessage id="ManageListingCard.priceNotSet" />
      </div>
    );
  } else if (!showPrice) {
    return null;
  }

  const isPriceVariationsInUse = isPriceVariationsEnabled(publicData, foundListingTypeConfig);
  const hasMultiplePriceVariants = isPriceVariationsInUse && publicData?.priceVariants?.length > 1;

  const isBookable = isBookingProcessAlias(publicData?.transactionProcessAlias);
  const { formattedPrice, priceTitle } = priceData(price, config.currency, intl);

  const priceValue = <span className={css.priceValue}>{formattedPrice}</span>;
  const pricePerUnit = isBookable ? (
    <span className={css.perUnit}>
      <FormattedMessage
        id="ManageListingCard.perUnit"
        values={{ unitType: publicData?.unitType }}
      />
    </span>
  ) : (
    ''
  );

  return (
    <div className={css.price}>
      {hasMultiplePriceVariants ? (
        <FormattedMessage
          id="ManageListingCard.priceStartingFrom"
          values={{ priceValue, pricePerUnit }}
        />
      ) : (
        <FormattedMessage id="ManageListingCard.price" values={{ priceValue, pricePerUnit }} />
      )}
    </div>
  );
};

/**
 * Manage listing card
 *
 * @param {Object} props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that overrides the default class for the root element
 * @param {boolean} props.hasClosingError - Whether the closing error is present
 * @param {boolean} props.hasDiscardingError - Whether the discarding error is present
 * @param {boolean} props.hasOpeningError - Whether the opening error is present
 * @param {boolean} props.isMenuOpen - Whether the menu is open
 * @param {Object} [props.actionsInProgressListingId] - The actions in progress for the specific listing
 * @param {propTypes.uuid} [props.actionsInProgressListingId.uuid] - The uuid of the listing
 * @param {propTypes.ownListing} props.listing - The listing
 * @param {function} props.onCloseListing - The function to close the listing
 * @param {function} props.onOpenListing - The function to open the listing
 * @param {function} props.onDiscardDraft - The function to discard the draft
 * @param {function} props.onToggleMenu - The function to toggle the menu
 * @param {string} [props.renderSizes] - The render sizes
 * @returns {JSX.Element} Manage listing card component
 */
export const ManageListingCard = props => {
  const config = useConfiguration();
  const routeConfiguration = useRouteConfiguration();
  const intl = props.intl || useIntl();
  const history = useHistory();
  const dispatch = useDispatch();
  const highlightedListings = useSelector(selectHighlightedListings);
  const {
    className,
    rootClassName,
    hasClosingError,
    hasDiscardingError,
    hasOpeningError,
    isMenuOpen,
    actionsInProgressListingId,
    listing,
    onCloseListing,
    onOpenListing,
    onDiscardDraft,
    onToggleMenu,
    renderSizes,
  } = props;
  const classes = classNames(rootClassName || css.root, className);
  const currentListing = ensureOwnListing(listing);
  const id = currentListing.id.uuid;

  const averageRating = useSelector(s => selectListingRating(s, id));
  const reviewCount = useSelector(s => selectListingReviewCount(s, id));
  useEffect(() => {
    if (id && averageRating === undefined) dispatch(fetchListingRating(id));
  }, [id]);
  const { title = '', price, state, publicData } = currentListing.attributes;
  const slug = createSlug(title);
  const isPendingApproval = state === LISTING_STATE_PENDING_APPROVAL;
  const isClosed = state === LISTING_STATE_CLOSED;
  const isDraft = state === LISTING_STATE_DRAFT;

  const { listingType, transactionProcessAlias, cardStyle } = publicData || {};
  const isBookable = isBookingProcessAlias(transactionProcessAlias);
  const isProductOrder = isPurchaseProcessAlias(transactionProcessAlias);
  const hasListingType = !!listingType;
  const validListingTypes = config.listing.listingTypes;

  // City extraction — same logic as the public ListingCard so own/manage cards
  // stay visually consistent. Drafts may not have a location yet → show a
  // placeholder ("Sem cidade") instead of an empty row.
  const rawAddress = publicData?.location?.address || publicData?.city || null;
  const extractCity = addr => {
    if (!addr) return null;
    const parts = addr.split(',').map(p => p.trim()).filter(Boolean);
    if (parts.length === 0) return null;
    const candidate = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
    return candidate.replace(/^\d{4}-\d{3}\s+/, '').replace(/^\d+\s+/, '').trim();
  };
  const cityLabel = extractCity(rawAddress);

  const foundListingTypeConfig = validListingTypes.find(conf => conf.listingType === listingType);
  const showListingImage = requireListingImage(foundListingTypeConfig);

  const currentStock = currentListing.currentStock?.attributes?.quantity;
  const isOutOfStock = currentStock === 0;
  const showOutOfStockOverlay =
    !isBookable && isOutOfStock && !isPendingApproval && !isClosed && !isDraft;
  const hasStockManagementInUse =
    isProductOrder && foundListingTypeConfig?.stockType === STOCK_MULTIPLE_ITEMS;

  const firstImage =
    currentListing.images && currentListing.images.length > 0 ? currentListing.images[0] : null;

  const hasError = hasOpeningError || hasClosingError || hasDiscardingError;
  const thisListingInProgress =
    actionsInProgressListingId && actionsInProgressListingId.uuid === id;

  const onOverListingLink = () => {
    // Enforce preloading of ListingPage (loadable component)
    const { component: Page } = findRouteByRouteName('ListingPage', routeConfiguration);
    // Loadable Component has a "preload" function.
    if (Page.preload) {
      Page.preload();
    }
  };

  const titleClasses = classNames(css.title, {
    [css.titlePending]: isPendingApproval,
    [css.titleDraft]: isDraft,
  });

  const editListingLinkType = isDraft
    ? LISTING_PAGE_PARAM_TYPE_DRAFT
    : LISTING_PAGE_PARAM_TYPE_EDIT;

  const {
    aspectWidth = 1,
    aspectHeight = 1,
    variantPrefix = 'listing-card',
  } = config.layout.listingImage;
  const variants = firstImage
    ? Object.keys(firstImage?.attributes?.variants).filter(k => k.startsWith(variantPrefix))
    : [];

  const [isHovered, setIsHovered] = React.useState(false);
  const [isDeleteConfirming, setIsDeleteConfirming] = React.useState(false);

  return (
    <div
      className={classNames(classes, { [css.cardHovered]: isHovered })}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div
        className={css.clickWrapper}
        tabIndex={0}
        onClick={event => {
          event.preventDefault();
          event.stopPropagation();

          // ManageListingCard contains links, buttons and elements that are working with routing.
          // This card doesn't work if <a> or <button> is used to wrap events that are card 'clicks'.
          //
          // NOTE: It might be better to absolute-position those buttons over a card-links.
          // (So, that they have no parent-child relationship - like '<a>bla<a>blaa</a></a>')
          history.push(createListingURL(routeConfiguration, listing));
        }}
        onMouseOver={onOverListingLink}
        onTouchStart={onOverListingLink}
      >
        {/* imageContainer clips all corners including gradient/menu */}
        <div className={classNames(css.imageContainer, {
          [css.imageContainerDraft]: isDraft || isPendingApproval,
        })}>
          {showListingImage ? (
            <AspectRatioWrapper
              className={isDraft || isPendingApproval ? css.aspectRatioWrapperDraft : css.aspectRatioWrapper}
              width={aspectWidth}
              height={aspectHeight}
            >
              <ResponsiveImage
                rootClassName={css.rootForImage}
                alt={title}
                image={firstImage}
                variants={variants}
                sizes={renderSizes}
              />
            </AspectRatioWrapper>
          ) : (
            <ListingCardThumbnail
              style={cardStyle}
              width={aspectWidth}
              height={aspectHeight}
              className={isDraft || isPendingApproval ? css.aspectRatioWrapperDraft : css.aspectRatioWrapper}
            />
          )}

          <div className={classNames(css.menuOverlayWrapper)}>
            <div className={classNames(css.menuOverlay, { [css.menuOverlayOpen]: isMenuOpen })} />
          </div>
          <div className={css.menubarWrapper}>
            <div className={css.menubar}>
              <button
                className={css.iconWrapperEdit}
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  history.push(
                    createResourceLocatorString(
                      'EditListingPage',
                      routeConfiguration,
                      { id, slug, type: editListingLinkType, tab: 'details' },
                      {}
                    )
                  );
                }}
                aria-label={intl.formatMessage({ id: 'ManageListingCard.editListing' })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                  <path d="M12 20h9"/>
                  <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
                </svg>
              </button>
              <button
                className={css.iconWrapperClose}
                onClick={event => {
                  event.preventDefault();
                  event.stopPropagation();
                  if (!actionsInProgressListingId) {
                    if (isDraft) {
                      onDiscardDraft(currentListing.id);
                    } else {
                      onCloseListing(currentListing.id);
                    }
                  }
                }}
                aria-label={intl.formatMessage({
                  id: isDraft ? 'ManageListingCard.discardDraftLinkText' : 'ManageListingCard.closeListing',
                })}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" xmlns="http://www.w3.org/2000/svg">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              {!isDraft ? (
                <button
                  type="button"
                  className={css.iconWrapperDelete}
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    if (actionsInProgressListingId) return;
                    setIsDeleteConfirming(true);
                  }}
                  aria-label={intl.formatMessage({ id: 'ManageListingCard.deleteListing' })}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 7h16" />
                    <path d="M10 4h4a1 1 0 0 1 1 1v2H9V5a1 1 0 0 1 1-1z" />
                    <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
                    <path d="M10 11v6" />
                    <path d="M14 11v6" />
                  </svg>
                </button>
              ) : null}
            </div>
          </div>

          <ShowFinishDraftOverlayMaybe
            isDraft={isDraft}
            title={title}
            id={id}
            slug={slug}
            hasImage={!!firstImage}
            intl={intl}
            actionsInProgressListingId={actionsInProgressListingId}
            currentListingId={currentListing.id}
            onDiscardDraft={onDiscardDraft}
          />

          <ShowClosedOverlayMaybe
            isClosed={isClosed}
            title={title}
            actionsInProgressListingId={actionsInProgressListingId}
            currentListingId={currentListing.id}
            onOpenListing={onOpenListing}
            intl={intl}
          />

          {isDeleteConfirming ? (
            <Overlay
              message={intl.formatMessage({ id: 'ManageListingCard.deleteListingConfirmMessage' })}
            >
              <div className={css.deleteConfirmActions}>
                <PrimaryButtonInline
                  className={css.deleteConfirmButton}
                  disabled={!!actionsInProgressListingId}
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsDeleteConfirming(false);
                    props.onDeleteListing && props.onDeleteListing(currentListing.id);
                  }}
                >
                  <FormattedMessage id="ManageListingCard.deleteListingConfirmButton" />
                </PrimaryButtonInline>
                <InlineTextButton
                  rootClassName={css.deleteCancelLink}
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    setIsDeleteConfirming(false);
                  }}
                >
                  <FormattedMessage id="ManageListingCard.deleteListingCancelButton" />
                </InlineTextButton>
              </div>
            </Overlay>
          ) : null}

          <ShowPendingApprovalOverlayMaybe
            isPendingApproval={isPendingApproval}
            title={title}
            intl={intl}
          />

          <ShowOutOfStockOverlayMaybe
            showOutOfStockOverlay={showOutOfStockOverlay}
            title={title}
            id={id}
            slug={slug}
            actionsInProgressListingId={actionsInProgressListingId}
            currentListingId={currentListing.id}
            onCloseListing={onCloseListing}
            hasStockManagementInUse={hasStockManagementInUse}
            intl={intl}
          />

          {thisListingInProgress ? (
            <Overlay>
              <IconSpinner />
            </Overlay>
          ) : hasError ? (
            <Overlay errorMessage={intl.formatMessage({ id: 'ManageListingCard.actionFailed' })} />
          ) : null}
        </div>
      </div>

      <div className={css.info}>
        <div className={css.mainInfo}>
          <div className={css.titleWrapper}>
            <span
              className={titleClasses}
              role={!isDraft ? 'button' : undefined}
              tabIndex={!isDraft ? 0 : undefined}
              onClick={event => {
                event.preventDefault();
                event.stopPropagation();
                if (!isDraft) {
                  history.push(createListingURL(routeConfiguration, listing));
                }
              }}
              onKeyDown={event => {
                if (!isDraft && (event.key === 'Enter' || event.key === ' ')) {
                  history.push(createListingURL(routeConfiguration, listing));
                }
              }}
            >
              {formatTitle(title, MAX_LENGTH_FOR_WORDS_IN_TITLE)}
            </span>
          </div>

          <PriceMaybe
            price={price}
            publicData={publicData}
            config={config}
            intl={intl}
            foundListingTypeConfig={foundListingTypeConfig}
          />

          <div className={css.locationRow}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="12"
              height="12"
              className={css.locationIcon}
            >
              <path
                fill={cityLabel ? '#e53935' : '#bbb'}
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
              />
            </svg>
            <span className={cityLabel ? css.locationCity : css.locationCityMissing}>
              {cityLabel || intl.formatMessage({ id: 'ManageListingCard.noCity' })}
            </span>
          </div>

          <div className={css.ratingRow}>
            <IconReviewStar
              className={averageRating != null ? css.ratingStar : css.ratingStarEmpty}
              isFilled={averageRating != null}
            />
            <span className={css.ratingValue}>
              {averageRating != null
                ? `${averageRating.toFixed(1)} (${reviewCount} ${
                    reviewCount === 1
                      ? intl.formatMessage({ id: 'ListingCard.review' })
                      : intl.formatMessage({ id: 'ListingCard.reviews' })
                  })`
                : intl.formatMessage({ id: 'ListingCard.noReviews' })}
            </span>
          </div>
        </div>

        {highlightedListings.some(h => h.id === id) ? (
          <span className={css.editarDestaqueButton}>
            <IconEdit className={css.editarDestaqueIcon} />
            <FormattedMessage id="ManageListingCard.editarDestaque" />
          </span>
        ) : (
          <button
            className={css.destacarButton}
            onClick={e => {
              e.preventDefault();
              e.stopPropagation();
              history.push(`/destacar-anuncio?listingId=${id}`);
            }}
          >
            <FormattedMessage id="ManageListingCard.destacarAnuncio" />
          </button>
        )}
      </div>
    </div>
  );
};

export default ManageListingCard;
