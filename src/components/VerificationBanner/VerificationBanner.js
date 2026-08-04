import React, { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
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
 * before they have filled in a wizard. It stays deliberately short — the
 * per-document detail lives on /verificacao, one click away.
 *
 * Renders nothing for every other account type, and nothing once approved.
 */

const t = (isEN, pt, en) => (isEN ? en : pt);

// The offset below has to be applied before paint, or the banner visibly jumps
// on every load. useLayoutEffect does that but warns during server rendering,
// where it never runs anyway — so fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

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

  // TopbarContainer renders this straight after <Topbar/>. On most pages the
  // topbar sits in normal flow and the banner simply follows it, but the search
  // page pins the topbar with `position: fixed`. There the banner would start
  // at y=0 and spend its first 72px hidden behind the topbar — which is exactly
  // what it did.
  //
  // Rather than special-casing pages, measure the preceding sibling: if it was
  // taken out of the flow, offset by its height. The resulting banner height is
  // published as a CSS variable so layouts that hardcode a topbar offset can
  // add it (see SearchPage.module.css).
  const ref = useRef(null);
  const syncOffset = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const previous = el.previousElementSibling;
    const isDetached =
      previous && ['fixed', 'absolute'].includes(getComputedStyle(previous).position);
    el.style.marginTop = isDetached ? `${previous.getBoundingClientRect().height}px` : '';
    document.documentElement.style.setProperty(
      '--verificationBannerHeight',
      `${el.getBoundingClientRect().height}px`
    );
  }, []);

  useIsomorphicLayoutEffect(() => {
    syncOffset();
    window.addEventListener('resize', syncOffset);
    return () => {
      window.removeEventListener('resize', syncOffset);
      document.documentElement.style.removeProperty('--verificationBannerHeight');
    };
  });

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
    <div ref={ref} className={classNames(css.root, { [css.rootAlert]: isRejected })}>
      <div className={css.inner}>
        <div className={css.text}>
          <p className={css.heading}>{heading}</p>
          <p className={css.body}>{body}</p>
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
