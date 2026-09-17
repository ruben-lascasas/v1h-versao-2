import React from 'react';

import { NamedLink } from '../../components';

import css from './ListingPage.module.css';

/**
 * O aviso de que um anúncio já não está disponível.
 *
 * PORQUE É QUE ISTO EXISTE
 *
 * Um anúncio "eliminado" não é apagado: fica fechado. E ainda bem — quem tem
 * uma reserva, um contrato ou um recibo daquele espaço precisa de conseguir
 * chegar à página. O que não pode é a página parecer uma oferta viva.
 *
 * Até aqui dizia-o em dois sítios discretos: uma linha por cima das
 * fotografias, que nesta disposição nem chega a aparecer a quem não é o dono, e
 * uma linha cinzenta onde estava o botão de reservar. Um tester percorreu a
 * página inteira e a conclusão dele foi "podia ser um pouco mais óbvio" — o que
 * é a forma educada de dizer que não se vê.
 *
 * Quem cá chega precisa de duas coisas: perceber em dois segundos, e ter para
 * onde ir a seguir.
 */
const ClosedListingNotice = (props) => {
  // Nota: ao dono não se promete a reabertura. "Apagar" um anúncio fecha-o e
  // esconde-o da lista dele (ver util/deletedListings.js), por isso pode não
  // haver lá nada para reabrir — e mandá-lo procurar o que não existe seria o
  // mesmo tipo de beco que este aviso veio resolver.
  const { isOwnListing, isEN } = props;

  return (
    <div className={css.avisoFechado} role="status">
      <h2 className={css.avisoFechadoTitulo}>
        {isEN ? 'This space is no longer available' : 'Este espaço já não está disponível'}
      </h2>
      <p className={css.avisoFechadoTexto}>
        {isOwnListing
          ? isEN
            ? 'Your listing is closed: it does not appear in searches and cannot be booked.'
            : 'O seu anúncio está encerrado: não aparece nas pesquisas e não pode ser reservado.'
          : isEN
            ? 'The host has closed this listing, so no new bookings can be made. The page stays available for anyone with a booking or contract linked to it.'
            : 'O anfitrião encerrou este anúncio, por isso não é possível fazer novas reservas. A página continua acessível a quem tenha uma reserva ou um contrato associados.'}
      </p>
      {isOwnListing ? (
        <NamedLink name="ManageListingsPage" className={css.avisoFechadoBotao}>
          {isEN ? 'Manage my listings' : 'Gerir os meus anúncios'}
        </NamedLink>
      ) : (
        <NamedLink name="SearchPage" to={{ search: '' }} className={css.avisoFechadoBotao}>
          {isEN ? 'See other spaces' : 'Ver outros espaços'}
        </NamedLink>
      )}
    </div>
  );
};

export default ClosedListingNotice;
