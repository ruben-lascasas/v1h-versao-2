import React from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import loadable from '@loadable/component';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import { documentoPorSlug } from '../../config/legalDocuments';

import { Page, LayoutSingleColumn, NamedLink } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';
import NotFoundPage from '../NotFoundPage/NotFoundPage';

import LegalDocument, { idDaSeccao } from './LegalDocument';
import css from './LegalPage.module.css';

/** Índice navegável. Estes documentos têm 60 e tal secções — sem índice, perde-se. */
const Indice = ({ doc, isEN }) => {
  const seccoes = doc.blocos
    .map((b, i) => ({ ...b, i }))
    .filter(b => b.tipo === 'h2' || b.tipo === 'h3');

  if (seccoes.length < 4) return null;

  return (
    <nav className={css.indice} aria-label={isEN ? 'Table of contents' : 'Índice'}>
      <p className={css.indiceTitulo}>{isEN ? 'In this document' : 'Neste documento'}</p>
      <ul className={css.indiceLista}>
        {seccoes.map(s => (
          <li key={s.i} className={s.tipo === 'h3' ? css.indiceSub : undefined}>
            <a href={`#${idDaSeccao(s.texto, s.i)}`} className={css.indiceLink}>
              {s.texto}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
};

/**
 * Um componente serve os 38 documentos.
 *
 * O texto de cada um vive no seu próprio módulo em ./documentos/ e só é
 * descarregado quando alguém abre esse documento — juntos são 1,7 MB, que no
 * pacote inicial seria absurdo. O `cacheKey` é o que faz o loadable tratar cada
 * slug como um chunk distinto; sem ele, todos partilhariam a mesma entrada e só
 * o primeiro carregaria.
 *
 * Índice e documento saem do mesmo módulo, e por isso carregam juntos:
 * separá-los daria dois pedidos para o mesmo ficheiro.
 */
const Corpo = loadable(props => import(`./documentos/${props.slug}.js`), {
  cacheKey: props => props.slug,
  resolveComponent: (modulo, props) => () => (
    <>
      <Indice doc={modulo.default} isEN={props.isEN} />
      <LegalDocument blocos={modulo.default.blocos} />
    </>
  ),
  fallback: <p className={css.aCarregar}>…</p>,
});

const dataPorExtenso = (iso, isEN) => {
  // Vem como "14-09-2026". Formatado à mão, e não com toLocaleDateString,
  // porque esta página é pré-renderizada no servidor: se o Node e o browser
  // formatarem de maneira diferente, o React acusa divergência na hidratação.
  const [d, m, a] = iso.split('-');
  const MESES_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const MESES_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const mes = (isEN ? MESES_EN : MESES_PT)[Number(m) - 1];
  if (!mes) return iso;
  return isEN ? `${Number(d)} ${mes} ${a}` : `${Number(d)} de ${mes} de ${a}`;
};

export const LegalPageComponent = props => {
  const { scrollingDisabled, params } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const slug = params?.slug;
  const meta = documentoPorSlug(slug);

  // Um slug inventado tem de dar 404 a sério, e não uma página vazia: se um
  // motor de busca indexar /legal/qualquer-coisa a 200, fica lá.
  if (!meta) return <NotFoundPage staticContext={props.staticContext} />;

  return (
    <Page title={`${meta.curto} | Venue1Hub`} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn hideRecentlyViewed topbar={<TopbarContainer />} footer={<FooterContainer />}>
        <div className={css.content}>
          <NamedLink name="LegalCentrePage" className={css.voltar}>
            ‹ {isEN ? 'Legal & Trust Centre' : 'Centro Jurídico'}
          </NamedLink>

          <h1 className={css.titulo}>{meta.titulo}</h1>

          <p className={css.meta}>
            {isEN ? 'Version' : 'Versão'} {meta.versao} · {isEN ? 'in force since' : 'em vigor desde'}{' '}
            {dataPorExtenso(meta.entradaEmVigor, isEN)}
          </p>

          {/* O Contrato de Reserva não é uma política: é o modelo do contrato
              que se forma em cada reserva, com os campos entre parênteses
              retos preenchidos com os dados reais. Sem este aviso, quem
              chegasse aqui via `[HOST_NAME]` e pensaria que estava por
              acabar. */}
          {meta.modelo ? (
            <p className={css.avisoModelo}>
              {isEN
                ? 'This is a contract template. The fields in square brackets — [HOST_NAME], [BOOKING_ID] and so on — are filled in with the real details of each booking when the contract is formed.'
                : 'Este é um modelo de contrato. Os campos entre parênteses retos — [HOST_NAME], [BOOKING_ID] e outros — são preenchidos com os dados reais de cada reserva no momento em que o contrato se forma.'}
            </p>
          ) : null}

          {/* Os documentos existem só em português. A cláusula 61 dos Termos
              prevê que a versão aplicável seja indicada de forma transparente —
              é o que esta faixa faz, em vez de deixar alguém a ler português
              sem perceber porquê. */}
          {isEN ? (
            <p className={css.avisoIdioma}>
              This document is available in Portuguese only. The Portuguese version is the binding
              one. If you need help understanding it, write to{' '}
              <a href="mailto:mail@venue1hub.com" className={css.link}>
                mail@venue1hub.com
              </a>
              .
            </p>
          ) : null}

          <Corpo slug={slug} isEN={isEN} />
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({ scrollingDisabled: isScrollingDisabled(state) });

const LegalPage = compose(connect(mapStateToProps))(LegalPageComponent);

export default LegalPage;
