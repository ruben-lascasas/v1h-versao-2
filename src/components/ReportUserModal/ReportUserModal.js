import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { FormattedMessage, useIntl } from '../../util/reactIntl';
import { apiBaseUrl } from '../../util/api';
import css from './ReportUserModal.module.css';

const REASON_KEYS = [
  'inappropriateBehavior',
  'fakeAccount',
  'harassment',
  'scam',
  'discrimination',
  'spam',
  'other',
];

const ReportUserModal = ({ isOpen, onClose, user }) => {
  const intl = useIntl();
  const currentUser = useSelector(state => state.user?.currentUser);
  const userEmail = currentUser?.attributes?.email || '';

  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState({});
  const [confirmingSubmit, setConfirmingSubmit] = useState(false);
  const [limitError, setLimitError] = useState(null);
  const [status, setStatus] = useState(null);

  const isEN = (intl?.locale || 'pt').toLowerCase().startsWith('en');

  useEffect(() => {
    if (isOpen) {
      setReason('');
      setDescription('');
      setEmail(userEmail);
      setAttachments([]);
      setSubmitted(false);
      setSubmitting(false);
      setConfirmingSubmit(false);
      setErrors({});
      setLimitError(null);
      setStatus(null);
    }
  }, [isOpen, userEmail]);

  // Fetch the reporter's current rate-limit status when the modal opens so
  // we can show "X/5 today" and explain the rules before they hit a wall.
  useEffect(() => {
    if (!isOpen) return;
    const targetId = user?.id?.uuid || '';
    fetch(`${apiBaseUrl()}/api/report-user-status?targetId=${encodeURIComponent(targetId)}`, {
      credentials: 'include',
    })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (data) setStatus(data);
      })
      .catch(() => {
        /* ignored — banner stays hidden */
      });
  }, [isOpen, user?.id?.uuid]);

  useEffect(() => {
    if (!isOpen) return undefined;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const userName = user?.attributes?.profile?.displayName || '';
  const userId = user?.id?.uuid || '';
  const userUrl = typeof window !== 'undefined' ? window.location.href : '';

  const handleSubmit = e => {
    e.preventDefault();
    const newErrors = {};

    if (!reason) {
      newErrors.reason = intl.formatMessage({ id: 'ReportUserModal.errorReason' });
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
      newErrors.email = intl.formatMessage({ id: 'ReportUserModal.errorEmail' });
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setConfirmingSubmit(true);
  };

  const handleConfirmSend = async () => {
    setSubmitting(true);
    const reasonLabel = intl.formatMessage({ id: `ReportUserModal.reason.${reason}` });

    try {
      const localeShort = (intl?.locale || 'pt').toLowerCase().startsWith('en') ? 'en' : 'pt';
      const response = await fetch(`${apiBaseUrl()}/api/report-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          userName,
          userId,
          userUrl,
          reasonKey: reason,
          reasonLabel,
          description,
          reporterEmail: email,
          attachments,
          locale: localeShort,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 429 || response.status === 503) {
          setLimitError(body.error || 'Não foi possível enviar a denúncia.');
          setSubmitting(false);
          setConfirmingSubmit(false);
          return;
        }
      }
    } catch (err) {
      // network error — still show success so we don't hint at internals
    }
    setSubmitting(false);
    setConfirmingSubmit(false);
    setSubmitted(true);
  };

  const handleFilesChange = async e => {
    const newFiles = Array.from(e.target.files || []);
    const slotsLeft = 6 - attachments.length;
    const filesToAdd = newFiles.slice(0, slotsLeft);
    const reads = await Promise.all(
      filesToAdd.map(
        file =>
          new Promise(resolve => {
            const reader = new FileReader();
            reader.onload = () =>
              resolve({ filename: file.name, base64: reader.result, size: file.size });
            reader.onerror = () => resolve(null);
            reader.readAsDataURL(file);
          })
      )
    );
    const valid = reads.filter(r => r && r.size <= 5 * 1024 * 1024);
    setAttachments(prev => [...prev, ...valid]);
    e.target.value = '';
  };

  const handleRemoveAttachment = index => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleBackdropClick = e => {
    if (e.target === e.currentTarget) onClose();
  };

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div className={css.backdrop} role="dialog" aria-modal="true" onClick={handleBackdropClick}>
      <div className={css.modal}>
        <div className={css.header}>
          <h2 className={css.title}>
            <FormattedMessage id="ReportUserModal.title" />
          </h2>
          <button type="button" className={css.close} onClick={onClose} aria-label="Close">×</button>
        </div>

        <div className={css.scrollArea}>

        {status && !submitted && !limitError ? (
          <div className={css.limitsBanner}>
            <span>
              {isEN
                ? `Limit: ${status.maxPerDay} reports per day.`
                : `Limite: ${status.maxPerDay} denúncias por dia.`}
            </span>
            <span className={css.limitsCounter}>
              {status.usedToday}/{status.maxPerDay}
            </span>
          </div>
        ) : null}

        {limitError ? (
          <div className={css.successWrapper}>
            <p className={css.successText} style={{ color: '#c62828' }}>
              {limitError}
            </p>
            <button type="button" className={css.btnPrimary} onClick={onClose}>
              <FormattedMessage id="ReportUserModal.close" />
            </button>
          </div>
        ) : submitted ? (
          <div className={css.successWrapper}>
            <p className={css.successText}>
              <FormattedMessage id="ReportUserModal.successText" />
            </p>
            <button type="button" className={css.btnPrimary} onClick={onClose}>
              <FormattedMessage id="ReportUserModal.close" />
            </button>
          </div>
        ) : confirmingSubmit ? (
          <div className={css.successWrapper}>
            <p className={css.successText}>
              <FormattedMessage id="ReportUserModal.confirmTitle" />
            </p>
            <p className={css.successFallback}>
              <FormattedMessage id="ReportUserModal.confirmText" />
            </p>
            <div className={css.actions} style={{ justifyContent: 'center' }}>
              <button
                type="button"
                className={css.btnSecondary}
                onClick={() => setConfirmingSubmit(false)}
                disabled={submitting}
              >
                <FormattedMessage id="ReportUserModal.confirmCancel" />
              </button>
              <button
                type="button"
                className={css.btnPrimary}
                onClick={handleConfirmSend}
                disabled={submitting}
              >
                {submitting
                  ? <FormattedMessage id="ReportUserModal.sending" />
                  : <FormattedMessage id="ReportUserModal.confirmYes" />}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={css.form} noValidate>
            <p className={css.intro}>
              <FormattedMessage id="ReportUserModal.intro" values={{ user: <strong>{userName}</strong> }} />
            </p>

            <label className={css.label}>
              <span className={css.labelText}><FormattedMessage id="ReportUserModal.reasonLabel" /> *</span>
              <select
                className={css.select}
                value={reason}
                onChange={e => {
                  setReason(e.target.value);
                  if (errors.reason) setErrors(prev => ({ ...prev, reason: undefined }));
                }}
              >
                <option value="">{intl.formatMessage({ id: 'ReportUserModal.reasonPlaceholder' })}</option>
                {REASON_KEYS.map(key => (
                  <option key={key} value={key}>
                    {intl.formatMessage({ id: `ReportUserModal.reason.${key}` })}
                  </option>
                ))}
              </select>
              {errors.reason && <p className={css.error}>{errors.reason}</p>}
            </label>

            <label className={css.label}>
              <span className={css.labelText}><FormattedMessage id="ReportUserModal.descriptionLabel" /></span>
              <textarea
                className={css.textarea}
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                maxLength={3000}
                placeholder={intl.formatMessage({ id: 'ReportUserModal.descriptionPlaceholder' })}
              />
            </label>

            <div className={css.label}>
              <span className={css.labelText}><FormattedMessage id="ReportUserModal.attachmentsLabel" /></span>
              {attachments.length > 0 && (
                <div className={css.thumbsRow}>
                  {attachments.map((att, i) => (
                    <div key={i} className={css.thumb}>
                      <img src={att.base64} alt={att.filename} />
                      <button
                        type="button"
                        className={css.thumbRemove}
                        onClick={() => handleRemoveAttachment(i)}
                        aria-label="Remove"
                      >×</button>
                    </div>
                  ))}
                </div>
              )}
              {attachments.length < 6 && (
                <label className={css.fileButton}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                  </svg>
                  <FormattedMessage id="ReportUserModal.attachmentsButton" values={{ count: attachments.length }} />
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleFilesChange}
                    className={css.fileInputHidden}
                  />
                </label>
              )}
            </div>

            <label className={css.label}>
              <span className={css.labelText}><FormattedMessage id="ReportUserModal.emailLabel" /> *</span>
              <input
                type="email"
                className={css.input}
                value={email}
                onChange={e => {
                  setEmail(e.target.value);
                  if (errors.email) setErrors(prev => ({ ...prev, email: undefined }));
                }}
                placeholder="email@exemplo.com"
                maxLength={254}
                autoComplete="email"
              />
              {errors.email && <p className={css.error}>{errors.email}</p>}
            </label>

            <div className={css.actions}>
              <button type="button" className={css.btnSecondary} onClick={onClose}>
                <FormattedMessage id="ReportUserModal.cancel" />
              </button>
              <button type="submit" className={css.btnPrimary}>
                <FormattedMessage id="ReportUserModal.submit" />
              </button>
            </div>
          </form>
        )}
        </div>
      </div>
    </div>,
    document.body
  );
};

export default ReportUserModal;
