import React, { useEffect, useMemo, useState } from 'react';
import { compose } from 'redux';
import { connect, useDispatch, useSelector } from 'react-redux';
import { useHistory, useLocation } from 'react-router-dom';
import classNames from 'classnames';
import { selectHighlightedListings } from '../../ducks/highlightedListings.duck';

import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { REVIEW_TYPE_OF_PROVIDER, REVIEW_TYPE_OF_CUSTOMER, propTypes } from '../../util/types';
import {
  NO_ACCESS_PAGE_USER_PENDING_APPROVAL,
  NO_ACCESS_PAGE_VIEW_LISTINGS,
  PROFILE_PAGE_PENDING_APPROVAL_VARIANT,
} from '../../util/urlHelpers';
import {
  isErrorNoViewingPermission,
  isErrorUserPendingApproval,
  isForbiddenError,
  isNotFoundError,
} from '../../util/errors';
import {
  getDetailCustomFieldValue,
  getFieldValue,
  pickCustomFieldProps,
} from '../../util/fieldHelpers';
import {
  getCurrentUserTypeRoles,
  showCreateListingLinkForUser,
  hasPermissionToViewData,
  isUserAuthorized,
} from '../../util/userHelpers';
import { richText } from '../../util/richText';
import { listingHighlightsEnabled } from '../../config/configFeatures';
import ReportUserModal from '../../components/ReportUserModal/ReportUserModal';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { getMarketplaceEntities } from '../../ducks/marketplaceData.duck';
import {
  fetchUserRating,
  selectUserRating,
  selectUserReviewCount,
} from '../../ducks/ratings.duck';
import {
  selectIsFollowing,
  toggleFollowAndSync,
  selectFollowerCountOverride,
} from '../../ducks/follow.duck';
import {
  Heading,
  H2,
  H4,
  Page,
  AvatarLarge,
  NamedLink,
  ListingCard,
  Reviews,
  ButtonTabNavHorizontal,
  LayoutSideNavigation,
  NamedRedirect,
  CustomExtendedDataSection,
} from '../../components';
import IconEdit from '../../components/IconEdit/IconEdit';
import 'flag-icons/css/flag-icons.min.css';
import { LANGUAGES } from '../../components/LanguagesField/LanguagesField';
import { SOCIAL_PLATFORMS, normaliseSocialUrl } from '../../components/SocialLinksField/SocialLinksField';
import { formatResponseTime } from '../../util/responseTime';
import ProfileListingsSearchBar from './ProfileListingsSearchBar';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';
import NotFoundPage from '../../containers/NotFoundPage/NotFoundPage';

import { triggerEmailVerificationModal } from '../../util/emailVerificationGate';
import css from './ProfilePage.module.css';

const MAX_MOBILE_SCREEN_WIDTH = 768;
const MIN_LENGTH_FOR_LONG_WORDS = 20;

const formatLastOnline = isoString => {
  if (!isoString) return null;
  const diff = Math.floor((Date.now() - new Date(isoString).getTime()) / 1000);
  if (diff < 120) return 'Esteve online agora mesmo';
  if (diff < 3600) return `Esteve online há ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Esteve online há ${Math.floor(diff / 3600)}h`;
  if (diff < 604800) return `Esteve online há ${Math.floor(diff / 86400)}d`;
  return null;
};

/**
 * Whether to offer "Destacar anúncio" on the profile. Only on your own profile,
 * only while the feature is switched on, and only for user types that can post
 * listings at all — a "visitante" has nothing to promote, so the button was
 * pure noise for them.
 */
const useCanHighlightListings = isCurrentUser => {
  const config = useConfiguration();
  const currentUser = useSelector(state => state.user.currentUser);
  return (
    listingHighlightsEnabled &&
    isCurrentUser &&
    showCreateListingLinkForUser(config, currentUser)
  );
};

