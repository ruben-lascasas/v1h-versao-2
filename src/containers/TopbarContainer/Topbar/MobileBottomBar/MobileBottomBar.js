import React, { useState, useEffect, useRef } from 'react';
import css from './MobileBottomBar.module.css';

const DISMISSED_KEY = 'v1hub_exploreBarDismissed';

// Local storage is unavailable during server-side rendering and can also be
// blocked by the browser (e.g. private mode), so every access is guarded.
const readDismissed = () => {
  try {
    return window.localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch (e) {
    return false;
  }
};

const MobileBottomBar = () => {
  // Starts as `false` so the server-rendered markup matches the first client
  // render. The stored value is applied right after mount.
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(true);
  const lastScrollY = useRef(0);
  const ticking = useRef(false);

  useEffect(() => {
    lastScrollY.current = window.scrollY || 0;
    if (readDismissed()) {
      setDismissed(true);
    }
  }, []);

  const dismiss = () => {
    try {
      window.localStorage.setItem(DISMISSED_KEY, 'true');
    } catch (e) {
      // Ignored — the bar still hides for this session.
    }
    setDismissed(true);
  };

  useEffect(() => {
    if (dismissed) return;

    // Hide bar when "Porquê a V1HUB?" section enters view
    const sectionEl = document.getElementById('section-why-us');
    let observer = null;
    if (sectionEl) {
      observer = new IntersectionObserver(
        entries => {
          if (entries[0].isIntersecting) dismiss();
        },
        { threshold: 0.2 }
      );
      observer.observe(sectionEl);
    }

    // Show/hide based on scroll direction
    const handleScroll = () => {
      if (ticking.current) return;
      ticking.current = true;
      window.requestAnimationFrame(() => {
        const currentScrollY = window.scrollY;
        if (currentScrollY <= 60) {
          setVisible(true);
        } else if (currentScrollY > lastScrollY.current) {
          setVisible(false);
        } else {
          setVisible(true);
        }
        lastScrollY.current = currentScrollY;
        ticking.current = false;
      });
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (observer) observer.disconnect();
    };
  }, [dismissed]);

  if (dismissed) return null;

  const handleClick = () => {
    dismiss();
    const el = document.getElementById('section-why-us');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    } else {
      window.location.href = '/#section-why-us';
    }
  };

  return (
    <div
      className={`${css.bar} ${visible ? css.visible : css.hidden}`}
      onClick={handleClick}
      role="button"
      tabIndex={0}
      onKeyDown={e => e.key === 'Enter' && handleClick()}
    >
      <span className={css.text}>Explore a V1HUB</span>
      <div className={css.chevrons}>
        <span className={css.chevronDown}></span>
        <span className={css.chevronDown}></span>
      </div>
    </div>
  );
};

export default MobileBottomBar;
