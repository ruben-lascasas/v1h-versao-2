import React, { useState, useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useLocale } from '../../../../context/localeContext';
import IconSearchDesktop from '../TopbarSearchForm/IconSearchDesktop';
import { createSlug } from '../../../../util/urlHelpers';
import slide1Image from '../../../../assets/images/1.png';
import slide2Image from '../../../../assets/images/12.png';
import slide3Image from '../../../../assets/images/3.jpg';
import slide4Image from '../../../../assets/images/4.jpg';
import slide5Image from '../../../../assets/images/5.jpg';
import css from './MobileSearchCard.module.css';

// Mirror of getImageUrl() in SectionHero — picks the largest variant URL from
// a Sharetribe image asset so we can show the CMS hero image on mobile too.
const getCmsImageUrl = imageAsset => {
  if (!imageAsset) return null;
  const variants = imageAsset?.attributes?.variants || {};
  const preferred = ['scaled-xlarge', 'scaled-large', 'scaled-2400', 'scaled-1200', 'scaled-800'];
  for (const key of preferred) {
    if (variants[key]?.url) return variants[key].url;
  }
  const keys = Object.keys(variants);
  return keys.length > 0 ? variants[keys[0]]?.url || null : null;
};

// Walks the landing-page asset Redux state and returns the CMS hero image URL.
const selectHeroBgUrl = state => {
  const sections = state?.hostedAssets?.pageAssetsData?.landingPage?.data?.sections;
  if (!Array.isArray(sections)) return null;
  const heroSection = sections.find(s => s?.sectionType === 'hero');
  return getCmsImageUrl(heroSection?.appearance?.backgroundImage);
};

// Mobile promo image order is aligned with the desktop hero slideshow so
// mobile slide N shows the same image as desktop slide N. Desktop order:
// 0:1.png (search/intro), 1:12.png, 2:hero CMS (proxied here with 1.png),
// 3:3.jpg, 4:4.jpg, 5:5.jpg.
const PROMO_SLIDES_PT = [
  {
    image: slide2Image,
    title: 'Espaços livres? Nós temos quem os queira usar!',
    description: 'Tem um espaço que merece mais? Transforme-o em fonte de rendimento.',
    ctaLabel: 'ARRENDAR ESPAÇO',
    href: '/l/new',
  },
  {
    image: slide1Image,
    useHeroCms: true,
    title: 'Publique o seu anúncio em minutos',
    description: 'Adicione fotos, descrição e disponibilidade. Simples e rápido.',
    ctaLabel: 'SEJA DESCOBERTO',
    href: '#espacos-disponiveis',
  },
  {
    image: slide3Image,
    title: 'Receba reservas diretamente',
    description: 'Comunique com os clientes e gerirá tudo na sua caixa de entrada.',
    ctaLabel: 'CAIXA DE ENTRADA',
    href: '/inbox',
  },
  {
    image: slide4Image,
    title: 'Reservas e Pagamentos seguros',
    description: 'Receba o pagamento sem complicações através da plataforma.',
    ctaLabel: 'SAIBA MAIS',
    href: '/terms-of-service',
  },
  {
    image: slide5Image,
    title: 'Confiança e Proteção',
    description: 'A V1H protege ambas as partes em cada reserva.',
    ctaLabel: 'A NOSSA PROTEÇÃO',
    href: '/terms-of-service',
  },
];

const PROMO_SLIDES_EN = [
  {
    image: slide2Image,
    title: 'Empty spaces? We have people who want to use them!',
    description: 'Have a space that deserves more? Turn it into a source of income.',
    ctaLabel: 'LIST YOUR SPACE',
    href: '/l/new',
  },
  {
    image: slide1Image,
    useHeroCms: true,
    title: 'Publish your listing in minutes',
    description: 'Add photos, description and availability. Simple and fast.',
    ctaLabel: 'GET DISCOVERED',
    href: '#espacos-disponiveis',
  },
  {
    image: slide3Image,
    title: 'Receive bookings directly',
    description: 'Communicate with clients and manage everything in your inbox.',
    ctaLabel: 'INBOX',
    href: '/inbox',
  },
  {
    image: slide4Image,
    title: 'Secure bookings and payments',
    description: 'Receive payment hassle-free through the platform.',
    ctaLabel: 'LEARN MORE',
    href: '/terms-of-service',
  },
  {
    image: slide5Image,
    title: 'Trust & Protection',
    description: 'V1H protects both parties in every booking.',
    ctaLabel: 'OUR PROTECTION',
    href: '/terms-of-service',
  },
];

