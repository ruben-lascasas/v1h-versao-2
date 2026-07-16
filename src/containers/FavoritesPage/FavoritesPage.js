import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { H2, Page, LayoutSingleColumn, ListingCard } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { types as sdkTypes } from '../../util/sdkLoader';
import { selectFavorites, fetchFavoriteListings, removeFromFavorites, syncFavoritesToServer } from '../../ducks/favorites.duck';
import { getListingsById } from '../../ducks/marketplaceData.duck';
import { isScrollingDisabled } from '../../ducks/ui.duck';
import css from './FavoritesPage.module.css';

const { UUID } = sdkTypes;

const FavoritesPageComponent = () => {
  const intl = useIntl();
  const config = useConfiguration();
  const dispatch = useDispatch();

  const currentUserId = useSelector(state => state.user?.currentUser?.id?.uuid || null);
  const scrollingDisabled = useSelector(isScrollingDisabled);
  const favoriteListingIds = useSelector(selectFavorites);
  const favoriteUUIDs = favoriteListingIds.map(id => new UUID(id));
  const allFavoriteListings = useSelector(state => {
    try {
      return getListingsById(state, favoriteUUIDs);
    } catch (e) {
      return [];
    }
  });

  // Filter out listings created by the current user — users can't favorite their own listings
  const favoriteListings = currentUserId
    ? allFavoriteListings.filter(l => l?.author?.id?.uuid !== currentUserId)
    : allFavoriteListings;

  useEffect(() => {
    if (favoriteListingIds && favoriteListingIds.length > 0) {
      dispatch(fetchFavoriteListings(config));
    }
  }, [dispatch, favoriteListingIds.join(',')]);

  // Auto-remove own listings from favorites data (cleanup stale entries)
  useEffect(() => {
    if (!currentUserId || allFavoriteListings.length === 0) return;
    const ownListingIds = allFavoriteListings
      .filter(l => l?.author?.id?.uuid === currentUserId)
      .map(l => l.id.uuid);
    if (ownListingIds.length === 0) return;
    ownListingIds.forEach(id => dispatch(removeFromFavorites(id)));
    dispatch(syncFavoritesToServer());
  }, [currentUserId, allFavoriteListings.length]);

  const hasListings = Array.isArray(favoriteListings) && favoriteListings.length > 0;

  const title = intl.formatMessage({ id: 'FavoritesPage.title' }, { marketplaceName: config.marketplaceName });

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled} className={css.root}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <div className={css.headingWrapper}>
            <H2 as="h1" className={css.heading}>
              <FormattedMessage id="FavoritesPage.heading" />
            </H2>
            <p className={css.count}>
              <FormattedMessage id="FavoritesPage.count" values={{ count: favoriteListings.length }} />
            </p>
          </div>

          {!hasListings ? (
            <div className={css.noListings}>
              <FormattedMessage id="FavoritesPage.noListings" />
            </div>
          ) : (
            <div className={css.listingsGrid}>
              {favoriteListings.map(listing => (
                <div key={listing?.id?.uuid} className={css.listingCard}>
                  <ListingCard listing={listing} />
                </div>
              ))}
            </div>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

export default FavoritesPageComponent;