export const AsideContent = props => {
  const { user, displayName, showLinkToProfileSettingsPage, isCurrentUser } = props;
  const canHighlightListings = useCanHighlightListings(isCurrentUser);
  const currentUser = useSelector(state => state.user.currentUser);
  const history = useHistory();
  const location = useLocation();
  const dispatch = useDispatch();
  const publicData = user?.attributes?.profile?.publicData || {};
  const lastOnlineText = formatLastOnline(publicData.lastOnline);
  const locationText =
    publicData.location?.address ||
    publicData.Location?.address ||
    (typeof publicData.location === 'string' ? publicData.location : null) ||
    (typeof publicData.Location === 'string' ? publicData.Location : null) ||
    null;
  const userId = user?.id?.uuid;
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const isFollowing = useSelector(state => selectIsFollowing(state, userId));
  const followerCountOverride = useSelector(state =>
    selectFollowerCountOverride(state, userId)
  );
  const followersCount =
    followerCountOverride != null
      ? followerCountOverride
      : publicData.followersCount;
  // Average rating + review count across every public review the user has
  // received (as provider or customer). Fetched lazily once per session.
  const userRating = useSelector(state => selectUserRating(state, userId));
  const userReviewCount = useSelector(state => selectUserReviewCount(state, userId));
  // Completed bookings count is read from publicData for every profile.
  // The number is kept in sync by `scripts/backfill-completed-bookings.js`
  // (run periodically via Integration SDK). Fetching live from
  // sdk.transactions on every ProfilePage mount tripped 429 on the Basic plan.
  const completedBookingsCount = Number(publicData.completedBookingsCount) || 0;
  useEffect(() => {
    if (userId) dispatch(fetchUserRating(userId, { includeAll: isCurrentUser }));
  }, [userId, isCurrentUser, dispatch]);

  const handleFollow = () => {
    if (!isAuthenticated) {
      history.push({
        pathname: '/login',
        state: { from: location.pathname + location.search },
      });
      return;
    }
    if (userId) dispatch(toggleFollowAndSync(userId));
  };

  return (
    <div className={css.asideContent}>
      <h1 className={showLinkToProfileSettingsPage ? css.sidebarTitle : css.sidebarTitleOther}>
        <FormattedMessage
          id={
            showLinkToProfileSettingsPage
              ? 'ProfilePage.sidebarTitleOwn'
              : 'ProfilePage.sidebarTitleOther'
          }
        />
      </h1>
      <AvatarLarge className={css.avatar} user={user} disableProfileLink />
      <H2 as="h1" className={css.mobileHeading}>
        {displayName ? (
          <FormattedMessage id="ProfilePage.mobileHeading" values={{ name: displayName }} />
        ) : null}
      </H2>
      <div className={css.metaStack}>
        {userRating != null && userReviewCount > 0 ? (
          <span className={css.userRatingSidebar}>
            <svg className={css.userRatingStar} viewBox="0 0 24 24" aria-hidden>
              <polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9" />
            </svg>
            <strong>{userRating.toFixed(1)}</strong>{' '}
            <span className={css.userRatingCount}>
              ({userReviewCount}{' '}
              {userReviewCount === 1 ? 'avaliação' : 'avaliações'})
            </span>
          </span>
        ) : isCurrentUser ? (
          <span className={css.userRatingSidebar}>
            <svg className={css.userRatingStar} viewBox="0 0 24 24" aria-hidden>
              <polygon points="12,2 15,9 22,9.5 17,14.5 18.5,22 12,18 5.5,22 7,14.5 2,9.5 9,9" />
            </svg>
            <span className={css.userRatingCount}>Sem avaliações ainda</span>
          </span>
        ) : null}
        {typeof followersCount === 'number' && followersCount > 0 ? (
          <span className={css.followersCountSidebar}>
            <strong>{followersCount}</strong>{' '}
            {followersCount === 1 ? 'seguidor' : 'seguidores'}
          </span>
        ) : null}
        {completedBookingsCount > 0 ? (
          <span className={css.completedBookingsSidebar}>
            <strong>{completedBookingsCount}</strong>{' '}
            {completedBookingsCount === 1 ? 'reserva concluída' : 'reservas concluídas'}
          </span>
        ) : null}
        {lastOnlineText ? <span className={css.lastOnlineSidebar}>{lastOnlineText}</span> : null}
      </div>
      {!isCurrentUser && userId ? (
        <button
          type="button"
          className={css.messageButtonSidebar}
          onClick={() => {
            if (!currentUser?.attributes?.emailVerified) {
              triggerEmailVerificationModal(() => history.push(`/conversa/${userId}`));
              return;
            }
            history.push(`/conversa/${userId}`);
          }}
        >
          <FormattedMessage id="ProfilePage.sendMessage" />
        </button>
      ) : null}
      {!isCurrentUser && userId ? (
        <button
          type="button"
          className={isFollowing ? css.followingButtonSidebar : css.followButtonSidebar}
          onClick={handleFollow}
        >
          {isFollowing
            ? <FormattedMessage id="UserCard.following" />
            : <FormattedMessage id="UserCard.follow" />}
        </button>
      ) : null}
      {isCurrentUser ? (
        <NamedLink className={css.editLinkDesktop} name="ProfileSettingsPage">
          <FormattedMessage id="ProfilePage.editProfileLinkDesktop" />
        </NamedLink>
      ) : null}
      {isCurrentUser ? (
        <button
          type="button"
          className={css.historyButtonSidebar}
          onClick={() => history.push('/historico-reservas')}
        >
          <FormattedMessage id="ProfilePage.viewHistory" defaultMessage="Ver histórico" />
        </button>
      ) : null}
      {canHighlightListings ? (
        <button
          type="button"
          className={css.highlightLinkSidebar}
          onClick={() => history.push('/destacar-anuncio')}
        >
          <svg width="14" height="14" viewBox="4 2 16 20" fill="currentColor" stroke="none" style={{ flexShrink: 0, marginRight: -1, verticalAlign: 'middle' }}>
            <polygon points="13,2 4,14 11,14 10,22 20,10 13,10 14,2" />
          </svg>
          <FormattedMessage id="ProfilePage.highlightListing" defaultMessage="Destacar anúncio" />
        </button>
      ) : null}
      {!isCurrentUser && userId ? <AsideReportButton user={user} /> : null}
    </div>
  );
};

