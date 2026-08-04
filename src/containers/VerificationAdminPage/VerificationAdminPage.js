import React, { useCallback, useEffect, useState } from 'react';
import { compose } from 'redux';
import { connect } from 'react-redux';
import classNames from 'classnames';

import { isScrollingDisabled } from '../../ducks/ui.duck';
import { Page, LayoutSingleColumn, H2 } from '../../components';
import TopbarContainer from '../TopbarContainer/TopbarContainer';
import FooterContainer from '../FooterContainer/FooterContainer';

import css from './VerificationAdminPage.module.css';

/**
 * Operator panel for reviewing anunciante documents.
 *
 * Access is decided by the server (ADMIN_EMAILS), not by this page and not by
 * the URL being hard to guess — anyone can reach the route, but every endpoint
 * it calls answers 403 unless the signed-in account is on the list.
 *
 * Approvals are per document, so a single unreadable scan sends back only that
 * scan. The account is unblocked automatically once all documents are approved.
 */

const STATUS_LABEL = {
  aprovado: 'Aprovado',
  pendente: 'Em análise',
  recusado: 'Recusado',
  em_falta: 'Por enviar',
};

const STATUS_CLASS = {
  aprovado: css.badgeApproved,
  pendente: css.badgePending,
  recusado: css.badgeRejected,
  em_falta: css.badgeMissing,
};

const ACCOUNT_LABEL = {
  aprovado: 'Verificado',
  pendente: 'Em análise',
  recusado: 'Com correções pendentes',
  nao_iniciado: 'Sem documentos',
};

const formatDate = iso => {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString('pt-PT', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch (_) {
    return null;
  }
};

const DocCard = ({ userId, doc, onDecided }) => {
  const [busy, setBusy] = useState(false);
  const [showReason, setShowReason] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  const openDoc = async () => {
    setError(null);
    try {
      const res = await fetch(
        `/api/verification-admin/doc?userId=${encodeURIComponent(userId)}&docKey=${encodeURIComponent(doc.key)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('doc-url-failed');
      const { url } = await res.json();
      // The link expires in minutes; open it immediately rather than storing it.
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (_) {
      setError('Não foi possível abrir o documento.');
    }
  };

  const decide = async (decision, motivo) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/verification-admin/decision', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, docKey: doc.key, decision, reason: motivo }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(payload.error === 'reason-required' ? 'Indique o motivo da recusa.' : 'Falhou. Tente novamente.');
        return;
      }
      onDecided(userId, payload);
      setShowReason(false);
      setReason('');
    } catch (_) {
      setError('Falhou. Tente novamente.');
    } finally {
      setBusy(false);
    }
  };

  const submitted = doc.status !== 'em_falta';

  return (
    <div className={css.docCard}>
      <div className={css.docHead}>
        <span className={css.docLabel}>{doc.label}</span>
        <span className={classNames(css.badge, STATUS_CLASS[doc.status])}>
          {STATUS_LABEL[doc.status]}
        </span>
      </div>

      {doc.filename ? <p className={css.filename}>{doc.filename}</p> : null}
      {doc.uploadedAt ? (
        <p className={css.meta}>Enviado {formatDate(doc.uploadedAt)}</p>
      ) : null}
      {doc.status === 'recusado' && doc.reason ? (
        <p className={css.reason}>Motivo: {doc.reason}</p>
      ) : null}

      {submitted ? (
        <div className={css.docActions}>
          <button type="button" className={css.linkButton} onClick={openDoc}>
            Ver documento
          </button>
          {doc.status !== 'aprovado' ? (
            <button
              type="button"
              className={css.approveButton}
              disabled={busy}
              onClick={() => decide('approve')}
            >
              Aprovar
            </button>
          ) : null}
          {doc.status !== 'recusado' ? (
            <button
              type="button"
              className={css.rejectButton}
              disabled={busy}
              onClick={() => setShowReason(v => !v)}
            >
              Recusar
            </button>
          ) : null}
        </div>
      ) : (
        <p className={css.meta}>Ainda não submetido.</p>
      )}

      {showReason ? (
        <div className={css.reasonBox}>
          <label className={css.reasonLabel} htmlFor={`reason-${userId}-${doc.key}`}>
            Motivo da recusa — o anunciante vê este texto
          </label>
          <textarea
            id={`reason-${userId}-${doc.key}`}
            className={css.reasonInput}
            value={reason}
            maxLength={300}
            rows={2}
            onChange={e => setReason(e.target.value)}
            placeholder="Ex.: imagem desfocada, data ilegível"
          />
          <button
            type="button"
            className={css.rejectButton}
            disabled={busy || !reason.trim()}
            onClick={() => decide('reject', reason)}
          >
            Confirmar recusa
          </button>
        </div>
      ) : null}

      {error ? <p className={css.error}>{error}</p> : null}
    </div>
  );
};

const VerificationAdminPage = props => {
  const { scrollingDisabled } = props;
  const [state, setState] = useState({ loading: true, users: [], error: null });

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: null }));
    try {
      const res = await fetch('/api/verification-admin/list', { credentials: 'include' });
      if (res.status === 403) {
        setState({ loading: false, users: [], error: 'forbidden' });
        return;
      }
      if (!res.ok) throw new Error('list-failed');
      const { users } = await res.json();
      setState({ loading: false, users: users || [], error: null });
    } catch (_) {
      setState({ loading: false, users: [], error: 'failed' });
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Patch just the affected row so a decision doesn't reset scroll position.
  const handleDecided = (userId, payload) => {
    setState(s => ({
      ...s,
      users: s.users.map(u =>
        u.userId === userId ? { ...u, status: payload.status, docs: payload.docs } : u
      ),
    }));
  };

  const { loading, users, error } = state;

  return (
    <Page title="Verificações | Venue1Hub" scrollingDisabled={scrollingDisabled}>
      <LayoutSingleColumn
        hideRecentlyViewed
        topbar={<TopbarContainer />}
        footer={<FooterContainer />}
      >
        <div className={css.root}>
          <H2 as="h1" className={css.title}>
            Verificações de anunciantes
          </H2>

          {error === 'forbidden' ? (
            <p className={css.notice}>
              Esta página é restrita. Inicie sessão com uma conta autorizada.
            </p>
          ) : error ? (
            <p className={css.notice}>Não foi possível carregar. Recarregue a página.</p>
          ) : loading ? (
            <p className={css.notice}>A carregar…</p>
          ) : users.length === 0 ? (
            <p className={css.notice}>Não há documentos submetidos de momento.</p>
          ) : (
            <ul className={css.userList}>
              {users.map(u => (
                <li key={u.userId} className={css.userItem}>
                  <div className={css.userHead}>
                    <div>
                      <p className={css.userName}>{u.displayName || '(sem nome)'}</p>
                      <p className={css.userMeta}>
                        {u.email} · {ACCOUNT_LABEL[u.status] || u.status || '—'}
                        {u.lastUploadAt ? ` · último envio ${formatDate(u.lastUploadAt)}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className={css.docGrid}>
                    {u.docs.map(doc => (
                      <DocCard
                        key={doc.key}
                        userId={u.userId}
                        doc={doc}
                        onDecided={handleDecided}
                      />
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </LayoutSingleColumn>
    </Page>
  );
};

const mapStateToProps = state => ({
  scrollingDisabled: isScrollingDisabled(state),
});

export default compose(connect(mapStateToProps))(VerificationAdminPage);
