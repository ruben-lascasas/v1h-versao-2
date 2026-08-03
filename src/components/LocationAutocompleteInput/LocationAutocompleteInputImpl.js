import React, { Component, useEffect, useState } from 'react';
import classNames from 'classnames';
import debounce from 'lodash/debounce';

import { useConfiguration } from '../../context/configurationContext';
import { FormattedMessage, useIntl } from '../../util/reactIntl';

import { IconSpinner } from '../../components';

import IconLookingGlass from './IconLookingGlass';
import IconCurrentLocation from './IconCurrentLocation';
import * as geocoderMapbox from './GeocoderMapbox';
import * as geocoderGoogleMaps from './GeocoderGoogleMaps';
import { hasConsent } from '../CookieConsent/CookieConsent';
import { types as sdkTypes } from '../../util/sdkLoader';
import { getListingCount } from '../../util/listingCount';

import css from './LocationAutocompleteInput.module.css';

const { LatLng: SDKLatLng, LatLngBounds: SDKLatLngBounds } = sdkTypes;

// Bounds/origin saved to history are JSON-serialised plain objects (the SDK
// LatLng/LatLngBounds class instances lose their prototype on JSON round-trip).
// Rehydrate them so URL builders that check `instanceof LatLngBounds` recognise
// them again — otherwise the location filter is silently dropped on submit.
const rehydratePlace = place => {
  if (!place || typeof place !== 'object') return place;
  const rehydrated = { ...place };
  if (place.bounds && place.bounds.ne && place.bounds.sw) {
    rehydrated.bounds = new SDKLatLngBounds(
      new SDKLatLng(place.bounds.ne.lat, place.bounds.ne.lng),
      new SDKLatLng(place.bounds.sw.lat, place.bounds.sw.lng)
    );
  }
  if (place.origin && place.origin.lat != null && place.origin.lng != null) {
    rehydrated.origin = new SDKLatLng(place.origin.lat, place.origin.lng);
  }
  return rehydrated;
};

const DEBOUNCE_WAIT_TIME = 300;
const DEBOUNCE_WAIT_TIME_FOR_SHORT_QUERIES = 1000;
const KEY_CODE_ARROW_UP = 38;

// ── Search history (localStorage) ───────────────────────────────────────────
// Each entry is one of:
//   { type: 'location', label, place }      — saved when a location is picked
//   { type: 'category', label, slug }       — saved when a category match is picked
//   { type: 'keyword',  label }              — saved when a free-text keyword search is submitted
//
// History is scoped to the currently logged-in user. The active user id is
// pushed in from a top-level bridge (see SearchHistoryUserBridge in the
// topbar) whenever the auth state changes. Visitors with no session don't
// persist anything — otherwise a shared "anon" bucket would leak searches
// between different people on the same browser.
const HISTORY_KEY_PREFIX = 'locationSearchHistory_';
const LEGACY_HISTORY_KEY = 'locationSearchHistory'; // unscoped pre-2026-05-11
let _activeUserId = null;
const historyKeyFor = uid => (uid ? `${HISTORY_KEY_PREFIX}${uid}` : null);

// Storage cap is large so location-only views still have up to MAX_DISPLAY
// location entries even when keyword/category entries fill up the recent list.
const MAX_HISTORY = 12;
const MAX_DISPLAY = 4;

// Called from a top-level bridge whenever the logged-in user changes (login,
// logout, account switch). All search bars across the site read history via
// this single module so a single update flips everyone. Emits a window event
// so mounted search forms can re-read their snapshot without a full reload.
export const setSearchHistoryUserId = uid => {
  const next = uid || null;
  if (next === _activeUserId) return;
  _activeUserId = next;
  if (typeof window !== 'undefined') {
    try {
      window.dispatchEvent(
        new CustomEvent('v1h:searchHistoryUserChanged', { detail: { uid: next } })
      );
    } catch (_) { /* ignored */ }
  }
};