const MobileProfileActions = ({ user, isCurrentUser }) => {
  const canHighlightListings = useCanHighlightListings(isCurrentUser);
  const history = useHistory();
  const location = useLocation();
  const dispatch = useDispatch();
  const userId = user?.id?.uuid;
  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const isFollowing = useSelector(state => selectIsFollowing(state, userId));
  const [reportModalOpen, setReportModalOpen] = useState(false);

  if (!userId) return null;

  if (isCurrentUser) {
    return (
      <div className={css.mobileActionsBlock}>
        <NamedLink className={css.editProfileButtonMobile} name="ProfileSettingsPage">
          <FormattedMessage id="ProfilePage.editProfileLinkMobile" />
        </NamedLink>
        <button
          type="button"
          className={css.historyButtonMobile}
          onClick={() => history.push('/historico-reservas')}
        >
          <FormattedMessage id="ProfilePage.viewHistory" defaultMessage="Ver histórico" />
        </button>
        {canHighlightListings ? (
          <button
            type="button"
            className={css.highlightLinkMobile}
            onClick={() => history.push('/destacar-anuncio')}
          >
            <svg width="14" height="14" viewBox="4 2 16 20" fill="currentColor" stroke="none" style={{ flexShrink: 0, marginRight: -1, verticalAlign: 'middle' }}>
              <polygon points="13,2 4,14 11,14 10,22 20,10 13,10 14,2" />
            </svg>
            <FormattedMessage id="ProfilePage.highlightListing" defaultMessage="Destacar anúncio" />
          </button>
        ) : null}
      </div>
    );
  }

  const handleFollow = () => {
    if (!isAuthenticated) {
      history.push({
        pathname: '/login',
        state: { from: location.pathname + location.search },
      });
      return;
    }
    dispatch(toggleFollowAndSync(userId));
  };

  return (
    <div className={css.mobileActionsBlock}>
      <button
        type="button"
        className={isFollowing ? css.followingButtonMobile : css.followButtonMobile}
        onClick={handleFollow}
      >
        {isFollowing
          ? <FormattedMessage id="UserCard.following" />
          : <FormattedMessage id="UserCard.follow" />}
      </button>
      <button
        type="button"
        className={css.reportButtonMobile}
        onClick={() => setReportModalOpen(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 6, verticalAlign: 'middle' }}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        <FormattedMessage id="ReportUserModal.triggerLabel" />
      </button>
      <ReportUserModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        user={user}
      />
    </div>
  );
};

const AsideReportButton = ({ user }) => {
  const [reportModalOpen, setReportModalOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className={css.reportButtonSidebar}
        onClick={() => setReportModalOpen(true)}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginRight: 6, verticalAlign: 'middle' }}>
          <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
          <line x1="4" y1="22" x2="4" y2="15" />
        </svg>
        <FormattedMessage id="ReportUserModal.triggerLabel" />
      </button>
      <ReportUserModal
        isOpen={reportModalOpen}
        onClose={() => setReportModalOpen(false)}
        user={user}
      />
    </>
  );
};

export const ReviewsErrorMaybe = props => {
  const { queryReviewsError } = props;
  return queryReviewsError ? (
    <p className={css.error}>
      <FormattedMessage id="ProfilePage.loadingReviewsFailed" />
    </p>
  ) : null;
};

