import React, { useEffect, useState } from 'react';
import classNames from 'classnames';
import { useHistory, useLocation } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useLocale } from '../../../context/localeContext';
import {
  selectIsSearchSaved,
  toggleSavedSearchAndSync,
} from '../../../ducks/savedSearches.duck';
import IconHeart from '../../../components/IconHeart/IconHeart';
import css from './SaveSearchButton.module.css';

// Map known url param keys to a human label so the saved-search list reads as
// "Lisboa · Eventos & Festas · keyword: piano" rather than the raw querystring.
const CATEGORY_LABEL = {
  'trabalho-reunioes': { pt: 'Trabalho & Reuniões', en: 'Work & Meetings' },
  'educacao-cultura': { pt: 'Educação & Cultura', en: 'Education & Culture' },
  'gastronomia-convivio': { pt: 'Gastronomia & Convívio', en: 'Gastronomy & Social' },
  'eventos-festas': { pt: 'Eventos & Festas', en: 'Events & Parties' },
  'criatividade-producao': { pt: 'Criatividade & Produção', en: 'Creativity & Production' },
  'saude-bemestar': { pt: 'Saúde, Bem-estar & Corpo', en: 'Health, Wellness & Body' },
  'desporto-actividadefisica': { pt: 'Desporto & Actividade Física', en: 'Sport & Physical Activity' },
  'espaco-arlivre': { pt: 'Espaços ao Ar Livre', en: 'Outdoor Spaces' },
  'espacos_inusitados_alternativos': { pt: 'Espaços Inusitados & Alternativos', en: 'Unusual & Alternative Spaces' },
};

const buildLabel = (params, isPt) => {
  const parts = [];
  const address = params.get('address');
  if (address) parts.push(address);
  const cat = params.get('pub_categoryLevel1');
  if (cat) {
    const known = CATEGORY_LABEL[cat];
    parts.push(known ? (isPt ? known.pt : known.en) : cat);
  }
  const kw = params.get('keywords');
  if (kw) parts.push(`"${kw}"`);
  if (parts.length === 0) parts.push(isPt ? 'Toda a marketplace' : 'Whole marketplace');
  return parts.join(' · ');
};

// Determine the primary "type" of a saved search so the saved-searches page
// can show the matching icon (keyword/category/location). Free-text keywords
// trump the others because they're the most specific intent.
const detectType = params => {
  if (params.get('keywords')) return 'keyword';
  if (params.get('pub_categoryLevel1')) return 'category';
  if (params.get('address')) return 'location';
  return 'all';
};

const SaveSearchButton = () => {
  const { locale } = useLocale();
  const isPt = !locale || String(locale).toLowerCase().startsWith('pt');
  const history = useHistory();
  const location = useLocation();
  const dispatch = useDispatch();

  const isAuth = useSelector(state => state.auth?.isAuthenticated);
  const url = location.pathname + location.search;
  const isSaved = useSelector(state => selectIsSearchSaved(state, url));

  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);

  useEffect(() => {
    if (!flash) return undefined;
    const id = setTimeout(() => setFlash(null), 2200);
    return () => clearTimeout(id);
  }, [flash]);

  const handleClick = async event => {
    event.preventDefault();
    event.stopPropagation();
    if (!isAuth) {
      history.push('/login', { from: location.pathname + location.search });
      return;
    }
    if (busy) return;
    setBusy(true);
    const params = new URLSearchParams(location.search);
    const label = buildLabel(params, isPt);
    const type = detectType(params);
    const paramsObj = {};
    params.forEach((value, key) => {
      paramsObj[key] = value;
    });
    const result = await dispatch(
      toggleSavedSearchAndSync({ url, label, type, params: paramsObj })
    );
    setBusy(false);
    if (result?.error) {
      setFlash(isPt ? 'Não foi possível guardar.' : 'Could not save.');
      return;
    }
    setFlash(
      result?.saved
        ? isPt ? 'Pesquisa guardada' : 'Search saved'
        : isPt ? 'Pesquisa removida' : 'Search removed'
    );
  };

  const labelText = isSaved
    ? isPt ? 'Pesquisa guardada' : 'Search saved'
    : isPt ? 'Guardar esta pesquisa' : 'Save this search';

  return (
    <span className={css.wrap}>
      <button
        type="button"
        className={classNames(css.root, { [css.active]: isSaved })}
        onClick={handleClick}
        disabled={busy}
        aria-pressed={isSaved}
        aria-label={labelText}
        title={labelText}
      >
        <IconHeart filled={isSaved} />
        <span className={css.btnLabel}>{labelText}</span>
      </button>
      {flash ? <span className={css.flash}>{flash}</span> : null}
    </span>
  );
};

export default SaveSearchButton;
