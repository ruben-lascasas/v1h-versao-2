import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage } from '../../util/reactIntl';
import { fetchRecentlyViewedListings } from '../../ducks/recentlyViewed.duck';
import ListingCard from '../ListingCard/ListingCard';
import css from './RecentlyViewedSection.module.css';

const RecentlyViewedSection = () => {
  const config = useConfiguration();
  const dispatch = useDispatch();
  const scrollRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Re-fetch whenever entries change — server entries arrive after fetchCurrentUser completes,
  // which may be after the component already mounted. Skip already-loaded IDs (safe to call often).
  const entriesLength = useSelector(state => state.recentlyViewed?.entries?.length || 0);
  useEffect(() => {
    if (!isMounted) return;
    dispatch(fetchRecentlyViewedListings(config));
  }, [isMounted, entriesLength, dispatch, config]);

  // Show all fetched listings regardless of Redux entries state
  const listings = useSelector(state => {
    const listingsMap = state.recentlyViewed?.listings || {};
    const entries = state.recentlyViewed?.entries || [];
    if (entries.length > 0) {
      return entries.map(e => listingsMap[e.id]).filter(Boolean);
    }
    return Object.values(listingsMap).filter(Boolean);
  }, shallowEqual);

  const updateScrollButtons = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 0);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    if (!isMounted) return;
    const el = scrollRef.current;
    if (!el) return;
    // requestAnimationFrame ensures the browser has finished layout before measuring scrollWidth
    const raf = requestAnimationFrame(updateScrollButtons);
    el.addEventListener('scroll', updateScrollButtons);
    window.addEventListener('resize', updateScrollButtons);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('scroll', updateScrollButtons);
      window.removeEventListener('resize', updateScrollButtons);
    };
  }, [isMounted, listings.length, updateScrollButtons]);

  const scroll = direction => {
    const el = scrollRef.current;
    if (!el) return;
    const amount = el.clientWidth / 2;
    el.scrollBy({ left: direction === 'right' ? amount : -amount, behavior: 'smooth' });
  };

  if (!isMounted) {
    return null;
  }

  if (listings.length === 0) {
    return (
      <div className={css.root}>
        <h2 className={css.heading}>
          <FormattedMessage id="RecentlyViewedSection.heading" />
        </h2>
        <p className={css.emptyMessage}>
          <FormattedMessage id="RecentlyViewedSection.empty" />
        </p>
      </div>
    );
  }

  return (
    <div className={css.root}>
      <h2 className={css.heading}>
        <FormattedMessage id="RecentlyViewedSection.heading" />
      </h2>
      <div className={css.carouselWrapper}>
        <button
          className={css.arrowLeft}
          onClick={() => scroll('left')}
          disabled={!canScrollLeft}
          aria-label="Scroll left"
        >
          <span>‹</span>
        </button>
        <div className={css.scrollContainer} ref={scrollRef}>
          {listings.map(listing => (
            <div key={listing?.id?.uuid} className={css.cardWrapper}>
              <ListingCard listing={listing} lazyLoadImage={false} />
            </div>
          ))}
        </div>
        <button
          className={css.arrowRight}
          onClick={() => scroll('right')}
          disabled={!canScrollRight}
          aria-label="Scroll right"
        >
          <span>›</span>
        </button>
      </div>
    </div>
  );
};

export default RecentlyViewedSection;