const CATEGORIES_PT = [
  { label: 'Trabalho & Reuniões', slug: 'trabalho-reunioes' },
  { label: 'Eventos & Festas',    slug: 'eventos-festas' },
  { label: 'Gastronomia',         slug: 'gastronomia-convivio' },
  { label: 'Criatividade',        slug: 'criatividade-producao' },
  { label: 'Educação & Cultura',  slug: 'educacao-cultura' },
  { label: 'Saúde & Bem-estar',   slug: 'saude-bemestar' },
  { label: 'Desporto',            slug: 'desporto-actividadefisica' },
  { label: 'Ao Ar Livre',         slug: 'espaco-arlivre' },
  { label: 'Espaços Inusitados',  slug: 'espacos_inusitados_alternativos' },
];

const CATEGORIES_EN = [
  { label: 'Work & Meetings',     slug: 'trabalho-reunioes' },
  { label: 'Events & Parties',    slug: 'eventos-festas' },
  { label: 'Gastronomy',          slug: 'gastronomia-convivio' },
  { label: 'Creativity',          slug: 'criatividade-producao' },
  { label: 'Education & Culture', slug: 'educacao-cultura' },
  { label: 'Health & Wellness',   slug: 'saude-bemestar' },
  { label: 'Sports',              slug: 'desporto-actividadefisica' },
  { label: 'Outdoors',            slug: 'espaco-arlivre' },
  { label: 'Unusual Spaces',      slug: 'espacos_inusitados_alternativos' },
];

const UNIT_TYPES_PT = [
  { label: 'Por hora', value: 'hour' },
  { label: 'Por dia',  value: 'day'  },
];

const UNIT_TYPES_EN = [
  { label: 'Per hour', value: 'hour' },
  { label: 'Per day',  value: 'day'  },
];

const DISTANCE_OPTIONS = [5, 10, 25, 50];
const PORTUGAL_CENTER  = { lat: 39.6, lng: -8.0 };
const MAPBOX_TOKEN     = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;

const kmToDeg = km => km / 111;

// ── Mapa interativo ──────────────────────────────────────────
const GeoMap = ({ coords, locations = [], zoom = 13, showUserMarker = true, bbox = null }) => {
  const containerRef   = useRef(null);
  const mapRef         = useRef(null);
  const listingMarkers = useRef([]);
  const history        = useHistory();

  useEffect(() => {
    const mapboxgl = window.mapboxgl;
    if (!mapboxgl || !containerRef.current) return;

    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [coords.lng, coords.lat],
      zoom,
      scrollZoom: false,
    });
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-left');

    if (showUserMarker) {
      new mapboxgl.Marker({ color: '#5C3317' })
        .setLngLat([coords.lng, coords.lat])
        .addTo(map);
    }

    // Se tiver bbox, ajusta o zoom ao distrito após carregar
    if (bbox) {
      map.on('load', () => {
        map.fitBounds(
          [[bbox[0], bbox[1]], [bbox[2], bbox[3]]],
          { padding: 30, maxZoom: 13 }
        );
      });
    }

    mapRef.current = map;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => { if (mapRef.current) mapRef.current.resize(); });
    });

    return () => {
      listingMarkers.current.forEach(m => m.remove());
      listingMarkers.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
    };
  }, [coords.lat, coords.lng, zoom, showUserMarker, bbox]);

  useEffect(() => {
    const mapboxgl = window.mapboxgl;
    if (!mapboxgl || !mapRef.current) return;

    const addMarkers = () => {
      listingMarkers.current.forEach(m => m.remove());
      listingMarkers.current = [];
      locations.forEach(loc => {
        if (loc?.lat == null || loc?.lng == null) return;
        const m = new mapboxgl.Marker({ color: '#BAA38A' })
          .setLngLat([loc.lng, loc.lat])
          .addTo(mapRef.current);
        if (loc.id && loc.slug) {
          const el = m.getElement();
          el.style.cursor = 'pointer';
          el.addEventListener('click', () => history.push(`/l/${loc.slug}/${loc.id}`));
        }
        listingMarkers.current.push(m);
      });
    };

    if (mapRef.current.loaded()) {
      addMarkers();
    } else {
      mapRef.current.once('load', addMarkers);
    }
  }, [locations]);

  return (
    <div className={css.mapSection}>
      <div ref={containerRef} className={css.mapContainer} />
    </div>
  );
};

