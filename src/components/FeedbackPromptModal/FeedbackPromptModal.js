import React, { useEffect, useState } from 'react';
import { useSelector } from 'react-redux';
import classNames from 'classnames';

import { useLocale } from '../../context/localeContext';
import { apiBaseUrl } from '../../util/api';

import css from './FeedbackPromptModal.module.css';

const STORAGE_KEY = 'v1h_pending_feedback_prompt';
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MESSAGE_DISALLOWED_REGEX = /[<>{}\\]/;
const MESSAGE_MAX = 2000;

const t = (isEN, pt, en) => (isEN ? en : pt);

const SATISFACTION = [
  { value: 'terrible', emoji: '😞', labelPT: 'Péssimo', labelEN: 'Terrible' },
  { value: 'unsatisfied', emoji: '🙁', labelPT: 'Insatisfeito', labelEN: 'Unsatisfied' },
  { value: 'neutral', emoji: '😐', labelPT: 'Neutro', labelEN: 'Neutral' },
  { value: 'satisfied', emoji: '🙂', labelPT: 'Satisfeito', labelEN: 'Satisfied' },
  { value: 'excellent', emoji: '😄', labelPT: 'Excelente', labelEN: 'Excellent' },
];

const clearFlag = () => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch (_) { /* ignore */ }
};

