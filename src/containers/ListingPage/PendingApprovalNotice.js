import React from 'react';

import { NamedLink } from '../../components';

import css from './ListingPage.module.css';

/**
 * O aviso de que um anúncio está à espera de aprovação.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * Um anúncio submetido fica em revisão antes de ir para as pesquisas. Até aqui
 * isso dizia-se numa linha fina por cima das fotografias — a mesma linha fina
 * que, nos anúncios encerrados, um tester percorreu a página inteira sem ver.
 * O problema é o mesmo e a solução também: quem acabou de submeter o anúncio
 * precisa de perceber em dois segundos em que pé está, sem ter de procurar.
 *
 * Veio de um pedido da equipa, depois de alguém olhar para um anúncio que
 * julgava estar em revisão e não perceber o que estava a ver.
 *
 * O QUE SE PROMETE AQUI
 *
 * O prazo (24 a 48 horas úteis) é o mesmo que está nas Perguntas Frequentes.
 * Se um dia mudar, muda nos dois sítios — um prazo escrito em dois sítios
 * diferentes acaba sempre por divergir, e quem fica mal é quem esperou.
 *
 * Só o dono do anúncio chega a ver isto: um anúncio por aprovar não é visível
 * para mais ninguém.
 */
const PendingApprovalNotice = props => {
  const { isEN } = props;

  return (
    <div className={css.avisoRevisao} role="status">
      <h2 className={css.avisoFechadoTitulo}>
        {isEN ? 'This listing is under review' : 'Este anúncio está em revisão'}
      </h2>
      <p className={css.avisoFechadoTexto}>
        {isEN
          ? 'You have submitted it and our team is checking it. This usually takes 24 to 48 working hours. Until it is approved it does not appear in searches and cannot be booked — what you see here is how it will look once it goes live. We will email you as soon as there is a decision.'
          : 'Já o submeteu e a nossa equipa está a verificá-lo. Costuma demorar 24 a 48 horas úteis. Até ser aprovado não aparece nas pesquisas nem pode ser reservado — o que vê aqui é como ficará quando for publicado. Avisamos por email assim que houver uma decisão.'}
      </p>
      <NamedLink name="ManageListingsPage" className={css.avisoFechadoBotao}>
        {isEN ? 'Manage my listings' : 'Gerir os meus anúncios'}
      </NamedLink>
    </div>
  );
};

export default PendingApprovalNotice;
