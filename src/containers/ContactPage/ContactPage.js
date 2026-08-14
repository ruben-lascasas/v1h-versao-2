import React, { useState, useRef, useEffect } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useHistory } from 'react-router-dom';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { apiBaseUrl } from '../../util/api';
import { useLocale } from '../../context/localeContext';
import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './ContactPage.module.css';

// Format rules
const NAME_ALLOWED_REGEX = /^[\p{L}\s'\-]+$/u;
const SUBJECT_DISALLOWED_REGEX = /[<>{}\\]/;

const COUNTRIES = [
  { code: 'pt', dial: '+351', digits: 9 },
  { code: 'es', dial: '+34',  digits: 9 },
  { code: 'fr', dial: '+33',  digits: 10 },
  { code: 'gb', dial: '+44',  digits: 11 },
  { code: 'de', dial: '+49',  digits: 11 },
  { code: 'it', dial: '+39',  digits: 10 },
  { code: 'nl', dial: '+31',  digits: 9 },
  { code: 'be', dial: '+32',  digits: 9 },
  { code: 'ch', dial: '+41',  digits: 9 },
  { code: 'us', dial: '+1',   digits: 10 },
  { code: 'br', dial: '+55',  digits: 11 },
  { code: 'ao', dial: '+244', digits: 9 },
  { code: 'mz', dial: '+258', digits: 9 },
];

const PhonePrefix = ({ value, onChange, disabled }) => {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = COUNTRIES.find(c => c.dial === value) || COUNTRIES[0];

  useEffect(() => {
    const handler = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className={css.phonePrefixWrapper} ref={ref}>
      <button
        type="button"
        className={css.phonePrefixBtn}
        onClick={() => !disabled && setOpen(o => !o)}
        disabled={disabled}
      >
        <span className={`fi fi-${selected.code}`} />
        <span>{selected.dial}</span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none"><path d="M1 1l4 4 4-4" stroke="#888" strokeWidth="1.5" strokeLinecap="round"/></svg>
      </button>
      {open && (
        <ul className={css.phonePrefixDropdown}>
          {COUNTRIES.map(c => (
            <li key={c.code}>
              <button
                type="button"
                className={`${css.phonePrefixOption}${c.dial === value ? ` ${css.phonePrefixOptionSelected}` : ''}`}
                onClick={() => { onChange(c.dial); setOpen(false); }}
              >
                <span className={`fi fi-${c.code}`} />
                <span>{c.code.toUpperCase()} {c.dial}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const InfoCards = ({ isEN, mobile }) => (
  <div className={css.infoItems}>
    <div className={css.infoItem}>
      <div className={css.infoIcon}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BAA38A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect fill="none" x="2" y="4" width="20" height="16" rx="2" />
          <polyline fill="none" points="22,6 12,13 2,6" />
        </svg>
      </div>
      <div>
        <div className={css.infoLabel}>Email</div>
        <span className={css.infoValue}>admin@v1h.net</span>
      </div>
    </div>

    <div className={css.infoItem}>
      <div className={css.infoIcon}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BAA38A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path fill="none" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" />
          <circle fill="none" cx="12" cy="9" r="2.5" />
        </svg>
      </div>
      <div>
        <div className={css.infoLabel}>{isEN ? 'Address' : 'Morada'}</div>
        <div className={css.infoValue}>
          {mobile
            ? <>Edifício Mira Center,<br />Rua do Matadouro<br />3070-436 Mira, Portugal</>
            : <>Edifício Mira Center, Rua do Matadouro<br />3070-436 Mira, Portugal</>}
        </div>
      </div>
    </div>

    <div className={css.infoItem}>
      <div className={css.infoIcon}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BAA38A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path fill="none" d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.44 2 2 0 0 1 3.6 1.27h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.91a16 16 0 0 0 6 6l.91-.91a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z" />
        </svg>
      </div>
      <div>
        <div className={css.infoLabel}>{isEN ? 'Phone' : 'Telefone'}</div>
        <a href="tel:+351930432478" className={css.infoValue}>+351 930 432 478</a>
      </div>
    </div>

    <div className={css.infoItem}>
      <div className={css.infoIcon}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#BAA38A" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle fill="none" cx="12" cy="12" r="10" />
          <polyline fill="none" points="12 6 12 12 16 14" />
        </svg>
      </div>
      <div>
        <div className={css.infoLabel}>{isEN ? 'Opening Hours' : 'Horário de Atendimento'}</div>
        <div className={css.infoValue}>
          {mobile
            ? (isEN ? <>Mon–Fri:<br />9:00 – 18:00</> : <>Segunda a Sexta:<br />9h00 – 18h00</>)
            : (isEN ? 'Mon–Fri: 9:00 – 18:00' : 'Segunda a Sexta: 9h00 – 18h00')}
        </div>
      </div>
    </div>
  </div>
);

const InfoNote = ({ isEN }) => (
  <div className={css.infoNote}>
    {isEN
      ? 'We usually respond within 24 business hours. Please make sure the email address you provide is valid, otherwise we will not be able to reply.'
      : 'Respondemos normalmente em menos de 24 horas úteis. Certifique-se de que o email indicado é válido, caso contrário não conseguiremos responder.'}
  </div>
);

const ContactInfo = ({ isEN }) => (
  <div className={css.info}>
    <h2 className={css.infoTitle}>{isEN ? 'Get in Touch' : 'Fale Connosco'}</h2>
    <p className={css.infoText}>
      {isEN
        ? 'We are here to help. Send us an email or call us during working hours, we will get back to you as soon as possible.'
        : 'Estamos aqui para ajudar. Envie-nos um email ou ligue-nos durante o horário disponível, respondemos o mais breve possível.'}
    </p>
    <InfoCards isEN={isEN} />
    <InfoNote isEN={isEN} />
  </div>
);

const ContactPage = props => {
  const { scrollingDisabled } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const history = useHistory();

  const [form, setForm] = useState({ name: '', email: '', phonePrefix: '+351', phone: '', subject: '', message: '' });
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');

  const handleChange = e => {
    const { name, value } = e.target;
    if (name === 'phone') {
      const country = COUNTRIES.find(c => c.dial === form.phonePrefix) || COUNTRIES[0];
      const digits = value.replace(/\D/g, '').slice(0, country.digits);
      const formatted = digits.replace(/(\d{3})(?=\d)/g, '$1 ');
      setForm(prev => ({ ...prev, phone: formatted }));
    } else {
      setForm(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setErrorMsg('');

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!form.name.trim()) {
      setErrorMsg(isEN ? 'Please enter your name.' : 'Por favor insira o seu nome.');
      return;
    }
    if (form.name.trim().length < 3) {
      setErrorMsg(isEN ? 'The name must be at least 3 characters.' : 'O nome deve ter pelo menos 3 caracteres.');
      return;
    }
    if (!NAME_ALLOWED_REGEX.test(form.name.trim())) {
      setErrorMsg(
        isEN
          ? 'The name can only contain letters, spaces, hyphens and apostrophes.'
          : 'O nome só pode conter letras, espaços, hífens e apóstrofos.'
      );
      return;
    }
    if (!form.email.trim() || !emailRegex.test(form.email)) {
      setErrorMsg(isEN ? 'Please enter a valid email address.' : 'Por favor insira um endereço de email válido.');
      return;
    }
    if (!form.phone.trim()) {
      setErrorMsg(isEN ? 'Please enter your phone number.' : 'Por favor insira o seu número de telefone.');
      return;
    }
    if (!form.subject.trim()) {
      setErrorMsg(isEN ? 'Please enter a subject.' : 'Por favor insira o assunto.');
      return;
    }
    if (form.subject.trim().length < 3) {
      setErrorMsg(isEN ? 'The subject must be at least 3 characters.' : 'O assunto deve ter pelo menos 3 caracteres.');
      return;
    }
    if (SUBJECT_DISALLOWED_REGEX.test(form.subject)) {
      setErrorMsg(
        isEN
          ? 'The subject contains characters that are not allowed (< > { } \\).'
          : 'O assunto contém caracteres não permitidos (< > { } \\).'
      );
      return;
    }
    if (!form.message.trim()) {
      setErrorMsg(isEN ? 'Please write your message.' : 'Por favor escreva a sua mensagem.');
      return;
    }
    if (form.message.trim().length < 10) {
      setErrorMsg(isEN ? 'The message must be at least 10 characters.' : 'A mensagem deve ter pelo menos 10 caracteres.');
      return;
    }

    setStatus('sending');

    try {
      const res = await fetch(`${apiBaseUrl()}/api/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || (isEN ? 'Error sending message.' : 'Erro ao enviar a mensagem.'));
      }
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || (isEN ? 'An error occurred. Please try again.' : 'Ocorreu um erro. Tente novamente.'));
    }
  };

  const handleReset = () => {
    setForm({ name: '', email: '', phonePrefix: '+351', phone: '', subject: '', message: '' });
    setStatus('idle');
    setErrorMsg('');
  };

  return (
    <Page
      title={isEN ? 'Contact – Venue1Hub' : 'Contacto – Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.root}>
          <div className={css.container}>
            <div className={css.card}>
              <ContactInfo isEN={isEN} />

              <div className={css.divider} />

              <div className={css.formWrapper}>
                <div className={css.header}>
                  <h1 className={css.pageTitle}>{isEN ? 'Contact' : 'Contacto'}</h1>
                  <p className={`${css.pageSubtitle} ${css.pageSubtitleMobile}`}>
                    {isEN
                      ? 'Get in touch, send us an email or call us during working hours, we will get back to you as soon as possible.'
                      : 'Fale connosco, envie-nos um email ou ligue-nos durante o horário disponível, respondemos o mais breve possível.'}
                  </p>
                  <p className={`${css.pageSubtitle} ${css.pageSubtitleDesktop}`}>
                    {isEN
                      ? 'Have a question or suggestion? We are at your disposal.'
                      : 'Tem alguma dúvida ou sugestão? Estamos ao seu dispor.'}
                  </p>
                </div>

                <div className={css.mobileInfoBlock}>
                  <InfoCards isEN={isEN} mobile />
                </div>

                {status === 'success' ? (
                  <div className={css.success}>
                    <div className={css.successIcon}>
                      <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#BAA38A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle fill="none" cx="12" cy="12" r="10" />
                        <polyline fill="none" points="8 12 11 15 16 9" />
                      </svg>
                    </div>
                    <h3 className={css.successTitle}>{isEN ? 'Message sent!' : 'Mensagem enviada!'}</h3>
                    <p className={css.successText}>
                      {isEN
                        ? 'We have received your message and will get back to you shortly. Thank you for contacting us.'
                        : 'Recebemos a sua mensagem e responderemos em breve. Obrigado por nos contactar.'}
                    </p>
                    <div className={css.successButtons}>
                      <button className={css.resetButton} onClick={handleReset}>
                        {isEN ? 'Send another message' : 'Enviar outra mensagem'}
                      </button>
                      <button
                        type="button"
                        className={css.homeButton}
                        onClick={() => history.push('/')}
                      >
                        {isEN ? 'Back to home' : 'Voltar ao início'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <form className={css.form} onSubmit={handleSubmit} noValidate>
                    <div className={css.row}>
                      <div className={css.field}>
                        <label className={css.label} htmlFor="contact-name">{isEN ? 'Name' : 'Nome'}</label>
                        <input
                          id="contact-name"
                          className={css.input}
                          type="text"
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          placeholder={isEN ? 'Your full name' : 'O seu nome completo'}
                          maxLength={70}
                          required
                          disabled={status === 'sending'}
                        />
                      </div>
                      <div className={css.field}>
                        <label className={css.label} htmlFor="contact-email">Email</label>
                        <input
                          id="contact-email"
                          className={css.input}
                          type="email"
                          name="email"
                          value={form.email}
                          onChange={handleChange}
                          placeholder={isEN ? 'your@email.com' : 'o.seu@email.com'}
                          maxLength={100}
                          required
                          disabled={status === 'sending'}
                        />
                      </div>
                      <div className={css.field}>
                        <label className={css.label} htmlFor="contact-phone">{isEN ? 'Phone' : 'Telefone'}</label>
                        <div className={css.phoneInputWrapper}>
                          <PhonePrefix
                            value={form.phonePrefix}
                            onChange={val => setForm(prev => ({ ...prev, phonePrefix: val, phone: '' }))}
                            disabled={status === 'sending'}
                          />
                          <input
                            id="contact-phone"
                            className={css.phoneInput}
                            type="tel"
                            name="phone"
                            value={form.phone}
                            onChange={handleChange}
                            placeholder="9XX XXX XXX"
                            required
                            disabled={status === 'sending'}
                          />
                        </div>
                      </div>
                    </div>

                    <div className={css.field}>
                      <label className={css.label} htmlFor="contact-subject">{isEN ? 'Subject' : 'Assunto'}</label>
                      <input
                        id="contact-subject"
                        className={css.input}
                        type="text"
                        name="subject"
                        value={form.subject}
                        onChange={handleChange}
                        placeholder={isEN ? 'How can we help?' : 'Em que podemos ajudar?'}
                        maxLength={150}
                        required
                        disabled={status === 'sending'}
                      />
                    </div>

                    <div className={css.field}>
                      <label className={css.label} htmlFor="contact-message">{isEN ? 'Message' : 'Mensagem'}</label>
                      <textarea
                        id="contact-message"
                        className={css.textarea}
                        name="message"
                        value={form.message}
                        onChange={handleChange}
                        placeholder={isEN ? 'Describe your question or message...' : 'Descreva a sua questão ou mensagem...'}
                        maxLength={1500}
                        required
                        rows={6}
                        disabled={status === 'sending'}
                      />
                    </div>

                    {errorMsg && (
                      <div className={css.errorMsg}>{errorMsg}</div>
                    )}

                    <button
                      className={css.submitButton}
                      type="submit"
                      disabled={status === 'sending'}
                    >
                      {status === 'sending'
                        ? (isEN ? 'Sending...' : 'A enviar...')
                        : (isEN ? 'Send message' : 'Enviar mensagem')}
                    </button>

                    <div className={css.mobileNoteBlock}>
                      <InfoNote isEN={isEN} />
                    </div>
                  </form>
                )}
              </div>
            </div>
          </div>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default compose(connect(mapStateToProps))(ContactPage);
