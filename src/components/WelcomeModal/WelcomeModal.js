import React, { useEffect, useState } from 'react';
import { useHistory } from 'react-router-dom';

import { useLocale } from '../../context/localeContext';
import css from './WelcomeModal.module.css';

const STORAGE_KEY = 'v1h_welcome_pending';

const t = (isEN, pt, en) => (isEN ? en : pt);

const Check = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="12" r="10" fill="#BAA38A" />
    <polyline
      points="8 12 11 15 16 9"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const HeroIcon = () => (
  <svg width="56" height="56" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden>
    <circle cx="12" cy="12" r="11" fill="#BAA38A" />
    <polyline
      points="7.5 12.5 10.5 15.5 16.5 8.5"
      fill="none"
      stroke="#ffffff"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const WelcomeModal = ({ onClose }) => {
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const history = useHistory();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    let pending = null;
    try { pending = window.localStorage.getItem(STORAGE_KEY); } catch (_) {}
    if (pending) setOpen(true);
  }, []);

  if (!open) return null;

  const close = () => {
    if (typeof window !== 'undefined') {
      try { window.localStorage.removeItem(STORAGE_KEY); } catch (_) {}
    }
    setOpen(false);
    if (typeof onClose === 'function') onClose();
  };

  const goSearch = () => {
    close();
    history.push('/s');
  };

  const goPublish = () => {
    close();
    history.push('/l/new');
  };

  return (
    <div className={css.overlay} role="dialog" aria-modal="true">
      <div className={css.modal}>
        <button
          type="button"
          className={css.closeBtn}
          onClick={close}
          aria-label={t(isEN, 'Fechar', 'Close')}
        >×</button>

        <h2 className={css.title}>
          {t(isEN, 'Bem-vindo à Venue1Hub!', 'Welcome to Venue1Hub!')}
        </h2>
        <p className={css.subtitle}>
          {t(isEN,
            'A tua conta foi criada. Aqui ficam algumas dicas rápidas para começares:',
            'Your account is ready. Here are some quick tips to get you started:'
          )}
        </p>

        <ul className={css.bullets}>
          <li className={css.bullet}>
            <span className={css.bulletIcon}><Check /></span>
            <span>
              {t(isEN,
                'Procura espaços por categoria, localização e datas.',
                'Search venues by category, location and dates.'
              )}
            </span>
          </li>
          <li className={css.bullet}>
            <span className={css.bulletIcon}><Check /></span>
            <span>
              {t(isEN,
                'Tens um espaço? Anuncia-o em poucos minutos, gratuitamente.',
                'Have a space? List it in minutes, for free.'
              )}
            </span>
          </li>
          <li className={css.bullet}>
            <span className={css.bulletIcon}><Check /></span>
            <span>
              {t(isEN,
                'Pagamentos protegidos via Stripe e reservas com contrato digital.',
                'Secure payments via Stripe and bookings with digital contract.'
              )}
            </span>
          </li>
        </ul>

        <div className={css.actions}>
          <button type="button" className={css.primaryBtn} onClick={goSearch}>
            {t(isEN, 'Procurar espaços', 'Find venues')}
          </button>
          <button type="button" className={css.secondaryBtn} onClick={goPublish}>
            {t(isEN, 'Anunciar o meu espaço', 'List my space')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
