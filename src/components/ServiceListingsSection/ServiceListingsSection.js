import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useSelector, useDispatch, shallowEqual } from 'react-redux';
import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage } from '../../util/reactIntl';
import {
  fetchNearbyServiceListings,
  selectServiceListings,
} from '../../ducks/serviceListings.duck';
import ServiceListingCard from '../ListingCard/ServiceListingCard';
import css from './ServiceListingsSection.module.css';

/**
 * Secção "Serviços complementares" — mostra anúncios do tipo "servico"
 * (catering, limpeza, etc.) perto da geolocation do espaço, para o cliente
 * poder adicioná-los ao pedir o espaço.
 *
 * Não renderiza nada se não houver serviços por perto (marketplace ainda sem
 * prestadores na zona, ou nenhum a menos de MAX_DISTANCE_KM).
 *
 * @component
 * @param {Object} props
 * @param {string} props.currentListingId - uuid do espaço
 * @param {{lat:number,lng:number}} props.geolocation - geolocation do espaço
 * @returns {JSX.Element|null}
 */
const ServiceListingsSection = ({ currentListingId, geolocation }) => {
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
    if (!isMounted || !currentListingId || !geolocation) return;
    dispatch(fetchNearbyServiceListings(currentListingId, geolocation, config));
  }, [isMounted, currentListingId, geolocation, dispatch, config]);

  const listings = useSelector(
    state => selectServiceListings(state, currentListingId),
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
        <FormattedMessage id="ServiceListingsSection.heading" />
      </h2>
      <p className={css.subheading}>
        <FormattedMessage id="ServiceListingsSection.subheading" />
      </p>
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
              <ServiceListingCard listing={listing} />
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

export default ServiceListingsSection;
