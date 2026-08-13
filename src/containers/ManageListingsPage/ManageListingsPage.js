import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { useRouteConfiguration } from '../../context/routeConfigurationContext';
import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { pathByRouteName } from '../../util/routes';
import { hasPermissionToPostListings, showCreateListingLinkForUser } from '../../util/userHelpers';
import { NO_ACCESS_PAGE_POST_LISTINGS } from '../../util/urlHelpers';
import { propTypes } from '../../util/types';
import { isErrorNoPermissionToPostListings } from '../../util/errors';
import { isScrollingDisabled, manageDisableScrolling } from '../../ducks/ui.duck';

import {
  H2,
  H3,
  Page,
  PaginationLinks,
  LayoutSingleColumn,
  NamedLink,
  Modal,
} from '../../components';

import TopbarContainer from '../../containers/TopbarContainer/TopbarContainer';
import FooterContainer from '../../containers/FooterContainer/FooterContainer';

import ManageListingCard from './ManageListingCard/ManageListingCard';

import {
  closeListing,
  openListing,
  getOwnListingsById,
  discardDraft,
} from './ManageListingsPage.duck';
import { syncDeletedListingsToServer } from '../../ducks/user.duck';
import {
  getDeletedListingIds,
  addDeletedListingId,
} from '../../util/deletedListings';
import css from './ManageListingsPage.module.css';
import DiscardDraftModal from './DiscardDraftModal/DiscardDraftModal';
import HostDashboard from './HostDashboard/HostDashboard';

// Havia aqui um componente `Heading` que já ninguém renderizava e que contava
// pelo `pagination.totalItems`, sem descontar os anúncios escondidos — o mesmo
// erro que esta página tinha à vista. Foi removido em vez de corrigido: manter
// uma segunda contagem, sem uso, era só esperar que alguém a voltasse a ligar.
// A contagem que vale é a `visibleTotal`, no corpo da página.

const PaginationLinksMaybe = props => {
  const { listingsAreLoaded, pagination, page } = props;
  return listingsAreLoaded && pagination && pagination.totalPages > 1 ? (
    <PaginationLinks
      className={css.pagination}
      pageName="ManageListingsPage"
      pageSearchParams={{ page }}
      pagination={pagination}
    />
  ) : null;
};

/**
 * The ManageListingsPage component.
 *
 * @component
 * @param {Object} props
 * @param {propTypes.currentUser} props.currentUser - The current user
 * @param {propTypes.uuid} props.closingListing - The closing listing
 * @param {Object} props.closingListingError - The closing listing error
 * @param {propTypes.error} props.closingListingError.listingId - The closing listing id
 * @param {propTypes.error} props.closingListingError.error - The closing listing error
 * @param {propTypes.ownListing[]} props.listings - The listings
 * @param {function} props.onCloseListing - The onCloseListing function
 * @param {function} props.onDiscardDraft - The onDiscardDraft function
 * @param {function} props.onOpenListing - The onOpenListing function
 * @param {Object} props.openingListing - The opening listing
 * @param {propTypes.uuid} props.openingListing.uuid - The opening listing uuid
 * @param {Object} props.openingListingError - The opening listing error
 * @param {propTypes.uuid} props.openingListingError.listingId - The opening listing id
 * @param {propTypes.error} props.openingListingError.error - The opening listing error
 * @param {propTypes.pagination} props.pagination - The pagination
 * @param {boolean} props.queryInProgress - Whether the query is in progress
 * @param {propTypes.error} props.queryListingsError - The query listings error
 * @param {Object} props.queryParams - The query params
 * @param {boolean} props.scrollingDisabled - Whether the scrolling is disabled
 * @param {function} props.onManageDisableScrolling - The onManageDisableScrolling function
 * @returns {JSX.Element} manage listings page component
 */
