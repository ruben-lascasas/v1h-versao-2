import React, { useState, useEffect } from 'react';
import css from './ScrollToTopButton.module.css';

// Distance from the viewport bottom the button occupies (32px offset + 48px
// button + a little breathing room). Once the footer reaches into that band the
// button sits on top of the social icons and swallows their clicks — the
// YouTube icon is last in the row, so it was the one that stopped working.
const BUTTON_ZONE_HEIGHT = 96;

const ScrollToTopButton = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      if (window.scrollY <= 300) {
        setVisible(false);
        return;
      }
      const footer = document.getElementById('site-footer') || document.querySelector('footer');
      const footerTop = footer ? footer.getBoundingClientRect().top : Infinity;
      setVisible(footerTop > window.innerHeight - BUTTON_ZONE_HEIGHT);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, []);

  if (!visible) return null;

  return (
    <button
      className={css.button}
      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      aria-label="Voltar ao topo"
    >
      <span className={css.circle}>
        <span className={css.icon}>›</span>
      </span>
    </button>
  );
};

export default ScrollToTopButton;
