import React, { useState } from 'react';
import { NamedLink } from '../../../../components';
import { useLocale } from '../../../../context/localeContext';
import PwaInstallButton from '../../../../components/PwaInstallButton/PwaInstallButton';
import { SOCIAL_PROFILES } from '../../../../config/socialLinks';
import { OPERADOR } from '../../../../config/legalEntity';
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

// Os endereços vivem em src/config/socialLinks.js; aqui só se lhes dá cara.
// Uma rede declarada lá sem ícone conta para o SEO mas não aparece no rodapé,
// o que evita um espaço vazio na fila de ícones enquanto a arte não existe.
const ICONES = {
  fb: { icon: iconFB, iconHover: iconFBHover },
  inst: { icon: iconInst, iconHover: iconInstHover },
  lkin: { icon: iconLkin, iconHover: iconLkinHover },
  tktk: { icon: iconTktk, iconHover: iconTktkHover },
  yt: { icon: iconYT, iconHover: iconYTHover },
};

/**
 * Os documentos que ficam à vista no rodapé.
 *
 * Seis, e não treze.
 *
 * O guia interno sugeria treze, mas no ecrã isso dava uma coluna com 706px
 * contra 222 e 178 das outras — quatro vezes mais alta, e a puxar o rodapé todo
 * para baixo. Uma lista que ninguém lê não informa mais do que uma que se lê.
 *
 * Ficam os que as pessoas procuram mesmo, e "Todos os documentos" leva aos 38.
 * Era para isso que o Centro Jurídico existia.
 */
const RODAPE_LEGAL = [
  { slug: 'termos-de-servico', pt: 'Termos de serviço', en: 'Terms of service' },
  { slug: 'politica-de-privacidade', pt: 'Política de privacidade', en: 'Privacy policy' },
  { slug: 'politica-de-cookies', pt: 'Política de cookies', en: 'Cookie policy' },
  { slug: 'cancelamento-e-reembolso', pt: 'Cancelamentos e reembolsos', en: 'Cancellations & refunds' },
  { slug: 'taxas-e-comissoes', pt: 'Taxas e comissões', en: 'Fees' },
  { slug: 'aviso-legal', pt: 'Aviso legal', en: 'Legal notice' },
];

const SOCIAL_LINKS = SOCIAL_PROFILES.filter(p => ICONES[p.icone]).map(p => ({
  ...ICONES[p.icone],
  alt: p.nome,
  href: p.url,
}));

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
        // Quem subscreve pode nem ter conta, por isso a língua da confirmação
        // vem do que a pessoa está a ver, não de um perfil.
        body: JSON.stringify({ email, locale: isEN ? 'en' : 'pt' }),
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
                <li><NamedLink name="CareersPage">{isEN ? 'Careers' : 'Trabalhar connosco'}</NamedLink></li>
              </ul>
            </div>
            <div className={css.column}>
              <h4 className={css.columnTitle}>{isEN ? 'Legal' : 'Jurídico'}</h4>
              {/* O guia interno é explícito: não pôr dezenas de links soltos no
                  rodapé. Ficam os essenciais, e o Centro Jurídico leva aos 38. */}
              <ul className={css.linkList}>
                {RODAPE_LEGAL.map(({ slug, pt, en }) => (
                  <li key={slug}>
                    <NamedLink name="LegalPage" params={{ slug }}>{isEN ? en : pt}</NamedLink>
                  </li>
                ))}
                <li>
                  <NamedLink name="LegalCentrePage" className={css.legalCentreLink}>
                    {isEN ? 'All legal documents' : 'Todos os documentos'}
                  </NamedLink>
                </li>
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

        {/* Identificação da entidade operadora. Exigida por lei e pelo guia
            interno, e até aqui não existia em lado nenhum do site. Sai de
            src/config/legalEntity.js, a mesma fonte que o Centro Jurídico e o
            rodapé das faturas usam. */}
        <div className={css.operador}>
          <p className={css.operadorTexto}>
            <strong>{OPERADOR.nome}</strong> · {isEN ? 'Registry code' : 'Número de registo'}{' '}
            {OPERADOR.registo} · {OPERADOR.morada}
            <br />
            {isEN ? 'Operator of the' : 'Entidade operadora da'} {OPERADOR.marca} ·{' '}
            <a href={`mailto:${OPERADOR.email}`} className={css.operadorLink}>
              {OPERADOR.email}
            </a>
          </p>
        </div>

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