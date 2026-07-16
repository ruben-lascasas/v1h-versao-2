import React, { useEffect, useRef, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';

import { useLocale } from '../../../../context/localeContext';
import { fetchMapListings } from '../../../../ducks/mapListings.duck';
import SectionContainer from '../SectionContainer';

import css from './SectionLandingMap.module.css';

const PORTUGAL_CENTER = [-8.2, 39.5];
const PORTUGAL_ZOOM = 5.8;

const slugify = title =>
  (title || 'listing')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');

// Paths SVG — idênticos ao CategoryIcons.js
const CATEGORY_SVG_PATHS = {
  trabalho:
    '<rect x="2.5" y="7" width="19" height="13" rx="2"/>' +
    '<path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
    '<path d="M2.5 13h19"/>' +
    '<rect x="10.5" y="12" width="3" height="3" rx="0.5"/>',
  cultura:
    '<path d="M12 5v14"/>' +
    '<path d="M2 4c3 0 6 .8 10 2v14c-4-1.4-7-2-10-2V4z"/>' +
    '<path d="M22 4c-3 0-6 .8-10 2v14c4-1.4 7-2 10-2V4z"/>' +
    '<line x1="5" y1="8.3" x2="10.5" y2="9.4"/><line x1="5" y1="11.3" x2="10.5" y2="12.4"/>' +
    '<line x1="5" y1="14.3" x2="10.5" y2="15.4"/><line x1="13.5" y1="9.4" x2="19" y2="8.3"/>' +
    '<line x1="13.5" y1="12.4" x2="19" y2="11.3"/><line x1="13.5" y1="15.4" x2="19" y2="14.3"/>',
  gastronomia:
    '<path d="M4 7h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7z"/>' +
    '<path d="M17 9h2a2 2 0 0 1 0 4h-2"/><path d="M2 20h18"/>' +
    '<path d="M7 5 C 8 4, 6 3, 7 1.5"/><path d="M11 5 C 12 4, 10 3, 11 1.5"/>' +
    '<path d="M15 5 C 16 4, 14 3, 15 1.5"/>',
  eventos:
    '<rect x="3" y="5" width="18" height="16" rx="2"/>' +
    '<path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>' +
    '<line x1="7" y1="13.5" x2="9" y2="13.5"/><line x1="11" y1="13.5" x2="13" y2="13.5"/>' +
    '<line x1="15" y1="13.5" x2="17" y2="13.5"/><line x1="7" y1="17" x2="9" y2="17"/>' +
    '<line x1="11" y1="17" x2="13" y2="17"/><line x1="15" y1="17" x2="17" y2="17"/>',
  criatividade:
    '<path d="M9 18h6"/><path d="M10 21h4"/>' +
    '<path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1.2 1.5 1.3 2.5h5.4c.1-1 .6-1.8 1.3-2.5A6 6 0 0 0 12 3z"/>',
  saude: '<path d="M2 12h4l2-5 3 10 2-8 2 3h7"/>',
  desporto:
    '<circle cx="12" cy="12" r="9"/>' +
    '<polygon points="12 8 15.5 10.5 14 14.5 10 14.5 8.5 10.5"/>' +
    '<line x1="12" y1="8" x2="12" y2="3"/><line x1="15.5" y1="10.5" x2="20.5" y2="9.2"/>' +
    '<line x1="14" y1="14.5" x2="16.5" y2="18.7"/><line x1="10" y1="14.5" x2="7.5" y2="18.7"/>' +
    '<line x1="8.5" y1="10.5" x2="3.5" y2="9.2"/>',
  livre:
    '<path d="M12 3 L7 10 L10 10 L7 15 L10 15 L7 19 L17 19 L14 15 L17 15 L14 10 L17 10 Z"/>' +
    '<path d="M12 19 L12 22"/>',
  inusitado:
    '<polygon points="12 3 14.5 9 21 9.5 16 13.5 17.5 20 12 16.5 6.5 20 8 13.5 3 9.5 9.5 9"/>',
};

const CATEGORY_KEY_MAP = {
  trabalho: 'trabalho', reuniao: 'trabalho',
  cultura: 'cultura',   educacao: 'cultura',
  gastronomia: 'gastronomia', convivio: 'gastronomia',
  eventos: 'eventos',   festa: 'eventos',
  criatividade: 'criatividade', producao: 'criatividade',
  saude: 'saude',       bem: 'saude',
  desporto: 'desporto', actividade: 'desporto',
  livre: 'livre',
  inusitado: 'inusitado', alternativo: 'inusitado',
};

const PT_LABELS = {
  trabalho: 'Trabalho', cultura: 'Cultura', gastronomia: 'Gastronomia',
  eventos: 'Eventos', criatividade: 'Criatividade', saude: 'Saúde',
  desporto: 'Desporto', livre: 'Ar Livre', inusitado: 'Inusitados',
};
const EN_LABELS = {
  trabalho: 'Work', cultura: 'Culture', gastronomia: 'Food',
  eventos: 'Events', criatividade: 'Creative', saude: 'Health',
  desporto: 'Sports', livre: 'Outdoors', inusitado: 'Unusual',
};

const resolveCategoryKey = categoryId => {
  const haystack = (categoryId || '').toLowerCase();
  const match = Object.keys(CATEGORY_KEY_MAP).find(k => haystack.includes(k));
  return match ? CATEGORY_KEY_MAP[match] : 'inusitado';
};

const buildBadgeHtml = (key, label) => {
  const paths = CATEGORY_SVG_PATHS[key] || CATEGORY_SVG_PATHS.inusitado;
  // Wrap em <g> para garantir fill="none" em todos os paths (incluindo paths fechados com z)
  const svg =
    `<svg width="24" height="24" viewBox="0 0 24 24" style="display:block;flex-shrink:0">` +
    `<g fill="none" stroke="#2E2E2E" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">` +
    `${paths}` +
    `</g></svg>`;
  return (
    svg +
    `<span style="display:block;font-size:9px;font-weight:700;color:#2E2E2E;` +
    `margin-top:2px;text-align:center;white-space:nowrap;letter-spacing:0.02em;line-height:1">${label}</span>`
  );
};

const SectionLandingMap = props => {
  const { sectionId, className, rootClassName, appearance } = props;
  const dispatch = useDispatch();
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const markersRef = useRef([]);
  const [mounted, setMounted] = useState(false);
  const [interactive, setInteractive] = useState(false);

  const { listings, inProgress, fetched } = useSelector(state => state.mapListings);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    dispatch(fetchMapListings());
  }, [dispatch]);

  // Inicializa o mapa Mapbox
  useEffect(() => {
    if (!mounted || !mapContainerRef.current || mapRef.current) return;
    if (typeof window === 'undefined' || !window.mapboxgl || !window.mapboxgl.accessToken) return;

    const map = new window.mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: PORTUGAL_CENTER,
      zoom: PORTUGAL_ZOOM,
      scrollZoom: false,
      dragPan: false,
      boxZoom: false,
      doubleClickZoom: false,
      dragRotate: false,
      keyboard: false,
      touchZoomRotate: false,
    });
    map.addControl(new window.mapboxgl.NavigationControl({ showCompass: false }), 'top-left');
    mapRef.current = map;

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [mounted]);

  // Adiciona marcadores quando os anúncios chegam
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !listings.length) return;

    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    const addMarkers = () => {
      listings.forEach(listing => {
        const { geolocation, title, price, publicData } = listing.attributes;
        if (!geolocation) return;

        const id = listing.id?.uuid;
        const slug = slugify(title);
        const categoryId = publicData?.categoryLevel1 || '';
        const catKey = resolveCategoryKey(categoryId);
        const catLabel = isEN ? EN_LABELS[catKey] : PT_LABELS[catKey];

        const unitType = publicData?.unitType;
        const unitSuffix = unitType === 'hour'
          ? (isEN ? '/h' : '/hora')
          : unitType === 'day'
          ? (isEN ? '/day' : '/dia')
          : unitType === 'night'
          ? (isEN ? '/night' : '/noite')
          : '';
        const priceStr = price
          ? `${(price.amount / 100).toLocaleString('pt-PT', { minimumFractionDigits: 0 })} ${price.currency}${unitSuffix}`
          : null;

        const popup = new window.mapboxgl.Popup({ offset: 14, closeButton: false, maxWidth: '200px' })
          .setHTML(
            `<div style="font-family:sans-serif;padding:8px 4px">` +
              `<div style="font-weight:700;font-size:0.85rem;margin-bottom:${priceStr ? '4px' : '8px'};color:#1a1a1a;line-height:1.3">${title}</div>` +
              (priceStr ? `<div style="color:#555;font-size:0.78rem;margin-bottom:8px">${priceStr}</div>` : '') +
              `<a href="/l/${slug}/${id}" style="display:inline-block;padding:5px 12px;background:#2E2E2E;color:#fff;border-radius:4px;font-size:0.74rem;text-decoration:none;font-weight:600">${isEN ? 'View listing' : 'Ver anúncio'}</a>` +
            `</div>`
          );

        const el = document.createElement('div');
        el.setAttribute('style', [
          'width:14px',
          'height:14px',
          'overflow:visible',
          'cursor:pointer',
        ].join(';'));

        const dot = document.createElement('div');
        dot.setAttribute('style', [
          'width:14px',
          'height:14px',
          'border-radius:50%',
          'background:#e53935',
          'border:2.5px solid #fff',
          'box-shadow:0 1px 4px rgba(0,0,0,0.35)',
        ].join(';'));
        el.appendChild(dot);

        const badge = document.createElement('div');
        badge.setAttribute('style', [
          'display:none',
          'position:absolute',
          'bottom:calc(100% + 8px)',
          'left:50%',
          'transform:translateX(-50%)',
          'flex-direction:column',
          'align-items:center',
          'justify-content:center',
          'background:#fff',
          'border:1.5px solid #D4C4B0',
          'border-radius:10px',
          'padding:5px 7px 4px',
          'box-shadow:0 2px 8px rgba(0,0,0,0.15)',
          'min-width:48px',
          'pointer-events:none',
          'z-index:20',
          'white-space:nowrap',
        ].join(';'));
        badge.innerHTML = buildBadgeHtml(catKey, catLabel);
        el.appendChild(badge);

        el.addEventListener('mouseenter', () => { badge.style.display = 'flex'; });
        el.addEventListener('mouseleave', () => { badge.style.display = 'none'; });

        const marker = new window.mapboxgl.Marker(el, { anchor: 'center' })
          .setLngLat([geolocation.lng, geolocation.lat])
          .setPopup(popup)
          .addTo(map);

        markersRef.current.push(marker);
      });
    };

    if (map.isStyleLoaded()) {
      addMarkers();
    } else {
      map.once('load', addMarkers);
    }
  }, [listings, mounted]);

  if (!mounted) return null;

  return (
    <SectionContainer
      id={sectionId}
      className={className}
      rootClassName={rootClassName}
      appearance={appearance}
    >
      <header className={css.sectionHeader}>
        <h2 className={css.sectionTitle}>
          {isEN ? 'Explore on the map' : 'Explore no mapa'}
        </h2>
        <hr className={css.sectionDivider} />
      </header>

      <p className={css.description}>
        {isEN
          ? 'Discover available spaces across Portugal on this interactive map. Click on a pin to see the listing details and find the perfect space for you.'
          : 'Descubra os espaços disponíveis por todo o território nacional neste mapa interativo. Clique num pin para ver os detalhes do anúncio e encontrar o espaço ideal para si.'}
      </p>

      <div className={css.mapWrapper}>
        {inProgress && (
          <div className={css.loadingOverlay}>
            <span className={css.loadingDot} />
          </div>
        )}
        <div ref={mapContainerRef} className={css.mapContainer} />
        {!interactive && (
          <button
            type="button"
            className={css.activateOverlay}
            onClick={() => {
              const map = mapRef.current;
              if (map) {
                map.scrollZoom.enable();
                map.dragPan.enable();
                map.boxZoom.enable();
                map.doubleClickZoom.enable();
                map.dragRotate.enable();
                map.keyboard.enable();
                map.touchZoomRotate.enable();
              }
              setInteractive(true);
            }}
            aria-label={isEN ? 'Activate the map' : 'Ativar o mapa'}
          />
        )}
      </div>
    </SectionContainer>
  );
};

export default SectionLandingMap;
