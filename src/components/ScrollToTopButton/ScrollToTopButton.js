import React, { useState, useEffect } from 'react';
import css from './ScrollToTopButton.module.css';

const ScrollToTopButton = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 300);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
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
