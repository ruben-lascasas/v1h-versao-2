import React, { useEffect, useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';

import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import LegalDocument from '../LegalPage/LegalDocument';

import css from './BookingContractPage.module.css';

/**
 * O contrato de uma reserva.
 *
 * Os Termos dizem que o contrato relativo ao Espaço se celebra directamente
 * entre Anfitrião e Cliente. Esta é a página onde as duas partes o conseguem
 * ver — até aqui era uma afirmação sem objecto.
 *
 * O texto vem preenchido do servidor, que é quem tem acesso aos dados das duas
 * partes e verifica que quem pede é uma delas. O componente que o desenha é o
 * mesmo `LegalDocument` das páginas jurídicas: é o mesmo tipo de conteúdo e não
 * há razão para ter dois renderizadores.
 */
export const BookingContractPageComponent = props => {
  const { scrollingDisabled, params } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const id = params?.id;

  const [estado, setEstado] = useState({ fase: 'a-carregar' });

  useEffect(() => {
    let vivo = true;
    fetch(`/api/booking-contract/${id}`, { credentials: 'include' })
      .then(async r => {
        const corpo = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (r.ok) setEstado({ fase: 'pronto', ...corpo });
        else setEstado({ fase: 'erro', codigo: r.status, erro: corpo.error });
      })
      .catch(() => vivo && setEstado({ fase: 'erro', codigo: 0 }));
    return () => {
      vivo = false;
    };
  }, [id]);

  const mensagemDeErro = () => {
    if (estado.codigo === 401) {
      return isEN ? 'Sign in to see this contract.' : 'Inicie sessão para ver este contrato.';
    }
    if (estado.codigo === 403) {
      // Dito assim de propósito: não se confirma nem desmente que a reserva
      // existe a quem não é parte dela.
      return isEN
        ? 'This contract belongs to a booking you are not part of.'
        : 'Este contrato pertence a uma reserva de que não faz parte.';
    }
    if (estado.codigo === 404) {
      return isEN ? 'Booking not found.' : 'Reserva não encontrada.';
    }
    return isEN ? 'The contract could not be loaded.' : 'Não foi possível carregar o contrato.';
  };

  return (
    <Page
      title={isEN ? 'Booking contract | Venue1Hub' : 'Contrato da reserva | Venue1Hub'}
      scrollingDisabled={scrollingDisabled}
    >
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          {estado.fase === 'a-carregar' ? <p className={css.aviso}>…</p> : null}

          {estado.fase === 'erro' ? <p className={css.aviso}>{mensagemDeErro()}</p> : null}

          {estado.fase === 'pronto' ? (
            <>
              {/* Fora da impressão: numa folha impressa, botões e migalhas são
                  ruído, e o contrato deve sair como contrato. */}
              <div className={css.semImpressao}>
                <NamedLink name="LegalCentrePage" className={css.voltar}>
                  ‹ {isEN ? 'Legal & Trust Centre' : 'Centro Jurídico'}
                </NamedLink>
                <button type="button" className={css.imprimir} onClick={() => window.print()}>
                  {isEN ? 'Print or save as PDF' : 'Imprimir ou guardar em PDF'}
                </button>
              </div>

              <h1 className={css.titulo}>{estado.titulo}</h1>
              <p className={css.meta}>
                {isEN ? 'Version' : 'Versão'} {estado.versao}
                {estado.congeladoEm
                  ? ` · ${isEN ? 'formed on' : 'formado em'} ${new Date(estado.congeladoEm)
                      .toISOString()
                      .slice(0, 10)
                      .split('-')
                      .reverse()
                      .join('-')}`
                  : null}
              </p>

              <LegalDocument blocos={estado.blocos} />
            </>
          ) : null}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({ scrollingDisabled: isScrollingDisabled(state) });

const BookingContractPage = compose(connect(mapStateToProps))(BookingContractPageComponent);

export default BookingContractPage;
