import React, { useEffect, useState, useRef } from 'react';
import classNames from 'classnames';
import { useSelector } from 'react-redux';

// Import configs and components
import { useConfiguration } from '../../../../context/configurationContext';
import { FormattedMessage } from '../../../../util/reactIntl';
import { useLocale } from '../../../../context/localeContext';

import { ListingCard, IconSpinner, ErrorMessage, NamedLink, FavoriteButton, ResponsiveImage } from '../../../../components';
import IconReviewStar from '../../../../components/IconReviewStar/IconReviewStar';
import { selectHighlightedListings } from '../../../../ducks/highlightedListings.duck';

import Field, { hasDataInFields } from '../../Field';
import SectionContainer from '../SectionContainer';

import { translateEnumOptionLabel } from '../../../../util/translateConfig';
import { createSlug } from '../../../../util/urlHelpers';
import escritorioImage from '../../../../assets/escritorio.png';
import css from './SectionHighlightedListing.module.css';

// ── Distritos de Portugal ─────────────────────────────────────────────────────
const PORTUGAL_DISTRICTS = [
  'Aveiro', 'Beja', 'Braga', 'Bragança', 'Castelo Branco',
  'Coimbra', 'Évora', 'Faro', 'Guarda', 'Leiria', 'Lisboa',
  'Portalegre', 'Porto', 'Santarém', 'Setúbal', 'Viana do Castelo',
  'Vila Real', 'Viseu', 'Açores', 'Madeira',
];

const extractDistrict = address => {
  if (!address) return null;
  return PORTUGAL_DISTRICTS.find(d => address.includes(d)) || null;
};

const getSlideLocation = slide => {
  if (slide.type === 'api') return slide.data?.attributes?.publicData?.location?.address || null;
  return slide.data?.location || null;
};

// ── Palavra-chave por categoria ────────────────────────────────────────────────
const CATEGORY_KEYWORD_PT = {
  trabalho:     'Escritório',   reuniao:      'Escritório',
  cultura:      'Espaço Cultural', educacao:  'Espaço Cultural',
  gastronomia:  'Restaurante',  convivio:     'Restaurante',
  eventos:      'Evento',       festa:        'Evento',
  criatividade: 'Estúdio',      producao:     'Estúdio',
  saude:        'Espaço de Saúde', bem:       'Espaço de Saúde',
  desporto:     'Espaço Desportivo', actividade: 'Espaço Desportivo',
  livre:        'Espaço ao Ar Livre',
  inusitado:    'Espaço Inusitado', alternativo: 'Espaço Inusitado',
};

const CATEGORY_KEYWORD_EN = {
  trabalho:     'Office',       reuniao:      'Office',
  cultura:      'Cultural Space', educacao:   'Cultural Space',
  gastronomia:  'Restaurant',   convivio:     'Restaurant',
  eventos:      'Event Space',  festa:        'Event Space',
  criatividade: 'Studio',       producao:     'Studio',
  saude:        'Health Space', bem:          'Health Space',
  desporto:     'Sports Space', actividade:   'Sports Space',
  livre:        'Outdoor Space',
  inusitado:    'Unusual Space', alternativo: 'Unusual Space',
};

const getCategoryKeyword = (category, isEN) => {
  if (!category) return isEN ? 'Office' : 'Escritório';
  const haystack = category.toLowerCase();
  const map = isEN ? CATEGORY_KEYWORD_EN : CATEGORY_KEYWORD_PT;
  const match = Object.keys(map).find(k => haystack.includes(k));
  return match ? map[match] : (isEN ? 'Space' : 'Espaço');
};

