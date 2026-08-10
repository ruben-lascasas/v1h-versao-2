import React from 'react';

/**
 * Os quatro cantos em L que emolduram a secção "Porquê a V1HUB?".
 *
 * Vêm inline e não como quatro ficheiros: cada um tem 277 bytes, portanto
 * quatro pedidos HTTP custariam mais do que o desenho todo. Inline também
 * permite a cor vir do CSS, o que o modo escuro precisa.
 *
 * Os polígonos são os do designer, ponto por ponto. O `fill` foi tirado do
 * `<style>` que vinha nos ficheiros — quatro SVGs com a mesma classe `cls-1` no
 * mesmo documento colidiriam entre si — e passa a `currentColor`, herdado do
 * elemento que os contém.
 */

const VIEW_BOX = '0 0 419 266';

const Corner = ({ points, className }) => (
  <svg
    className={className}
    viewBox={VIEW_BOX}
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    focusable="false"
  >
    <polygon points={points} fill="currentColor" />
  </svg>
);

export const CornerTopLeft = props => (
  <Corner
    {...props}
    points="137.58 237.53 137.13 148.38 374.86 149.06 374.86 38.59 40.14 38.59 40.14 237.53 137.58 237.53"
  />
);

export const CornerTopRight = props => (
  <Corner
    {...props}
    points="277.41 237.53 277.87 148.38 40.14 149.06 40.14 38.59 374.86 38.59 374.86 237.53 277.41 237.53"
  />
);

export const CornerBottomLeft = props => (
  <Corner
    {...props}
    points="137.58 38.59 137.13 127.74 374.86 127.06 374.86 237.53 40.14 237.53 40.14 38.59 137.58 38.59"
  />
);

export const CornerBottomRight = props => (
  <Corner
    {...props}
    points="277.41 38.59 277.87 127.74 40.14 127.06 40.14 237.53 374.86 237.53 374.86 38.59 277.41 38.59"
  />
);
