import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import { Page, LayoutSingleColumn } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import imgBeatriz from '../../assets/images/Beatriz.jpg';
import imgAlexandre from '../../assets/images/Alexandre.jpg';
import imgAnabela from '../../assets/images/Anabela.jpg';
import imgLidia from '../../assets/images/Lidia.jpg';
import imgTeresa from '../../assets/images/Teresa.jpg';

import css from './AboutPage.module.css';

const t = (isEN, pt, en) => (isEN ? en : pt);

const TEAM = [
  { img: imgAnabela,   name: 'Anabela Moreira',     role: 'Career Manager | HR Director', pos: 'center center' },
  { img: imgTeresa,    name: 'Teresa Chaves',        role: 'Business Developer',           pos: '70% 20%' },
  { img: imgLidia,     name: 'Lídia Leitão',         role: 'Community Manager',            pos: 'center center' },
  { img: imgAlexandre, name: 'Alexandre Gandarinho', role: 'Designer',                     pos: '60% 20%' },
  { img: imgBeatriz,   name: 'Beatriz Jerónimo',     role: 'Career Support',               pos: 'center center' },
];

const IconHourglass = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M5 2h14M5 22h14M7 2v4l5 4-5 4v4M17 2v4l-5 4 5 4v4" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const IconCompass = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="10" stroke="#ffffff" strokeWidth="1.5"/>
    <path d="M16.24 7.76l-2.12 6.36-6.36 2.12 2.12-6.36 6.36-2.12z" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <circle cx="12" cy="12" r="1" fill="#ffffff"/>
  </svg>
);

