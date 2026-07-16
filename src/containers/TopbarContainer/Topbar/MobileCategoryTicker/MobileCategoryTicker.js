import React, { useEffect, useRef } from 'react';
import { useHistory } from 'react-router-dom';

import { useConfiguration } from '../../../../context/configurationContext';
import { useLocale } from '../../../../context/localeContext';
import { getCategoryIcon as getCategoryIconSvg } from '../../../../components/CategoryIcons/CategoryIcons';

import css from './MobileCategoryTicker.module.css';

const PT_LABELS = {
  trabalho: 'Trabalho', cultura: 'Cultura', educacao: 'Cultura',
  gastronomia: 'Gastronomia', eventos: 'Eventos', festa: 'Eventos',
  criatividade: 'Criatividade', saude: 'Saúde', bem: 'Saúde',
  desporto: 'Desporto', actividade: 'Desporto', livre: 'Ar Livre',
  inusitado: 'Inusitados', alternativo: 'Inusitados',
};

const EN_LABELS = {
  trabalho: 'Work', reuniao: 'Work', cultura: 'Culture', educacao: 'Culture',
  gastronomia: 'Gastronomy', convivio: 'Gastronomy', eventos: 'Events', festa: 'Events',
  criatividade: 'Creativity', producao: 'Creativity', saude: 'Health', bem: 'Health',
  desporto: 'Sport', actividade: 'Sport', livre: 'Outdoors',
  inusitado: 'Unusual', alternativo: 'Unusual',
};

const getCategoryIcon = (id = '', name = '') => getCategoryIconSvg(id, name);

const getLabel = (id = '', name = '', locale = 'pt') => {
  const haystack = (id + ' ' + name).toLowerCase();
  const map = locale === 'en' ? EN_LABELS : PT_LABELS;
  const match = Object.keys(map).find(k => haystack.includes(k));
  if (match) return map[match];
  return (name || '').split(/[&,]/)[0].trim().split(/\s+/)[0];
};

const SCROLL_SPEED = 0.167; // px per frame (~3x slower)

const MobileCategoryTicker = () => {
  const config = useConfiguration();
  const { locale } = useLocale();
  const history = useHistory();
  const trackRef = useRef(null);
  const posRef = useRef(0);
  const rafRef = useRef(null);
  const isDragging = useRef(false);
  const dragStartX = useRef(0);
  const dragStartPos = useRef(0);
  const halfWidthRef = useRef(0);
  const pauseUntilRef = useRef(0);
  const momentumRef = useRef(0);
  const lastMoveTimeRef = useRef(0);
  const lastMovePosRef = useRef(0);

  const rawCategories = config?.categoryConfiguration?.categories || [];

  useEffect(() => {
    const track = trackRef.current;
    if (!track || rawCategories.length === 0) return;

    const measure = () => {
      halfWidthRef.current = track.scrollWidth / 2;
    };
    measure();
    window.addEventListener('resize', measure);

    const tick = () => {
      const half = halfWidthRef.current;
      if (!isDragging.current) {
        if (Math.abs(momentumRef.current) > 0.05) {
          posRef.current += momentumRef.current;
          momentumRef.current *= 0.94;
        } else if (Date.now() >= pauseUntilRef.current) {
          momentumRef.current = 0;
          posRef.current += SCROLL_SPEED;
        }
        if (half > 0) {
          posRef.current = ((posRef.current % half) + half) % half;
        }
        track.style.transform = `translateX(${-posRef.current}px)`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', measure);
    };
  }, [rawCategories.length]);

  if (rawCategories.length === 0) return null;

  const doubled = [...rawCategories, ...rawCategories];

  const onTouchStart = e => {
    isDragging.current = true;
    momentumRef.current = 0;
    dragStartX.current = e.touches[0].clientX;
    dragStartPos.current = posRef.current;
    lastMoveTimeRef.current = Date.now();
    lastMovePosRef.current = posRef.current;
  };

  const onTouchMove = e => {
    if (!isDragging.current) return;
    const dx = dragStartX.current - e.touches[0].clientX;
    const half = halfWidthRef.current;
    let next = dragStartPos.current + dx;
    if (half > 0) {
      next = ((next % half) + half) % half;
    }
    const now = Date.now();
    const dt = now - lastMoveTimeRef.current;
    if (dt > 0) {
      const dp = next - lastMovePosRef.current;
      const wrap = half / 2;
      const adjusted = dp > wrap ? dp - half : dp < -wrap ? dp + half : dp;
      momentumRef.current = adjusted * (16 / dt);
    }
    lastMoveTimeRef.current = now;
    lastMovePosRef.current = next;
    posRef.current = next;
    trackRef.current.style.transform = `translateX(${-next}px)`;
  };

  const onTouchEnd = () => {
    isDragging.current = false;
    pauseUntilRef.current = Date.now() + 15000;
  };

  const handleClick = id => {
    history.push(`/s?pub_categoryLevel1=${encodeURIComponent(id)}`);
  };

  const heading = locale === 'en'
    ? 'What are you looking for?'
    : 'O que estás à procura?';

  const subtext = locale === 'en'
    ? 'Fun, work, events, parties...'
    : 'Diversão, trabalho, eventos, festas...';

  return (
    <div className={css.outer}>
      <div className={css.textRow}>
        <span className={css.heading}>{heading}</span>
        <span className={css.subtext}>{subtext}</span>
      </div>
      <div
        className={css.wrapper}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div ref={trackRef} className={css.track}>
          {doubled.map((cat, i) => (
            <button
              key={`${cat.id}-${i}`}
              className={css.btn}
              onClick={() => handleClick(cat.id)}
            >
              <span className={css.icon}>{getCategoryIcon(cat.id, cat.name)}</span>
              <span className={css.label}>{getLabel(cat.id, cat.name, locale)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MobileCategoryTicker;
