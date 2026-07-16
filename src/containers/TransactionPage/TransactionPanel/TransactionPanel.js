import React, { Component, useState, useEffect } from 'react';
import classNames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';

import { FormattedMessage, injectIntl, intlShape, useIntl } from '../../../util/reactIntl';
import { propTypes } from '../../../util/types';
import { userDisplayNameAsString } from '../../../util/data';
import { isMobileSafari } from '../../../util/userAgent';
import { createSlug } from '../../../util/urlHelpers';
import { displayPrice } from '../../../util/configHelpers';
import { selectIsFollowing, toggleFollowAndSync } from '../../../ducks/follow.duck';
import { selectListingRating, selectListingReviewCount } from '../../../ducks/ratings.duck';

import { AvatarLarge, AvatarMedium, IconReviewStar, NamedLink, UserDisplayName } from '../../../components';

import { stateDataShape } from '../TransactionPage.stateData';
import SendMessageForm from '../SendMessageForm/SendMessageForm';

// These are internal components that make this file more readable.
import BreakdownMaybe from './BreakdownMaybe';
import DetailCardHeadingsMaybe from './DetailCardHeadingsMaybe';
import DetailCardImage from './DetailCardImage';
import DeliveryInfoMaybe from './DeliveryInfoMaybe';
import BookingLocationMaybe from './BookingLocationMaybe';
import AddToCalendarButton from '../../../components/AddToCalendarButton/AddToCalendarButton';
import FeedSection from './FeedSection';
import DiminishedActionButtonMaybe from './DiminishedActionButtonMaybe';
import PanelHeading from './PanelHeading';

import css from './TransactionPanel.module.css';

const formatLastOnline = (isoString, intl) => {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 120) return intl.formatMessage({ id: 'UserCard.onlineJustNow' });
  if (diff < 3600) return intl.formatMessage({ id: 'UserCard.onlineMinutes' }, { minutes: Math.floor(diff / 60) });
  if (diff < 86400) return intl.formatMessage({ id: 'UserCard.onlineHours' }, { hours: Math.floor(diff / 3600) });
  if (diff < 604800) return intl.formatMessage({ id: 'UserCard.onlineDays' }, { days: Math.floor(diff / 86400) });
  return null;
};

// Summary block shown below the listing title: stars, address+building, capacity.
// Rendered on both mobile (under the listing title) and desktop (under the
// listing card title in the side card). The wrapping CSS class controls
// visibility per breakpoint.
const MobileListingSummary = ({ listing, intl, className, showTitle, showPriceRow }) => {
  const listingId = listing?.id?.uuid;
  const averageRating = useSelector(state =>
    listingId ? selectListingRating(state, listingId) : undefined
  );
  const reviewCount = useSelector(state =>
    listingId ? selectListingReviewCount(state, listingId) : undefined
  );

  const publicData = listing?.attributes?.publicData || {};
  const address = publicData?.location?.address;
  const building = publicData?.location?.building;
  const rawTitle =
    listing?.attributes?.title ||
    publicData?.title ||
    publicData?.listingTitle ||
    '';
  const listingTitle = String(rawTitle).trim();
  const price = listing?.attributes?.price;
  const formattedPrice =
    price && price.amount != null && price.currency
      ? intl.formatNumber(price.amount / 100, {
          style: 'currency',
          currency: price.currency,
        })
      : null;

  // Find the first numeric custom field (typically "número de pessoas")
  const numericEntry = Object.entries(publicData).find(
    ([key, value]) =>
      typeof value === 'number' &&
      key !== 'price' &&
      !['categoryLevel1', 'categoryLevel2', 'unitType'].includes(key)
  );
  const capacity = numericEntry ? numericEntry[1] : null;

  return (
    <div className={className || css.mobileListingSummary}>
      {showTitle ? (
        <div className={css.summaryTitle}>
          {listing?.id?.uuid ? (
            <NamedLink
              name="ListingPage"
              params={{ id: listing.id.uuid, slug: createSlug(listingTitle || 'anuncio') }}
              className={css.summaryTitleLink}
            >
              {listingTitle || (
                <FormattedMessage id="TransactionPanel.untitledListing" defaultMessage="Anúncio" />
              )}
            </NamedLink>
          ) : (
            listingTitle || (
              <FormattedMessage id="TransactionPanel.untitledListing" defaultMessage="Anúncio" />
            )
          )}
        </div>
      ) : null}
      {/* Rating row — always show (with "Sem avaliações" fallback) */}
      <div className={css.summaryRating}>
        <IconReviewStar
          className={averageRating != null ? css.summaryStar : css.summaryStarEmpty}
          isFilled={averageRating != null}
        />
        <span>
          {averageRating != null
            ? `${averageRating.toFixed(1)} (${reviewCount} ${
                reviewCount === 1
                  ? intl.formatMessage({ id: 'ListingCard.review' })
                  : intl.formatMessage({ id: 'ListingCard.reviews' })
              })`
            : intl.formatMessage({ id: 'ListingCard.noReviews' })}
        </span>
      </div>

      {address ? (
        <div className={css.summarySection}>
          <h4 className={css.summarySectionTitle}>
            <FormattedMessage id="ListingPage.locationTitle" defaultMessage="Localização" />
          </h4>
          <div className={css.summaryLocation}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              width="14"
              height="14"
              style={{ flexShrink: 0, marginTop: '1px' }}
            >
              <path
                fill="#e53935"
                d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
              />
            </svg>
            <span>
              {address}
              {building ? (
                <span style={{ marginLeft: 6, color: '#7C6350', fontWeight: 600 }}>
                  · {building}
                </span>
              ) : null}
            </span>
          </div>
        </div>
      ) : null}

      {capacity != null ? (
        <div className={css.summaryCapacity}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"
              fill="#7C6350"
            />
          </svg>
          <span>{capacity}</span>
        </div>
      ) : null}

      {showPriceRow && formattedPrice ? (
        <div className={css.summaryPrice}>{formattedPrice}</div>
      ) : null}

    </div>
  );
};