export const MobileReviews = props => {
  const { reviews, queryReviewsError, isCurrentUser } = props;
  const reviewsOfProvider = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_PROVIDER);
  const reviewsOfCustomer = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_CUSTOMER);
  return (
    <div className={css.mobileReviews}>
      <H4 as="h2" className={css.mobileReviewsTitle}>
        <FormattedMessage
          id="ProfilePage.reviewsFromMyCustomersTitle"
          values={{ count: reviewsOfProvider.length }}
        />
      </H4>
      <ReviewsErrorMaybe queryReviewsError={queryReviewsError} />
      <Reviews reviews={reviewsOfProvider} />
      {isCurrentUser ? (
        <>
          <H4 as="h2" className={css.mobileReviewsTitle}>
            <FormattedMessage
              id="ProfilePage.reviewsAsACustomerTitle"
              values={{ count: reviewsOfCustomer.length }}
            />
          </H4>
          <ReviewsErrorMaybe queryReviewsError={queryReviewsError} />
          <Reviews reviews={reviewsOfCustomer} />
        </>
      ) : null}
    </div>
  );
};

export const DesktopReviews = props => {
  const { reviews, queryReviewsError, userTypeRoles, intl, isCurrentUser } = props;
  const { customer: isCustomerUserType, provider: isProviderUserType } = userTypeRoles;

  const initialReviewState = REVIEW_TYPE_OF_PROVIDER;
  const [showReviewsType, setShowReviewsType] = useState(initialReviewState);

  const reviewsOfProvider = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_PROVIDER);
  const reviewsOfCustomer = reviews.filter(r => r.attributes.type === REVIEW_TYPE_OF_CUSTOMER);
  const isReviewTypeProviderSelected = showReviewsType === REVIEW_TYPE_OF_PROVIDER;
  const isReviewTypeCustomerSelected = showReviewsType === REVIEW_TYPE_OF_CUSTOMER;

  const tabs = [
    {
      text: (
        <Heading as="h3" rootClassName={css.desktopReviewsTitle}>
          <FormattedMessage
            id="ProfilePage.reviewsFromMyCustomersTitle"
            values={{ count: reviewsOfProvider.length }}
          />
        </Heading>
      ),
      selected: isReviewTypeProviderSelected,
      onClick: () => setShowReviewsType(REVIEW_TYPE_OF_PROVIDER),
    },
    ...(isCurrentUser
      ? [
          {
            text: (
              <Heading as="h3" rootClassName={css.desktopReviewsTitle}>
                <FormattedMessage
                  id="ProfilePage.reviewsAsACustomerTitle"
                  values={{ count: reviewsOfCustomer.length }}
                />
              </Heading>
            ),
            selected: isReviewTypeCustomerSelected,
            onClick: () => setShowReviewsType(REVIEW_TYPE_OF_CUSTOMER),
          },
        ]
      : []),
  ];

  return (
    <div className={css.desktopReviews}>
      <div className={css.desktopReviewsWrapper}>
        <ButtonTabNavHorizontal
          className={css.desktopReviewsTabNav}
          tabs={tabs}
          ariaLabel={intl.formatMessage({ id: 'ProfilePage.screenreader.reviewsNav' })}
        />

        <ReviewsErrorMaybe queryReviewsError={queryReviewsError} />

        {isReviewTypeProviderSelected ? (
          <Reviews reviews={reviewsOfProvider} />
        ) : (
          <Reviews reviews={reviewsOfCustomer} />
        )}
      </div>
    </div>
  );
};

export const CustomUserFields = props => {
  const { publicData, metadata, userFieldConfig, intl } = props;

  const shouldPickUserField = fieldConfig =>
    fieldConfig?.scope === 'public' &&
    fieldConfig?.showConfig?.displayInProfile !== false &&
    fieldConfig?.key !== 'location' &&
    fieldConfig?.key !== 'Location';
  const propsForCustomFields =
    (pickCustomFieldProps(
      { publicData, metadata },
      userFieldConfig,
      'userType',
      shouldPickUserField
    ) || []).map(fieldProps => ({ ...fieldProps, heading: null }));

  const pickUserFields = (filteredConfigs, config) => {
    const { key, schemaType, enumOptions, userTypeConfig = {}, showConfig = {} } = config;
    const { limitToUserTypeIds, userTypeIds } = userTypeConfig;
    const userType = publicData.userType;
    const isTargetUserType = !limitToUserTypeIds || userTypeIds.includes(userType);

    const { label, displayInProfile } = showConfig;
    const publicDataValue = getFieldValue(publicData, key);
    const metadataValue = getFieldValue(metadata, key);
    const value = publicDataValue !== null ? publicDataValue : metadataValue;

    if (displayInProfile && isTargetUserType && value !== null && key !== 'location' && key !== 'Location') {
      const detailValue = getDetailCustomFieldValue(
        enumOptions,
        value,
        schemaType,
        key,
        label,
        intl,
        'ProfilePage'
      );

      return detailValue ? filteredConfigs.concat(detailValue) : filteredConfigs;
    }
    return filteredConfigs;
  };
  const sectionDetailsProps = {
    ...props,
    fieldConfigs: userFieldConfig,
    heading: 'ProfilePage.detailsTitle',
    rootClassName: css.userFieldSection,
  };

  return (
    <CustomExtendedDataSection
      sectionDetailsProps={sectionDetailsProps}
      propsForCustomFields={propsForCustomFields}
      idPrefix="profilePage"
      pickExtendedDataFields={pickUserFields}
      rootClassName={css.userFieldSection}
    />
  );
};

