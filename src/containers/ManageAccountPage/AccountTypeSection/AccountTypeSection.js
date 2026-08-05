import React, { useEffect, useState } from 'react';

import { useLocale } from '../../../context/localeContext';
import { H4 } from '../../../components';

import css from './AccountTypeSection.module.css';

/**
 * Lets someone change account type after signing up — a visitante who decides
 * to advertise, or an anunciante who also wants to offer services.
 *
 * The options come from GET /api/user-types, which reads them from Console, so
 * a type that was removed there can never appear here. The change itself goes
 * through POST /api/change-user-type, which re-applies the verification gate
 * and refuses to strip the provider role from someone who still has listings.
 */

const t = (isEN, pt, en) => (isEN ? en : pt);

const AccountTypeSection = ({ currentUserType, onChanged }) => {
  const { locale } = useLocale();
  const isEN = locale === 'en';

  const [types, setTypes] = useState([]);
  const [selected, setSelected] = useState(currentUserType || '');
  const [state, setState] = useState({ saving: false, error: null, done: false });

  useEffect(() => {
    let cancelled = false;
    fetch('/api/user-types', { credentials: 'include' })
      .then(r => (r.ok ? r.json() : null))
      .then(data => {
        if (!cancelled && data?.userTypes) setTypes(data.userTypes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setSelected(currentUserType || '');
  }, [currentUserType]);

  const errorText = err => {
    switch (err?.error) {
      case 'has-listings':
        return t(
          isEN,
          `Ainda tem ${err.listings} anúncio(s). Um Visitante não pode ter anúncios, por isso remova-os antes de mudar.`,
          `You still have ${err.listings} listing(s). A Visitante cannot hold listings, so remove them before switching.`
        );
      case 'unknown-user-type':
        return t(isEN, 'Esse tipo de conta não existe.', 'That account type does not exist.');
      case 'not-authenticated':
        return t(isEN, 'A sessão expirou. Volte a entrar.', 'Your session expired. Please sign in again.');
      default:
        return t(isEN, 'Não foi possível mudar. Tente novamente.', 'Could not change. Please try again.');
    }
  };

  const submit = async () => {
    if (!selected || selected === currentUserType) return;
    setState({ saving: true, error: null, done: false });
    try {
      const res = await fetch('/api/change-user-type', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userType: selected }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState({ saving: false, error: errorText(payload), done: false });
        return;
      }
      setState({ saving: false, error: null, done: true });
      if (onChanged) onChanged(payload);
    } catch (_) {
      setState({ saving: false, error: errorText(null), done: false });
    }
  };

  if (types.length === 0) return null;

  const target = types.find(x => x.id === selected);
  const changed = selected && selected !== currentUserType;

  return (
    <section className={css.root}>
      <H4 as="h3" className={css.title}>
        {t(isEN, 'Tipo de conta', 'Account type')}
      </H4>
      <p className={css.help}>
        {t(
          isEN,
          'Pode mudar a qualquer momento. Se passar a Anunciante, será preciso verificar a conta antes de publicar.',
          'You can change this at any time. Switching to Anunciante means verifying your account before you can publish.'
        )}
      </p>

      <div className={css.row}>
        <select
          className={css.select}
          value={selected}
          disabled={state.saving}
          onChange={e => {
            setSelected(e.target.value);
            setState({ saving: false, error: null, done: false });
          }}
          aria-label={t(isEN, 'Tipo de conta', 'Account type')}
        >
          {types.map(type => (
            <option key={type.id} value={type.id}>
              {type.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          className={css.button}
          disabled={!changed || state.saving}
          onClick={submit}
        >
          {state.saving
            ? t(isEN, 'A guardar…', 'Saving…')
            : t(isEN, 'Mudar tipo de conta', 'Change account type')}
        </button>
      </div>

      {/* Says what the change actually does, before it is made. */}
      {changed && target ? (
        <p className={css.notice}>
          {target.isProvider
            ? t(
                isEN,
                `Como ${target.label} poderá publicar anúncios.`,
                `As ${target.label} you will be able to publish listings.`
              )
            : t(
                isEN,
                `Como ${target.label} deixa de poder publicar anúncios.`,
                `As ${target.label} you will no longer be able to publish listings.`
              )}
        </p>
      ) : null}

      {state.error ? <p className={css.error}>{state.error}</p> : null}
      {state.done ? (
        <p className={css.success}>
          {t(isEN, 'Tipo de conta alterado.', 'Account type changed.')}
        </p>
      ) : null}
    </section>
  );
};

export default AccountTypeSection;