const CustomerInfoCard = ({ customer, currentUser }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const intl = useIntl();
  const dispatch = useDispatch();

  const customerId = customer?.id?.uuid;
  const customerPublicData = customer?.attributes?.profile?.publicData;
  const lastOnlineText = mounted ? formatLastOnline(customerPublicData?.lastOnline, intl) : null;
  const customerLocation =
    customerPublicData?.location?.address ||
    customerPublicData?.location ||
    customerPublicData?.Location?.address ||
    customerPublicData?.Location ||
    null;

  const isFollowing = useSelector(state => selectIsFollowing(state, customerId));
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const currentUserId = currentUser?.id?.uuid;
  const isCurrentUserCustomer = currentUserId && customerId && currentUserId === customerId;

  const handleFollow = () => {
    if (customerId) dispatch(toggleFollowAndSync(customerId));
  };

  const followButton =
    mounted && !isCurrentUserCustomer && isAuthenticated && customerId ? (
      <button
        type="button"
        className={isFollowing ? css.followingButton : css.followButton}
        onClick={handleFollow}
      >
        {isFollowing
          ? <FormattedMessage id="UserCard.following" />
          : <FormattedMessage id="UserCard.follow" />}
      </button>
    ) : null;

  return (
    <div className={css.avatarWrapperProviderDesktop}>
      <div className={css.avatarColumn}>
        <AvatarLarge user={customer} className={css.avatarDesktop} />
        {lastOnlineText ? (
          <span className={css.providerLastOnline}>{lastOnlineText}</span>
        ) : null}
      </div>
      <div className={css.providerInfo}>
        <p className={css.providerName}>
          {customer?.attributes?.profile?.displayName || customer?.attributes?.profile?.firstName}
        </p>
        {customerLocation ? (
          <div className={css.providerLocation}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0, marginTop: 2 }}>
              <path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            {customerLocation}
          </div>
        ) : null}
        {followButton}
      </div>
    </div>
  );
};