// ── Componente principal ─────────────────────────────────────
const PinIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <path fill="#e53e3e" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

const MapIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <polygon
      points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21 3 6"
      fill="#ffffff"
      stroke="#2563eb"
      strokeWidth="2"
      strokeLinejoin="round"
    />
    <line x1="9" y1="3" x2="9" y2="18" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
    <line x1="15" y1="6" x2="15" y2="21" stroke="#2563eb" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const MobileSearchCard = () => {
  const history  = useHistory();
  const dispatch = useDispatch();
  const heroCmsUrl = useSelector(selectHeroBgUrl);
  const { locale } = useLocale();
  const isPt = locale !== 'en';
  const PROMO_SLIDES = isPt ? PROMO_SLIDES_PT : PROMO_SLIDES_EN;
  const CATEGORIES   = isPt ? CATEGORIES_PT   : CATEGORIES_EN;
  const UNIT_TYPES   = isPt ? UNIT_TYPES_PT   : UNIT_TYPES_EN;

  const [locationValue,      setLocationValue]      = useState('');
  const [suggestions,        setSuggestions]        = useState([]);
  const [selectedLocation,   setSelectedLocation]   = useState(null);
  const [selectedCategory,   setSelectedCategory]   = useState(null);
  const [selectedUnitType,   setSelectedUnitType]   = useState(null);
  const [geoCoords,          setGeoCoords]          = useState(null);
  const [geoLoading,         setGeoLoading]         = useState(false);
  const [geoDenied,          setGeoDenied]          = useState(false);
  const [selectedDistance,   setSelectedDistance]   = useState(25);
  const [listingCount,       setListingCount]       = useState(null);
  const [listingLocations,   setListingLocations]   = useState([]);
  const [countLoading,       setCountLoading]       = useState(false);
  const [showPortugalMap,    setShowPortugalMap]    = useState(false);
  const [portugaleLocations, setPortugaleLocations] = useState([]);

  // ── Carrossel: slide 0 = pesquisa, slides 1..N = promo ──────
  const TOTAL_SLIDES = 1 + PROMO_SLIDES.length;
  const [currentSlide, setCurrentSlide] = useState(0);
  const touchStartXRef = useRef(null);
  const touchDeltaRef = useRef(0);
  const trackRef = useRef(null);
  const carouselRef = useRef(null);

  const applyTransform = (slideIdx, deltaPx, withTransition) => {
    const track = trackRef.current;
    const carousel = carouselRef.current;
    if (!track || !carousel) return;
    const width = carousel.offsetWidth || 1;
    const offsetPercent = (deltaPx / width) * 100;
    track.style.transition = withTransition ? 'transform 0.35s ease' : 'none';
    track.style.transform = `translateX(calc(-${slideIdx * 100}% + ${offsetPercent}%))`;
  };

  // True when the touch started inside a horizontally-scrollable region (e.g. the
  // `.chips` rows). In that case we let the inner element scroll and skip the
  // carousel swipe entirely so the user can drag chips without flipping slide.
  const isScrollableTargetRef = useRef(false);

  const startedInsideScrollable = target => {
    if (!target || !target.closest) return false;
    // Touches that begin inside the embedded Mapbox map should pan the map,
    // not swipe the carousel — otherwise activating "Mapa Inteiro" and
    // dragging would jump to the next slide.
    const mapEl = target.closest(
      '.mapboxgl-map, .mapboxgl-canvas-container, .mapboxgl-canvas, [class*="mapSection"]'
    );
    if (mapEl) return true;
    const chipsClass = (css && css.chips) || 'chips';
    const chipsEl = target.closest(`.${chipsClass}, [class*="chips"]`);
    if (!chipsEl) return false;
    // Only block carousel swipe when the chips row actually overflows its
    // container — if the chips fit on one row there's nothing to scroll, so the
    // user can keep swiping to change slide as expected.
    return chipsEl.scrollWidth > chipsEl.clientWidth + 1;
  };

  const onTouchStart = e => {
    if (startedInsideScrollable(e.target)) {
      isScrollableTargetRef.current = true;
      touchStartXRef.current = null;
      return;
    }
    isScrollableTargetRef.current = false;
    touchStartXRef.current = e.touches[0].clientX;
    touchDeltaRef.current = 0;
  };
  const onTouchMove = e => {
    if (isScrollableTargetRef.current) return;
    if (touchStartXRef.current == null) return;
    touchDeltaRef.current = e.touches[0].clientX - touchStartXRef.current;
    applyTransform(currentSlide, touchDeltaRef.current, false);
  };
  const onTouchEnd = () => {
    if (isScrollableTargetRef.current) {
      isScrollableTargetRef.current = false;
      return;
    }
    const delta = touchDeltaRef.current;
    const threshold = 50;
    let next = currentSlide;
    if (delta < -threshold && currentSlide < TOTAL_SLIDES - 1) {
      next = currentSlide + 1;
    } else if (delta > threshold && currentSlide > 0) {
      next = currentSlide - 1;
    }
    applyTransform(next, 0, true);
    if (next !== currentSlide) setCurrentSlide(next);
    touchStartXRef.current = null;
    touchDeltaRef.current = 0;
  };

  const handlePromoClick = href => {
    if (!href) return;
    if (href.startsWith('#')) {
      const el = document.querySelector(href);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
    } else {
      history.push(href);
    }
  };

  const debounceRef         = useRef(null);
  const geocodeDebounceRef  = useRef(null);
  const portugaleDebounceRef = useRef(null);

  // ── Geocoding (sugestões de localização) ─────────────────────
  useEffect(() => {
    clearTimeout(geocodeDebounceRef.current);

    if (locationValue.length < 2 || selectedLocation) {
      setSuggestions([]);
      return;
    }

    geocodeDebounceRef.current = setTimeout(async () => {
      try {
        const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationValue)}.json?access_token=${MAPBOX_TOKEN}&country=pt&types=region,district&language=pt&limit=5`;
        const res  = await fetch(url);
        const data = await res.json();
        setSuggestions(data.features || []);
      } catch {
        setSuggestions([]);
      }
    }, 300);

    return () => clearTimeout(geocodeDebounceRef.current);
  }, [locationValue, selectedLocation]);

  // ── Fetch anúncios (count + localizações) ────────────────────
  useEffect(() => {
    const hasGeoFilter = selectedCategory || selectedUnitType || geoCoords || selectedLocation;
    if (!hasGeoFilter) {
      setListingCount(null);
      setListingLocations([]);
      return;
    }

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setCountLoading(true);
      try {
        // Pull a bigger page when unitType is set so client-side filtering has
        // a representative sample to count from. Sharetribe doesn't index
        // `publicData.unitType`, so it's filtered locally — same as SearchPage.
        const params = {
          perPage: selectedUnitType ? 100 : 50,
          page: 1,
          minStock: 1,
          stockMode: 'match-undefined',
        };
        if (selectedCategory)  params.pub_categoryLevel1 = selectedCategory;

        if (geoCoords) {
          const d    = kmToDeg(selectedDistance);
          const lngD = d / Math.cos((geoCoords.lat * Math.PI) / 180);
          params.origin = `${geoCoords.lat},${geoCoords.lng}`;
          params.bounds = [
            geoCoords.lat + d, geoCoords.lng + lngD,
            geoCoords.lat - d, geoCoords.lng - lngD,
          ].join(',');
        } else if (selectedLocation?.bbox) {
          const [west, south, east, north] = selectedLocation.bbox;
          params.bounds = `${north},${east},${south},${west}`;
        }

        const response = await dispatch((d, getState, sdk) => sdk.listings.query(params));
        const rawItems = response?.data?.data ?? [];
        const items = selectedUnitType
          ? rawItems.filter(l => l?.attributes?.publicData?.unitType === selectedUnitType)
          : rawItems;

        // When filtering by unitType, the API totalItems counts every match for
        // the other filters — not the unitType subset — so use the local count.
        setListingCount(
          selectedUnitType
            ? items.length
            : response?.data?.meta?.totalItems ?? 0
        );
        setListingLocations(
          items
            .map(l => {
              const geo = l.attributes?.geolocation;
              if (!geo?.lat || !geo?.lng) return null;
              return { lat: geo.lat, lng: geo.lng, id: l.id?.uuid, slug: createSlug(l.attributes?.title || '') };
            })
            .filter(Boolean)
        );
      } catch {
        setListingCount(null);
        setListingLocations([]);
      } finally {
        setCountLoading(false);
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [selectedCategory, selectedUnitType, geoCoords, selectedDistance, selectedLocation, dispatch]);

  // ── Fetch anúncios para Mapa Inteiro ─────────────────────────
  useEffect(() => {
    if (!showPortugalMap) {
      setPortugaleLocations([]);
      return;
    }

    clearTimeout(portugaleDebounceRef.current);
    portugaleDebounceRef.current = setTimeout(async () => {
      try {
        const params = { perPage: 100, page: 1, minStock: 1, stockMode: 'match-undefined' };
        if (selectedCategory) params.pub_categoryLevel1 = selectedCategory;
        // unitType is filtered client-side (same as SearchPage) — Sharetribe
        // doesn't index publicData.unitType.

        const response = await dispatch((d, getState, sdk) => sdk.listings.query(params));
        const rawItems = response?.data?.data ?? [];
        const items = selectedUnitType
          ? rawItems.filter(l => l?.attributes?.publicData?.unitType === selectedUnitType)
          : rawItems;
        setPortugaleLocations(
          items
            .map(l => {
              const geo = l.attributes?.geolocation;
              if (!geo?.lat || !geo?.lng) return null;
              return { lat: geo.lat, lng: geo.lng, id: l.id?.uuid, slug: createSlug(l.attributes?.title || '') };
            })
            .filter(Boolean)
        );
      } catch {
        setPortugaleLocations([]);
      }
    }, 400);

    return () => clearTimeout(portugaleDebounceRef.current);
  }, [showPortugalMap, selectedCategory, selectedUnitType, dispatch]);

  // ── Geolocation ──────────────────────────────────────────────
  const handleUseMyLocation = () => {
    if (!navigator.geolocation) return;
    setGeoLoading(true);
    setGeoDenied(false);
    setShowPortugalMap(false);
    setSelectedLocation(null);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setGeoCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoLoading(false);
      },
      err => {
        setGeoLoading(false);
        if (err.code === 1) setGeoDenied(true);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
    );
  };

  const handleShowPortugalMap = () => {
    setGeoCoords(null);
    setSelectedLocation(null);
    setShowPortugalMap(true);
  };

  const handleSelectSuggestion = feature => {
    const [lng, lat] = feature.center;
    const bbox       = feature.bbox || null;
    setSelectedLocation({ lat, lng, bbox, name: feature.place_name });
    setLocationValue(feature.text);
    setSuggestions([]);
    setGeoCoords(null);
    setShowPortugalMap(false);
  };

  // ── Submit ───────────────────────────────────────────────────
  const handleSubmit = async e => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (selectedCategory) params.set('pub_categoryLevel1', selectedCategory);
    // SearchPage parses `unitType` (not `pub_unitType`) and applies it as a
    // client-side filter, so use the same param name when navigating across.
    if (selectedUnitType) params.set('unitType', selectedUnitType);

    if (geoCoords) {
      params.set('origin', `${geoCoords.lat},${geoCoords.lng}`);
      const d    = kmToDeg(selectedDistance);
      const lngD = d / Math.cos((geoCoords.lat * Math.PI) / 180);
      params.set('bounds', [geoCoords.lat + d, geoCoords.lng + lngD, geoCoords.lat - d, geoCoords.lng - lngD].join(','));
    } else if (selectedLocation?.bbox) {
      const [west, south, east, north] = selectedLocation.bbox;
      params.set('bounds', `${north},${east},${south},${west}`);
    } else if (locationValue.trim()) {
      // Usa sugestão já carregada ou faz geocoding imediato ao nome escrito
      let feature = suggestions[0] || null;
      if (!feature) {
        try {
          const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(locationValue.trim())}.json?access_token=${MAPBOX_TOKEN}&country=pt&types=region,district&language=pt&limit=1`;
          const res  = await fetch(url);
          const data = await res.json();
          feature = data.features?.[0] || null;
        } catch {
          feature = null;
        }
      }
      if (feature?.bbox) {
        const [west, south, east, north] = feature.bbox;
        params.set('bounds', `${north},${east},${south},${west}`);
      } else {
        params.set('keywords', locationValue.trim());
      }
    }

    history.push(`/s${params.toString() ? '?' + params.toString() : ''}`);
  };

  const visibleCategories = selectedCategory
    ? CATEGORIES.filter(c => c.slug === selectedCategory)
    : CATEGORIES;

  const activeMap  = geoCoords ? 'geo' : selectedLocation ? 'location' : showPortugalMap ? 'portugal' : null;
  const hasFilters = selectedCategory || selectedUnitType || geoCoords || selectedLocation;

  return (
    <div className={css.wrapper}>
      <div
        className={css.carousel}
        ref={carouselRef}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div
          className={css.carouselTrack}
          ref={trackRef}
          style={{ transform: `translateX(-${currentSlide * 100}%)` }}
        >
          <div className={css.carouselSlide}>
      <form className={css.card} onSubmit={handleSubmit}>

        {/* ── 1. Barra de pesquisa com autocomplete ────────── */}
        <div className={css.searchRow}>
          <div className={css.searchGroup}>
            <span className={css.searchIcon}><IconSearchDesktop /></span>
            <div className={css.searchInputWrap}>
              <input
                className={css.searchInput}
                type="text"
                placeholder={isPt ? 'Em que distrito?' : 'Which district?'}
                value={locationValue}
                size={Math.max((locationValue || (isPt ? 'Em que distrito?' : 'Which district?')).length, 5)}
                onChange={e => {
                  setLocationValue(e.target.value);
                  if (selectedLocation) setSelectedLocation(null);
                }}
                autoComplete="off"
              />
              {suggestions.length > 0 && (
                <ul className={css.suggestions}>
                  {suggestions.map(f => (
                    <li
                      key={f.id}
                      className={css.suggestionItem}
                      onMouseDown={() => handleSelectSuggestion(f)}
                    >
                      <span className={css.suggestionIcon}><PinIcon size={16} /></span>
                      <div className={css.suggestionText}>
                        <span className={css.suggestionMain}>{f.text}</span>
                        <span className={css.suggestionSub}>{f.place_name.replace(f.text + ', ', '')}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className={css.divider} />

        {/* ── 2. Geolocalização + Mapa Inteiro ─────────────── */}
        <div className={css.geoRow}>
          {activeMap === 'geo' ? (
            <div className={css.geoActive}>
              <PinIcon />
              <span className={css.geoActiveText}>{isPt ? 'A mostrar opções perto de ti' : 'Showing options near you'}</span>
              <button type="button" className={css.geoClear} onClick={() => setGeoCoords(null)}>✕</button>
            </div>
          ) : activeMap === 'portugal' ? (
            <div className={css.geoActive}>
              <MapIcon />
              <span className={css.geoActiveText}>{isPt ? 'A mostrar espaços em Portugal' : 'Showing spaces in Portugal'}</span>
              <button type="button" className={css.geoClear} onClick={() => setShowPortugalMap(false)}>✕</button>
            </div>
          ) : (
            <>
              <button type="button" className={css.geoBtn} onClick={handleUseMyLocation} disabled={geoLoading}>
                <PinIcon />
                <span>{geoLoading ? (isPt ? 'A obter localização…' : 'Getting location…') : (isPt ? 'Usar minha localização' : 'Use my location')}</span>
              </button>
              {geoDenied && (
                <p className={css.geoDeniedHint}>
                  {isPt
                    ? <>Permissão bloqueada. Abre as definições do browser, vai a <strong>Privacidade → Localização</strong> e permite para este site.</>
                    : <>Permission blocked. Open browser settings, go to <strong>Privacy → Location</strong> and allow this site.</>}
                </p>
              )}
              <button type="button" className={css.geoBtnPortugal} onClick={handleShowPortugalMap}>
                <MapIcon />
                <span>{isPt ? 'Mapa Inteiro' : 'Full Map'}</span>
              </button>
            </>
          )}
        </div>

        {/* ── 2b. Distância (só quando geo ativa) ──────────── */}
        {geoCoords && (
          <>
            <div className={css.divider} />
            <div className={css.section}>
              <div className={css.sectionHeader}>
                <span className={css.sectionLabel}>{isPt ? 'Distância máxima' : 'Max distance'}</span>
                <button type="button" className={css.clearBtn} onClick={() => setGeoCoords(null)}>
                  {isPt ? 'Fechar' : 'Close'}
                </button>
              </div>
              <div className={css.chips}>
                {DISTANCE_OPTIONS.map(km => (
                  <button
                    key={km}
                    type="button"
                    className={`${css.chip} ${selectedDistance === km ? css.chipActive : ''}`}
                    onClick={() => setSelectedDistance(km)}
                  >
                    {km} km
                  </button>
                ))}
              </div>
            </div>
          </>
        )}

        <div className={css.divider} />

        {/* ── 3. Categoria ─────────────────────────────────── */}
        <div className={css.section}>
          <div className={css.sectionHeader}>
            <span className={css.sectionLabel}>{isPt ? 'Categoria' : 'Category'} <span className={css.sectionOptional}>{isPt ? '(opcional)' : '(optional)'}</span></span>
            {selectedCategory && (
              <button type="button" className={css.clearBtn} onClick={() => setSelectedCategory(null)}>
                {isPt ? 'Limpar' : 'Clear'}
              </button>
            )}
          </div>
          <div className={css.chips}>
            {visibleCategories.map(cat => (
              <button
                key={cat.slug}
                type="button"
                className={`${css.chip} ${selectedCategory === cat.slug ? css.chipActive : ''}`}
                onClick={() => setSelectedCategory(selectedCategory === cat.slug ? null : cat.slug)}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </div>

        <div className={css.divider} />

        {/* ── 4. Tipo de aluguer ────────────────────────────── */}
        <div className={css.section}>
          <div className={css.sectionHeader}>
            <span className={css.sectionLabel}>{isPt ? 'Tipo de aluguer' : 'Rental type'} <span className={css.sectionOptional}>{isPt ? '(opcional)' : '(optional)'}</span></span>
            {selectedUnitType && (
              <button type="button" className={css.clearBtn} onClick={() => setSelectedUnitType(null)}>
                {isPt ? 'Limpar' : 'Clear'}
              </button>
            )}
          </div>
          <div className={css.chips}>
            {UNIT_TYPES.map(u => (
              <button
                key={u.value}
                type="button"
                className={`${css.chip} ${selectedUnitType === u.value ? css.chipActive : ''}`}
                onClick={() => setSelectedUnitType(selectedUnitType === u.value ? null : u.value)}
              >
                {u.label}
              </button>
            ))}
          </div>
        </div>

        {/* ── 5. Mapa ──────────────────────────────────────── */}
        {activeMap === 'geo' && (
          <GeoMap coords={geoCoords} locations={listingLocations} zoom={13} showUserMarker />
        )}
        {activeMap === 'location' && (
          <GeoMap
            coords={selectedLocation}
            locations={listingLocations}
            bbox={selectedLocation.bbox}
            zoom={10}
            showUserMarker={false}
          />
        )}
        {activeMap === 'portugal' && (
          <GeoMap
            coords={PORTUGAL_CENTER}
            locations={portugaleLocations}
            zoom={6}
            showUserMarker={false}
          />
        )}

        {/* ── 6. Contagem de anúncios ───────────────────────── */}
        {hasFilters && (
          <div className={css.countRow}>
            {countLoading ? (
              <span className={css.countText}>{isPt ? 'A pesquisar…' : 'Searching…'}</span>
            ) : listingCount !== null ? (
              <span className={css.countText}>
                {isPt
                  ? <><strong>{listingCount}</strong> {listingCount === 1 ? 'anúncio' : 'anúncios'} com estas características</>
                  : <><strong>{listingCount}</strong> {listingCount === 1 ? 'listing' : 'listings'} with these filters</>}
              </span>
            ) : null}
          </div>
        )}

        {/* ── 7. Botão pesquisar ────────────────────────────── */}
        <button className={css.searchButton} type="submit">
          {isPt ? 'Ver resultados' : 'See results'}
        </button>

      </form>
          </div>
          {PROMO_SLIDES.map((slide, i) => {
            const bg = slide.useHeroCms && heroCmsUrl ? heroCmsUrl : slide.image;
            return (
            <div key={i} className={css.carouselSlide}>
              <div
                className={css.promoCard}
                style={{ backgroundImage: `url(${bg})` }}
              >
                <div className={css.promoOverlay} />
                <div className={css.promoContent}>
                  <h2 className={css.promoTitle}>{slide.title}</h2>
                  {slide.description && (
                    <p className={css.promoDescription}>{slide.description}</p>
                  )}
                  <button
                    type="button"
                    className={css.promoCta}
                    onClick={() => handlePromoClick(slide.href)}
                  >
                    {slide.ctaLabel}
                  </button>
                </div>
              </div>
            </div>
            );
          })}
        </div>
      </div>
      <div className={css.dots}>
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <button
            key={i}
            type="button"
            className={`${css.dot} ${i === currentSlide ? css.dotActive : ''}`}
            onClick={() => setCurrentSlide(i)}
            aria-label={`Slide ${i + 1}`}
          />
        ))}
      </div>
    </div>
  );
};

export default MobileSearchCard;