const LISTINGS_PER_PAGE = 25;

export const MainContent = props => {
  const [mounted, setMounted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [listingsQuery, setListingsQuery] = useState('');
  const highlightedListings = useSelector(selectHighlightedListings);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Reset to page 1 whenever the listings filter changes so the user
  // doesn't get stranded on an empty page.
  useEffect(() => {
    setCurrentPage(1);
  }, [listingsQuery]);

  const {
    user,
    userShowError,
    bio,
    displayName,
    createdAt,
    isCurrentUser,
    listings,
    queryListingsError,
    reviews = [],
    queryReviewsError,
    publicData,
    metadata,
    userFieldConfig,
    intl,
    hideReviews,
    userTypeRoles,
  } = props;

  const hasListings = listings.length > 0;
  const isPtMC = !intl?.locale || String(intl.locale).toLowerCase().startsWith('pt');

  // Normalise text for accent-insensitive matching ("acude" matches "açude").
  // \p{M} with /u flag matches any Unicode "Mark" — i.e. the combining
  // diacritics left over after NFD decomposition.
  const normalise = s =>
    String(s || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/\p{M}/gu, '');

  // Category labels (mirror the topbar) so the query can match either the
  // human label ("Trabalho & Reuniões") OR the underlying slug. The dropdown
  // sets the input to the human label when the user clicks a category, so the
  // filter must accept both forms.
  const CATEGORY_LABEL_MAP = {
    'trabalho-reunioes': ['Trabalho & Reuniões', 'Work & Meetings'],
    'educacao-cultura': ['Educação & Cultura', 'Education & Culture'],
    'gastronomia-convivio': ['Gastronomia & Convívio', 'Gastronomy & Social'],
    'eventos-festas': ['Eventos & Festas', 'Events & Parties'],
    'criatividade-producao': ['Criatividade & Produção', 'Creativity & Production'],
    'saude-bemestar': ['Saúde, Bem-estar & Corpo', 'Health, Wellness & Body'],
    'desporto-actividadefisica': ['Desporto & Actividade Física', 'Sport & Physical Activity'],
    'espaco-arlivre': ['Espaços ao Ar Livre', 'Outdoor Spaces'],
    'espacos_inusitados_alternativos': ['Espaços Inusitados & Alternativos', 'Unusual & Alternative Spaces'],
  };

  const filteredListings = useMemo(() => {
    const q = normalise(listingsQuery).trim();
    if (!q) return listings;
    return listings.filter(l => {
      const a = l.attributes || {};
      const pd = a.publicData || {};
      const locStr =
        (pd.location && (pd.location.address || pd.location.formattedAddress)) ||
        pd.address ||
        (pd.Location && (pd.Location.address || pd.Location.formattedAddress)) ||
        '';
      const catSlug = pd.categoryLevel1 || pd.category || '';
      const catLabels = CATEGORY_LABEL_MAP[catSlug] || [];
      const haystack = normalise(
        [a.title, a.description, locStr, catSlug, pd.categoryLabel, ...catLabels]
          .filter(Boolean)
          .join(' ')
      );
      return haystack.includes(q);
    });
  }, [listings, listingsQuery]);

  const hasMatchMedia = typeof window !== 'undefined' && window?.matchMedia;
  const isMobileLayout =
    mounted && hasMatchMedia
      ? window.matchMedia(`(max-width: ${MAX_MOBILE_SCREEN_WIDTH}px)`)?.matches
      : true;

  const hasBio = !!bio;
  const bioWithLinks = richText(bio, {
    linkify: true,
    longWordMinLength: MIN_LENGTH_FOR_LONG_WORDS,
    longWordClass: css.longWord,
  });

  const listingsContainerClasses = classNames(css.listingsContainer, {
    [css.withBioMissingAbove]: !hasBio,
  });

  if (userShowError || queryListingsError) {
    return (
      <p className={css.error}>
        <FormattedMessage id="ProfilePage.loadingDataFailed" />
      </p>
    );
  }
  return (
    <div>
      <H2 as="h1" className={css.desktopHeading}>
        <FormattedMessage id="ProfilePage.desktopHeading" values={{ name: displayName }} />
      </H2>
      {createdAt ? (
        <p className={css.memberSince}>
          <FormattedMessage
            id="ProfilePage.memberSince"
            values={{
              date: intl.formatDate(createdAt, { year: 'numeric', month: 'long' }),
            }}
          />
        </p>
      ) : null}
      {hasBio ? <p className={css.bio}>{bioWithLinks}</p> : null}

      {(() => {
        const stats = publicData?.responseStats;
        const isPt = !intl?.locale || String(intl.locale).toLowerCase().startsWith('pt');
        const label = formatResponseTime(stats, !isPt);
        if (!label) return null;
        return <p className={css.responseTime}>{label}</p>;
      })()}

      {(() => {
        // Address sits with the response-time line, both placed above the
        // languages chips so the contact info reads first.
        const locText =
          publicData?.location?.address ||
          publicData?.Location?.address ||
          (typeof publicData?.location === 'string' ? publicData.location : null) ||
          (typeof publicData?.Location === 'string' ? publicData.Location : null) ||
          null;
        if (!locText) return null;
        return (
          <p className={css.locationInline}>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="currentColor"
              className={css.locationInlineIcon}
              aria-hidden
            >
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
            </svg>
            {locText}
          </p>
        );
      })()}

      {(() => {
        const codes = Array.isArray(publicData?.languagesSpoken) ? publicData.languagesSpoken : [];
        if (codes.length === 0) return null;
        const isPt = !intl?.locale || String(intl.locale).toLowerCase().startsWith('pt');
        const items = codes
          .map(c => LANGUAGES.find(l => l.code === c))
          .filter(Boolean);
        if (items.length === 0) return null;
        return (
          <div className={css.languagesSection}>
            <span className={css.languagesLabel}>
              {isPt ? 'Línguas que fala' : 'Speaks'}
            </span>
            <div className={css.languagesChips}>
              {items.map(lang => (
                <span key={lang.code} className={css.languagesChip}>
                  <span className={`fi fi-${lang.country} ${css.languagesChipFlag}`} aria-hidden />
                  {isPt ? lang.pt : lang.en}
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {(() => {
        const links = publicData?.socialLinks || {};
        const items = SOCIAL_PLATFORMS
          .map(p => {
            const raw = links[p.key];
            if (!raw) return null;
            return { ...p, url: normaliseSocialUrl(raw, p.handlePrefix) };
          })
          .filter(Boolean);
        if (items.length === 0) return null;
        const isPt = !intl?.locale || String(intl.locale).toLowerCase().startsWith('pt');
        return (
          <div className={css.socialBlock}>
            <span className={css.socialLabel}>
              {isPt ? 'Redes sociais' : 'Social media'}
            </span>
            <div className={css.socialSection}>
              {items.map(p => (
                <a
                  key={p.key}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={p.label}
                  title={p.label}
                  className={css.socialLink}
                >
                  {p.iconSrc ? (
                    <>
                      <img src={p.iconSrc} alt="" className={css.socialLinkImg} />
                      {p.iconHoverSrc && (
                        <img
                          src={p.iconHoverSrc}
                          alt=""
                          aria-hidden
                          className={css.socialLinkImgHover}
                        />
                      )}
                    </>
                  ) : (
                    p.icon
                  )}
                </a>
              ))}
            </div>
          </div>
        );
      })()}

      <MobileProfileActions user={user} isCurrentUser={isCurrentUser} />

      {hasBio || createdAt ? <hr className={css.profileDivider} /> : null}

      {displayName ? (
        <CustomUserFields
          publicData={publicData}
          metadata={metadata}
          userFieldConfig={userFieldConfig}
          intl={intl}
        />
      ) : null}

      {hasListings ? (
        <div className={listingsContainerClasses}>
          <H4 as="h2" className={css.listingsTitle}>
            <FormattedMessage
              id={isCurrentUser ? 'ProfilePage.listingsTitle' : 'ProfilePage.listingsTitleOther'}
              values={{ count: listings.length, name: displayName }}
            />
          </H4>
          <ProfileListingsSearchBar
            listings={listings}
            value={listingsQuery}
            onChange={setListingsQuery}
            isPt={isPtMC}
            filteredCount={filteredListings.length}
          />
          {filteredListings.length === 0 ? (
            <p className={css.profileSearchEmpty}>
              {isPtMC
                ? `Sem resultados para "${listingsQuery}".`
                : `No results for "${listingsQuery}".`}
            </p>
          ) : null}
          <ul className={css.listings}>
            {filteredListings
              .slice((currentPage - 1) * LISTINGS_PER_PAGE, currentPage * LISTINGS_PER_PAGE)
              .map(l => (
                <li className={css.listing} key={l.id.uuid}>
                  <div className={css.listingCardWrapper}>
                    <ListingCard listing={l} showAuthorInfo={false} />
                    {isCurrentUser && listingHighlightsEnabled ? (
                      highlightedListings.some(h => h.id === l.id.uuid) ? (
                        <span className={css.editarDestaqueButton}>
                          <IconEdit className={css.editarDestaqueIcon} />
                          <FormattedMessage id="ProfilePage.editarDestaque" />
                        </span>
                      ) : (
                        <NamedLink
                          name="DestacaAnuncioPage"
                          className={css.destacarCardButton}
                        >
                          <FormattedMessage id="ProfilePage.destacarAnuncio" />
                        </NamedLink>
                      )
                    ) : null}
                  </div>
                </li>
              ))}
          </ul>
          {filteredListings.length > LISTINGS_PER_PAGE ? (
            <div className={css.pagination}>
              <button
                className={css.pageBtn}
                onClick={() => setCurrentPage(p => p - 1)}
                disabled={currentPage === 1}
              >
                ‹
              </button>
              {Array.from({ length: Math.ceil(filteredListings.length / LISTINGS_PER_PAGE) }, (_, i) => (
                <button
                  key={i + 1}
                  className={`${css.pageBtn}${currentPage === i + 1 ? ` ${css.pageBtnActive}` : ''}`}
                  onClick={() => setCurrentPage(i + 1)}
                >
                  {i + 1}
                </button>
              ))}
              <button
                className={css.pageBtn}
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={currentPage === Math.ceil(filteredListings.length / LISTINGS_PER_PAGE)}
              >
                ›
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
      {hideReviews ? null : isMobileLayout ? (
        <MobileReviews
          reviews={reviews}
          queryReviewsError={queryReviewsError}
          userTypeRoles={userTypeRoles}
          isCurrentUser={isCurrentUser}
        />
      ) : (
        <DesktopReviews
          reviews={reviews}
          queryReviewsError={queryReviewsError}
          userTypeRoles={userTypeRoles}
          intl={intl}
          isCurrentUser={isCurrentUser}
        />
      )}
    </div>
  );
};

/**
 * ProfilePageComponent
 *
 * @component
 * @param {Object} props
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {boolean} props.useCurrentUser - Whether to use the current user
 * @param {propTypes.user|propTypes.currentUser} props.user - The user
 * @param {propTypes.error} props.userShowError - The user show error
 * @param {propTypes.error} props.queryListingsError - The query listings error
 * @param {Array<propTypes.listing|propTypes.ownListing>} props.listings - The listings
 * @param {Array<propTypes.review>} props.reviews - The reviews
 * @param {propTypes.error} props.queryReviewsError - The query reviews error
 * @returns {JSX.Element} ProfilePageComponent
 */
export const ProfilePageComponent = props => {
  const config = useConfiguration();
  const intl = useIntl();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    scrollingDisabled,
    params: pathParams,
    currentUser,
    useCurrentUser,
    userShowError,
    user,
    ...rest
  } = props;
  const isVariant = pathParams.variant?.length > 0;
  const isPreview = isVariant && pathParams.variant === PROFILE_PAGE_PENDING_APPROVAL_VARIANT;

  // Stripe's onboarding needs a business URL for each seller, but the profile page can be
  // too empty for the provider at the time they are creating their first listing.
  // To remedy the situation, we redirect Stripe's crawler to the landing page of the marketplace.
  // TODO: When there's more content on the profile page, we should consider by-passing this redirection.
  const searchParams = rest?.location?.search;
  const isStorefront = searchParams
    ? new URLSearchParams(searchParams)?.get('mode') === 'storefront'
    : false;
  if (isStorefront) {
    return <NamedRedirect name="LandingPage" />;
  }

  const isCurrentUser = currentUser?.id && currentUser?.id?.uuid === pathParams.id;
  const profileUser = useCurrentUser ? currentUser : user;
  const { bio, displayName, publicData, metadata } = profileUser?.attributes?.profile || {};
  const createdAt = profileUser?.attributes?.createdAt;
  const { userFields } = config.user;
  const isPrivateMarketplace = config.accessControl.marketplace.private === true;
  const isUnauthorizedUser = currentUser && !isUserAuthorized(currentUser);
  const isUnauthorizedOnPrivateMarketplace = isPrivateMarketplace && isUnauthorizedUser;
  const hasUserPendingApprovalError = isErrorUserPendingApproval(userShowError);
  const hasNoViewingRightsUser = currentUser && !hasPermissionToViewData(currentUser);
  const hasNoViewingRightsOnPrivateMarketplace = isPrivateMarketplace && hasNoViewingRightsUser;

  const userTypeRoles = getCurrentUserTypeRoles(config, profileUser);

  const isDataLoaded = isPreview
    ? currentUser != null || userShowError != null
    : hasNoViewingRightsOnPrivateMarketplace
    ? currentUser != null || userShowError != null
    : user != null || userShowError != null;

  const schemaTitleVars = { name: displayName, marketplaceName: config.marketplaceName };
  const schemaTitle = intl.formatMessage({ id: 'ProfilePage.schemaTitle' }, schemaTitleVars);

  if (!isDataLoaded) {
    return null;
  } else if (!isPreview && isNotFoundError(userShowError)) {
    return <NotFoundPage staticContext={props.staticContext} />;
  } else if (!isPreview && (isUnauthorizedOnPrivateMarketplace || hasUserPendingApprovalError)) {
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_USER_PENDING_APPROVAL }}
      />
    );
  } else if (
    (!isPreview && hasNoViewingRightsOnPrivateMarketplace && !isCurrentUser) ||
    isErrorNoViewingPermission(userShowError)
  ) {
    // Someone without viewing rights on a private marketplace is trying to
    // view a profile page that is not their own – redirect to NoAccessPage
    return (
      <NamedRedirect
        name="NoAccessPage"
        params={{ missingAccessRight: NO_ACCESS_PAGE_VIEW_LISTINGS }}
      />
    );
  } else if (!isPreview && isForbiddenError(userShowError)) {
    // This can happen if private marketplace mode is active, but it's not reflected through asset yet.
    return (
      <NamedRedirect
        name="SignupPage"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
      />
    );
  } else if (isPreview && mounted && !isCurrentUser) {
    // Someone is manipulating the URL, redirect to current user's profile page.
    return isCurrentUser === false ? (
      <NamedRedirect name="ProfilePage" params={{ id: currentUser?.id?.uuid }} />
    ) : null;
  } else if ((isPreview || isPrivateMarketplace) && !mounted) {
    // This preview of the profile page is not rendered on server-side
    // and the first pass on client-side should render the same UI.
    return null;
  }

  // This is rendering normal profile page (not preview for pending-approval)
  return (
    <Page
      scrollingDisabled={scrollingDisabled}
      title={schemaTitle}
      schema={{
        '@context': 'http://schema.org',
        '@type': 'ProfilePage',
        mainEntity: {
          '@type': 'Person',
          name: profileUser?.attributes?.profile?.displayName,
        },
        name: schemaTitle,
      }}
    >
      <LayoutSideNavigation
        sideNavClassName={css.aside}
        mainColumnClassName={css.mainColumn}
        topbar={<TopbarContainer />}
        sideNav={
          <AsideContent
            user={profileUser}
            showLinkToProfileSettingsPage={mounted && isCurrentUser}
            isCurrentUser={!!isCurrentUser}
            displayName={displayName}
          />
        }
        footer={<FooterContainer />}
      >
        <MainContent
          user={profileUser}
          bio={bio}
          displayName={displayName}
          createdAt={createdAt}
          isCurrentUser={isCurrentUser}
          userShowError={userShowError}
          publicData={publicData}
          metadata={metadata}
          userFieldConfig={userFields}
          hideReviews={hasNoViewingRightsOnPrivateMarketplace}
          intl={intl}
          userTypeRoles={userTypeRoles}
          {...rest}
        />
      </LayoutSideNavigation>
    </Page>
  );
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const {
    userId,
    userShowError,
    queryListingsError,
    userListingRefs,
    reviews = [],
    queryReviewsError,
  } = state.ProfilePage;
  const userMatches = getMarketplaceEntities(state, [{ type: 'user', id: userId }]);
  const user = userMatches.length === 1 ? userMatches[0] : null;

  // Show currentUser's data if it's not approved yet
  const isCurrentUser = userId?.uuid === currentUser?.id?.uuid;
  const useCurrentUser =
    isCurrentUser && !(isUserAuthorized(currentUser) && hasPermissionToViewData(currentUser));

  return {
    scrollingDisabled: isScrollingDisabled(state),
    currentUser,
    useCurrentUser,
    user,
    userShowError,
    queryListingsError,
    listings: getMarketplaceEntities(state, userListingRefs),
    reviews,
    queryReviewsError,
  };
};

const ProfilePage = compose(connect(mapStateToProps))(ProfilePageComponent);

export default ProfilePage;