const SectionHighlightedListing = props => {
  const config = useConfiguration();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const {
    sectionId,
    className,
    rootClassName,
    defaultClasses,
    appearance,
    title,
    description,
    callToAction,
    staticHighlight,
    options = {},
    allSections = [],
  } = props;

  // Safely extract featuredListings from options
  const { featuredListings } = options;

  // Add fallback values and protection against undefined
  const onFetchFeaturedListings = featuredListings?.onFetchFeaturedListings || (() => {});
  const getListingEntitiesById = featuredListings?.getListingEntitiesById || (() => []);
  const parentPage = featuredListings?.parentPage || 'landing-page';
  const featuredListingData = featuredListings?.featuredListingData || {};

  const listingIds = featuredListingData?.[sectionId]?.listingIds;
  const listingEntities = listingIds ? getListingEntitiesById(listingIds) : [];

  const fetched = featuredListingData?.[sectionId]?.fetched || false;
  const inProgress = featuredListingData?.[sectionId]?.inProgress;
  const error = featuredListingData?.[sectionId]?.error;

  // User-highlighted listings (added via "Destacar Anúncio")
  const userHighlights = useSelector(selectHighlightedListings);

  const [mounted, setMounted] = useState(false);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [selectedDistrict, setSelectedDistrict] = useState(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [minSliderHeight, setMinSliderHeight] = useState(0);
  const [exitingSlideIdx, setExitingSlideIdx] = useState(null);
  const [isAtLastCard, setIsAtLastCard] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [isDescClamped, setIsDescClamped] = useState(false);
  const descriptionRef = useRef(null);
  const totalImages = 4; // Visual pagination within a slide
  const hasRequestedListingsOnce = useRef(false);
  const totalSlidesRef = useRef(1);
  const compactGridRef = useRef(null);
  const autoAdvanceDelay = useRef(7000);
  const autoAdvanceTimer = useRef(null);
  const sliderWrapperRef = useRef(null);
  const prevSlideIdxRef = useRef(null);
  const exitTimerRef = useRef(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!filterOpen) return;
    const handleClickOutside = e => {
      if (filterRef.current && !filterRef.current.contains(e.target)) {
        setFilterOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [filterOpen]);

  useEffect(() => {
    setCurrentSlideIndex(0);
    setCurrentImageIndex(0);
  }, [selectedDistrict]);

  // Measure whether description text is actually clamped (needs "Ler mais" button)
  useEffect(() => {
    const el = descriptionRef.current;
    if (!el) { setIsDescClamped(false); return; }
    setIsDescClamped(el.scrollHeight > el.clientHeight + 1);
  }, [currentSlideIndex, descriptionExpanded]);

  // After each slide change, measure height and keep the maximum so the section never shrinks
  useEffect(() => {
    if (!sliderWrapperRef.current) return;
    const h = sliderWrapperRef.current.offsetHeight;
    if (h > 0) setMinSliderHeight(prev => Math.max(prev, h));
  }, [currentSlideIndex]);

  // Detect slide changes and trigger exit animation on the previous slide
  useEffect(() => {
    if (prevSlideIdxRef.current !== null && prevSlideIdxRef.current !== currentSlideIndex) {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
      setExitingSlideIdx(prevSlideIdxRef.current);
      exitTimerRef.current = setTimeout(() => setExitingSlideIdx(null), 2200);
    }
    prevSlideIdxRef.current = currentSlideIndex;
    setDescriptionExpanded(false);
  }, [currentSlideIndex]);

  // Auto-advance slides (loops). Normally 7s; resets to 20s after a manual arrow click.
  const scheduleAutoAdvance = (delay) => {
    if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current);
    autoAdvanceTimer.current = setTimeout(() => {
      const total = totalSlidesRef.current;
      if (total > 1) {
        setCurrentSlideIndex(i => (i + 1) % total);
        setCurrentImageIndex(0);
      }
      scheduleAutoAdvance(7000);
    }, delay);
  };

  useEffect(() => {
    scheduleAutoAdvance(7000);
    return () => { if (autoAdvanceTimer.current) clearTimeout(autoAdvanceTimer.current); };
  }, []);

  useEffect(() => {
    // One fetch per component mount. The ref prevents loops on re-renders.
    // We intentionally ignore the Redux `fetched` flag so that stale cached
    // entities (e.g. fetched before new fields were added) are always refreshed.
    if (hasRequestedListingsOnce.current) return;
    if (inProgress === true || error || !config || !mounted) return;

    hasRequestedListingsOnce.current = true;
    try {
      const listingImageConfig = config.layout.listingImage;
      if (typeof onFetchFeaturedListings === 'function') {
        onFetchFeaturedListings(sectionId, parentPage, listingImageConfig, allSections);
      }
    } catch (err) {
      console.warn('SectionHighlightedListing: Error fetching featured listings', err);
    }
  }, [inProgress, error, config, sectionId, parentPage, allSections, onFetchFeaturedListings, mounted]);

  useEffect(() => {
    const el = compactGridRef.current;
    if (!el) return;

    const checkScrollEnd = () => {
      const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 10;
      setIsAtLastCard(atEnd);
    };

    el.addEventListener('scroll', checkScrollEnd, { passive: true });
    const t = setTimeout(checkScrollEnd, 150);
    return () => {
      el.removeEventListener('scroll', checkScrollEnd);
      clearTimeout(t);
    };
  }, [mounted]);

  const handleArrowClick = () => {
    const el = compactGridRef.current;
    if (!el) return;
    const firstCard = el.firstElementChild;
    const cardWidth = (firstCard?.offsetWidth || 200) + 12;
    el.scrollBy({ left: cardWidth, behavior: 'smooth' });
  };

  const fieldComponents = options?.fieldComponents;
  const fieldOptions = { fieldComponents };
  const hasHeaderFields = hasDataInFields([title, description, callToAction], fieldOptions);
  const darkMode = appearance?.textColor === 'white';

  if (!mounted) {
    return null;
  }

  // ── Transforma um listing da API no formato dos userHighlights ───────────
  const transformApiListing = l => {
    const attrs = l.attributes || {};
    const publicData = attrs.publicData || {};
    const firstImage = l.images?.[0];
    const variants = firstImage?.attributes?.variants || {};
    const imageUrl =
      variants['listing-card-2x']?.url ||
      variants['listing-card']?.url ||
      Object.values(variants)[0]?.url ||
      null;
    const price = attrs.price;
    const amount = price ? (price.amount / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 }) : null;
    const currency = price?.currency === 'EUR' ? '€' : price?.currency || '';
    const priceFormatted = amount ? `${amount} ${currency}` : null;
    const location = publicData.location?.address || null;
    const category = publicData.categoryLevel1 || null;
    const amenityKeys = publicData.featuredAmenityKeys?.length > 0
      ? publicData.featuredAmenityKeys
      : (config.listing?.listingFields || [])
          .filter(f => f.schemaType === 'multi-enum' && publicData[f.key]?.length > 0)
          .flatMap(f => publicData[f.key] || []);
    const author = l.author?.attributes?.profile;
    const hostName = author?.displayName || author?.firstName || null;
    const hostInitial = hostName ? hostName.charAt(0).toUpperCase() : null;
    return {
      id: l.id?.uuid,
      slug: createSlug(attrs.title || ''),
      title: attrs.title || '',
      description: publicData.featuredDescription || attrs.description || '',
      priceFormatted,
      unitType: publicData.unitType || 'hour',
      location,
      category,
      amenityKeys,
      amenityChips: [],
      imageUrl,
      extraImageUrls: [],
      hostName,
      hostInitial,
      rating: null,
      reviewCount: 0,
    };
  };

  // ── Slides for the desktop slider ─────────────────────────────────────────
  // Use ALL API listings (pub_featured=true) so they show on every device.
  // Supplement missing fields (e.g. description) from localStorage if available.
  const localById = {};
  userHighlights.forEach(h => { localById[h.id] = h; });

  const apiSlidesDesktop = listingEntities.map(l => {
    const transformed = transformApiListing(l);
    const local = localById[transformed.id];
    if (local) {
      if (!transformed.description && local.description) transformed.description = local.description;
      if (!transformed.category && local.category) transformed.category = local.category;
      if (!transformed.amenityKeys?.length && local.amenityKeys?.length) transformed.amenityKeys = local.amenityKeys;
      if (!transformed.amenityChips?.length && local.amenityChips?.length) transformed.amenityChips = local.amenityChips;
    }
    return { type: 'user', data: transformed };
  });

  const apiIds = new Set(apiSlidesDesktop.map(s => s.data.id));
  // Local-only highlights (very recent, not yet reflected in API)
  const userSlides = userHighlights
    .filter(h => !apiIds.has(h.id))
    .map(h => ({ type: 'user', data: h }));
  const combinedSlides = [...apiSlidesDesktop, ...userSlides];
  const allSlides = combinedSlides.length > 0
    ? combinedSlides
    : staticHighlight
    ? [{ type: 'static', data: staticHighlight }]
    : [];

  // ── Cards for the mobile compact grid ─────────────────────────────────────
  const apiSlides = listingEntities.map(l => ({ type: 'api', data: l }));
  const staticSlide = listingEntities.length === 0 && staticHighlight ? [{ type: 'static', data: staticHighlight }] : [];
  const allCards = [...apiSlides, ...userSlides, ...staticSlide];

  // ── Location filter ────────────────────────────────────────────────────────
  // Compute available districts only from districts present in current listings
  const availableDistricts = [...new Set(
    allSlides.map(s => extractDistrict(getSlideLocation(s))).filter(Boolean)
  )].sort();

  // null = "Mais recentes" (top 10, newest); 'Portugal' = all; district name = filtered from all
  const RECENTES_LIMIT = 10;

  const filteredSlides = !selectedDistrict
    ? allSlides.slice(0, RECENTES_LIMIT)
    : selectedDistrict === 'Portugal'
    ? allSlides
    : allSlides.filter(s => extractDistrict(getSlideLocation(s)) === selectedDistrict);

  const filteredCards = !selectedDistrict
    ? allCards.slice(0, RECENTES_LIMIT)
    : selectedDistrict === 'Portugal'
    ? allCards
    : allCards.filter(s => extractDistrict(getSlideLocation(s)) === selectedDistrict);

  const totalSlides = filteredSlides.length;
  totalSlidesRef.current = totalSlides;
  const safeSlideIdx = Math.min(currentSlideIndex, Math.max(0, totalSlides - 1));
  const currentSlide = filteredSlides[safeSlideIdx] || null;

  // ── Desktop slider render helpers ──────────────────────────────────────────
  const renderImage = () => {
    if (currentSlide.type === 'api') {
      return (
        <ListingCard
          className={classNames(css.card)}
          listing={currentSlide.data}
          darkMode={darkMode}
          renderSizes="(max-width: 767px) 100vw, (max-width: 1024px) 50vw, 500px"
        />
      );
    }
    if (currentSlide.type === 'user') {
      const h = currentSlide.data;
      const allImgUrls = [
        ...(h.imageUrl ? [h.imageUrl] : []),
        ...(h.extraImageUrls || []),
      ];
      const imgUrl = allImgUrls[currentImageIndex] || allImgUrls[0] || escritorioImage;
      return (
        <img
          src={imgUrl}
          alt={h.title}
          className={css.highlightedImage}
        />
      );
    }
    // static
    const s = currentSlide.data;
    return (
      <img
        src={s.imageUrl || escritorioImage}
        alt={s.officeName || 'Escritório em destaque'}
        className={css.highlightedImage}
      />
    );
  };

  const renderOverlay = () => {
    if (currentSlide.type === 'api') return null;

    let category = null;
    if (currentSlide.type === 'user') {
      category = currentSlide.data.category || null;
    } else if (currentSlide.type === 'static') {
      category = currentSlide.data.category || null;
    }

    const keyword = getCategoryKeyword(category, isEN);
    const label = isEN ? `Featured ${keyword}` : `${keyword} em Destaque`;

    return (
      <div className={css.imageOverlay}>
        {label}
      </div>
    );
  };

  const renderFavorite = () => {
    const id =
      currentSlide.type === 'api' ? currentSlide.data.id?.uuid
      : currentSlide.type === 'user' ? currentSlide.data.id
      : currentSlide.data.listingId;
    return id ? (
      <div className={css.favoriteButtonWrapper}>
        <FavoriteButton listingId={id} />
      </div>
    ) : null;
  };

  const renderImgCounter = () => {
    const userImgCount = currentSlide.type === 'user'
      ? (currentSlide.data.imageUrl ? 1 : 0) + (currentSlide.data.extraImageUrls?.length || 0)
      : totalImages;
    const imgTotal = userImgCount > 0 ? userImgCount : totalImages;
    return (
      <div className={css.imageNavigation}>
        <button
          className={css.navArrow}
          onClick={() => setCurrentImageIndex(i => Math.max(0, i - 1))}
          disabled={currentImageIndex === 0}
          aria-label="Previous image"
        >‹</button>
        <div className={css.imageCounter}>
          {currentImageIndex + 1} {isEN ? 'of' : 'de'} {imgTotal}
        </div>
        <button
          className={css.navArrow}
          onClick={() => setCurrentImageIndex(i => Math.min(imgTotal - 1, i + 1))}
          disabled={currentImageIndex === imgTotal - 1}
          aria-label="Next image"
        >›</button>
      </div>
    );
  };

  const renderInfo = () => {
    if (currentSlide.type === 'api') {
      const l = currentSlide.data;
      return (
        <div className={css.infoContent}>
          <h3 className={css.listingTitle}>{l.attributes.title}</h3>
          {l.attributes.description && (
            <p className={css.listingDescription}>{l.attributes.description}</p>
          )}
          {l.attributes.price && (
            <div className={css.priceContainer}>
              <span className={css.price}>{l.attributes.price.amount / 100}</span>
              <span className={css.currency}>{l.attributes.price.currency}</span>
            </div>
          )}
          <NamedLink name="ListingPage" params={{ id: l.id.uuid, slug: createSlug(l.attributes.title) }} className={css.viewButton}>
            <FormattedMessage id="SectionHighlightedListing.viewListing" defaultMessage="View Listing" />
          </NamedLink>
        </div>
      );
    }

    if (currentSlide.type === 'user') {
      const h = currentSlide.data;
      const priceFormatted = h.priceFormatted || null;
      const perUnit = h.unitType === 'day' ? (isEN ? '/ day' : '/ dia') : (isEN ? '/ hour' : '/ hora');

      const resolveAmenityLabel = optionKey => {
        for (const f of config.listing.listingFields || []) {
          if (f.schemaType === 'multi-enum') {
            const opt = f.enumOptions?.find(o => o.option === optionKey);
            if (opt) return opt.label;
          }
        }
        return optionKey;
      };
      const displayChips = h.amenityKeys?.length > 0
        ? h.amenityKeys.map(resolveAmenityLabel)
        : isEN
        ? (h.amenityChips || []).map(translateEnumOptionLabel)
        : (h.amenityChips || []);

      return (
        <div className={css.infoContent}>
          <div className={css.userHeaderInfo}>
            <div className={css.ratingBadge}>
              <IconReviewStar
                className={h.rating != null ? css.ratingStarFilled : css.ratingStarEmpty}
                isFilled={h.rating != null}
              />
              <span className={css.ratingValue}>
                {h.rating != null
                  ? `${Number(h.rating).toFixed(1)} (${h.reviewCount} ${h.reviewCount === 1 ? (isEN ? 'review' : 'avaliação') : (isEN ? 'reviews' : 'avaliações')})`
                  : (isEN ? 'No reviews' : 'Sem avaliações')}
              </span>
            </div>
            {h.location && <div className={css.locationBadge}>📍 {h.location}</div>}
          </div>
          <h3 className={css.listingTitle}>{h.title}</h3>
          {displayChips.length > 0 && (
            <div className={css.tagsContainer}>
              {displayChips.map((chip, i) => (
                <span key={i} className={css.tag}>{chip}</span>
              ))}
            </div>
          )}
          {h.description && (
            <div className={css.descriptionWrapper}>
              <p
                ref={descriptionRef}
                className={descriptionExpanded ? css.listingDescriptionFull : css.listingDescriptionClamped}
              >
                {h.description}
              </p>
              {!descriptionExpanded && isDescClamped && (
                <button className={css.readMoreBtn} onClick={() => setDescriptionExpanded(true)}>
                  {isEN ? 'Read more' : 'Ler mais'}
                </button>
              )}
              {descriptionExpanded && (
                <button className={css.readMoreBtn} onClick={() => setDescriptionExpanded(false)}>
                  {isEN ? 'Read less' : 'Ler menos'}
                </button>
              )}
            </div>
          )}
          {priceFormatted && (
            <div className={css.priceContainer}>
              <span className={css.price}>{priceFormatted}</span>
              <span className={css.perUnit}>{perUnit}</span>
            </div>
          )}
          {h.hostName && (
            <div className={css.hostInfo}>
              <div className={css.hostAvatar}>{h.hostInitial}</div>
              <div className={css.hostDetails}>
                <div className={css.hostName}>{h.hostName}</div>
                <div className={css.hostVerified}>
                  ✓ {isEN ? 'Verified host' : 'Anfitrião verificado'}
                </div>
              </div>
            </div>
          )}
          <div className={css.buttonsContainer}>
            <NamedLink
              name="ListingPage"
              params={{ id: h.id, slug: h.slug || 'listing' }}
              to={{ search: '?highlight=booking' }}
              className={css.buttonPrimary}
            >
              {isEN ? 'BOOK NOW' : 'RESERVAR AGORA'}
            </NamedLink>
            <NamedLink
              name="ListingPage"
              params={{ id: h.id, slug: h.slug || 'listing' }}
              className={css.buttonSecondary}
            >
              {isEN ? 'VIEW DETAILS' : 'VER DETALHES'}
            </NamedLink>
          </div>
        </div>
      );
    }

    // static
    const s = currentSlide.data;
    return (
      <div className={css.infoContent}>
        <div className={css.headerInfo}>
          <div className={css.ratingBadge}>
            <IconReviewStar
              className={s.rating != null ? css.ratingStarFilled : css.ratingStarEmpty}
              isFilled={s.rating != null}
            />
            <span className={css.ratingValue}>
              {s.rating != null
                ? `${s.rating}${s.reviewCount ? ` (${s.reviewCount} ${s.reviewCount === 1 ? (isEN ? 'review' : 'avaliação') : (isEN ? 'reviews' : 'avaliações')})` : ''}`
                : (isEN ? 'No reviews' : 'Sem avaliações')}
            </span>
          </div>
          {s.location && <div className={css.locationBadge}>📍 {s.location}</div>}
        </div>
        <h3 className={css.listingTitle}>{s.officeName}</h3>
        {s.features?.length > 0 && (
          <div className={css.tagsContainer}>
            {s.features.map((f, i) => <span key={i} className={css.tag}>{f}</span>)}
          </div>
        )}
        {s.officeDescription && <p className={css.listingDescription}>{s.officeDescription}</p>}
        <div className={css.priceContainer}>
          <span className={css.price}>{s.price}</span>
        </div>
        {s.hostName && (
          <div className={css.hostInfo}>
            <div className={css.hostAvatar}>{s.hostName.charAt(0).toUpperCase()}</div>
            <div className={css.hostDetails}>
              <div className={css.hostName}>{s.hostName}</div>
              {s.hostVerified && <div className={css.hostVerified}>✓ {isEN ? 'Verified host - responds within 1h' : s.hostVerified}</div>}
            </div>
          </div>
        )}
        <div className={css.buttonsContainer}>
          {s.listingId ? (
            <NamedLink name="ListingPage" params={{ id: s.listingId, slug: s.listingSlug || 'listing' }} className={css.buttonPrimary}>
              {isEN ? 'BOOK NOW' : (s.reserveLabel || 'RESERVAR AGORA')}
            </NamedLink>
          ) : (
            <a href={s.listingPageLink || '#'} className={css.buttonPrimary}>
              {isEN ? 'BOOK NOW' : (s.reserveLabel || 'RESERVAR AGORA')}
            </a>
          )}
          {s.listingId ? (
            <NamedLink name="ListingPage" params={{ id: s.listingId, slug: s.listingSlug || 'listing' }} className={css.buttonSecondary}>
              {isEN ? 'VIEW DETAILS' : (callToAction?.label || 'VER DETALHES')}
            </NamedLink>
          ) : (
            <a href={s.listingPageLink || '#'} className={css.buttonSecondary}>
              {isEN ? 'VIEW DETAILS' : (callToAction?.label || 'VER DETALHES')}
            </a>
          )}
        </div>
      </div>
    );
  };

  // ── Mobile compact grid render ─────────────────────────────────────────────
  const renderCompactCard = (slide, key) => {
    if (slide.type === 'api') {
      const l = slide.data;
      const firstImage = l?.images?.[0] || null;
      const { variantPrefix = 'listing-card' } = config.layout.listingImage;
      const variants = firstImage?.attributes?.variants
        ? Object.keys(firstImage.attributes.variants).filter(k => k.startsWith(variantPrefix))
        : [];
      const id = l?.id?.uuid;
      const t = l?.attributes?.title || '';
      const price = l?.attributes?.price;
      const priceStr = price ? `${(price.amount / 100).toLocaleString('pt-PT', { minimumFractionDigits: 2 })} ${price.currency}` : null;
      const unitType = l?.attributes?.publicData?.unitType;
      const perUnit = unitType === 'hour' ? (isEN ? '/ hour' : '/ hora') : (isEN ? '/ day' : '/ dia');
      const loc = l?.attributes?.publicData?.location?.address || l?.attributes?.publicData?.city || null;
      const slug = t.toLowerCase().replace(/\s+/g, '-');

      return (
        <NamedLink key={key} name="ListingPage" params={{ id, slug }} className={css.compactCard}>
          <div className={css.compactImageWrapper}>
            {firstImage
              ? <ResponsiveImage rootClassName={css.compactImage} alt={t} image={firstImage} variants={variants} sizes="(max-width: 767px) 45vw, 200px" />
              : <div className={css.compactImagePlaceholder} />
            }
            <div className={css.compactFavorite}><FavoriteButton listingId={id} /></div>
          </div>
          <div className={css.compactInfo}>
            {loc && <div className={css.compactLocation}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0, fill: '#e53935' }}><path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              {loc}
            </div>}
            <div className={css.compactTitle}>{t}</div>
            {priceStr && <div className={css.compactPrice}>{priceStr} <span className={css.compactPerUnit}>{perUnit}</span></div>}
          </div>
        </NamedLink>
      );
    }

    if (slide.type === 'user') {
      const h = slide.data;
      const imgUrl = h.imageUrl || escritorioImage;
      const linkParams = { id: h.id, slug: h.slug || 'listing' };
      return (
        <NamedLink key={key} name="ListingPage" params={linkParams} className={css.compactCard}>
          <div className={css.compactImageWrapper}>
            <img src={imgUrl} alt={h.title} className={css.compactImage} />
            {h.id && <div className={css.compactFavorite}><FavoriteButton listingId={h.id} /></div>}
          </div>
          <div className={css.compactInfo}>
            {h.location && <div className={css.compactLocation}>
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0, fill: '#e53935' }}><path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
              {h.location}
            </div>}
            <div className={css.compactTitle}>{h.title}</div>
            {h.priceFormatted && <div className={css.compactPrice}>{h.priceFormatted} <span className={css.compactPerUnit}>{isEN ? '/ hour' : '/ hora'}</span></div>}
          </div>
        </NamedLink>
      );
    }

    // static
    const s = slide.data;
    const linkParams = s.listingId
      ? { id: s.listingId, slug: s.listingSlug || 'listing' }
      : { id: 'example', slug: 'listing' };
    return (
      <NamedLink key={key} name="ListingPage" params={linkParams} className={css.compactCard}>
        <div className={css.compactImageWrapper}>
          <img src={s.imageUrl || escritorioImage} alt={s.officeName} className={css.compactImage} />
          {s.listingId && <div className={css.compactFavorite}><FavoriteButton listingId={s.listingId} /></div>}
        </div>
        <div className={css.compactInfo}>
          {s.location && <div className={css.compactLocation}>
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="12" height="12" style={{ flexShrink: 0, fill: '#e53935' }}><path fill="#e53935" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
            {s.location}
          </div>}
          <div className={css.compactTitle}>{s.officeName}</div>
          {s.price && <div className={css.compactPrice}>{s.price}</div>}
        </div>
      </NamedLink>
    );
  };

  return (
    <SectionContainer
      id={sectionId}
      className={className}
      rootClassName={rootClassName}
      appearance={appearance}
    >
      <header className={css.sectionHeader}>
        <h2 className={css.sectionTitle}>{isEN ? 'Featured Listings' : 'Anúncios em Destaque'}</h2>
        <hr className={css.sectionDivider} />
      </header>

      {/* ── Location filter ───────────────────────────────────────────── */}
      {availableDistricts.length > 0 && (
        <div className={css.filterRow}>
          <span className={css.filterRowLabel}>
            {isEN ? 'Browse featured listings by region:' : 'Veja os Destaques de uma região:'}
          </span>
          <div className={css.filterContainer} ref={filterRef}>
            <button
              className={css.filterButton}
              onClick={() => setFilterOpen(f => !f)}
              aria-expanded={filterOpen}
            >
              <span className={css.filterPin}>📍</span>
              <span className={css.filterLabel}>
                {!selectedDistrict
                  ? (isEN ? 'Most recent' : 'Mais recentes')
                  : selectedDistrict === 'Portugal'
                  ? 'Portugal'
                  : selectedDistrict}
              </span>
              <span className={css.filterChevron}>{filterOpen ? '▲' : '▼'}</span>
            </button>
            {filterOpen && (
              <div className={css.filterDropdown}>
                {selectedDistrict !== null && (
                  <button
                    className={css.filterOption}
                    onClick={() => { setSelectedDistrict(null); setFilterOpen(false); }}
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#BAA38A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, verticalAlign: 'middle', marginRight: 2 }}>
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {isEN ? 'Most recent' : 'Mais recentes'}
                  </button>
                )}
                <button
                  className={classNames(css.filterOption, selectedDistrict === 'Portugal' && css.filterOptionActive)}
                  onClick={() => { setSelectedDistrict('Portugal'); setFilterOpen(false); }}
                >
                  🇵🇹 Portugal
                </button>
                {availableDistricts.map(district => (
                  <button
                    key={district}
                    className={classNames(css.filterOption, selectedDistrict === district && css.filterOptionActive)}
                    onClick={() => { setSelectedDistrict(district); setFilterOpen(false); }}
                  >
                    📍 {district}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Desktop: original slider layout ─────────────────────────── */}
      <div className={css.highlightedContainer}>
        {inProgress && <IconSpinner className={css.centeredContent} />}
        {error && (
          <div className={css.centeredMessageContainer} role="alert">
            <h4 className={css.genericErrorTitle}>
              <FormattedMessage id="SectionListings.genericErrorTitle" />
            </h4>
            <ErrorMessage error={error} />
          </div>
        )}
        {!inProgress && !error && currentSlide && (
          <div
            className={css.sliderWrapper}
            ref={sliderWrapperRef}
            style={minSliderHeight > 0 ? { minHeight: minSliderHeight } : undefined}
          >
            <button
              className={css.outerArrow}
              aria-label="Previous listing"
              onClick={() => {
                setCurrentSlideIndex(i => (i - 1 + totalSlides) % totalSlides);
                setCurrentImageIndex(0);
                scheduleAutoAdvance(20000);
              }}
            >
              &#8249;
            </button>
            <div className={css.contentWrapper}>
              <div className={css.imageWrapper}>
                {renderImage()}
                {renderOverlay()}
                {renderFavorite()}
                {renderImgCounter()}
              </div>
              <div className={css.infoWrapper}>
                {renderInfo()}
              </div>
            </div>
            <button
              className={css.outerArrow}
              aria-label="Next listing"
              onClick={() => {
                setCurrentSlideIndex(i => (i + 1) % totalSlides);
                setCurrentImageIndex(0);
                scheduleAutoAdvance(20000);
              }}
            >
              &#8250;
            </button>
          </div>
        )}
        {!inProgress && !error && !currentSlide && fetched && (
          <div className={css.centeredMessageContainer} role="status">
            <p className={css.noListingsFound}><FormattedMessage id="SectionListings.noListingsFoundInfo" /></p>
            <NamedLink name="SearchPage" className={css.ctaButton}><FormattedMessage id="SectionListings.noListingsFoundCTA" /></NamedLink>
          </div>
        )}
      </div>

      {/* ── Desktop: "Veja mais anúncios" link ─────────────────────── */}
      <div className={css.verMaisDesktopRow}>
        <NamedLink name="SearchPage" className={css.verMaisDesktopLink}>
          {isEN ? 'See more listings' : 'Veja mais anúncios'}
        </NamedLink>
      </div>

      {/* ── Mobile: compact grid layout ─────────────────────────────── */}
      <div className={css.compactGrid} ref={compactGridRef}>
        {inProgress && <IconSpinner className={css.centeredContent} />}
        {error && (
          <div className={css.centeredMessageContainer} role="alert">
            <ErrorMessage error={error} />
          </div>
        )}
        {!inProgress && !error && filteredCards.length === 0 && fetched && (
          <div className={css.centeredMessageContainer} role="status">
            <p className={css.noListingsFound}><FormattedMessage id="SectionListings.noListingsFoundInfo" /></p>
            <NamedLink name="SearchPage" className={css.ctaButton}><FormattedMessage id="SectionListings.noListingsFoundCTA" /></NamedLink>
          </div>
        )}
        {filteredCards.map((slide, i) => renderCompactCard(slide, i))}
      </div>

      <div className={css.moreRow}>
        <div className={css.moreLinkWrapper}>
          {isAtLastCard && (
            <NamedLink name="SearchPage" className={css.verMaisText}>
              ver mais
            </NamedLink>
          )}
          {isAtLastCard ? (
            <NamedLink name="SearchPage" className={css.moreLink}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </NamedLink>
          ) : (
            <button className={css.moreLink} onClick={handleArrowClick} aria-label="Ver próximos anúncios">
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="5" y1="12" x2="19" y2="12" />
                <polyline points="12 5 19 12 12 19" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </SectionContainer>
  );
};

export default SectionHighlightedListing;