const ProviderInfoCard = ({ provider, currentUser }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const intl = useIntl();
  const dispatch = useDispatch();

  const providerId = provider?.id?.uuid;
  const providerPublicData = provider?.attributes?.profile?.publicData;
  const lastOnlineText = mounted ? formatLastOnline(providerPublicData?.lastOnline, intl) : null;
  const providerLocation =
    providerPublicData?.location?.address ||
    providerPublicData?.location ||
    providerPublicData?.Location?.address ||
    providerPublicData?.Location ||
    null;

  const isFollowing = useSelector(state => selectIsFollowing(state, providerId));
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const currentUserId = currentUser?.id?.uuid;
  const isCurrentUserProvider = currentUserId && providerId && currentUserId === providerId;

  const handleFollow = () => {
    if (providerId) dispatch(toggleFollowAndSync(providerId));
  };

  const followButton =
    mounted && !isCurrentUserProvider && isAuthenticated && providerId ? (
      <button
        type="button"
        className={isFollowing ? css.followingButton : css.followButton}
        onClick={handleFollow}
      >
        {isFollowing
          ? <FormattedMessage id="UserCard.following" />
          : <FormattedMessage id="UserCard.follow" />}
      </button>
    ) : null;

  return (
    <div className={css.avatarWrapperProviderDesktop}>
      <div className={css.avatarColumn}>
        <AvatarLarge user={provider} className={css.avatarDesktop} />
        {lastOnlineText ? (
          <span className={css.providerLastOnline}>{lastOnlineText}</span>
        ) : null}
      </div>
      <div className={css.providerInfo}>
        <p className={css.providerName}>
          {provider?.attributes?.profile?.displayName || provider?.attributes?.profile?.firstName}
        </p>
        {providerLocation ? (
          <div className={css.providerLocation}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0, marginTop: 2 }}>
              <path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            {providerLocation}
          </div>
        ) : null}
        {followButton}
      </div>
    </div>
  );
};

const ChatCard = ({ otherUser, otherUserId, currentUser, activityFeed, sendMessageForm, fetchMessagesError, translateButton }) => {
  const [mounted, setMounted] = useState(false);
  const feedRef = React.useRef(null);
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight;
    }
  }, [activityFeed]);
  const intl = useIntl();
  const dispatch = useDispatch();

  const isFollowing = useSelector(state => selectIsFollowing(state, otherUserId));
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const isCurrentUser = currentUser?.id?.uuid === otherUserId;

  const publicData = otherUser?.attributes?.profile?.publicData || {};
  const lastOnlineText = mounted ? formatLastOnline(publicData?.lastOnline, intl) : null;
  const locationText =
    publicData?.location?.address ||
    (typeof publicData?.location === 'string' ? publicData.location : null) ||
    publicData?.Location?.address ||
    (typeof publicData?.Location === 'string' ? publicData.Location : null) ||
    null;
  const displayName = otherUser?.attributes?.profile?.displayName || otherUser?.attributes?.profile?.firstName || '—';

  return (
    <div className={css.chatCard}>
      <div className={css.chatCardHeader}>
        {otherUserId ? (
          <NamedLink name="ProfilePage" params={{ id: otherUserId }} className={css.chatCardUser}>
            <AvatarMedium user={otherUser} className={css.chatCardAvatar} disableProfileLink />
            <div className={css.chatCardText}>
              <span className={css.chatCardName}>
                {displayName}
                {locationText && (
                  <span className={css.chatCardLocation}>
                    <svg viewBox="0 0 24 24" width="13" height="13" xmlns="http://www.w3.org/2000/svg">
                      <path fill="#e53e3e" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                    </svg>
                    {locationText}
                  </span>
                )}
              </span>
              {lastOnlineText && <span className={css.chatCardOnline}>{lastOnlineText}</span>}
            </div>
          </NamedLink>
        ) : null}
        {mounted && !isCurrentUser && isAuthenticated && otherUserId ? (
          <button
            type="button"
            className={isFollowing ? css.chatCardFollowingBtn : css.chatCardFollowBtn}
            onClick={() => dispatch(toggleFollowAndSync(otherUserId))}
          >
            {isFollowing ? intl.formatMessage({ id: 'TransactionPanel.following' }) : intl.formatMessage({ id: 'TransactionPanel.follow' })}
          </button>
        ) : null}
      </div>
      <div className={css.chatCardFeed} ref={feedRef}>
        {fetchMessagesError ? (
          <p className={css.chatCardError}><FormattedMessage id="TransactionPanel.messageLoadingFailed" /></p>
        ) : null}
        {activityFeed}
        {translateButton}
      </div>
      <div className={css.chatCardInput}>
        {sendMessageForm}
      </div>
    </div>
  );
};

