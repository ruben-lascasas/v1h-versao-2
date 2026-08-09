import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import { Page, LayoutSingleColumn, H2 } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './CareersPage.module.css';

/**
 * Vagas de emprego.
 *
 * As vagas vivem no careers-page.com e entram por iframe. Não replicamos nada
 * do lado de cá: quem publica as vagas gere-as lá, e esta página só as mostra.
 *
 * O iframe precisa de estar autorizado na CSP (server/csp.js, frameSrc). Sem
 * isso é bloqueado sem erro visível assim que a CSP passar de "report" a
 * "block" em produção.
 */

// Sem include_header: com ele, o embed trazia outra vez o logótipo Venue1Hub no
// topo e uma faixa preta de redes sociais no fundo, a duplicar o cabeçalho e o
// rodapé que a página já tem à volta.
const CAREERS_SRC = 'https://venue1hub.careers-page.com/';

const t = (isEN, pt, en) => (isEN ? en : pt);

const CareersPage = props => {
  const { scrollingDisabled } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const title = t(isEN, 'Trabalhar connosco | Venue1Hub', 'Careers | Venue1Hub');

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <H2 as="h1" className={css.title}>
            {t(isEN, 'Trabalhar connosco', 'Work with us')}
          </H2>
          <p className={css.intro}>
            {t(
              isEN,
              'Estamos a construir o marketplace de espaços comerciais de referência. Veja as vagas abertas e candidate-se.',
              'We are building the reference marketplace for commercial spaces. See our open roles and apply.'
            )}
          </p>

          <div className={css.frameWrapper}>
            <iframe
              className={css.frame}
              src={CAREERS_SRC}
              title={t(isEN, 'Vagas de emprego', 'Open roles')}
              loading="lazy"
            />
          </div>

          {/* Se o iframe não carregar — bloqueio de CSP, extensão do browser ou
              o serviço em baixo — a página ficaria em branco sem explicação. */}
          <p className={css.fallback}>
            {t(isEN, 'Não vê as vagas? ', 'Not seeing the roles? ')}
            <a href={CAREERS_SRC} target="_blank" rel="noopener noreferrer">
              {t(isEN, 'Abrir numa janela nova', 'Open in a new window')}
            </a>
          </p>
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({ scrollingDisabled: isScrollingDisabled(state) });

export default compose(connect(mapStateToProps))(CareersPage);
