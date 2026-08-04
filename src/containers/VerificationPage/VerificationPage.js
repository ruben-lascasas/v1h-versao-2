import React, { useEffect, useRef } from 'react';
import { compose } from 'redux';
import { connect, useDispatch, useSelector } from 'react-redux';
import classNames from 'classnames';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { useLocale } from '../../context/localeContext';
import {
  fetchVerificationStatus,
  uploadVerificationDoc,
  selectVerification,
} from '../../ducks/verification.duck';
import { Page, LayoutSingleColumn, H2 } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './VerificationPage.module.css';

/**
 * Where an anunciante submits identity documents and watches them being
 * reviewed. Each document stands alone: one rejection sends back that document
 * only, and an approved one can no longer be replaced by a stray click.
 */

const t = (isEN, pt, en) => (isEN ? en : pt);

const ACCEPT = '.pdf,.jpg,.jpeg,.png,.webp';

const STATUS_TEXT = {
  aprovado: (isEN) => t(isEN, 'Aprovado', 'Approved'),
  pendente: (isEN) => t(isEN, 'Em análise', 'Under review'),
  recusado: (isEN) => t(isEN, 'Recusado', 'Rejected'),
  em_falta: (isEN) => t(isEN, 'Por enviar', 'Not submitted'),
};

const STATUS_CLASS = {
  aprovado: css.badgeApproved,
  pendente: css.badgePending,
  recusado: css.badgeRejected,
  em_falta: css.badgeMissing,
};

const UPLOAD_ERROR_TEXT = {
  'too-large': (isEN) => t(isEN, 'O ficheiro excede 8 MB.', 'The file is larger than 8 MB.'),
  'invalid-type': (isEN) =>
    t(isEN, 'Formato não aceite. Use PDF, JPG, PNG ou WEBP.', 'Unsupported format. Use PDF, JPG, PNG or WEBP.'),
  'already-approved': (isEN) =>
    t(isEN, 'Este documento já foi aprovado.', 'This document has already been approved.'),
};

const DocRow = ({ doc, isEN, uploading, onPick }) => {
  const inputRef = useRef(null);
  const isApproved = doc.status === 'aprovado';

  return (
    <li className={css.docItem}>
      <div className={css.docHead}>
        <div className={css.docTitles}>
          <p className={css.docLabel}>{isEN ? doc.labelEN : doc.label}</p>
          <p className={css.docHint}>{isEN ? doc.hintEN : doc.hint}</p>
        </div>
        <span className={classNames(css.badge, STATUS_CLASS[doc.status])}>
          {(STATUS_TEXT[doc.status] || STATUS_TEXT.em_falta)(isEN)}
        </span>
      </div>

      {doc.status === 'recusado' && doc.reason ? (
        <p className={css.reason}>
          <strong>{t(isEN, 'Motivo:', 'Reason:')}</strong> {doc.reason}
        </p>
      ) : null}

      {doc.filename ? <p className={css.filename}>{doc.filename}</p> : null}

      {isApproved ? null : (
        <>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPT}
            className={css.hiddenInput}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) onPick(doc.key, file);
              // Reset so picking the same file twice still fires onChange.
              e.target.value = '';
            }}
          />
          <button
            type="button"
            className={css.uploadButton}
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
          >
            {uploading
              ? t(isEN, 'A enviar…', 'Uploading…')
              : doc.status === 'em_falta'
              ? t(isEN, 'Escolher ficheiro', 'Choose file')
              : t(isEN, 'Substituir ficheiro', 'Replace file')}
          </button>
        </>
      )}
    </li>
  );
};

const VerificationPage = props => {
  const { scrollingDisabled } = props;
  const dispatch = useDispatch();
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const currentUser = useSelector(state => state.user?.currentUser);
  const { fetched, loading, required, status, docs, uploadingDocKey, uploadError } = useSelector(
    selectVerification
  );

  useEffect(() => {
    if (currentUser?.id) dispatch(fetchVerificationStatus());
  }, [currentUser?.id?.uuid, dispatch]);

  const handlePick = (docKey, file) => dispatch(uploadVerificationDoc(docKey, file));

  const title = t(isEN, 'Verificação da conta | Venue1Hub', 'Account verification | Venue1Hub');

  const intro =
    status === 'aprovado'
      ? t(
          isEN,
          'A sua conta está verificada. Já pode publicar anúncios.',
          'Your account is verified. You can publish listings.'
        )
      : t(
          isEN,
          'Para publicar anúncios, precisamos de confirmar a sua identidade e a sua ligação ao espaço. A análise é feita por uma pessoa e demora até 48 horas.',
          'Before you can publish listings we need to confirm your identity and your connection to the venue. Review is done by a person and takes up to 48 hours.'
        );

  return (
    <Page title={title} scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <H2 as="h1" className={css.title}>
            {t(isEN, 'Verificação da conta', 'Account verification')}
          </H2>
          <p className={css.intro}>{intro}</p>

          {!fetched && loading ? (
            <p className={css.muted}>{t(isEN, 'A carregar…', 'Loading…')}</p>
          ) : null}

          {fetched && !required ? (
            <p className={css.muted}>
              {t(
                isEN,
                'Esta conta não precisa de verificação.',
                'This account does not require verification.'
              )}
            </p>
          ) : null}

          {uploadError ? (
            <p className={css.error}>
              {(UPLOAD_ERROR_TEXT[uploadError] ||
                (() => t(isEN, 'Não foi possível enviar. Tente novamente.', 'Upload failed. Please try again.')))(
                isEN
              )}
            </p>
          ) : null}

          {required ? (
            <ul className={css.docList}>
              {docs.map(doc => (
                <DocRow
                  key={doc.key}
                  doc={doc}
                  isEN={isEN}
                  uploading={uploadingDocKey === doc.key}
                  onPick={handlePick}
                />
              ))}
            </ul>
          ) : null}

          {required && status !== 'aprovado' ? (
            <p className={css.footnote}>
              {t(
                isEN,
                'Os documentos são guardados de forma privada na União Europeia, usados apenas para esta verificação e apagados quando deixam de ser necessários.',
                'Documents are stored privately in the European Union, used only for this verification, and deleted once no longer needed.'
              )}
            </p>
          ) : null}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default compose(connect(mapStateToProps))(VerificationPage);