// Helper function to get display names for different roles
const displayNames = (currentUser, provider, customer, intl) => {
  const authorDisplayName = <UserDisplayName user={provider} intl={intl} />;
  const customerDisplayName = <UserDisplayName user={customer} intl={intl} />;

  let otherUserDisplayName = '';
  let otherUserDisplayNameString = '';
  const currentUserIsCustomer =
    currentUser.id && customer?.id && currentUser.id.uuid === customer?.id?.uuid;
  const currentUserIsProvider =
    currentUser.id && provider?.id && currentUser.id.uuid === provider?.id?.uuid;

  if (currentUserIsCustomer) {
    otherUserDisplayName = authorDisplayName;
    otherUserDisplayNameString = userDisplayNameAsString(provider, '');
  } else if (currentUserIsProvider) {
    otherUserDisplayName = customerDisplayName;
    otherUserDisplayNameString = userDisplayNameAsString(customer, '');
  }

  return {
    authorDisplayName,
    customerDisplayName,
    otherUserDisplayName,
    otherUserDisplayNameString,
  };
};

const allowShowingExtraInfo = (showExtraInfo, transactionPartyInfo) => {
  const {
    isCustomer,
    isCustomerBanned,
    isCustomerDeleted,
    isProvider,
    isProviderBanned,
    isProviderDeleted,
  } = transactionPartyInfo;
  return (
    !!showExtraInfo &&
    ((isProvider && !isCustomerBanned && !isCustomerDeleted) ||
      (isCustomer && !isProviderBanned && !isProviderDeleted))
  );
};

/**
 * Transaction panel
 *
 * @component
 * @param {Object} props - The props
 * @param {string} [props.className] - Custom class that extends the default class for the root element
 * @param {string} [props.rootClassName] - Custom class that extends the default class for the root element
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {string} props.transactionRole - The transaction role
 * @param {propTypes.listing} props.listing - The listing
 * @param {propTypes.user} props.customer - The customer
 * @param {propTypes.user} props.provider - The provider
 * @param {boolean} props.hasTransitions - Whether the transitions are shown
 * @param {propTypes.uuid} props.transactionId - The transaction id
 * @param {Array<propTypes.message>)} props.messages - The messages
 * @param {boolean} props.savePaymentMethodFailed - Whether the save payment method failed
 * @param {propTypes.error} props.fetchMessagesError - The fetch messages error
 * @param {boolean} props.sendMessageInProgress - Whether the send message is in progress
 * @param {propTypes.error} props.sendMessageError - The send message error
 * @param {Function} props.onOpenDisputeModal - The on open dispute modal function
 * @param {Function} props.onSendMessage - The on send message function
 * @param {stateDataShape} props.stateData - The state data
 * @param {boolean} props.showBookingLocation - Whether the booking location is shown
 * @param {React.ReactNode} props.activityFeed - The activity feed
 * @param {Function} props.actionButtons - The action buttons function
 * @param {React.ReactNode} props.orderBreakdown - The order breakdown
 * @param {React.ReactNode} props.orderPanel - The order panel
 * @param {object} props.config - The config
 * @param {intlShape} props.intl - The intl
 * @returns {JSX.Element} The TransactionPanel component
 */
export class TransactionPanelComponent extends Component {
  constructor(props) {
    super(props);
    this.state = {
      sendMessageFormFocused: false,
    };
    this.isMobSaf = false;
    this.sendMessageFormName = 'TransactionPanel.SendMessageForm';

    this.onSendMessageFormFocus = this.onSendMessageFormFocus.bind(this);
    this.onSendMessageFormBlur = this.onSendMessageFormBlur.bind(this);
    this.onMessageSubmit = this.onMessageSubmit.bind(this);
    this.onImageSubmit = this.onImageSubmit.bind(this);
    this.scrollToMessage = this.scrollToMessage.bind(this);
  }

  componentDidMount() {
    this.isMobSaf = isMobileSafari();
  }

  onSendMessageFormFocus() {
    this.setState({ sendMessageFormFocused: true });
    if (this.isMobSaf) {
      // Scroll to bottom
      window.scroll({ top: document.body.scrollHeight, left: 0, behavior: 'smooth' });
    }
  }

  onSendMessageFormBlur() {
    this.setState({ sendMessageFormFocused: false });
  }

  onMessageSubmit(values, form) {
    const message = values.message ? values.message.trim() : null;
    const { transactionId, onSendMessage, config } = this.props;

    if (!message) {
      return;
    }
    onSendMessage(transactionId, message, config)
      .then(messageId => {
        form.reset();
        this.scrollToMessage(messageId);
      })
      .catch(e => {
        // Ignore, Redux handles the error
      });
  }

