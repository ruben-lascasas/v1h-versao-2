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
  const { isOwnListing, isEN, publicData } = props;

  // FECHADO NÃO QUER DIZER ACABADO.
  //
  // Neste marketplace "em análise" É um anúncio fechado: ao publicar, o
  // servidor fecha-o de propósito e marca `publicData.listingPending`
  // (ver server/api/notify-admin.js), à espera da aprovação manual. O estado
  // `pendingApproval` do Sharetribe não chega a ser usado.
  //
  // Por isso este aviso dizia a quem tinha acabado de publicar que o espaço
  // "já não está disponível" e que o anúncio "está encerrado" — a leitura
  // exactamente oposta à verdade, que é estar à espera de ser aprovado. O
  // ManageListingCard já distinguia os três casos; esta página não, e foi o
  // Rafael que deu por isso (2026-10-26).
  const emAnalise = publicData?.listingPending === true;
  const recusado = publicData?.listingRejected === true;

  const titulo = emAnalise
    ? isEN
      ? 'This space is being confirmed'
      : 'Este espaço está a ser confirmado'
    : recusado
      ? isEN
        ? 'This listing needs changes'
        : 'Este anúncio precisa de alterações'
      : isEN
        ? 'This space is no longer available'
        : 'Este espaço já não está disponível';

  const texto = emAnalise
    ? isOwnListing
      ? isEN
        ? 'Your listing is under review: it does not appear in searches yet and cannot be booked. It usually takes less than 48 hours.'
        : 'O seu anúncio está em análise: ainda não aparece nas pesquisas e não pode ser reservado. Normalmente demora menos de 48 horas.'
      : isEN
        ? 'This listing is still being confirmed, so it cannot be booked yet.'
        : 'Este anúncio ainda está a ser confirmado, por isso ainda não pode ser reservado.'
    : recusado
      ? isOwnListing
        ? isEN
          ? 'It needs changes before it can be published. Check the email we sent you and edit the listing.'
          : 'Precisa de alterações antes de ser publicado. Veja o email que lhe enviámos e edite o anúncio.'
        : isEN
          ? 'This listing is not available.'
          : 'Este anúncio não está disponível.'
      : isOwnListing
        ? isEN
          ? 'Your listing is closed: it does not appear in searches and cannot be booked.'
          : 'O seu anúncio está encerrado: não aparece nas pesquisas e não pode ser reservado.'
        : isEN
          ? 'The host has closed this listing, so no new bookings can be made. The page stays available for anyone with a booking or contract linked to it.'
          : 'O anfitrião encerrou este anúncio, por isso não é possível fazer novas reservas. A página continua acessível a quem tenha uma reserva ou um contrato associados.';

  // A `.avisoRevisao` já existia para este caso — bege diz "isto fechou", azul
  // acinzentado diz "isto está a decorrer" — mas só o `PendingApprovalNotice` a
  // usava, e esse nunca aparece porque o estado `pendingApproval` não é usado.
  // Aqui serve para o que foi desenhada.
  return (
    <div className={emAnalise ? css.avisoRevisao : css.avisoFechado} role="status">
      <h2 className={css.avisoFechadoTitulo}>{titulo}</h2>
      <p className={css.avisoFechadoTexto}>{texto}</p>
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
