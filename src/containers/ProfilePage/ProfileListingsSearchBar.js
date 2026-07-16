import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import css from './ProfileListingsSearchBar.module.css';

const MAX_HISTORY = 4;
const MAX_MAPBOX = 5;
const MAPBOX_TOKEN = process.env.REACT_APP_MAPBOX_ACCESS_TOKEN;
// History is scoped to the LOGGED-IN user so each account keeps its own list
// regardless of which profile is being viewed. Falls back to a per-browser
// "anon" bucket for visitors who haven't signed in.
const historyKey = loggedInId => `v1h_profile_${loggedInId || 'anon'}_listing_history`;

// Mirror of CATEGORY_DATA in TopbarSearchForm — used to translate the slug
// stored on each listing (`publicData.categoryLevel1`) into a human label.
const CATEGORY_LABELS = {
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

const normalise = s =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');

const PinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" />
  </svg>
);

const SearchIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 21 22"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden
    className={css.iconLupa}
  >
    <g
      transform="matrix(-1 0 0 1 20 1)"
      strokeWidth="2"
      stroke="currentColor"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M13 14l5.241 5.241" />
      <circle cx="7.5" cy="7.5" r="7.5" />
    </g>
  </svg>
);

const ProfileListingsSearchBar = ({
  listings,
  value,
  onChange,
  isPt,
  filteredCount,
}) => {
  const loggedInId = useSelector(s => s.user.currentUser?.id?.uuid);
  const [focused, setFocused] = useState(false);
  const [history, setHistory] = useState([]);
  const [mapboxResults, setMapboxResults] = useState([]);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const abortRef = useRef(null);
  const debounceRef = useRef(null);

  // Load history scoped to the logged-in user; reloads on account switch.
  // Visitors without a session don't get any history at all — they'd share a
  // browser-wide bucket otherwise, which would leak searches between users.
  useEffect(() => {
    if (!loggedInId) {
      setHistory([]);
      return;
    }
    try {
      const raw = localStorage.getItem(historyKey(loggedInId));
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setHistory(parsed.slice(0, MAX_HISTORY));
          return;
        }
      }
      setHistory([]);
    } catch (_) {
      setHistory([]);
    }
  }, [loggedInId]);

  // Persist history under the logged-in user's bucket. No persistence when
  // unauthenticated (no shared "anon" leak).
  const persistHistory = next => {
    setHistory(next);
    if (!loggedInId) return;
    try {
      localStorage.setItem(historyKey(loggedInId), JSON.stringify(next));
    } catch (_) {
      /* ignored */
    }
  };

  // Close the dropdown on outside click.
  useEffect(() => {
    const onDown = e => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setFocused(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  // Derive categories from user's listings, with count.
  const categories = useMemo(() => {
    const map = new Map();
    listings.forEach(l => {
      const slug = l.attributes?.publicData?.categoryLevel1;
      if (!slug) return;
      const cur = map.get(slug) || 0;
      map.set(slug, cur + 1);
    });
    return Array.from(map, ([slug, count]) => ({
      slug,
      label: CATEGORY_LABELS[slug] ? (isPt ? CATEGORY_LABELS[slug].pt : CATEGORY_LABELS[slug].en) : slug,
      count,
    })).sort((a, b) => b.count - a.count);
  }, [listings, isPt]);

  // Debounced Mapbox geocoder — same provider as the topbar search. Suggests
  // any place worldwide as the user types (cities, streets, regions). When
  // picked, the label flows into the local filter so the user's listings get
  // filtered by that location string.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    const q = value.trim();
    if (!q || q.length < 2 || !MAPBOX_TOKEN) {
      setMapboxResults([]);
      return undefined;
    }

    debounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      abortRef.current = controller;
      const url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(q)}.json` +
        `?access_token=${MAPBOX_TOKEN}` +
        `&autocomplete=true&limit=${MAX_MAPBOX}&language=${isPt ? 'pt' : 'en'}`;
      fetch(url, { signal: controller.signal })
        .then(r => r.json())
        .then(data => {
          if (!Array.isArray(data?.features)) {
            setMapboxResults([]);
            return;
          }
          setMapboxResults(
            data.features.map(f => ({
              id: f.id,
              label: f.place_name,
              text: f.text,
            }))
          );
        })
        .catch(() => {
          /* aborted or network error — ignored */
        });
    }, 220);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [value, isPt]);

  // Pre-compute normalised addresses for every listing so we can count how
  // many of them match each Mapbox suggestion (e.g. "Lisboa" → 12).
  const listingAddresses = useMemo(
    () =>
      listings.map(l => {
        const pd = l.attributes?.publicData || {};
        const addr =
          (pd.location && (pd.location.address || pd.location.formattedAddress)) ||
          (pd.Location && (pd.Location.address || pd.Location.formattedAddress)) ||
          (typeof pd.location === 'string' ? pd.location : null) ||
          '';
        return normalise(addr);
      }),
    [listings]
  );

  // Count how many of the user's listings match a given history entry. For
  // categories we match against the resolved label; for locations we match
  // against the listing's stored address (same trick as Mapbox results).
  const countForHistory = entry => {
    const needle = normalise(entry.label);
    if (!needle) return 0;
    if (entry.type === 'category') {
      return categories.find(c => normalise(c.label) === needle)?.count || 0;
    }
    if (entry.type === 'location') {
      return listingAddresses.reduce(
        (acc, a) => (a && a.includes(needle) ? acc + 1 : acc),
        0
      );
    }
    // Plain text — match across title/description/address as the live filter does.
    return listings.filter(l => {
      const a = l.attributes || {};
      const pd = a.publicData || {};
      const locStr =
        (pd.location && (pd.location.address || pd.location.formattedAddress)) || '';
      const haystack = normalise(
        [a.title, a.description, locStr].filter(Boolean).join(' ')
      );
      return haystack.includes(needle);
    }).length;
  };

  // Filter each section by what the user is typing — narrows the dropdown
  // dynamically just like the topbar search. While the input is empty we
  // only show the recent searches section (matches topbar behaviour).
  const q = normalise(value).trim();
  const filteredHistory = (q
    ? history.filter(h => normalise(h.label).includes(q))
    : history
  ).map(h => ({ ...h, count: countForHistory(h) }));
  // Don't duplicate items that are already in the recent-searches section.
  const historyLabelsSet = new Set(filteredHistory.map(h => normalise(h.label)));
  const filteredCategories = q
    ? categories
        .filter(c => normalise(c.label).includes(q))
        .filter(c => !historyLabelsSet.has(normalise(c.label)))
    : [];
  const filteredLocations = q
    ? mapboxResults
        .filter(l => !historyLabelsSet.has(normalise(l.label)))
        .map(l => {
          // Match against the short "text" first (e.g. "Lisboa"); fall back to
          // the full place_name if the short form is too generic.
          const needleShort = normalise(l.text);
          const needleFull = normalise(l.label);
          const count = listingAddresses.reduce((acc, a) => {
            if (!a) return acc;
            if (needleShort && a.includes(needleShort)) return acc + 1;
            if (needleFull && a.includes(needleFull)) return acc + 1;
            return acc;
          }, 0);
          return { ...l, count };
        })
    : [];

  const pickItem = item => {
    onChange(item.label);
    const entry = { label: item.label, type: item.type || 'text' };
    const next = [entry, ...history.filter(h => h.label !== item.label)].slice(0, MAX_HISTORY);
    persistHistory(next);
    setFocused(false);
    if (inputRef.current) inputRef.current.blur();
  };

  const clearHistory = () => persistHistory([]);

  const handleClear = () => {
    onChange('');
    if (inputRef.current) inputRef.current.focus();
  };

  const showDropdown =
    focused &&
    (filteredHistory.length > 0 ||
      filteredCategories.length > 0 ||
      filteredLocations.length > 0);

  return (
    <div className={css.wrap} ref={wrapRef}>
      <div className={css.inputRow}>
        <SearchIcon />
        <input
          ref={inputRef}
          type="text"
          className={css.input}
          placeholder={isPt ? 'Pesquisar neste perfil…' : 'Search this profile…'}
          value={value}
          onChange={e => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const text = value.trim();
              if (!text) return;
              const next = [
                { label: text, type: 'text' },
                ...history.filter(h => h.label !== text),
              ].slice(0, MAX_HISTORY);
              persistHistory(next);
              setFocused(false);
              if (inputRef.current) inputRef.current.blur();
            } else if (e.key === 'Escape') {
              setFocused(false);
              if (inputRef.current) inputRef.current.blur();
            }
          }}
          aria-label={isPt ? 'Pesquisar neste perfil' : 'Search this profile'}
        />
        {value ? (
          <>
            <span className={css.count}>
              {typeof filteredCount === 'number' ? filteredCount : 0}
            </span>
            <button
              type="button"
              className={css.clearBtn}
              onClick={handleClear}
              aria-label={isPt ? 'Limpar pesquisa' : 'Clear search'}
            >
              ×
            </button>
          </>
        ) : null}
      </div>

      {showDropdown && (
        <div className={css.dropdown}>
          {filteredHistory.length > 0 && (
            <div className={css.section}>
              <div className={css.sectionHeader}>
                <span className={css.sectionLabel}>
                  {isPt ? 'PESQUISAS RECENTES' : 'RECENT SEARCHES'}
                </span>
                <button
                  type="button"
                  className={css.sectionClear}
                  onClick={clearHistory}
                >
                  {isPt ? 'Limpar' : 'Clear'}
                </button>
              </div>
              <ul className={css.list}>
                {filteredHistory.map((h, i) => (
                  <li
                    key={`h-${i}`}
                    className={css.item}
                    onMouseDown={e => {
                      e.preventDefault();
                      pickItem(h);
                    }}
                  >
                    <span className={css.itemIcon}>
                      {h.type === 'category' ? '#' : h.type === 'location' ? <PinIcon /> : '↩'}
                    </span>
                    <span className={css.itemLabel}>{h.label}</span>
                    <span className={css.itemCount}>{h.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filteredCategories.length > 0 && (
            <div className={css.section}>
              <span className={css.sectionLabel}>
                {isPt ? 'CATEGORIAS' : 'CATEGORIES'}
              </span>
              <ul className={css.list}>
                {filteredCategories.map(c => (
                  <li
                    key={`c-${c.slug}`}
                    className={css.item}
                    onMouseDown={e => {
                      e.preventDefault();
                      pickItem({ label: c.label, type: 'category' });
                    }}
                  >
                    <span className={css.itemIcon}>#</span>
                    <span className={css.itemLabel}>{c.label}</span>
                    <span className={css.itemCount}>{c.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {filteredLocations.length > 0 && (
            <div className={css.section}>
              <span className={css.sectionLabel}>
                {isPt
                  ? 'CLIQUE NUMA DESTAS OPÇÕES PARA MELHORES RESULTADOS DE LOCALIZAÇÃO'
                  : 'CLICK ONE OF THESE FOR BETTER LOCATION RESULTS'}
              </span>
              <ul className={css.list}>
                {filteredLocations.map(l => (
                  <li
                    key={`l-${l.id}`}
                    className={css.item}
                    onMouseDown={e => {
                      e.preventDefault();
                      pickItem({ label: l.label, type: 'location' });
                    }}
                  >
                    <span className={css.itemIcon}>
                      <PinIcon />
                    </span>
                    <span className={css.itemLabel}>{l.label}</span>
                    <span className={css.itemCount}>{l.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ProfileListingsSearchBar;
