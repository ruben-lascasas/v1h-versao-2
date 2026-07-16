import React, { useEffect } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import { useLocation } from 'react-router-dom';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import FAQContent from './FAQContent';

import css from './ComoFuncionaPage.module.css';

const t = (isEN, pt, en) => (isEN ? en : pt);

const IconSearch = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="11" cy="11" r="8" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M21 21l-4.35-4.35" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconCalendar = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconChat = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconCheck = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 4L12 14.01l-3-3" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconHome = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 22V12h6v10" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconStar = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconEuro = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M4 10h12M4 14h12" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
    <path d="M19 5a9 9 0 1 0 0 14" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round"/>
  </svg>
);

const IconShield = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ComoFuncionaPage = props => {
  const { scrollingDisabled } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const location = useLocation();

  // When the user lands on /como-funciona#faq (e.g. from the footer "Perguntas
  // frequentes" link), scroll to the FAQ section after first paint.
  useEffect(() => {
    if (location.hash) {
      const id = location.hash.replace('#', '');
      // Delay one frame so the lazy-loaded sections are mounted before scroll.
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
  }, [location.hash]);

  const organizerSteps = [
    {
      icon: <IconSearch />,
      step: '01',
      title: t(isEN, 'Pesquise espaços', 'Search venues'),
      text: t(isEN,
        'Utilize os nossos filtros avançados para encontrar o espaço ideal: filtre por localização, capacidade, tipo de evento, comodidades e preço. Veja fotos, descrições detalhadas e avaliações de outros utilizadores.',
        'Use our advanced filters to find the ideal venue: filter by location, capacity, event type, amenities and price. View photos, detailed descriptions and reviews from other users.'
      ),
    },
    {
      icon: <IconChat />,
      step: '02',
      title: t(isEN, 'Contacte o anfitrião', 'Contact the host'),
      text: t(isEN,
        'Encontrou o espaço perfeito? Entre em contacto com o anfitrião diretamente através da nossa plataforma. Coloque as suas dúvidas, confirme disponibilidade e negoceie os detalhes do evento.',
        'Found the perfect venue? Contact the host directly through our platform. Ask your questions, confirm availability and negotiate event details.'
      ),
    },
    {
      icon: <IconCalendar />,
      step: '03',
      title: t(isEN, 'Reserve com segurança', 'Book securely'),
      text: t(isEN,
        'Faça a sua reserva de forma segura através do sistema de pagamentos integrado. O seu pagamento é protegido até a reserva ser confirmada pelo anfitrião.',
        'Make your booking securely through our integrated payment system. Your payment is protected until the booking is confirmed by the host.'
      ),
    },
    {
      icon: <IconCheck />,
      step: '04',
      title: t(isEN, 'Aproveite o evento', 'Enjoy the event'),
      text: t(isEN,
        'Chegue ao espaço e realize o evento dos seus sonhos. Depois, deixe uma avaliação para ajudar outros utilizadores e reconhecer os melhores anfitriões da plataforma.',
        'Arrive at the venue and host the event of your dreams. Afterwards, leave a review to help other users and recognise the best hosts on the platform.'
      ),
    },
  ];

  const hostSteps = [
    {
      icon: <IconHome />,
      step: '01',
      title: t(isEN, 'Registe o seu espaço', 'Register your space'),
      text: t(isEN,
        'Crie a sua conta e adicione o seu espaço de forma gratuita. Preencha as informações detalhadas (descrição, capacidade, comodidades, fotos de qualidade) para atrair os melhores eventos.',
        'Create your account and list your space for free. Fill in detailed information (description, capacity, amenities, quality photos) to attract the best events.'
      ),
    },
    {
      icon: <IconCalendar />,
      step: '02',
      title: t(isEN, 'Defina disponibilidade e preços', 'Set availability and pricing'),
      text: t(isEN,
        'Controle o seu calendário e defina os seus preços: por hora, por dia ou por evento. Configure políticas de cancelamento e condições de utilização do espaço ao seu gosto.',
        'Control your calendar and set your prices: per hour, per day or per event. Configure cancellation policies and usage conditions for your space as you see fit.'
      ),
    },
    {
      icon: <IconEuro />,
      step: '03',
      title: t(isEN, 'Receba reservas e pagamentos', 'Receive bookings and payments'),
      text: t(isEN,
        'Quando um organizador reservar o seu espaço, receberá uma notificação e poderá confirmar ou recusar. Os pagamentos são processados de forma segura e transferidos para a sua conta.',
        'When an organiser books your space, you will receive a notification and can confirm or decline. Payments are processed securely and transferred to your account.'
      ),
    },
    {
      icon: <IconStar />,
      step: '04',
      title: t(isEN, 'Construa a sua reputação', 'Build your reputation'),
      text: t(isEN,
        'Reúna avaliações positivas e destaque-se na plataforma. Os anfitriões com melhores avaliações aparecem em destaque nas pesquisas e atraem mais eventos de qualidade.',
        'Gather positive reviews and stand out on the platform. Hosts with better reviews appear prominently in searches and attract more quality events.'
      ),
    },
  ];

  return (
    <Page
      title={t(isEN, 'Como Funciona | Venue1Hub', 'How It Works | Venue1Hub')}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>

          {/* ── Hero ──────────────────────────────────── */}
          <div className={css.hero}>
            <h1 className={css.heroTitle}>{t(isEN, 'Como Funciona', 'How It Works')}</h1>
            <p className={css.heroSubtitle}>
              {t(isEN,
                'A Venue1Hub é a plataforma que liga anfitriões com espaços únicos a organizadores de eventos em Portugal. Simples, seguro e eficiente.',
                'Venue1Hub is the platform connecting hosts with unique spaces to event organisers across Portugal. Simple, secure and efficient.'
              )}
            </p>
          </div>

          {/* ── Para Organizadores ─────────────────────── */}
          <section className={css.section}>
            <div className={css.sectionInner}>
              <div className={css.sectionHeader}>
                <span className={css.sectionTag}>{t(isEN, 'Organizadores de eventos', 'Event organisers')}</span>
                <h2 className={css.sectionTitle}>
                  {t(isEN, 'Encontre e reserve o espaço ideal', 'Find and book the ideal venue')}
                </h2>
                <p className={css.sectionSubtitle}>
                  {t(isEN,
                    'Do casamento corporativo à festa de aniversário, temos o espaço certo para si.',
                    'From corporate weddings to birthday parties, we have the right space for you.'
                  )}
                </p>
              </div>
              <div className={css.stepsGrid}>
                {organizerSteps.map(step => (
                  <div key={step.step} className={css.stepCard}>
                    <div className={css.stepTop}>
                      <div className={css.stepIcon}>{step.icon}</div>
                      <span className={css.stepNumber}>{step.step}</span>
                    </div>
                    <h3 className={css.stepTitle}>{step.title}</h3>
                    <p className={css.stepText}>{step.text}</p>
                  </div>
                ))}
              </div>
              <div className={css.sectionCta}>
                <NamedLink name="SearchPage" className={css.ctaBtn}>
                  {t(isEN, 'Procurar espaços', 'Search venues')}
                </NamedLink>
              </div>
            </div>
          </section>

          {/* ── Divider ───────────────────────────────── */}
          <div className={css.dividerWrap}>
            <div className={css.divider} />
          </div>

          {/* ── Para Anfitriões ────────────────────────── */}
          <section className={css.section}>
            <div className={css.sectionInner}>
              <div className={css.sectionHeader}>
                <span className={css.sectionTag}>{t(isEN, 'Anfitriões', 'Hosts')}</span>
                <h2 className={css.sectionTitle}>
                  {t(isEN, 'Rentabilize o seu espaço', 'Monetize your space')}
                </h2>
                <p className={css.sectionSubtitle}>
                  {t(isEN,
                    'Transforme o seu espaço num negócio e receba eventos únicos sem esforço.',
                    'Turn your space into a business and host unique events effortlessly.'
                  )}
                </p>
              </div>
              <div className={css.stepsGrid}>
                {hostSteps.map(step => (
                  <div key={step.step} className={css.stepCard}>
                    <div className={css.stepTop}>
                      <div className={css.stepIcon}>{step.icon}</div>
                      <span className={css.stepNumber}>{step.step}</span>
                    </div>
                    <h3 className={css.stepTitle}>{step.title}</h3>
                    <p className={css.stepText}>{step.text}</p>
                  </div>
                ))}
              </div>
              <div className={css.sectionCta}>
                <NamedLink name="NewListingPage" className={css.ctaBtn}>
                  {t(isEN, 'Publicar o meu espaço', 'List my space')}
                </NamedLink>
              </div>
            </div>
          </section>

          {/* ── Garantias ─────────────────────────────── */}
          <section className={css.guaranteeSection}>
            <div className={css.sectionInner}>
              <div className={css.sectionHeader}>
                <h2 className={css.sectionTitle} style={{ color: '#ffffff' }}>
                  {t(isEN, 'A sua segurança é a nossa prioridade', 'Your safety is our priority')}
                </h2>
              </div>
              <div className={css.guaranteeGrid}>
                <div className={css.guaranteeCard}>
                  <div className={css.guaranteeIcon}><IconShield /></div>
                  <h3 className={css.guaranteeTitle}>{t(isEN, 'Pagamentos seguros', 'Secure payments')}</h3>
                  <p className={css.guaranteeText}>
                    {t(isEN,
                      'Todos os pagamentos são processados via Stripe, com encriptação de nível bancário.',
                      'All payments are processed via Stripe, with bank-level encryption.'
                    )}
                  </p>
                </div>
                <div className={css.guaranteeCard}>
                  <div className={css.guaranteeIcon}><IconStar /></div>
                  <h3 className={css.guaranteeTitle}>{t(isEN, 'Avaliações verificadas', 'Verified reviews')}</h3>
                  <p className={css.guaranteeText}>
                    {t(isEN,
                      'Só quem reservou pode avaliar. Avaliações reais de utilizadores reais.',
                      'Only those who booked can review. Real reviews from real users.'
                    )}
                  </p>
                </div>
                <div className={css.guaranteeCard}>
                  <div className={css.guaranteeIcon}><IconChat /></div>
                  <h3 className={css.guaranteeTitle}>{t(isEN, 'Suporte dedicado', 'Dedicated support')}</h3>
                  <p className={css.guaranteeText}>
                    {t(isEN,
                      'A nossa equipa está disponível para apoiar anfitriões e organizadores em qualquer momento.',
                      'Our team is available to support hosts and organisers at any time.'
                    )}
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ── FAQ ───────────────────────────────────── */}
          <section id="faq" className={css.faqSection}>
            <div className={css.sectionInner}>
              <div className={`${css.sectionHeader} ${css.faqSectionHeader}`}>
                <h2 className={css.sectionTitle}>
                  {t(isEN, 'Perguntas frequentes', 'Frequently asked questions')}
                </h2>
              </div>
              <FAQContent />
            </div>
          </section>

          {/* ── CTA Final ─────────────────────────────── */}
          <div className={css.ctaSection}>
            <h2 className={css.ctaTitle}>
              {t(isEN, 'Pronto para começar?', 'Ready to get started?')}
            </h2>
            <p className={css.ctaText}>
              {t(isEN,
                'Junte-se a centenas de anfitriões e organizadores que já confiam na Venue1Hub.',
                'Join hundreds of hosts and organisers who already trust Venue1Hub.'
              )}
            </p>
            <div className={css.ctaButtons}>
              <NamedLink name="SearchPage" className={css.ctaBtnPrimary}>
                {t(isEN, 'Procurar espaços', 'Search venues')}
              </NamedLink>
              <NamedLink name="NewListingPage" className={css.ctaBtnSecondary}>
                {t(isEN, 'Publicar o meu espaço', 'List my space')}
              </NamedLink>
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

export default compose(connect(mapStateToProps))(ComoFuncionaPage);
