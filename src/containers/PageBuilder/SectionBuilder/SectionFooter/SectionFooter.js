import React, { useState } from 'react';
import { NamedLink } from '../../../../components';
import { useLocale } from '../../../../context/localeContext';
import PwaInstallButton from '../../../../components/PwaInstallButton/PwaInstallButton';
import css from './SectionFooter.module.css';

import logoWhite from '../../../../assets/images/V1H-LOGO-WHITE.png';
import iconFB from '../../../../assets/images/VH1-ICON_FB (WHITE).png';
import iconFBHover from '../../../../assets/images/fb1.png';
import iconInst from '../../../../assets/images/VH1-ICON_INST (WHITE).png';
import iconInstHover from '../../../../assets/images/insta1.png';
import iconLkin from '../../../../assets/images/VH1-ICON_LKIN (WHITE).png';
import iconLkinHover from '../../../../assets/images/linkedin1.png';
import iconTktk from '../../../../assets/images/VH1-ICON_TKTK (WHITE).png';
import iconTktkHover from '../../../../assets/images/tiktok1.png';
import iconYT from '../../../../assets/images/VH1-ICON_YT (WHITE).png';
import iconYTHover from '../../../../assets/images/yt1.png';

const SOCIAL_LINKS = [
  { icon: iconFB,   iconHover: iconFBHover,   alt: 'Facebook',  href: 'https://facebook.com/venue1hub' },
  { icon: iconInst, iconHover: iconInstHover, alt: 'Instagram', href: 'https://instagram.com/venue1hub' },
  { icon: iconLkin, iconHover: iconLkinHover, alt: 'LinkedIn',  href: 'https://linkedin.com/company/venue1hub' },
  { icon: iconTktk, iconHover: iconTktkHover, alt: 'TikTok',   href: 'https://tiktok.com/@venue1hub' },
  { icon: iconYT,   iconHover: iconYTHover,   alt: 'YouTube',  href: 'https://youtube.com/@venue1hub' },
];

const NewsletterForm = ({ isEN }) => {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState('idle'); // idle | loading | success | error

  const handleSubmit = async e => {
    e.preventDefault();
    if (!email) return;
    setStatus('loading');
    try {
      const res = await fetch('/api/newsletter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (res.ok) {
        setStatus('success');
        setEmail('');
      } else {
        setStatus('error');
      }
    } catch {
      setStatus('error');
    }
  };

  if (status === 'success') {
    return (
      <div className={css.newsletterSuccess}>
        <span className={css.newsletterSuccessIcon}>✓</span>
        {isEN ? 'You\'re subscribed! Thank you.' : 'Subscrito com sucesso! Obrigado.'}
      </div>
    );
  }

  return (
    <form className={css.newsletterForm} onSubmit={handleSubmit} noValidate>
      <div className={css.newsletterInputRow}>
        <input
          className={css.newsletterInput}
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder={isEN ? 'Your email address' : 'O seu endereço de email'}
          required
          disabled={status === 'loading'}
        />
        <button
          type="submit"
          className={css.newsletterButton}
          disabled={status === 'loading' || !email}
        >
          {status === 'loading'
            ? (isEN ? 'Sending…' : 'A enviar…')
            : (isEN ? 'Subscribe' : 'Subscrever')}
        </button>
      </div>
      {status === 'error' && (
        <p className={css.newsletterError}>
          {isEN ? 'Something went wrong. Please try again.' : 'Ocorreu um erro. Por favor tente novamente.'}
        </p>
      )}
    </form>
  );
};

const SectionFooter = () => {
  const { locale } = useLocale();
  const isEN = locale === 'en';

  return (
    <footer id="site-footer" className={css.root}>
      <div className={css.inner}>

        <div className={css.top}>
          <div className={css.brand}>
            <img src={logoWhite} alt="Venue1Hub" className={css.logo} />
            <p className={css.tagline}>
              {isEN ? 'Venue1Hub - Your Premier Venue Partner' : 'Venue1Hub - O seu principal parceiro de eventos'}
            </p>
          </div>

          <div className={css.columns}>
            <div className={css.column}>
              <h4 className={css.columnTitle}>{isEN ? 'Platform' : 'Plataforma'}</h4>
              <ul className={css.linkList}>
                <li><NamedLink name="ComoFuncionaPage">{isEN ? 'How it works' : 'Como funciona'}</NamedLink></li>
                <li><NamedLink name="SearchPage">{isEN ? 'Search listings' : 'Procurar anúncios'}</NamedLink></li>
                <li><NamedLink name="NewListingPage">{isEN ? 'Post a new listing' : 'Publicar um novo anúncio'}</NamedLink></li>
                <li>
                  <NamedLink name="ComoFuncionaPage" to={{ hash: '#faq' }}>
                    {isEN ? 'FAQ' : 'Perguntas frequentes'}
                  </NamedLink>
                </li>
              </ul>
            </div>
            <div className={css.column}>
              <h4 className={css.columnTitle}>{isEN ? 'Company' : 'Empresa'}</h4>
              <ul className={css.linkList}>
                <li><NamedLink name="AboutPage">{isEN ? 'About us' : 'Sobre nós'}</NamedLink></li>
                <li><NamedLink name="ContactPage">{isEN ? 'Contact' : 'Contacto'}</NamedLink></li>
              </ul>
            </div>
            <div className={css.column}>
              <h4 className={css.columnTitle}>{isEN ? 'Support' : 'Suporte'}</h4>
              <ul className={css.linkList}>
                <li><NamedLink name="TermsOfServicePage">{isEN ? 'Terms of service' : 'Termos de serviço'}</NamedLink></li>
                <li><NamedLink name="PrivacyPolicyPage">{isEN ? 'Privacy policy' : 'Política de privacidade'}</NamedLink></li>
                <li><NamedLink name="CookiePolicyPage">{isEN ? 'Cookie policy' : 'Política de cookies'}</NamedLink></li>
                <li>
                  <button
                    type="button"
                    className={css.linkButton}
                    onClick={() => {
                      if (typeof window !== 'undefined' && typeof window.__v1hOpenCookiePrefs === 'function') {
                        window.__v1hOpenCookiePrefs();
                      }
                    }}
                  >
                    {isEN ? 'Cookie settings' : 'Definições de cookies'}
                  </button>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className={css.newsletter}>
          <div className={css.newsletterText}>
            <h4 className={css.newsletterTitle}>
              {isEN ? 'Stay in the loop' : 'Fique sempre a par'}
            </h4>
            <p className={css.newsletterSubtitle}>
              {isEN
                ? 'Get the latest spaces, exclusive deals and event tips.'
                : 'Receba novidades sobre espaços, promoções exclusivas e dicas para eventos.'}
            </p>
          </div>
          <NewsletterForm isEN={isEN} />
        </div>

        <div className={css.divider} />

        <div className={css.bottom}>
          <p className={css.copyright}>
            © {new Date().getFullYear()} Venue1Hub. {isEN ? 'All rights reserved.' : 'Todos os direitos reservados.'}
          </p>
          <div className={css.installSlot}>
            <PwaInstallButton />
          </div>
          <div className={css.socialIcons}>
            {SOCIAL_LINKS.map(({ icon, iconHover, alt, href }) => (
              <a key={alt} href={href} target="_blank" rel="noopener noreferrer" className={css.socialLink}>
                <img src={icon} alt={alt} className={css.socialIcon} />
                <img src={iconHover} alt="" aria-hidden="true" className={css.socialIconHover} />
              </a>
            ))}
          </div>
        </div>

      </div>
    </footer>
  );
};

export default SectionFooter;