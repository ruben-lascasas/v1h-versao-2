import React, { useEffect, useState } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { H2, Page, LayoutSingleColumn, ListingCard } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import { fetchRecentlyViewedListings } from '../../ducks/recentlyViewed.duck';
import css from './RecentlyViewedPage.module.css';

const RecentlyViewedPageComponent = () => {
  const intl = useIntl();
  const config = useConfiguration();
  const dispatch = useDispatch();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Re-fetch whenever entries change — same pattern as RecentlyViewedSection.
  const entriesLength = useSelector(state => state.recentlyViewed?.entries?.length || 0);
  useEffect(() => {
    if (!isMounted) return;
    dispatch(fetchRecentlyViewedListings(config));
  }, [isMounted, entriesLength, dispatch, config]);

  // Read from state.recentlyViewed.listings (where fetchRecentlyViewedListings stores data),
  // ordered by entries when available.
  const listings = useSelector(state => {
    const listingsMap = state.recentlyViewed?.listings || {};
    const entries = state.recentlyViewed?.entries || [];
    if (entries.length > 0) {
      return entries.map(e => listingsMap[e.id]).filter(Boolean);
    }
    return Object.values(listingsMap).filter(Boolean);
  }, shallowEqual);

  const title = intl.formatMessage(
    { id: 'RecentlyViewedPage.title' },
    { marketplaceName: config.marketplaceName }
  );

  const count = isMounted ? listings.length : 0;

  if (!isMounted) {
    return (
      <Page title={title} scrollingDisabled={false} className={css.root}>
        <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />} hideRecentlyViewed>
          <div className={css.content} />
        </LayoutSingleColumn>
      </Page>
    );
  }

  return (
    <Page title={title} scrollingDisabled={false} className={css.root}>
      <LayoutSingleColumn topbar={<TopbarContainer />} footer={<FooterContainer />} hideRecentlyViewed>
        <div className={css.content}>
          <div className={css.headingWrapper}>
            <H2 as="h1" className={css.heading}>
              <FormattedMessage id="RecentlyViewedPage.heading" />
            </H2>
            <p className={css.count}>
              <FormattedMessage
                id="RecentlyViewedPage.count"
                values={{ count }}
              />
            </p>
          </div>

          {listings.length === 0 ? (
            <div className={css.noListings}>
              <FormattedMessage id="RecentlyViewedPage.noListings" />
            </div>
          ) : (
            <div className={css.listingsGrid}>
              {listings.map(listing => (
                <div key={listing.id.uuid} className={css.listingCard}>
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

export default RecentlyViewedPageComponent;
