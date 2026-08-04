import React, { useEffect } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useHistory } from 'react-router-dom';
import classNames from 'classnames';

import { useLocale } from '../../context/localeContext';
import {
  fetchVerificationStatus,
  selectVerification,
} from '../../ducks/verification.duck';

import css from './VerificationBanner.module.css';

/**
 * Shown to anunciantes whose documents are not yet approved.
 *
 * Rendered app-wide rather than on one page: the point is that someone who
 * signs in and goes straight to "publicar anúncio" finds out why they can't
 * before they have filled in a wizard. It carries the per-document state so
 * the answer to "what is missing?" needs no extra click.
 *
 * Renders nothing for every other account type, and nothing once approved.
 */

const DOT_CLASS = {
  aprovado: css.dotApproved,
  pendente: css.dotPending,
  recusado: css.dotRejected,
  em_falta: css.dotMissing,
};

const t = (isEN, pt, en) => (isEN ? en : pt);

const docStatusLabel = (status, isEN) => {
  switch (status) {
    case 'aprovado':
      return t(isEN, 'Aprovado', 'Approved');
    case 'pendente':
      return t(isEN, 'Em análise', 'Under review');
    case 'recusado':
      return t(isEN, 'Recusado', 'Rejected');
    default:
      return t(isEN, 'Por enviar', 'Not submitted');
  }
};

const VerificationBanner = () => {
  const dispatch = useDispatch();
  const history = useHistory();
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const isAuthenticated = useSelector(state => state.auth?.isAuthenticated);
  const currentUser = useSelector(state => state.user?.currentUser);
  const { fetched, required, status, docs } = useSelector(selectVerification);

  useEffect(() => {
    // Wait for currentUser: the endpoint answers from the session, and calling
    // it before the user is loaded just wastes a request on every cold load.
    if (!isAuthenticated || !currentUser?.id) return;
    dispatch(fetchVerificationStatus());
  }, [isAuthenticated, currentUser?.id?.uuid, dispatch]);

  if (!isAuthenticated || !fetched || !required) return null;
  if (status === 'aprovado') return null;

  const rejected = docs.filter(d => d.status === 'recusado');
  const missing = docs.filter(d => d.status === 'em_falta');
  const isRejected = rejected.length > 0;
  const notStarted = status === 'nao_iniciado';

  const heading = isRejected
    ? t(isEN, 'Há documentos por corrigir', 'Some documents need fixing')
    : notStarted
    ? t(isEN, 'Falta verificar a sua conta', 'Your account needs verifying')
    : t(isEN, 'Documentos em análise', 'Documents under review');

  const body = isRejected
    ? t(
        isEN,
        'Reveja os documentos assinalados e volte a submeter apenas esses.',
        'Review the flagged documents and re-submit only those.'
      )
    : notStarted
    ? t(
        isEN,
        'Para publicar anúncios, submeta os documentos de verificação. A análise demora até 48 horas.',
        'To publish listings, submit your verification documents. Review takes up to 48 hours.'
      )
    : t(
        isEN,
        'Recebemos os seus documentos. A análise demora até 48 horas e avisamos assim que estiver concluída.',
        'We have your documents. Review takes up to 48 hours and we will let you know as soon as it is done.'
      );

  return (
    <div className={classNames(css.root, { [css.rootAlert]: isRejected })}>
      <div className={css.inner}>
        <div className={css.text}>
          <p className={css.heading}>{heading}</p>
          <p className={css.body}>{body}</p>

          <ul className={css.docList}>
            {docs.map(doc => (
              <li key={doc.key} className={css.docItem}>
                <span className={classNames(css.dot, DOT_CLASS[doc.status])} />
                <span className={css.docLabel}>{isEN ? doc.labelEN : doc.label}</span>
                <span className={css.docStatus}>{docStatusLabel(doc.status, isEN)}</span>
                {doc.status === 'recusado' && doc.reason ? (
                  <span className={css.docReason}>{doc.reason}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>

        {missing.length > 0 || isRejected ? (
          <button
            type="button"
            className={css.action}
            onClick={() => history.push('/verificacao')}
          >
            {isRejected
              ? t(isEN, 'Corrigir documentos', 'Fix documents')
              : t(isEN, 'Submeter documentos', 'Submit documents')}
          </button>
        ) : null}
      </div>
    </div>
  );
};

export default VerificationBanner;