const IconPeople = () => (
  <svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="#ffffff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const AboutPage = props => {
  const { scrollingDisabled } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const CARDS = [
    {
      icon: <IconHourglass />,
      title: t(isEN, 'Como tudo começou?', 'How did it all begin?'),
      text: t(isEN,
        'A Venue1Hub nasceu da necessidade de simplificar a forma como os espaços são encontrados e reservados para eventos em Portugal. Identificámos uma lacuna no mercado e decidimos preenchê-la com tecnologia, transparência e foco nas pessoas.',
        'Venue1Hub was born from the need to simplify the way venues are found and booked for events in Portugal. We identified a gap in the market and decided to fill it with technology, transparency and a focus on people.'
      ),
    },
    {
      icon: <IconCompass />,
      title: t(isEN, 'Qual é a nossa missão?', 'What is our mission?'),
      text: t(isEN,
        'A nossa missão é tornar a descoberta e reserva de espaços para eventos simples, transparente e acessível a todos. Queremos que qualquer pessoa, seja empresa ou particular, consiga encontrar e reservar o espaço certo sem esforço.',
        'Our mission is to make discovering and booking event venues simple, transparent and accessible to everyone. We want anyone, whether a company or individual, to be able to find and book the right venue effortlessly.'
      ),
    },
    {
      icon: <IconCompass />,
      title: t(isEN, 'Qual é a nossa visão?', 'What is our vision?'),
      text: t(isEN,
        'Tornar-nos a referência global para o arrendamento de espaços comerciais de curta duração, promovendo a reutilização inteligente de infraestruturas subutilizadas e democratizando o acesso a espaços para criar, trabalhar e celebrar.',
        'To become the global reference for short-term commercial rentals, promoting the intelligent reuse of underutilised infrastructure and enabling broader access to spaces for expression, creation, and business.'
      ),
    },
    {
      icon: <IconPeople />,
      title: t(isEN, 'Quem é o nosso público?', 'Who is our audience?'),
      text: t(isEN,
        'A Venue1Hub é para anfitriões com espaços únicos que querem rentabilizá-los, e para organizadores de eventos (empresas, agências ou particulares) que precisam do espaço certo para o momento certo.',
        'Venue1Hub is for hosts with unique spaces who want to monetize them, and for event organisers (companies, agencies or individuals) who need the right venue for the right moment.'
      ),
    },
  ];

  const VALUES = [
    { title: t(isEN, 'Inovação', 'Innovation'), text: t(isEN, 'Reinventamos a forma como os espaços são partilhados.', 'We reinvent how spaces are shared.') },
    { title: t(isEN, 'Transparência', 'Transparency'), text: t(isEN, 'Preços, condições e contratos claros do início ao fim.', 'Clear pricing, terms and contracts from start to finish.') },
    { title: t(isEN, 'Inclusão', 'Inclusion'), text: t(isEN, 'Espaço para todos os perfis profissionais e criativos.', 'Room for every professional and creative profile.') },
    { title: t(isEN, 'Sustentabilidade', 'Sustainability'), text: t(isEN, 'Reutilizar é mais sustentável do que construir.', 'Reusing is more sustainable than building.') },
    { title: t(isEN, 'Excelência no Serviço', 'Service Excellence'), text: t(isEN, 'Cada reserva é um compromisso connosco e consigo.', 'Every booking is a commitment to you and to us.') },
  ];

  return (
    <Page
      title={t(isEN, 'Sobre Nós | Venue1Hub', 'About Us | Venue1Hub')}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>

          {/* ── Hero ─────────────────────────────── */}
          <div className={css.hero}>
            <h1 className={css.title}>{t(isEN, 'Sobre Nós', 'About Us')}</h1>
            <p className={css.intro}>
              {t(isEN,
                'Se chegou até nós, é porque viu a nossa empresa divulgada e tem um espaço que gostaria de rentabilizar. A V1H é uma empresa tecnológica; somos para espaços e eventos o que o Airbnb e o Booking são para alojamentos.',
                'If you\'ve reached out to us, it\'s because you\'ve seen our company advertised and have a space you\'d like to monetize. V1H is a technology company; we are to spaces and events what Airbnb and Booking are to accommodations.'
              )}
            </p>
          </div>

          {/* ── 3 Cards ───────────────────────────── */}
          <div className={css.cardsSection}>
            <div className={css.cardsGrid}>
              {CARDS.map(card => (
                <div key={card.title} className={css.card}>
                  <div className={css.cardHeader}>
                    <div className={css.cardIcon}>{card.icon}</div>
                    <h2 className={css.cardTitle}>{card.title}</h2>
                  </div>
                  <p className={css.cardText}>{card.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── Team ─────────────────────────────── */}
          <div className={css.teamSection}>
            <div className={css.teamInner}>
              <div className={css.teamHeader}>
                <h2 className={css.teamTitle}>{t(isEN, 'A nossa equipa', 'Our team')}</h2>
                <p className={css.teamSubtitle}>
                  {t(isEN,
                    'As pessoas por detrás da Venue1Hub. Uma equipa focada em construir a melhor plataforma de espaços para eventos em Portugal.',
                    'The people behind Venue1Hub. A team focused on building the best venue platform for events in Portugal.'
                  )}
                </p>
              </div>
              <div className={css.teamGrid}>
                {TEAM.map(m => (
                  <div key={m.name} className={css.teamMember}>
                    <img src={m.img} alt={m.name} className={css.teamAvatar} style={{ objectPosition: m.pos }} />
                    <p className={css.teamName}>{m.name}</p>
                    <p className={css.teamRole}>{m.role}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── Values ───────────────────────────── */}
          <div className={css.valuesSection}>
            <div className={css.valuesInner}>
              <h2 className={css.valuesTitle}>
                {t(isEN, 'Os nossos valores', 'Our values')}
              </h2>
              <div className={css.valuesGrid}>
                {VALUES.map(v => (
                  <div key={v.title} className={css.valueItem}>
                    <h3 className={css.valueTitle}>{v.title}</h3>
                    <p className={css.valueText}>{v.text}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── CTA ───────────────────────────────── */}
          <div className={css.ctaSection}>
            <p className={css.ctaText}>
              {t(isEN,
                'Pronto para encontrar o espaço perfeito?',
                'Ready to find the perfect venue?'
              )}
            </p>
            <a href="/" className={css.ctaButton}>
              {t(isEN, 'Comece a explorar', 'Start exploring')}
            </a>
          </div>

        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default compose(connect(mapStateToProps))(AboutPage);
