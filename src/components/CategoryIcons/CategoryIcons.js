import React from 'react';

const svgProps = {
  width: '100%',
  height: '100%',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
};

export const IconTrabalho = () => (
  <svg {...svgProps}>
    <rect x="2.5" y="7" width="19" height="13" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M2.5 13h19" />
    <rect x="10.5" y="12" width="3" height="3" rx="0.5" />
  </svg>
);

export const IconCultura = () => (
  <svg {...svgProps}>
    <path d="M12 5v14" />
    <path d="M2 4c3 0 6 .8 10 2v14c-4-1.4-7-2-10-2V4z" />
    <path d="M22 4c-3 0-6 .8-10 2v14c4-1.4 7-2 10-2V4z" />
    <line x1="5" y1="8.3" x2="10.5" y2="9.4" />
    <line x1="5" y1="11.3" x2="10.5" y2="12.4" />
    <line x1="5" y1="14.3" x2="10.5" y2="15.4" />
    <line x1="13.5" y1="9.4" x2="19" y2="8.3" />
    <line x1="13.5" y1="12.4" x2="19" y2="11.3" />
    <line x1="13.5" y1="15.4" x2="19" y2="14.3" />
  </svg>
);

export const IconGastronomia = () => (
  <svg {...svgProps}>
    <path d="M4 7h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V7z" />
    <path d="M17 9h2a2 2 0 0 1 0 4h-2" />
    <path d="M2 20h18" />
    <path d="M7 5 C 8 4, 6 3, 7 1.5" />
    <path d="M11 5 C 12 4, 10 3, 11 1.5" />
    <path d="M15 5 C 16 4, 14 3, 15 1.5" />
  </svg>
);

export const IconEventos = () => (
  <svg {...svgProps}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18" />
    <path d="M8 3v4" />
    <path d="M16 3v4" />
    <line x1="7" y1="13.5" x2="9" y2="13.5" />
    <line x1="11" y1="13.5" x2="13" y2="13.5" />
    <line x1="15" y1="13.5" x2="17" y2="13.5" />
    <line x1="7" y1="17" x2="9" y2="17" />
    <line x1="11" y1="17" x2="13" y2="17" />
    <line x1="15" y1="17" x2="17" y2="17" />
  </svg>
);

export const IconCriatividade = () => (
  <svg {...svgProps}>
    <path d="M9 18h6" />
    <path d="M10 21h4" />
    <path d="M12 3a6 6 0 0 0-4 10.5c.7.7 1.2 1.5 1.3 2.5h5.4c.1-1 .6-1.8 1.3-2.5A6 6 0 0 0 12 3z" />
  </svg>
);

export const IconSaude = () => (
  <svg {...svgProps}>
    <path d="M2 12h4l2-5 3 10 2-8 2 3h7" />
  </svg>
);

export const IconDesporto = () => (
  <svg {...svgProps}>
    <circle cx="12" cy="12" r="9" />
    <polygon points="12 8 15.5 10.5 14 14.5 10 14.5 8.5 10.5" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="15.5" y1="10.5" x2="20.5" y2="9.2" />
    <line x1="14" y1="14.5" x2="16.5" y2="18.7" />
    <line x1="10" y1="14.5" x2="7.5" y2="18.7" />
    <line x1="8.5" y1="10.5" x2="3.5" y2="9.2" />
  </svg>
);

export const IconArLivre = () => (
  <svg {...svgProps}>
    <path d="M12 3 L7 10 L10 10 L7 15 L10 15 L7 19 L17 19 L14 15 L17 15 L14 10 L17 10 Z" />
    <path d="M12 19 L12 22" />
  </svg>
);

export const IconInusitados = () => (
  <svg {...svgProps}>
    <polygon points="12 3 14.5 9 21 9.5 16 13.5 17.5 20 12 16.5 6.5 20 8 13.5 3 9.5 9.5 9" />
  </svg>
);

export const CATEGORY_ICON_COMPONENTS = {
  trabalho:     IconTrabalho,
  cultura:      IconCultura,
  educacao:     IconCultura,
  gastronomia:  IconGastronomia,
  convivio:     IconGastronomia,
  eventos:      IconEventos,
  festa:        IconEventos,
  criatividade: IconCriatividade,
  producao:     IconCriatividade,
  saude:        IconSaude,
  bem:          IconSaude,
  desporto:     IconDesporto,
  actividade:   IconDesporto,
  livre:        IconArLivre,
  inusitado:    IconInusitados,
  alternativo:  IconInusitados,
};

export const getCategoryIcon = (id = '', name = '') => {
  const haystack = (id + ' ' + name).toLowerCase();
  const match = Object.keys(CATEGORY_ICON_COMPONENTS).find(k => haystack.includes(k));
  const Icon = match ? CATEGORY_ICON_COMPONENTS[match] : IconInusitados;
  return <Icon />;
};

const PT_CATEGORY_LABELS = {
  trabalho:    'Trabalho',   reuniao: 'Trabalho',
  cultura:     'Cultura',    educacao: 'Cultura',
  gastronomia: 'Gastronomia', convivio: 'Gastronomia',
  eventos:     'Eventos',    festa: 'Eventos',
  criatividade:'Criatividade', producao: 'Criatividade',
  saude:       'Saúde',      bem: 'Saúde',
  desporto:    'Desporto',   actividade: 'Desporto',
  livre:       'Ar Livre',
  inusitado:   'Inusitados', alternativo: 'Inusitados',
};

const EN_CATEGORY_LABELS = {
  trabalho:    'Work',       reuniao: 'Work',
  cultura:     'Culture',    educacao: 'Culture',
  gastronomia: 'Gastronomy', convivio: 'Gastronomy',
  eventos:     'Events',     festa: 'Events',
  criatividade:'Creativity', producao: 'Creativity',
  saude:       'Health',     bem: 'Health',
  desporto:    'Sport',      actividade: 'Sport',
  livre:       'Outdoors',
  inusitado:   'Unusual',    alternativo: 'Unusual',
};

export const getCategoryLabel = (id = '', name = '', locale = 'pt') => {
  const haystack = (id + ' ' + name).toLowerCase();
  const map = locale === 'en' ? EN_CATEGORY_LABELS : PT_CATEGORY_LABELS;
  const match = Object.keys(map).find(k => haystack.includes(k));
  if (match) return map[match];
  const first = (name || '').split(/[&,]/)[0].trim();
  return first.split(/\s+/)[0];
};
