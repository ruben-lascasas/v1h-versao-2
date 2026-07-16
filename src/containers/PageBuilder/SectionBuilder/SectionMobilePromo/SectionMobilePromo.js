import React from 'react';
import classNames from 'classnames';
import { NamedLink } from '../../../../components';

import slide2Image from '../../../../assets/images/12.png';

import css from './SectionMobilePromo.module.css';

/**
 * Mobile-only promotional banner shown between "Anúncios em Destaque" and
 * "Porquê a V1HUB". Compact alternative to the desktop hero/slideshow.
 *
 * Hidden on viewports >= 768px.
 */
const SectionMobilePromo = props => {
  const { sectionId, className, rootClassName } = props;

  return (
    <section
      id={sectionId}
      className={classNames(rootClassName || css.root, className)}
    >
      <div className={css.bg} style={{ backgroundImage: `url(${slide2Image})` }} />
      <div className={css.overlay} />
      <div className={css.content}>
        <h2 className={css.title}>
          <span className={css.titleHighlight}>Espaços</span> livres? Nós temos quem os queira usar!
        </h2>
        <p className={css.description}>
          Tem um espaço que merece mais? Na <span className={css.descHighlight}>Venue1Hub</span>{' '}
          ajudamos a transformar espaços comerciais subutilizados em fontes de rendimento.
        </p>
        <NamedLink name="NewListingPage" className={css.cta}>
          ARRENDAR ESPAÇO
        </NamedLink>
      </div>
    </section>
  );
};

export default SectionMobilePromo;