  onImageSubmit(filesOrFile, caption) {
    const { transactionId, onSendImageMessage, config } = this.props;
    if (!onSendImageMessage || !filesOrFile) return;
    const files = Array.isArray(filesOrFile) ? filesOrFile : [filesOrFile];
    if (files.length === 0) return;
    onSendImageMessage(transactionId, files, caption, config)
      .then(messageId => {
        if (messageId) this.scrollToMessage(messageId);
      })
      .catch(e => {
        // Ignore, Redux handles the error
      });
  }

  scrollToMessage(messageId) {
    const selector = `#msg-${messageId.uuid}`;
    const el = document.querySelector(selector);
    if (el) {
      el.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
    }
  }

  render() {
    const {
      rootClassName,
      className,
      currentUser,
      transactionRole,
      listing,
      customer,
      provider,
      transitions,
      processName,
      protectedData,
      messages,
      savePaymentMethodFailed = false,
      fetchMessagesError,
      sendMessageInProgress,
      sendMessageError,
      onOpenDisputeModal,
      showListingImage,
      intl,
      stateData = {},
      showBookingLocation = false,
      requestQuote,
      offer,
      activityFeed,
      translateButton,
      actionButtons,
      isInquiryProcess,
      orderBreakdown,
      orderPanel,
      config,
      hasViewingRights,
      transactionFieldsComponent,
      booking,
      transactionId,
      transaction,
    } = this.props;

    const hasTransitions = transitions.length > 0;
    const isCustomer = transactionRole === 'customer';
    const isProvider = transactionRole === 'provider';

    const listingDeleted = !!listing?.attributes?.deleted;
    const isCustomerBanned = !!customer?.attributes?.banned;
    const isCustomerDeleted = !!customer?.attributes?.deleted;
    const isProviderBanned = !!provider?.attributes?.banned;
    const isProviderDeleted = !!provider?.attributes?.deleted;

    const transactionPartyInfo = {
      isCustomer,
      isCustomerBanned,
      isCustomerDeleted,
      isProvider,
      isProviderBanned,
      isProviderDeleted,
    };

    const { authorDisplayName, customerDisplayName, otherUserDisplayNameString } = displayNames(
      currentUser,
      provider,
      customer,
      intl
    );

    const deletedListingTitle = intl.formatMessage({
      id: 'TransactionPanel.deletedListingTitle',
    });

    const listingTitle = listingDeleted ? deletedListingTitle : listing?.attributes?.title;
    const firstImage = listing?.images?.length > 0 ? listing?.images[0] : null;

    const listingType = listing?.attributes?.publicData?.listingType;
    const listingTypeConfigs = config.listing.listingTypes;
    const listingTypeConfig = listingTypeConfigs.find(conf => conf.listingType === listingType);
    const showPrice = isInquiryProcess && displayPrice(listingTypeConfig);
    const showBreakDown = stateData.showBreakDown !== false; // NOTE: undefined defaults to true due to historical reasons.

    const showSendMessageForm =
      !isCustomerBanned && !isCustomerDeleted && !isProviderBanned && !isProviderDeleted;

    // Only show order panel for users who have listing viewing rights, otherwise
    // show the detail card heading.
    const showOrderPanel = stateData.showOrderPanel && hasViewingRights;
    const showDetailCardHeadings = stateData.showDetailCardHeadings || !hasViewingRights;

    const deliveryMethod = protectedData?.deliveryMethod || 'none';
    const priceVariantName = protectedData?.priceVariantName;

    const classes = classNames(rootClassName || css.root, className);

    return (
      <div className={classes}>
        <div className={css.container}>
          <div className={css.txInfo}>
            {/* Mobile only — title + extra info ABOVE the image */}
            <div className={css.mobileTopHeader}>
              <PanelHeading
                mobileMode="top"
                processName={stateData.processName}
                processState={stateData.processState}
                showExtraInfo={allowShowingExtraInfo(stateData.showExtraInfo, transactionPartyInfo)}
                showPriceOnMobile={showPrice}
                price={listing?.attributes?.price}
                intl={intl}
                deliveryMethod={deliveryMethod}
                isPendingPayment={!!stateData.isPendingPayment}
                transactionRole={transactionRole}
                providerName={authorDisplayName}
                customerName={customerDisplayName}
                listingId={listing?.id?.uuid}
                listingTitle={listingTitle}
                listingDeleted={listingDeleted}
              />
            </div>
            {/* Mobile only — Informação adicional shown ABOVE the image */}
            {transactionFieldsComponent ? (
              <div className={css.mobileTopTransactionFields}>{transactionFieldsComponent}</div>
            ) : null}
            <DetailCardImage
              rootClassName={css.imageWrapperMobile}
              avatarWrapperClassName={css.avatarWrapperMobile}
              listingTitle={listingTitle}
              image={firstImage}
              provider={provider}
              isCustomer={isCustomer}
              showListingImage={showListingImage}
              listingImageConfig={config.layout.listingImage}
              currentUser={currentUser}
            />
            {/* Mobile only — listing title + special messages BELOW the image */}
            <div className={css.mobileBottomHeader}>
              <PanelHeading
                mobileMode="bottom"
                processName={stateData.processName}
                processState={stateData.processState}
                showExtraInfo={allowShowingExtraInfo(stateData.showExtraInfo, transactionPartyInfo)}
                showPriceOnMobile={showPrice}
                price={listing?.attributes?.price}
                intl={intl}
                deliveryMethod={deliveryMethod}
                isPendingPayment={!!stateData.isPendingPayment}
                transactionRole={transactionRole}
                providerName={authorDisplayName}
                customerName={customerDisplayName}
                listingId={listing?.id?.uuid}
                listingTitle={listingTitle}
                listingDeleted={listingDeleted}
              />
              <MobileListingSummary listing={listing} intl={intl} />
            </div>
            {/* Desktop — full heading (single block, image is hidden on desktop) */}
            <div className={css.desktopHeader}>
              <PanelHeading
                processName={stateData.processName}
                processState={stateData.processState}
                showExtraInfo={allowShowingExtraInfo(stateData.showExtraInfo, transactionPartyInfo)}
                showPriceOnMobile={showPrice}
                price={listing?.attributes?.price}
                intl={intl}
                deliveryMethod={deliveryMethod}
                isPendingPayment={!!stateData.isPendingPayment}
                transactionRole={transactionRole}
                providerName={authorDisplayName}
                customerName={customerDisplayName}
                listingId={listing?.id?.uuid}
                listingTitle={listingTitle}
                listingDeleted={listingDeleted}
              />
            </div>

            {requestQuote}
            {offer}
            {/* Original transactionFields position — desktop only.
                On mobile, this is rendered ABOVE the image (mobileTopTransactionFields). */}
            <div className={css.desktopOnlyTransactionFields}>{transactionFieldsComponent}</div>

            {!isInquiryProcess ? (
              <div className={css.orderDetails}>
                <div className={css.orderDetailsMobileSection}>
                  {showBreakDown ? (
                    <BreakdownMaybe
                      orderBreakdown={orderBreakdown}
                      processName={stateData.processName}
                      priceVariantName={priceVariantName}
                    />
                  ) : null}
                  <DiminishedActionButtonMaybe
                    id="mobile_disputeOrderButton"
                    showDispute={stateData.showDispute}
                    onOpenDisputeModal={onOpenDisputeModal}
                  />
                </div>

                {savePaymentMethodFailed ? (
                  <p className={css.genericError}>
                    <FormattedMessage
                      id="TransactionPanel.savePaymentMethodFailed"
                      values={{
                        paymentMethodsPageLink: (
                          <NamedLink name="PaymentMethodsPage">
                            <FormattedMessage id="TransactionPanel.paymentMethodsPageLink" />
                          </NamedLink>
                        ),
                      }}
                    />
                  </p>
                ) : null}
                <DeliveryInfoMaybe
                  className={css.deliveryInfoSection}
                  protectedData={protectedData}
                  listing={listing}
                  locale={config.localization.locale}
                />
                {/* Old in-form location — hidden because the sidecard
                    listing summary already shows the same address. */}
                <div className={css.hiddenBookingLocation}>
                  <BookingLocationMaybe
                    className={css.deliveryInfoSection}
                    listing={listing}
                    showBookingLocation={showBookingLocation}
                  />
                </div>
              </div>
            ) : null}
            <h3 className={css.chatCardTitle}>
              {isCustomer
                ? intl.formatMessage({ id: 'TransactionPanel.chatTitleCustomer' })
                : intl.formatMessage({ id: 'TransactionPanel.chatTitleProvider' })}
            </h3>
            <ChatCard
              otherUser={isCustomer ? provider : customer}
              otherUserId={isCustomer ? provider?.id?.uuid : customer?.id?.uuid}
              currentUser={currentUser}
              fetchMessagesError={fetchMessagesError}
              activityFeed={activityFeed}
              translateButton={translateButton}
              sendMessageForm={
                showSendMessageForm ? (
                  <SendMessageForm
                    formId={this.sendMessageFormName}
                    messagePlaceholder={intl.formatMessage(
                      { id: 'TransactionPanel.sendMessagePlaceholder' },
                      { name: otherUserDisplayNameString }
                    )}
                    inProgress={sendMessageInProgress}
                    sendMessageError={sendMessageError}
                    onFocus={this.onSendMessageFormFocus}
                    onBlur={this.onSendMessageFormBlur}
                    onSubmit={this.onMessageSubmit}
                    onSendImage={this.props.onSendImageMessage ? this.onImageSubmit : undefined}
                  />
                ) : (
                  <p className={css.sendingMessageNotAllowed}>
                    <FormattedMessage id="TransactionPanel.sendingMessageNotAllowed" />
                  </p>
                )
              }
            />

            {stateData.showActionButtons ? (
              <>
                <div className={css.mobileActionButtonSpacer}></div>
                <div className={css.mobileActionButtons}>{actionButtons('mobile')}</div>
              </>
            ) : null}
          </div>

          <div className={css.asideDesktop}>
            <div
              className={classNames(css.stickySection, { [css.noListingImage]: !showListingImage })}
            >
              <div className={css.detailCard}>
                <DetailCardImage
                  avatarWrapperClassName={css.avatarWrapperDesktop}
                  listingTitle={listingTitle}
                  image={firstImage}
                  provider={provider}
                  isCustomer={isCustomer}
                  showListingImage={showListingImage}
                  listingImageConfig={config.layout.listingImage}
                  currentUser={currentUser}
                />

                {/* Desktop-only listing title rendered directly here so it can't be
                    suppressed by any conditional inside MobileListingSummary. */}
                {listingTitle && listing?.id?.uuid ? (
                  <div className={classNames(css.summaryTitle, css.desktopOnlyTitle)}>
                    <NamedLink
                      name="ListingPage"
                      params={{ id: listing.id.uuid, slug: createSlug(listingTitle) }}
                      className={css.summaryTitleLink}
                    >
                      {listingTitle}
                    </NamedLink>
                  </div>
                ) : null}
                {/* Desktop sidecard — same listing summary as mobile (rating, location, capacity). */}
                <MobileListingSummary
                  listing={listing}
                  intl={intl}
                  className={css.desktopListingSummary}
                  showPriceRow
                />
                {showOrderPanel ? orderPanel : null}
                {showBreakDown ? (
                  <BreakdownMaybe
                    className={css.breakdownContainer}
                    orderBreakdown={orderBreakdown}
                    processName={stateData.processName}
                    priceVariantName={priceVariantName}
                  />
                ) : null}

                {showBookingLocation &&
                booking &&
                ![
                  'delivered',
                  'reviewed',
                  'reviewed-by-customer',
                  'reviewed-by-provider',
                  'canceled',
                ].includes(stateData.processState) ? (
                  <div className={css.addToCalendarRow}>
                    <AddToCalendarButton
                      booking={booking}
                      listing={listing}
                      transaction={transaction}
                      transactionId={transactionId?.uuid || transactionId}
                      transactionRole={transactionRole}
                      customerName={
                        userDisplayNameAsString(customer, '') || null
                      }
                    />
                  </div>
                ) : null}

                {listing?.id ? (
                  <div className={css.viewListingRow}>
                    <NamedLink
                      name="ListingPage"
                      params={{
                        id: listing.id.uuid,
                        slug: createSlug(listing.attributes?.title || ''),
                      }}
                      className={css.viewListingButton}
                    >
                      <FormattedMessage id="TransactionPanel.viewListingButton" defaultMessage="Ver anúncio" />
                    </NamedLink>
                  </div>
                ) : null}

                {stateData.showActionButtons ? (
                  <div className={css.desktopActionButtons}>{actionButtons('desktop')}</div>
                ) : null}
              </div>
              <DiminishedActionButtonMaybe
                id="desktop_disputeOrderButton"
                showDispute={stateData.showDispute}
                onOpenDisputeModal={onOpenDisputeModal}
              />
            </div>
          </div>
        </div>
      </div>
    );
  }
}

const TransactionPanel = injectIntl(TransactionPanelComponent);

export default TransactionPanel;