const FeedbackPromptModal = () => {
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const currentUserEmail = useSelector(state => {
    const u = state.user?.currentUser;
    return u?.attributes?.email || '';
  });

  const [open, setOpen] = useState(false);
  const [satisfaction, setSatisfaction] = useState(null);
  const [rating, setRating] = useState(0);
  const [hoveredStar, setHoveredStar] = useState(0);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState({});
  const [status, setStatus] = useState('idle');

  // On mount, check the flag set after review submission. If present, open
  // the modal and pre-fill the email with the logged-in user's address.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let pending = null;
    try { pending = window.localStorage.getItem(STORAGE_KEY); } catch (_) {}
    if (pending) {
      setOpen(true);
      if (currentUserEmail) setEmail(currentUserEmail);
    }
  }, [currentUserEmail]);

  if (!open) return null;

  const close = () => {
    clearFlag();
    setOpen(false);
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const next = {};
    if (!satisfaction) {
      next.satisfaction = t(isEN, 'Por favor indica a tua satisfação.', 'Please indicate your satisfaction.');
    }
    if (!message.trim()) {
      next.message = t(isEN, 'Escreve a tua mensagem.', 'Write your message.');
    } else if (message.trim().length < 10) {
      next.message = t(isEN,
        'A mensagem deve ter pelo menos 10 caracteres.',
        'The message must be at least 10 characters.'
      );
    } else if (MESSAGE_DISALLOWED_REGEX.test(message)) {
      next.message = t(isEN,
        'A mensagem contém caracteres não permitidos (< > { } \\).',
        'The message contains characters that are not allowed (< > { } \\).'
      );
    }
    if (!email.trim()) {
      next.email = t(isEN, 'Por favor insere o teu email.', 'Please enter your email.');
    } else if (!EMAIL_REGEX.test(email.trim())) {
      next.email = t(isEN, 'Endereço de email inválido.', 'Invalid email address.');
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;

    setStatus('sending');
    try {
      const sat = SATISFACTION.find(s => s.value === satisfaction);
      const subject = `[${sat?.labelPT || satisfaction}] Pós-review`;
      const body = [
        `Satisfação: ${sat?.emoji || ''} ${sat?.labelPT || satisfaction}`,
        `Origem: pop-up pós-review`,
        '',
        message.trim(),
      ].join('\n');

      const res = await fetch(`${apiBaseUrl()}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '(via pop-up pós-review)',
          email: email.trim(),
          subject,
          message: rating
            ? `${body}\n\nRecomendação (NPS): ${rating}/5 estrelas`
            : body,
          satisfaction: `${sat?.emoji || ''} ${sat?.labelPT || satisfaction}`.trim(),
          category: 'Pós-review',
          rating,
        }),
      });
      if (!res.ok) throw new Error('send failed');
      setStatus('success');
      clearFlag();
    } catch (_) {
      setStatus('idle');
      setErrors({ submit: t(isEN, 'Erro ao enviar. Tenta de novo.', 'Error sending. Try again.') });
    }
  };

  return (
    <div className={css.overlay} role="dialog" aria-modal="true">
      <div className={css.modal}>
        {status === 'success' ? (
          <div className={css.successWrap}>
            <button
              type="button"
              className={css.closeBtnFloating}
              onClick={close}
              aria-label={t(isEN, 'Fechar', 'Close')}
            >×</button>
            <div className={css.successIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#BAA38A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle fill="none" cx="12" cy="12" r="10" />
                <polyline fill="none" points="8 12 11 15 16 9" />
              </svg>
            </div>
            <h3 className={css.successTitle}>
              {t(isEN, 'Obrigado!', 'Thank you!')}
            </h3>
            <p className={css.successText}>
              {t(isEN,
                'O teu feedback ajuda-nos a melhorar a Venue1Hub.',
                'Your feedback helps us improve Venue1Hub.'
              )}
            </p>
            <button type="button" className={css.successCloseBtn} onClick={close}>
              {t(isEN, 'Fechar', 'Close')}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className={css.headerRow}>
              <h3 className={css.title}>
                {t(isEN, 'Como correu a tua experiência na Venue1Hub?', 'How was your experience on Venue1Hub?')}
              </h3>
              <button
                type="button"
                className={css.closeBtn}
                onClick={close}
                aria-label={t(isEN, 'Fechar', 'Close')}
              >×</button>
            </div>
            <p className={css.subtitle}>
              {t(isEN,
                'Em poucos segundos, ajudas-nos a melhorar a Venue1Hub.',
                'In a few seconds, you help us improve Venue1Hub.'
              )}
            </p>

            <div className={css.label}>
              {t(isEN, 'Como te sentiste em relação à plataforma?', 'How did the platform feel?')}
            </div>
            <div className={css.faceRow}>
              {SATISFACTION.map(s => {
                const selected = satisfaction === s.value;
                return (
                  <button
                    type="button"
                    key={s.value}
                    className={classNames(css.face, { [css.faceSelected]: selected })}
                    onClick={() => {
                      setSatisfaction(s.value);
                      setErrors(prev => ({ ...prev, satisfaction: undefined }));
                    }}
                  >
                    <span className={css.faceEmoji}>{s.emoji}</span>
                    <span className={css.faceLabel}>{isEN ? s.labelEN : s.labelPT}</span>
                  </button>
                );
              })}
            </div>
            {errors.satisfaction ? (
              <div className={classNames(css.fieldError, css.satisfactionError)}>
                {errors.satisfaction}
              </div>
            ) : (
              <div style={{ height: 14 }} aria-hidden />
            )}

            <div className={css.field}>
              <div className={css.label}>
                {t(isEN,
                  'Recomendarias a Venue1Hub a um amigo? (opcional)',
                  'Would you recommend Venue1Hub to a friend? (optional)'
                )}
              </div>
              <div className={css.starsRow} onMouseLeave={() => setHoveredStar(0)}>
                {[1, 2, 3, 4, 5].map(n => {
                  const filled = n <= (hoveredStar || rating);
                  return (
                    <button
                      type="button"
                      key={n}
                      className={classNames(css.star, { [css.starFilled]: filled })}
                      aria-label={isEN ? `${n} stars` : `${n} estrelas`}
                      onMouseEnter={() => setHoveredStar(n)}
                      onClick={() => setRating(rating === n ? 0 : n)}
                    >
                      ★
                    </button>
                  );
                })}
              </div>
            </div>

            <div className={css.field}>
              <div className={css.label}>
                {t(isEN, 'Como podemos melhorar?', 'How can we improve?')}
              </div>
              <textarea
                className={classNames(css.textarea, { [css.inputError]: !!errors.message })}
                rows={3}
                value={message}
                onChange={e => {
                  setMessage(e.target.value);
                  setErrors(prev => ({ ...prev, message: undefined }));
                }}
                placeholder={t(isEN,
                  'Diz-nos o que correu bem ou o que mudarias…',
                  'Tell us what went well or what you would change…'
                )}
                maxLength={MESSAGE_MAX}
              />
              {errors.message ? <div className={css.fieldError}>{errors.message}</div> : null}
            </div>

            <div className={css.field}>
              <div className={css.label}>
                {t(isEN, 'O teu email', 'Your email')}
              </div>
              <input
                type="email"
                className={classNames(css.input, { [css.inputError]: !!errors.email })}
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  setErrors(prev => ({ ...prev, email: undefined }));
                }}
                placeholder="voce@exemplo.com"
                autoComplete="email"
              />
              {errors.email ? <div className={css.fieldError}>{errors.email}</div> : null}
            </div>

            {errors.submit ? <div className={css.fieldError}>{errors.submit}</div> : null}

            <button type="submit" className={css.submitBtn} disabled={status === 'sending'}>
              {status === 'sending'
                ? t(isEN, 'A enviar…', 'Sending…')
                : t(isEN, 'Enviar feedback', 'Send feedback')}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackPromptModal;
