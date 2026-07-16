import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage } from '../../util/reactIntl';
import { fetchSimilarListings, selectSimilarListings } from '../../ducks/similarListings.duck';
import ListingCard from '../ListingCard/ListingCard';
import css from './SimilarListingsSection.module.css';

const SimilarListingsSection = ({ currentListingId, categoryLevel1 }) => {
  const config = useConfiguration();
  const dispatch = useDispatch();
  const scrollRef = useRef(null);
  const [isMounted, setIsMounted] = useState(false);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || !currentListingId) return;
    dispatch(fetchSimilarListings(currentListingId, categoryLevel1, config));
  }, [isMounted, currentListingId, categoryLevel1, dispatch, config]);

  const listings = useSelector(
    state => selectSimilarListings(state, currentListingId),
    shallowEqual
  );

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

  if (!isMounted || listings.length === 0) {
    return null;
  }

  return (
    <div className={css.root}>
      <h2 className={css.heading}>
        <FormattedMessage id="SimilarListingsSection.heading" />
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

export default SimilarListingsSection;
