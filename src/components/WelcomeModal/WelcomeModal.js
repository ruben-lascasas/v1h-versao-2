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

// Conteúdo por tipo de utilizador — cada persona só publica ou só reserva
// (ver roles no Console: Anunciante e Prestador de Serviços são só
// "Provider", Visitante é só "Customer"), por isso o CTA e as dicas mudam
// consoante quem acabou de se registar. "anunciante"/"prestador_de_servicos"
// levam a /l/new; "visitante" e qualquer tipo não previsto levam a /s.
const CONTENT_BY_USER_TYPE = {
  anunciante: {
    bullets: (isEN) => [
      t(isEN, 'Anuncia o teu espaço em poucos minutos, gratuitamente.', 'List your space in minutes, for free.'),
      t(isEN, 'Gere reservas e disponibilidade num calendário simples.', 'Manage bookings and availability with a simple calendar.'),
      t(isEN, 'Pagamentos protegidos via Stripe, direto para ti.', 'Secure payments via Stripe, straight to you.'),
    ],
    primary: (isEN) => t(isEN, 'Anunciar o meu espaço', 'List my space'),
    goTo: '/l/new',
  },
  prestador_de_servicos: {
    bullets: (isEN) => [
      t(isEN, 'Cria o teu anúncio de serviço — catering, limpeza, fotografia e mais.', 'Create your service listing — catering, cleaning, photography and more.'),
      t(isEN, 'Aparece automaticamente como complemento em espaços perto de ti.', 'Shows up automatically as an add-on on nearby venues.'),
      t(isEN, 'Pagamentos protegidos via Stripe, direto para ti.', 'Secure payments via Stripe, straight to you.'),
    ],
    primary: (isEN) => t(isEN, 'Criar o meu anúncio de serviço', 'Create my service listing'),
    goTo: '/l/new',
  },
  visitante: {
    bullets: (isEN) => [
      t(isEN, 'Procura espaços por categoria, localização e datas.', 'Search venues by category, location and dates.'),
      t(isEN, 'Reserva com pagamento seguro e contrato digital.', 'Book with secure payment and a digital contract.'),
      t(isEN, 'Guarda os teus espaços favoritos para decidir com calma.', 'Save your favourite venues to decide later.'),
    ],
    primary: (isEN) => t(isEN, 'Procurar espaços', 'Find venues'),
    goTo: '/s',
  },
};

const WelcomeModal = ({ onClose, currentUser }) => {
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

  const userType = currentUser?.attributes?.profile?.publicData?.userType;
  const content = CONTENT_BY_USER_TYPE[userType] || CONTENT_BY_USER_TYPE.visitante;

  const goPrimary = () => {
    close();
    history.push(content.goTo);
  };

  const goSearch = () => {
    close();
    history.push('/s');
  };

  // O botão secundário só faz sentido para quem publica anúncios — dá para
  // espreitar a plataforma antes de criar o primeiro anúncio. Para quem só
  // reserva (visitante), o CTA principal já é "Procurar espaços".
  const showSecondaryAction = content.goTo !== '/s';

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
          {content.bullets(isEN).map((text, index) => (
            <li className={css.bullet} key={index}>
              <span className={css.bulletIcon}><Check /></span>
              <span>{text}</span>
            </li>
          ))}
        </ul>

        <div className={css.actions}>
          <button type="button" className={css.primaryBtn} onClick={goPrimary}>
            {content.primary(isEN)}
          </button>
          {showSecondaryAction ? (
            <button type="button" className={css.secondaryBtn} onClick={goSearch}>
              {t(isEN, 'Explorar a plataforma', 'Explore the platform')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WelcomeModal;