export const getSearchHistory = () => {
  // Recent searches are a "preferences" cookie category (RGPD).
  if (typeof window !== 'undefined' && !hasConsent('preferences')) return [];
  const key = historyKeyFor(_activeUserId);
  if (!key) return [];
  try {
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch {
    return [];
  }
};

export const saveToSearchHistory = entry => {
  if (typeof window !== 'undefined' && !hasConsent('preferences')) return;
  const key = historyKeyFor(_activeUserId);
  if (!key) return; // not logged in → no persistence
  try {
    // Dedupe by label+type so a category and a location with the same label coexist.
    const prev = (() => {
      try { return JSON.parse(localStorage.getItem(key) || '[]'); } catch { return []; }
    })().filter(
      h => !(h.label === entry.label && (h.type || 'location') === (entry.type || 'location'))
    );
    localStorage.setItem(key, JSON.stringify([entry, ...prev].slice(0, MAX_HISTORY)));
  } catch {}
};

// When the user revokes "preferences" consent via the cookie modal, wipe
// every saved-history bucket so nothing reappears if they re-accept.
if (typeof window !== 'undefined') {
  window.addEventListener('v1h:consentChanged', e => {
    const granted = !!e?.detail?.preferences;
    if (granted) return;
    try {
      localStorage.removeItem(LEGACY_HISTORY_KEY);
      Object.keys(localStorage)
        .filter(k => k.startsWith(HISTORY_KEY_PREFIX))
        .forEach(k => localStorage.removeItem(k));
    } catch {}
  });
}
const KEY_CODE_ARROW_DOWN = 40;
const KEY_CODE_ENTER = 13;
const KEY_CODE_TAB = 9;
const KEY_CODE_ESC = 27;
const DIRECTION_UP = 'up';
const DIRECTION_DOWN = 'down';
const TOUCH_TAP_RADIUS = 5; // Movement within 5px from touch start is considered a tap

// Touch devices need to be able to distinguish touches for scrolling and touches to tap
const getTouchCoordinates = nativeEvent => {
  const touch = nativeEvent && nativeEvent.changedTouches ? nativeEvent.changedTouches[0] : null;
  return touch ? { x: touch.screenX, y: touch.screenY } : null;
};

// Get correct geocoding variant: geocoderGoogleMaps or geocoderMapbox
const getGeocoderVariant = mapProvider => {
  const isGoogleMapsInUse = mapProvider === 'googleMaps';
  return isGoogleMapsInUse ? geocoderGoogleMaps : geocoderMapbox;
};

// Build the listings.query() params for a recent-search entry so we can ask
// Sharetribe how many listings would match if the user re-ran that search.
const paramsForHistoryEntry = entry => {
  if (!entry) return null;
  if (entry.type === 'category' && entry.slug) {
    return { pub_categoryLevel1: entry.slug };
  }
  if (entry.type === 'keyword' && entry.label) {
    return { keywords: entry.label };
  }
  // Location (default)
  const b = entry.place?.bounds;
  if (b && b.ne && b.sw) {
    return {
      bounds: new SDKLatLngBounds(
        new SDKLatLng(b.ne.lat, b.ne.lng),
        new SDKLatLng(b.sw.lat, b.sw.lng)
      ),
    };
  }
  return null;
};

const historyEntryKey = entry => {
  if (!entry) return '';
  return `${entry.type || 'location'}::${entry.label || ''}::${entry.slug || ''}`;
};

// Renders the autocompletion prediction results in a list
const LocationPredictionsList = props => {
  const {
    id,
    rootClassName,
    className,
    useDarkText,
    children,
    predictions,
    currentLocationId,
    geocoder,
    isGoogleMapsInUse,
    highlightedIndex,
    onSelectStart,
    onSelectMove,
    onSelectEnd,
    searchHistory = [],
    onHistorySelect,
    showHistory = false,
    categoryMatches = [],
    onCategorySelect,
    suggestCurrentLocation = false,
    // When true (used on the signup form), hides the "Clique numa destas
    // opções para melhores resultados" heading and the count badges next
    // to each prediction. Keeps the dropdown clean when the user is just
    // picking their city.
    hideExtras = false,
  } = props;
  const intl = useIntl();

  // Per-render cache of fetched counts. Re-resolved when the visible entries
  // change (typed text filters them, dropdown reopens, etc.).
  const [historyCountMap, setHistoryCountMap] = useState({});
  useEffect(() => {
    if (!showHistory || searchHistory.length === 0) return;
    let cancelled = false;
    searchHistory.forEach(entry => {
      const key = historyEntryKey(entry);
      if (historyCountMap[key] !== undefined) return;
      const params = paramsForHistoryEntry(entry);
      if (!params) return;
      getListingCount(params).then(count => {
        if (cancelled) return;
        setHistoryCountMap(prev =>
          prev[key] === count ? prev : { ...prev, [key]: count }
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [showHistory, searchHistory.map(historyEntryKey).join('|')]);

  // Counts for category-name matches (e.g. user types "gas" → "Gastronomia & Convívio").
  const [categoryCountMap, setCategoryCountMap] = useState({});
  useEffect(() => {
    if (!categoryMatches || categoryMatches.length === 0) return;
    let cancelled = false;
    categoryMatches.forEach(cat => {
      if (!cat?.slug) return;
      if (categoryCountMap[cat.slug] !== undefined) return;
      getListingCount({ pub_categoryLevel1: cat.slug }).then(count => {
        if (cancelled || count == null) return;
        setCategoryCountMap(prev =>
          prev[cat.slug] === count ? prev : { ...prev, [cat.slug]: count }
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, [categoryMatches.map(c => c.slug).join('|')]);

  // Same idea for the live geocoder predictions while the user is typing.
  const [predictionCountMap, setPredictionCountMap] = useState({});
  useEffect(() => {
    if (!predictions || predictions.length === 0) return;
    let cancelled = false;
    predictions.forEach(prediction => {
      const pid = geocoder.getPredictionId(prediction);
      if (!pid || pid === currentLocationId) return;
      if (predictionCountMap[pid] !== undefined) return;
      // getPlaceDetails resolves synchronously (no extra API call) — it just
      // pulls bounds from the prediction's bbox.
      geocoder
        .getPlaceDetails(prediction)
        .then(place => {
          if (cancelled || !place?.bounds) return null;
          return getListingCount({ bounds: place.bounds });
        })
        .then(count => {
          if (cancelled || count == null) return;
          setPredictionCountMap(prev =>
            prev[pid] === count ? prev : { ...prev, [pid]: count }
          );
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
    };
  }, [predictions.map(p => geocoder.getPredictionId(p)).join('|')]);

  const hasAnything =
    predictions.length > 0 ||
    (showHistory && searchHistory.length > 0) ||
    categoryMatches.length > 0 ||
    suggestCurrentLocation;

  if (!hasAnything) {
    return null;
  }

  const item = (prediction, index) => {
    const isHighlighted = index === highlightedIndex;
    const predictionId = geocoder.getPredictionId(prediction);

    return (
      <li
        className={classNames(
          isHighlighted ? css.highlighted : null,
          useDarkText ? css.listItemBlackText : css.listItemWhiteText
        )}
        key={predictionId}
        id={predictionId}
        role="option"
        onTouchStart={e => {
          e.preventDefault();
          onSelectStart(getTouchCoordinates(e.nativeEvent));
        }}
        onMouseDown={e => {
          e.preventDefault();
          onSelectStart();
        }}
        onTouchMove={e => {
          e.preventDefault();
          onSelectMove(getTouchCoordinates(e.nativeEvent));
        }}
        onTouchEnd={e => {
          e.preventDefault();
          onSelectEnd(prediction);
        }}
        onMouseUp={e => {
          e.preventDefault();
          onSelectEnd(prediction);
        }}
      >
        {predictionId === currentLocationId ? (
          <span className={css.currentLocation}>
            <IconCurrentLocation />
            <FormattedMessage id="LocationAutocompleteInput.currentLocation" />
          </span>
        ) : (
          <span className={css.predictionRow}>
            <span className={css.historyIcon} aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                width="12"
                height="12"
                aria-hidden="true"
              >
                <path
                  fill="currentColor"
                  d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                />
              </svg>
            </span>
            <span className={css.predictionLabel}>{geocoder.getPredictionAddress(prediction)}</span>
            {!hideExtras && predictionCountMap[predictionId] != null && (
              <span className={css.historyCount}>{predictionCountMap[predictionId]}</span>
            )}
          </span>
        )}
      </li>
    );
  };

  const predictionRootMapProviderClass = isGoogleMapsInUse
    ? css.predictionsRootGoogle
    : css.predictionsRootMapbox;
  const classes = classNames(
    rootClassName || css.predictionsRoot,
    predictionRootMapProviderClass,
    hideExtras ? css.predictionsRootCentered : null,
    className
  );

  const regularPredictions = predictions.filter(p => geocoder.getPredictionId(p) !== currentLocationId);
  const currentLocationPrediction =
    predictions.find(p => geocoder.getPredictionId(p) === currentLocationId) ||
    (suggestCurrentLocation ? { id: currentLocationId, predictionPlace: {} } : null);

  return (
    <div className={classes} id={id}>
      {showHistory && searchHistory.length > 0 && (
        <div className={css.historySection}>
          <p className={css.historyLabel}>
            {intl.formatMessage({ id: 'LocationAutocompleteInput.recentSearchesLabel' })}
          </p>
          <ul className={css.predictions} role="listbox">
            {searchHistory.map((entry, i) => {
              const key = historyEntryKey(entry);
              const count = historyCountMap[key];
              return (
                <li
                  key={`history-${i}`}
                  className={classNames(css.historyItem, useDarkText ? css.listItemBlackText : css.listItemWhiteText)}
                  role="option"
                  onMouseDown={e => { e.preventDefault(); onHistorySelect && onHistorySelect(entry); }}
                  onTouchEnd={e => { e.preventDefault(); onHistorySelect && onHistorySelect(entry); }}
                >
                  <span className={css.historyIcon}>
                    {entry.type === 'category' ? (
                      '#'
                    ) : entry.type === 'keyword' ? (
                      '↩'
                    ) : (
                      // Location entries get a small map-pin SVG so the user
                      // can tell them apart from keyword searches at a glance.
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        width="12"
                        height="12"
                        aria-hidden="true"
                      >
                        <path
                          fill="currentColor"
                          d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"
                        />
                      </svg>
                    )}
                  </span>
                  <span className={css.historyLabelText}>{entry.label}</span>
                  {count != null && (
                    <span className={css.historyCount}>{count}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {categoryMatches.length > 0 && (
        <div className={css.categorySection}>
          <p className={css.categoryLabel}>
            {intl.formatMessage({ id: 'LocationAutocompleteInput.categoriesLabel' })}
          </p>
          <ul className={css.predictions} role="listbox">
            {categoryMatches.map((cat, i) => {
              const handleCatPick = () => {
                saveToSearchHistory({ type: 'category', label: cat.label, slug: cat.slug });
                if (onCategorySelect) onCategorySelect(cat.slug);
              };
              const catCount = categoryCountMap[cat.slug];
              return (
                <li
                  key={`cat-${cat.slug}`}
                  className={classNames(css.categoryItem, useDarkText ? css.listItemBlackText : css.listItemWhiteText)}
                  role="option"
                  onMouseDown={e => { e.preventDefault(); handleCatPick(); }}
                  onTouchEnd={e => { e.preventDefault(); handleCatPick(); }}
                >
                  <span className={css.categoryIcon}>#</span>
                  <span className={css.predictionLabel}>{cat.label}</span>
                  {catCount != null && (
                    <span className={css.historyCount}>{catCount}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {regularPredictions.length > 0 && (
        <div>
          {!hideExtras ? (
            <p className={css.predictionsLabel}>{intl.formatMessage({ id: 'LocationAutocompleteInput.predictionsLabel' })}</p>
          ) : null}
          <ul className={css.predictions} role="listbox">
            {regularPredictions.map(item)}
          </ul>
        </div>
      )}
      {currentLocationPrediction && (
        <div className={css.currentLocationSection}>
          <p className={css.predictionsLabel}>{intl.formatMessage({ id: 'LocationAutocompleteInput.currentLocationLabel' })}</p>
          <ul className={css.predictions} role="listbox">
            {[currentLocationPrediction].map(item)}
          </ul>
        </div>
      )}
      {children}
    </div>
  );
};

// Get the current value with defaults from the given
// LocationAutocompleteInput props.
const currentValue = props => {
  const value = props.input.value || {};
  const { search = '', predictions = [], selectedPlace = null } = value;
  return { search, predictions, selectedPlace };
};

class LocationAutocompleteInputImplementation extends Component {
  constructor(props) {
    super(props);

    this._isMounted = false;

    this.state = {
      inputHasFocus: false,
      selectionInProgress: false,
      touchStartedFrom: null,
      highlightedIndex: -1, // -1 means no highlight
      fetchingPlaceDetails: false,
      fetchingPredictions: false,
      searchHistory: [],
      keywordCount: null,
      keywordCountFor: '',
    };

    // Ref to the input element.
    this.input = null;
    this.shortQueryTimeout = null;

    this.getGeocoder = this.getGeocoder.bind(this);
    this.currentPredictions = this.currentPredictions.bind(this);
    this.changeHighlight = this.changeHighlight.bind(this);
    this.selectPrediction = this.selectPrediction.bind(this);
    this.selectItemIfNoneSelected = this.selectItemIfNoneSelected.bind(this);
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onChange = this.onChange.bind(this);
    this.handleOnBlur = this.handleOnBlur.bind(this);
    this.handlePredictionsSelectStart = this.handlePredictionsSelectStart.bind(this);
    this.handlePredictionsSelectMove = this.handlePredictionsSelectMove.bind(this);
    this.handlePredictionsSelectEnd = this.handlePredictionsSelectEnd.bind(this);
    this.finalizeSelection = this.finalizeSelection.bind(this);
    this.handleHistorySelect = this.handleHistorySelect.bind(this);

    // Debounce the method to avoid calling the API too many times
    // when the user is typing fast.
    this.predict = debounce(this.predict.bind(this), DEBOUNCE_WAIT_TIME, { leading: true });
    // Debounced keyword count: only fires 500ms after the user stops typing,
    // so a quick burst of keystrokes only generates one API call. Cached.
    this.fetchKeywordCount = debounce(this.fetchKeywordCount.bind(this), 500);
  }

  fetchKeywordCount(text) {
    const trimmed = (text || '').trim();
    if (trimmed.length < 2) {
      this.setState({ keywordCount: null, keywordCountFor: '' });
      return;
    }
    // Pick the right query for the current search context so the badge always
    // reflects what's actually being filtered:
    //   1. selectedPlace.bounds → location search
    //   2. pub_categoryLevel1 in URL (no other search) → category search
    //   3. otherwise → free-text keywords
    const value = this.props.input?.value;
    const place = value?.selectedPlace;
    let params;
    if (place?.bounds && place.bounds.ne && place.bounds.sw) {
      params = { bounds: place.bounds };
    } else {
      const urlSearch =
        typeof window !== 'undefined' && window.location?.search
          ? window.location.search
          : '';
      const m = urlSearch.match(/[?&]pub_categoryLevel1=([^&]+)/);
      const slug = m ? decodeURIComponent(m[1]).split(',')[0].trim() : null;
      params = slug ? { pub_categoryLevel1: slug } : { keywords: trimmed };
    }
    getListingCount(params).then(count => {
      if (!this._isMounted) return;
      this.setState({ keywordCount: count, keywordCountFor: trimmed });
    });
  }

  componentDidMount() {
    this._isMounted = true;
    this.setState({ searchHistory: getSearchHistory() });
    // Refresh the snapshot whenever the active user changes — the Topbar
    // pushes the new id via setSearchHistoryUserId, which fires this event.
    this._onUserChange = () => {
      if (!this._isMounted) return;
      this.setState({ searchHistory: getSearchHistory() });
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('v1h:searchHistoryUserChanged', this._onUserChange);
    }
    // Fire the count fetch on first paint too — otherwise navigating directly
    // to a results URL (?keywords=escritorio) leaves the badge missing.
    const initialSearch = currentValue(this.props).search;
    if (initialSearch) this.fetchKeywordCount(initialSearch);
  }

  componentDidUpdate(prevProps) {
    const prev = currentValue(prevProps).search;
    const curr = currentValue(this.props).search;
    if (prev !== curr) {
      this.fetchKeywordCount(curr);
    }
  }

  componentWillUnmount() {
    window.clearTimeout(this.shortQueryTimeout);
    this._isMounted = false;
    if (typeof window !== 'undefined' && this._onUserChange) {
      window.removeEventListener('v1h:searchHistoryUserChanged', this._onUserChange);
    }
  }

  getGeocoder() {
    const geocoderVariant = getGeocoderVariant(this.props.config.maps.mapProvider);
    const Geocoder = geocoderVariant.default;

    // Create the Geocoder as late as possible only when it is needed.
    if (!this._geocoder) {
      this._geocoder = new Geocoder();
    }
    return this._geocoder;
  }

  currentPredictions() {
    const { search, predictions: fetchedPredictions } = currentValue(this.props);
    const { useDefaultPredictions = true, config } = this.props;
    const hasFetchedPredictions = fetchedPredictions && fetchedPredictions.length > 0;
    const showDefaultPredictions = !search && !hasFetchedPredictions && useDefaultPredictions;
    const geocoderVariant = getGeocoderVariant(config.maps.mapProvider);

    // A list of default predictions that can be shown when the user
    // focuses on the autocomplete input without typing a search. This can
    // be used to reduce typing and Geocoding API calls for common
    // searches.
    const defaultPredictions = (config.maps.search.suggestCurrentLocation
      ? [{ id: geocoderVariant.CURRENT_LOCATION_ID, predictionPlace: {} }]
      : []
    ).concat(config.maps.search.defaults);

    return showDefaultPredictions ? defaultPredictions : fetchedPredictions;
  }

  // Interpret input key event
  onKeyDown(e) {
    if (e.keyCode === KEY_CODE_ARROW_UP) {
      // Prevent changing cursor position in input
      e.preventDefault();
      this.changeHighlight(DIRECTION_UP);
    } else if (e.keyCode === KEY_CODE_ARROW_DOWN) {
      // Prevent changing cursor position in input
      e.preventDefault();
      this.changeHighlight(DIRECTION_DOWN);
    } else if (e.keyCode === KEY_CODE_ENTER) {
      const { selectedPlace } = currentValue(this.props);

      if (!selectedPlace) {
        if (this.state.highlightedIndex !== -1) {
          // User highlighted an item with arrow keys — select it
          e.preventDefault();
          e.stopPropagation();
          const predictions = this.currentPredictions();
          if (predictions[this.state.highlightedIndex]) {
            this.selectPrediction(predictions[this.state.highlightedIndex]);
          }
          this.input?.blur();
        }
        // If nothing highlighted, let form submit naturally (keyword search)
      }
    } else if (e.keyCode === KEY_CODE_TAB) {
      if (!e.shiftKey) {
        this.selectItemIfNoneSelected();
      }
    } else if (e.keyCode === KEY_CODE_ESC && this.input) {
      this.input.blur();
    }
  }

  // Handle input text change, fetch predictions if the value isn't empty
  onChange(e) {
    const onChange = this.props.input.onChange;
    const predictions = this.currentPredictions();
    const newValue = e.target.value;

    // Clear the current values since the input content is changed
    onChange({
      search: newValue,
      predictions: newValue ? predictions : [],
      selectedPlace: null,
    });

    // Clear highlighted prediction since the input value changed and
    // results will change as well
    this.setState({ highlightedIndex: -1 });

    if (!newValue) {
      // No need to fetch predictions on empty input
      return;
    }

    if (newValue.length >= 3) {
      if (this.shortQueryTimeout) {
        window.clearTimeout(this.shortQueryTimeout);
      }
      this.predict(newValue);
    } else {
      this.shortQueryTimeout = window.setTimeout(() => {
        this.predict(newValue);
      }, DEBOUNCE_WAIT_TIME_FOR_SHORT_QUERIES);
    }
  }

  // Change the currently highlighted item by calculating the new
  // index from the current state and the given direction number
  // (DIRECTION_UP or DIRECTION_DOWN)
  changeHighlight(direction) {
    this.setState((prevState, props) => {
      const predictions = this.currentPredictions();
      const currentIndex = prevState.highlightedIndex;
      let index = currentIndex;

      if (direction === DIRECTION_UP) {
        // Keep the first position if already highlighted
        index = currentIndex === 0 ? 0 : currentIndex - 1;
      } else if (direction === DIRECTION_DOWN) {
        index = currentIndex + 1;
      }

      // Check that the index is within the bounds
      if (index < 0) {
        index = -1;
      } else if (index >= predictions.length) {
        index = predictions.length - 1;
      }

      return { highlightedIndex: index };
    });
  }

  // Select the prediction in the given item. This will fetch/read the
  // place details and set it as the selected place.
  selectPrediction(prediction) {
    const currentLocationBoundsDistance = this.props.config.maps?.search
      ?.currentLocationBoundsDistance;
    this.props.input.onChange({
      ...this.props.input,
      selectedPlace: null,
    });

    this.setState({ fetchingPlaceDetails: true });

    this.getGeocoder()
      .getPlaceDetails(prediction, currentLocationBoundsDistance)
      .then(place => {
        if (!this._isMounted) {
          // Ignore if component already unmounted
          return;
        }
        this.setState({ fetchingPlaceDetails: false });
        if (place.address) {
          saveToSearchHistory({ type: 'location', label: place.address, place });
          this.setState({ searchHistory: getSearchHistory() });
        }
        this.props.input.onChange({
          search: place.address,
          predictions: [],
          selectedPlace: place,
        });
      })
      .catch(e => {
        this.setState({ fetchingPlaceDetails: false });
        // eslint-disable-next-line no-console
        console.error(e);
        this.props.input.onChange({
          ...this.props.input.value,
          selectedPlace: null,
        });
      });
  }
  selectItemIfNoneSelected() {
    if (this.state.fetchingPredictions) {
      // No need to select anything since prediction fetch is still going on
      return;
    }

    const { search, selectedPlace } = currentValue(this.props);
    const predictions = this.currentPredictions();
    if (!selectedPlace) {
      if (predictions && predictions.length > 0) {
        const geocoderVariant = getGeocoderVariant(this.props.config.maps.mapProvider);
        if (
          this.state.highlightedIndex === -1 &&
          predictions.length === 1 &&
          predictions[0].id === geocoderVariant.CURRENT_LOCATION_ID
        ) {
          // If the only prediction is the current location, do not select it automatically.
          return;
        }
        const index = this.state.highlightedIndex !== -1 ? this.state.highlightedIndex : 0;
        this.selectPrediction(predictions[index]);
      } else {
        this.predict(search);
      }
    }
  }
  predict(search) {
    const config = this.props.config;
    const onChange = this.props.input.onChange;
    this.setState({ fetchingPredictions: true });

    return this.getGeocoder()
      .getPlacePredictions(search, config.maps.search.countryLimit, config.localization.locale)
      .then(results => {
        const { search: currentSearch } = currentValue(this.props);
        this.setState({ fetchingPredictions: false });

        // If the earlier predictions arrive when the user has already
        // changed the search term, ignore and wait until the latest
        // predictions arrive. Without this logic, results for earlier
        // requests would override whatever the user had typed since.
        //
        // This is essentially the same as switchLatest in RxJS or
        // takeLatest in Redux Saga, without canceling the earlier
        // requests.
        if (results.search === currentSearch) {
          onChange({
            search: results.search,
            predictions: results.predictions,
            selectedPlace: null,
          });
        }
      })
      .catch(e => {
        this.setState({ fetchingPredictions: false });
        // eslint-disable-next-line no-console
        console.error(e);
        const value = currentValue(this.props);
        onChange({
          ...value,
          selectedPlace: null,
        });
      });
  }

  handleHistorySelect(entry) {
    // Bump it to the front of the history regardless of type.
    saveToSearchHistory(entry);
    this.setState({ searchHistory: getSearchHistory() });

    if (entry?.type === 'category' && entry.slug) {
      if (this.props.onCategorySelect) this.props.onCategorySelect(entry.slug);
      this.finalizeSelection();
      return;
    }
    if (entry?.type === 'keyword' && entry.label) {
      if (this.props.onKeywordSelect) this.props.onKeywordSelect(entry.label);
      this.finalizeSelection();
      return;
    }
    this.props.input.onChange({
      search: entry.label,
      predictions: [],
      selectedPlace: rehydratePlace(entry.place),
    });
    this.finalizeSelection();
  }

  finalizeSelection() {
    this.setState({ inputHasFocus: false, highlightedIndex: -1 });
    this.props.input.onBlur(currentValue(this.props));
  }

  handleOnBlur() {
    if (this.props.closeOnBlur && !this.state.selectionInProgress) {
      // On forms where a resolved place is mandatory (the listing wizard),
      // leaving the field with typed text but no selection would otherwise
      // keep the form silently invalid: `input.onBlur` is what sets
      // final-form's `touched`, and without it ValidationError never renders.
      // Resolving the top prediction here means a correctly typed address
      // just works, and anything unrecognised surfaces its error.
      if (this.props.selectOnBlur) {
        const { search, selectedPlace } = currentValue(this.props);
        const predictions = this.currentPredictions();
        // Only resolve predictions that are already on screen — never kick off
        // a new geocoder request from a blur, which would throw if the map
        // library failed to load.
        if (search && !selectedPlace && predictions.length > 0) {
          const index = this.state.highlightedIndex !== -1 ? this.state.highlightedIndex : 0;
          const prediction = predictions[index];
          const geocoderVariant = getGeocoderVariant(this.props.config.maps.mapProvider);
          if (prediction && prediction.id !== geocoderVariant.CURRENT_LOCATION_ID) {
            this.selectPrediction(prediction);
          }
        }
      }
      this.finalizeSelection();
    }
  }

  handlePredictionsSelectStart(touchCoordinates) {
    this.setState({
      selectionInProgress: true,
      touchStartedFrom: touchCoordinates,
      isSwipe: false,
    });
  }

  handlePredictionsSelectMove(touchCoordinates) {
    this.setState(prevState => {
      const touchStartedFrom = prevState.touchStartedFrom;
      const isTouchAction = !!touchStartedFrom;
      const isSwipe = isTouchAction
        ? Math.abs(touchStartedFrom.y - touchCoordinates.y) > TOUCH_TAP_RADIUS
        : false;

      return { selectionInProgress: false, isSwipe };
    });
  }

  handlePredictionsSelectEnd(prediction) {
    let selectAndFinalize = false;
    this.setState(
      prevState => {
        if (!prevState.isSwipe) {
          selectAndFinalize = true;
        }
        return { selectionInProgress: false, touchStartedFrom: null, isSwipe: false };
      },
      () => {
        if (selectAndFinalize) {
          this.selectPrediction(prediction);
          this.finalizeSelection();
        }
      }
    );
  }

  render() {
    const {
      autoFocus,
      rootClassName,
      className,
      useDarkText,
      iconClassName,
      CustomIcon,
      inputClassName,
      predictionsClassName,
      predictionsAttributionClassName,
      validClassName,
      placeholder = '',
      input,
      meta,
      inputRef,
      disabled,
      config,
      intl,
      id,
      submitButton: SubmitButton,
      ariaLabel,
    } = this.props;
    const { name, onFocus } = input;
    const { search } = currentValue(this.props);
    const { touched, valid } = meta || {};
    const isValid = valid && touched;
    const predictions = this.currentPredictions();

    const ariaLabelMaybe = ariaLabel ? { ['aria-label']: ariaLabel } : {};

    const handleOnFocus = e => {
      this.setState({ inputHasFocus: true });
      onFocus(e);
    };

    const rootClass = classNames(rootClassName || css.root, className);
    const iconClass = classNames(iconClassName || css.icon);
    const inputClass = classNames(inputClassName || css.input, { [validClassName]: isValid });
    const predictionsClass = classNames(predictionsClassName);

    // Only render predictions when the input has focus. For
    // development and easier workflow with the browser devtools, you
    // might want to hardcode this to `true`. Otherwise the dropdown
    // list will disappear.
    const renderPredictions = this.state.inputHasFocus;
    const geocoderVariant = getGeocoderVariant(config.maps.mapProvider);
    const GeocoderAttribution = geocoderVariant.GeocoderAttribution;
    // The first ref option in this optional chain is about callback ref,
    // which was used in previous version of this Template.
    const refMaybe =
      typeof inputRef === 'function'
        ? {
            ref: node => {
              this.input = node;
              if (inputRef) {
                inputRef(node);
              }
            },
          }
        : inputRef
        ? { ref: inputRef }
        : {};

    const predictionsId = `${id}.predictions`;

    return (
      <div className={rootClass}>
        <div className={iconClass}>
          {this.state.fetchingPlaceDetails ? (
            <IconSpinner className={css.iconSpinner} />
          ) : CustomIcon ? (
            <CustomIcon />
          ) : SubmitButton ? (
            <SubmitButton />
          ) : (
            <IconLookingGlass
              ariaLabel={intl.formatMessage({
                id: 'LocationAutocompleteInput.screenreader.search',
              })}
            />
          )}
        </div>
        <input
          className={inputClass}
          type="search"
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder}
          name={name}
          id={id}
          value={search}
          disabled={disabled || this.state.fetchingPlaceDetails}
          onFocus={handleOnFocus}
          onBlur={this.handleOnBlur}
          onChange={this.onChange}
          onKeyDown={this.onKeyDown}
          {...refMaybe}
          title={search}
          data-testid="location-search"
          {...ariaLabelMaybe}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={renderPredictions}
          aria-controls={predictionsId}
          aria-activedescendant={predictions[this.state.highlightedIndex]?.id}
        />
        {!this.props.hideExtras &&
          this.state.keywordCount != null &&
          this.state.keywordCountFor === (search || '').trim() && (
            <span className={css.liveCount}>{this.state.keywordCount}</span>
          )}
        {renderPredictions ? (
          <LocationPredictionsList
            id={predictionsId}
            rootClassName={predictionsClass}
            useDarkText={useDarkText}
            predictions={predictions}
            currentLocationId={geocoderVariant.CURRENT_LOCATION_ID}
            isGoogleMapsInUse={config.maps.mapProvider === 'googleMaps'}
            geocoder={this.getGeocoder()}
            highlightedIndex={this.state.highlightedIndex}
            onSelectStart={this.handlePredictionsSelectStart}
            onSelectMove={this.handlePredictionsSelectMove}
            onSelectEnd={this.handlePredictionsSelectEnd}
            searchHistory={(() => {
              const base = this.props.locationOnlyHistory
                ? this.state.searchHistory.filter(
                    e => !e.type || e.type === 'location'
                  )
                : this.state.searchHistory;
              if (!search) return base.slice(0, MAX_DISPLAY);
              // Live-filter recents by what the user is typing so they can
              // pick a previous search without losing it among new geocoder hits.
              const normalize = s =>
                String(s || '')
                  .toLowerCase()
                  .normalize('NFD')
                  .replace(/[̀-ͯ]/g, '');
              const needle = normalize(search);
              return base
                .filter(e => normalize(e.label).includes(needle))
                .slice(0, MAX_DISPLAY);
            })()}
            onHistorySelect={this.handleHistorySelect}
            showHistory={!this.props.hideSearchHistory}
            categoryMatches={this.props.categoryMatches || []}
            onCategorySelect={this.props.onCategorySelect}
            suggestCurrentLocation={
              typeof this.props.suggestCurrentLocation === 'boolean'
                ? this.props.suggestCurrentLocation
                : !!config.maps.search.suggestCurrentLocation
            }
            hideExtras={this.props.hideExtras}
          >
            <GeocoderAttribution
              className={predictionsAttributionClassName}
              useDarkText={useDarkText}
            />
          </LocationPredictionsList>
        ) : null}
      </div>
    );
  }
}

/**
 * @typedef {Object} SearchData
 * @property {string} search
 * @property {Object} predictions
 * @property {Object} selectedPlace
 */

/**
 * @typedef {Object} SearchData
 * @property {Object} current
 */

/**
 * Location auto completion input component
 *
 * This component can work as the `component` prop to Final Form's
 * <Field /> component. It takes a custom input value shape, and
 * controls the onChange callback that is called with the input value.
 *
 * The component works by listening to the underlying input component
 * and calling a Geocoder implementation for predictions. When the
 * predictions arrive, those are passed to Final Form in the onChange
 * callback.
 *
 * See the LocationAutocompleteInput.example.js file for a usage
 * example within a form.
 *
 * @component
 * @param {Object} props
 * @param {string?} props.className add more style rules in addition to components own css.root
 * @param {string?} props.rootClassName overwrite components own css.root
 * @param {string?} props.iconClassName
 * @param {string?} props.inputClassName
 * @param {string?} props.predictionsClassName
 * @param {string?} props.predictionsAttributionClassName
 * @param {string?} props.validClassName
 * @param {boolean} props.autoFocus
 * @param {boolean} props.closeOnBlur
 * @param {boolean} props.selectOnBlur resolve the top prediction when the field
 *   is left with typed text but no selected place (requires closeOnBlur)
 * @param {string?} props.placeholder
 * @param {boolean} props.useDefaultPredictions
 * @param {Object} props.input
 * @param {string} props.input.name
 * @param {string|SearchData} props.input.value
 * @param {Function} props.input.onChange
 * @param {Function} props.input.onFocus
 * @param {Function} props.input.onBlur
 * @param {Object} props.meta
 * @param {boolean} props.meta.valid
 * @param {boolean} props.meta.touched
 * @param {Function | RefHook} props.inputRef
 * @param {ReactNode} props.CustomIcon override the default icon
 * @returns {JSX.Element} LocationAutocompleteInputImpl component
 */
const LocationAutocompleteInputImpl = props => {
  const config = useConfiguration();
  const intl = useIntl();

  return <LocationAutocompleteInputImplementation config={config} intl={intl} {...props} />;
};

export default LocationAutocompleteInputImpl;
