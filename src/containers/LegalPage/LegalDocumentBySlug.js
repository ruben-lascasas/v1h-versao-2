import React from 'react';
import loadable from '@loadable/component';

import { documentoPorSlug } from '../../config/legalDocuments';
import LegalDocument from './LegalDocument';
import css from './LegalPage.module.css';

/**
 * O texto de um documento jurídico, sem a moldura de página.
 *
 * Serve os sítios onde o documento tem de aparecer dentro de outra coisa: o
 * modal de aceitação no registo, e as três páginas históricas
 * (/terms-of-service, /privacy-policy, /cookie-policy) que mantêm os seus
 * URLs — estão ligadas do banner de cookies, do registo, da FAQ e de emails já
 * enviados, e parti-las para arrumar a casa seria pior do que a desarrumação.
 *
 * Só há um renderizador de documentos em todo o site. O que muda é a moldura.
 */
const Corpo = loadable(props => import(`./documentos/${props.slug}.js`), {
  cacheKey: props => props.slug,
  resolveComponent: modulo => () => <LegalDocument blocos={modulo.default.blocos} />,
  fallback: <p className={css.aCarregar}>…</p>,
});

const LegalDocumentBySlug = ({ slug, comCabecalho = false, isEN = false }) => {
  const meta = documentoPorSlug(slug);
  if (!meta) return null;

  return (
    <div className={css.documentoInline}>
      {comCabecalho ? (
        <p className={css.meta}>
          {isEN ? 'Version' : 'Versão'} {meta.versao} ·{' '}
          {isEN ? 'in force since' : 'em vigor desde'} {meta.entradaEmVigor}
        </p>
      ) : null}
      <Corpo slug={slug} />
    </div>
  );
};

export default LegalDocumentBySlug;
