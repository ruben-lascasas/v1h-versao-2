import React, { useState } from 'react';
import { useLocale } from '../../../context/localeContext';
import css from './WaitlistButton.module.css';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const BellIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

const WaitlistButton = ({ listingId, listingTitle, values }) => {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const { locale } = useLocale();

  const handleSubmit = async e => {
    e.preventDefault();
    if (!EMAIL_REGEX.test(email)) {
      setErrorMsg('Introduza um email válido.');
      return;
    }
    setStatus('loading');
    setErrorMsg('');

    try {
      const startDate = values?.bookingStartTime
        ? new Date(Number(values.bookingStartTime)).toISOString()
        : null;
      const endDate = values?.bookingEndTime
        ? new Date(Number(values.bookingEndTime)).toISOString()
        : null;

      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          listingId: listingId?.uuid || listingId,
          listingTitle,
          listingUrl: window.location.href,
          startDate,
          endDate,
          // O email de confirmação é enviado na língua em que a pessoa está a ver
          // o site — pode nem ter conta, por isso não há perfil onde consultar.
          locale,
        }),
      });

      const data = await response.json();
      if (response.ok && data.success) {
        setStatus('success');
      } else {
        setStatus('error');
        setErrorMsg(data.error || 'Erro ao registar. Tente novamente.');
      }
    } catch {
      setStatus('error');
      setErrorMsg('Erro de ligação. Tente novamente.');
    }
  };

  if (status === 'success') {
    return (
      <div className={css.root}>
        <div className={css.successBox}>
          <span className={css.successIcon}>✓</span>
          <span>Registado! Avisamos quando houver disponibilidade.</span>
        </div>
      </div>
    );
  }

  return (
    <div className={css.root}>
      {!open ? (
        <button type="button" className={css.trigger} onClick={() => setOpen(true)}>
          <span className={css.icon}><BellIcon /></span>
          Juntar à lista de espera
        </button>
      ) : (
        <div className={css.panel}>
          <p className={css.panelTitle}>
            <span className={css.icon}><BellIcon /></span>
            Lista de espera
          </p>
          <p className={css.panelText}>
            Deixe o seu email e avisamos assim que uma vaga ficar disponível.
          </p>
          <form onSubmit={handleSubmit} className={css.form}>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="o-seu-email@exemplo.com"
              className={css.input}
              disabled={status === 'loading'}
              required
            />
            {errorMsg && <p className={css.error}>{errorMsg}</p>}
            <div className={css.formActions}>
              <button
                type="button"
                className={css.cancelBtn}
                onClick={() => { setOpen(false); setEmail(''); setErrorMsg(''); }}
                disabled={status === 'loading'}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className={css.submitBtn}
                disabled={status === 'loading'}
              >
                {status === 'loading' ? 'A registar…' : 'Entrar na lista'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default WaitlistButton;