export const ManageListingsPageComponent = props => {
  const [listingMenuOpen, setListingMenuOpen] = useState(null);
  const [discardDraftModalOpen, setDiscardDraftModalOpen] = useState(null);
  const [discardDraftModalId, setDiscardDraftModalId] = useState(null);
  const history = useHistory();
  const routeConfiguration = useRouteConfiguration();
  const config = useConfiguration();
  const intl = useIntl();

  const {
    currentUser,
    closingListing,
    closingListingError,
    discardingDraft,
    discardingDraftError,
    listings = [],
    onCloseListing,
    onDiscardDraft,
    onOpenListing,
    onSyncDeletedListings,
    openingListing,
    openingListingError,
    pagination,
    queryInProgress,
    queryListingsError,
    queryParams,
    scrollingDisabled,
    onManageDisableScrolling,
  } = props;

  useEffect(() => {
    if (isErrorNoPermissionToPostListings(openingListingError?.error)) {
      const noAccessPagePath = pathByRouteName('NoAccessPage', routeConfiguration, {
        missingAccessRight: NO_ACCESS_PAGE_POST_LISTINGS,
      });
      history.push(noAccessPagePath);
    }
  }, [openingListingError]);

  const onToggleMenu = listing => {
    setListingMenuOpen(listing);
  };

  const handleOpenListing = listingId => {
    const hasPostingRights = hasPermissionToPostListings(currentUser);

    if (!hasPostingRights) {
      const noAccessPagePath = pathByRouteName('NoAccessPage', routeConfiguration, {
        missingAccessRight: NO_ACCESS_PAGE_POST_LISTINGS,
      });
      history.push(noAccessPagePath);
    } else {
      onOpenListing(listingId);
    }
  };

  const openDiscardDraftModal = listingId => {
    setDiscardDraftModalId(listingId);
    setDiscardDraftModalOpen(true);
  };

  const handleDiscardDraft = () => {
    onDiscardDraft(discardDraftModalId);
    setDiscardDraftModalOpen(false);
    setDiscardDraftModalId(null);
  };

  // Sharetribe doesn't allow true deletion of published listings. Our
  // "delete" pipeline: close the listing (hides from everyone in the
  // marketplace) + remember its id locally so it also disappears from the
  // owner's own management view + push to user privateData so the hide
  // applies on every device the user logs in on.
  const [, forceRerender] = useState(0);
  const userIdForDeleted = currentUser?.id?.uuid;
  const handleDeleteListing = listingId => {
    const uuid = listingId?.uuid;
    if (!uuid) return;
    addDeletedListingId(userIdForDeleted, uuid);
    onCloseListing(listingId);
    onSyncDeletedListings();
    forceRerender(n => n + 1);
  };

  const hasPaginationInfo = !!pagination && pagination.totalItems != null;
  const listingsAreLoaded = !queryInProgress && hasPaginationInfo;

  // A Sharetribe não apaga anúncios — um anúncio apagado aqui é fechado e
  // acrescentado a uma lista de escondidos (ver util/deletedListings.js). A
  // grelha respeitava essa lista, mas a contagem vinha do `totalItems` da API,
  // que não a conhece: quem apagasse o único anúncio ficava a ler "Tem 1
  // anúncio" por cima de uma grelha vazia, e sem o convite para criar o
  // primeiro, porque esse só aparecia com totalItems a zero.
  //
  // Os escondidos continuam todos a existir do lado da API (fechados, nunca
  // apagados), por isso descontá-los do total dá o número que a pessoa vê.
  const deletedSet = new Set(getDeletedListingIds(userIdForDeleted));
  const visibleListings = listings.filter(l => !deletedSet.has(l.id.uuid));
  const visibleTotal = hasPaginationInfo
    ? Math.max(0, pagination.totalItems - deletedSet.size)
    : null;

  const loadingResults = (
    <div className={css.messagePanel}>
      <H3 as="h2" className={css.heading}>
        <FormattedMessage id="ManageListingsPage.loadingOwnListings" />
      </H3>
    </div>
  );

  const queryError = (
    <div className={css.messagePanel}>
      <H3 as="h2" className={css.heading}>
        <FormattedMessage id="ManageListingsPage.queryError" />
      </H3>
    </div>
  );

  const closingErrorListingId = !!closingListingError && closingListingError.listingId;
  const openingErrorListingId = !!openingListingError && openingListingError.listingId;
  const discardingErrorListingId = !!discardingDraftError && discardingDraft.listingId;

  const panelWidth = 62.5;
  // Render hints for responsive image
  const renderSizes = [
    `(max-width: 767px) 100vw`,
    `(max-width: 1920px) ${panelWidth / 2}vw`,
    `${panelWidth / 3}vw`,
  ].join(', ');

  const showManageListingsLink = showCreateListingLinkForUser(config, currentUser);

  return (
    <Page
      title={intl.formatMessage({ id: 'ManageListingsPage.title' })}
      scrollingDisabled={scrollingDisabled}
      className={css.root}
    >
      <LayoutSingleColumn
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.listingPanel}>
          <HostDashboard
            listings={visibleListings}
            activeCount={listingsAreLoaded ? visibleTotal : null}
            currentUser={currentUser}
          />
          <div className={css.headingWrapper}>
            <H2 as="h1" className={css.heading}>
              <FormattedMessage id="ManageListingsPage.title" />
            </H2>
            <p className={css.count}>
              {listingsAreLoaded && visibleTotal != null && visibleTotal > 0
                ? <FormattedMessage
                    id="ManageListingsPage.youHaveListings"
                    values={{ count: visibleTotal }}
                  />
                : null}
            </p>
          </div>
          {queryInProgress ? loadingResults : null}
          {queryListingsError ? queryError : null}
          {listingsAreLoaded && visibleTotal === 0 ? (
            <div className={css.noResults}>
              <H3 as="h2" className={css.headingNoListings}>
                <FormattedMessage id="ManageListingsPage.noResults" />
              </H3>
              <p>
                <NamedLink className={css.createListingLink} name="NewListingPage">
                  <FormattedMessage id="ManageListingsPage.createListing" />
                </NamedLink>
              </p>
            </div>
          ) : null}

          <div className={css.listingCards}>
            {(() => {
              return visibleListings
                .map(l => (
                  <ManageListingCard
                    className={css.listingCard}
                    key={l.id.uuid}
                    listing={l}
                    isMenuOpen={!!listingMenuOpen && listingMenuOpen.id.uuid === l.id.uuid}
                    actionsInProgressListingId={openingListing || closingListing || discardingDraft}
                    onToggleMenu={onToggleMenu}
                    onCloseListing={onCloseListing}
                    onOpenListing={handleOpenListing}
                    onDiscardDraft={openDiscardDraftModal}
                    onDeleteListing={handleDeleteListing}
                    hasOpeningError={openingErrorListingId.uuid === l.id.uuid}
                    hasClosingError={closingErrorListingId.uuid === l.id.uuid}
                    hasDiscardingError={discardingErrorListingId.uuid === l.id.uuid}
                    renderSizes={renderSizes}
                  />
                ));
            })()}
          </div>
          {onManageDisableScrolling && discardDraftModalOpen ? (
            <DiscardDraftModal
              id="ManageListingsPage"
              isOpen={discardDraftModalOpen}
              onManageDisableScrolling={onManageDisableScrolling}
              onCloseModal={() => setDiscardDraftModalOpen(false)}
              onDiscardDraft={handleDiscardDraft}
              focusElementId={
                discardDraftModalId ? `discardButton_${discardDraftModalId.uuid}` : null
              }
            />
          ) : null}

          <PaginationLinksMaybe
            listingsAreLoaded={listingsAreLoaded}
            pagination={pagination}
            page={queryParams ? queryParams.page : 1}
          />
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => {
  const { currentUser } = state.user;
  const {
    currentPageResultIds,
    pagination,
    queryInProgress,
    queryListingsError,
    queryParams,
    openingListing,
    openingListingError,
    closingListing,
    closingListingError,
    discardingDraft,
    discardingDraftError,
  } = state.ManageListingsPage;
  const listings = getOwnListingsById(state, currentPageResultIds);
  return {
    currentUser,
    currentPageResultIds,
    listings,
    pagination,
    queryInProgress,
    queryListingsError,
    queryParams,
    scrollingDisabled: isScrollingDisabled(state),
    openingListing,
    openingListingError,
    closingListing,
    closingListingError,
    discardingDraft,
    discardingDraftError,
  };
};

const mapDispatchToProps = dispatch => ({
  onCloseListing: listingId => dispatch(closeListing(listingId)),
  onOpenListing: listingId => dispatch(openListing(listingId)),
  onDiscardDraft: listingId => dispatch(discardDraft(listingId)),
  onSyncDeletedListings: () => dispatch(syncDeletedListingsToServer()),
  onManageDisableScrolling: (componentId, disableScrolling) =>
    dispatch(manageDisableScrolling(componentId, disableScrolling)),
});

const ManageListingsPage = compose(
  connect(
    mapStateToProps,
    mapDispatchToProps
  )
)(ManageListingsPageComponent);

export default ManageListingsPage;
