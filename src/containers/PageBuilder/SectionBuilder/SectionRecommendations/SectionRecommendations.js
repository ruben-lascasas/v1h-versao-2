import React, { useEffect, useMemo, useRef } from 'react';
import classNames from 'classnames';
import { useDispatch, useSelector } from 'react-redux';

import { useConfiguration } from '../../../../context/configurationContext';
import { useLocale } from '../../../../context/localeContext';
import { FormattedMessage } from '../../../../util/reactIntl';
import { ListingCard } from '../../../../components';
import { denormalisedEntities } from '../../../../util/data';
import { types as sdkTypes } from '../../../../util/sdkLoader';

const { UUID } = sdkTypes;

import {
  fetchRecommendationCandidates,
  fetchViewCounts,
  selectRecommendationsFetched,
  selectRecommendationsInProgress,
  selectExcludeSnapshot,
  setExcludeSnapshot,
  clearExcludeSnapshot,
  selectViewCounts,
} from '../../../../ducks/recommendations.duck';
import { selectFavorites } from '../../../../ducks/favorites.duck';
import { selectRecentlyViewed } from '../../../../ducks/recentlyViewed.duck';

import SectionContainer from '../SectionContainer';
import css from './SectionRecommendations.module.css';

const MAX_RESULTS = 6;

// Hash that mixes a mount-time seed (provided by the component) with the
// candidate ID. We keep the seed *per mount* rather than per module load
// so that within a SPA navigation cycle — log out, log back in, navigate
// away and return — the section reshuffles. Inside one render-pass the
// seed is stable, so the grid doesn't dance on every Redux tick.
const hashWithSeed = (seed, str) => {
  let h = seed | 0;
  for (let i = 0; i < str.length; i++) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return h;
};
const stableJitter = (seed, uuid) => {
  if (!uuid) return 0;
  // Map the int hash to [0, 2.5). Range was widened so two users (or two
  // mounts) see distinctly different orderings instead of the popularity
  // signal locking the same 6 cards in place.
  const h = hashWithSeed(seed, uuid);
  return ((h >>> 0) % 1000) / 1000 * 2.5;
};

// --- Helpers --------------------------------------------------------------

// Pull the lowercase city token out of a Sharetribe address string.
// Sharetribe addresses look like "Alcântara, Lisboa, Lisboa, Portugal" —
// the city is usually the 2nd or 3rd comma-separated token. Returning the
// raw lowercased address as a fallback so substring matches still work.
const cityTokens = address => {
  if (!address || typeof address !== 'string') return [];
  return address
    .toLowerCase()
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
};

const getCategory = listing => listing?.attributes?.publicData?.categoryLevel1 || null;
const getCity = listing =>
  cityTokens(listing?.attributes?.publicData?.location?.address || '');
const getPriceAmount = listing => listing?.attributes?.price?.amount || null;
const getAuthorUuid = listing => listing?.author?.id?.uuid || listing?.relationships?.author?.data?.id?.uuid;

// --- Profile + scoring ----------------------------------------------------

// Build a lightweight "interest profile" out of the user's signals.
// Heavily-weighted signals: favorites + recently viewed (recent intent).
// Each signal contributes its category, cities and price bracket to the
// pool — candidates that overlap multiple dimensions score highest.
const buildProfile = signalListings => {
  const categories = new Map();
  const cities = new Map();
  const prices = [];

  const bump = (map, key, weight) => {
    if (!key) return;
    map.set(key, (map.get(key) || 0) + weight);
  };

  signalListings.forEach((entry, idx) => {
    if (!entry) return;
    // More recent signals weigh slightly more (newer = stronger intent).
    const recencyWeight = 1 + Math.max(0, 1 - idx / signalListings.length);

    bump(categories, getCategory(entry), recencyWeight);
    getCity(entry).forEach(token => bump(cities, token, recencyWeight));
    const p = getPriceAmount(entry);
    if (p != null) prices.push(p);
  });

  const avgPrice = prices.length
    ? prices.reduce((a, b) => a + b, 0) / prices.length
    : null;

  return { categories, cities, avgPrice, signalCount: signalListings.length };
};

// Get the user's home-base city tokens from their profile location, if any.
// Used as a cold-start signal — Booking.com does the same: when the user
// hasn't built up history yet, the marketplace shows them stuff near them.
const profileCityTokens = currentUser => {
  const addr =
    currentUser?.attributes?.profile?.publicData?.location?.address ||
    currentUser?.attributes?.profile?.publicData?.location ||
    '';
  return cityTokens(typeof addr === 'string' ? addr : '');
};

// Score a single candidate against the user profile.
//
// The score combines several signals — strongest first:
//   0. Direct recently-viewed bonus              (+5..0, decays with rank)
//   1. Category overlap with the user's signals  (×3 per match weight)
//   2. City overlap with the user's signals      (×2 per match)
//   3. Price within ±50% of the signal average   (+1, +0.4 for ±100%)
//   4. Profile-location bonus (cold-start)       (+2.5 if same city)
//   5. Popularity bonus from real view counts    (log-scaled, +0 to +1.5)
//   6. Recency bonus for listings <30 days old   (small, +0 to +1)
//   7. Random jitter (variety / tie-break)       (+0 to +2.5)
//
// The popularity + location + recency are the cold-start carriers — a
// brand-new account without history sees popular listings near them first,
// not "the 30 newest by createdAt" (which was the old behavior and felt
// unfair to older listings).
const scoreCandidate = (candidate, profile, ctx) => {
  if (!candidate) return 0;
  const { viewCounts = {}, profileCities = [] } = ctx || {};
  let score = 0;

  // --- 0. Direct recency bonus — the user clicked THIS listing recently ---
  // recentRanks maps listingUuid → 0-based position in the recently-viewed
  // list (0 = most recent). The card the user just opened gets +5; older
  // ones decay linearly. This makes "Sugestões pensadas para si" feel like
  // a continuation of what they were just looking at, instead of constantly
  // pushing only adjacent-category listings.
  const uuidEarly = candidate?.id?.uuid;
  if (uuidEarly && ctx?.recentRanks) {
    const rank = ctx.recentRanks.get(uuidEarly);
    if (rank != null) {
      // 0 → +5, 1 → +4, …, 5+ → +0
      const recencyBoost = Math.max(0, 5 - rank);
      score += recencyBoost;
    }
  }

  // --- 1. Category overlap with explicit signals --------------------------
  const cat = getCategory(candidate);
  if (cat && profile.categories.get(cat)) {
    score += 3 * profile.categories.get(cat);
  }

  // --- 2. City overlap with explicit signals ------------------------------
  const candCity = getCity(candidate);
  candCity.forEach(token => {
    const w = profile.cities.get(token);
    if (w) score += 2 * w;
  });

  // --- 3. Price proximity --------------------------------------------------
  if (profile.avgPrice != null) {
    const p = getPriceAmount(candidate);
    if (p != null) {
      const ratio = p / profile.avgPrice;
      if (ratio >= 0.5 && ratio <= 1.5) score += 1;
      else if (ratio >= 0.25 && ratio <= 2) score += 0.4;
    }
  }

  // --- 4. Profile-location bonus (cold-start safety net) ------------------
  // Even without click history, if the user set a city in their profile we
  // can prefer listings in that city. Bigger weight than the signal-driven
  // city match so it actually moves the needle for empty accounts.
  if (profileCities.length && candCity.length) {
    const overlap = candCity.some(t => profileCities.includes(t));
    if (overlap) score += 2.5;
  }

  // --- 5. Popularity (real view counts from server-side counter) ----------
  // log-scaled so a listing with 100 views isn't 100× a listing with 1 view.
  // Cap at +1.5 (was 3) so popularity tilts but doesn't dictate the top 6.
  const uuid = candidate?.id?.uuid;
  const allTimeCount = uuid && viewCounts[uuid]?.allTimeCount;
  if (typeof allTimeCount === 'number' && allTimeCount > 0) {
    score += Math.min(1.5, Math.log10(allTimeCount + 1) * 0.8);
  }

  // --- 6. Small recency bonus for genuinely new listings ------------------
  // Listings younger than 30 days get a tiny boost so they have a chance
  // even without views or signals. Decays to zero at 30 days.
  const createdAt = candidate?.attributes?.createdAt;
  if (createdAt) {
    const ageDays = (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays >= 0 && ageDays < 30) {
      score += 1 * (1 - ageDays / 30);
    }
  }

  // --- 7. Stable jitter (now the dominant tie-breaker) -------------------
  // Deterministic per (mountSeed × userId × listingId). Same listing gets
  // the same jitter inside one render-pass (no dancing grid), but each
  // remount of the component (e.g. logout → login, navigate away → back)
  // gets a fresh mount seed → different ordering.
  const seed = (ctx?.mountSeed || 0) ^ hashWithSeed(0, ctx?.userSeed || 'anon');
  score += stableJitter(seed, candidate?.id?.uuid || '');

  return score;
};

// --- Component ------------------------------------------------------------

const SectionRecommendations = props => {
  const { sectionId, className, rootClassName, appearance } = props;
  const config = useConfiguration();
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const dispatch = useDispatch();

  const currentUser = useSelector(state => state.user?.currentUser);
  const currentUserId = currentUser?.id?.uuid;
  const isAuthenticated = useSelector(state => !!state.auth?.isAuthenticated);

  const favIds = useSelector(selectFavorites);
  const recentIds = useSelector(selectRecentlyViewed);
  const viewCounts = useSelector(selectViewCounts);
  const fallbackFetched = useSelector(selectRecommendationsFetched);
  const fallbackInProgress = useSelector(selectRecommendationsInProgress);

  // Use whatever listings the rest of the site has already loaded into
  // `marketplaceData` — Destaque + recently-viewed + favourites + search
  // results all populate this store. The recommendations section now does
  // ZERO extra SDK calls; it just picks the 6 best from what's there.
  //
  // Tradeoff: the candidate pool size depends on how much the user has
  // navigated. On a first homepage visit it's basically just the Destaque
  // listings (~10). Once the user navigates a bit, the pool grows.
  // In return: no contribution to the 60/min rate limit, no 429s caused
  // by this section, no extra waiting time.
  const allEntities = useSelector(state => state.marketplaceData?.entities);
  const candidates = useMemo(() => {
    const listingMap = allEntities?.listing;
    if (!listingMap) return [];
    const ids = Object.keys(listingMap);
    if (ids.length === 0) return [];
    const resources = ids.map(uuid => ({ id: new UUID(uuid), type: 'listing' }));
    return denormalisedEntities(allEntities, resources, false).filter(Boolean);
  }, [allEntities]);
  const signalListings = useMemo(() => {
    if (!allEntities) return [];
    const ids = [...new Set([...(recentIds || []), ...(favIds || [])])].filter(Boolean);
    if (ids.length === 0) return [];
    const resources = ids.map(uuid => ({ id: new UUID(uuid), type: 'listing' }));
    return denormalisedEntities(allEntities, resources, false).filter(Boolean);
  }, [allEntities, recentIds, favIds]);

  // Mount-time seed for the jitter. Fresh each time the component mounts
  // (logout/login, navigate away/back), so the shown 6 reshuffle. Stable
  // through all the re-renders within a single mount so the grid stays
  // still during normal Redux ticks.
  const mountSeedRef = useRef(Math.floor(Math.random() * 0xffffffff));

  // View counts come from the local Express server (/api/listing-views),
  // not Sharetribe — fetched once for logged-in users when the component
  // first mounts.
  useEffect(() => {
    if (!isAuthenticated) return;
    dispatch(fetchViewCounts());
  }, [isAuthenticated, dispatch]);

  // Fallback fetch: the section prefers to reuse listings already loaded
  // by other parts of the site (Destaque, recently-viewed, favourites)
  // because it costs zero extra Sharetribe queries. BUT if 2 seconds after
  // mount the marketplaceData store is still short on candidates, we kick
  // off our own one-shot fetch. Used to be "empty or not", bumped to "less
  // than 6" because the colleague switched Destaque to listingSelection:
  // 'featured' (only featured-flagged listings), which means marketplaceData
  // can have just 1-2 entries on cold load — not enough for a 6-card
  // recommendations grid. The duck itself guards against re-firing.
  const FALLBACK_MIN_CANDIDATES = 6;
  const candidateCount = allEntities?.listing
    ? Object.keys(allEntities.listing).length
    : 0;
  const needsFallback = candidateCount < FALLBACK_MIN_CANDIDATES;
  useEffect(() => {
    if (!isAuthenticated) return;
    if (!needsFallback) return;
    if (fallbackFetched || fallbackInProgress) return;
    const timer = setTimeout(() => {
      // Re-check inside the timer in case Destaque just populated.
      dispatch(fetchRecommendationCandidates(config));
    }, 2000);
    return () => clearTimeout(timer);
  }, [
    isAuthenticated,
    needsFallback,
    fallbackFetched,
    fallbackInProgress,
    dispatch,
    config,
  ]);

  // Snapshot of FAVORITES captured once per user-session and persisted in
  // Redux (not in a local ref) so it survives navigation to a listing and
  // back. Recently-viewed is intentionally NOT included — if the user
  // clicked into a card they found interesting we want it to keep showing
  // up so they can find it again easily. Favorites are excluded because
  // adding to favorites is an explicit "I've saved this for later" signal.
  // The snapshot is rebuilt when:
  //   – the user changes (logout → login as another account, same tab); or
  //   – the user logs out (snapshot is cleared so the next login starts
  //     fresh).
  const snapshot = useSelector(selectExcludeSnapshot);
  useEffect(() => {
    if (!isAuthenticated) {
      if (snapshot.userId !== null || (snapshot.ids && snapshot.ids.length)) {
        dispatch(clearExcludeSnapshot());
      }
      return;
    }
    if (snapshot.userId !== currentUserId) {
      dispatch(setExcludeSnapshot({ userId: currentUserId, ids: favIds || [] }));
    }
  }, [isAuthenticated, currentUserId, snapshot.userId, favIds, dispatch]);

  // Memoize the entire score → filter → sort → top-N pipeline so it doesn't
  // re-run on every unrelated Redux update. Without this, every notification
  // / favorite / chat message tick was making this section recompute 100
  // scores from scratch, which is the main reason the homepage felt slow.
  const final = useMemo(() => {
    if (!isAuthenticated || candidates.length === 0) return [];

    const profile = buildProfile(signalListings);
    const snapshotMatches = snapshot.userId === currentUserId;
    const excludeIds = snapshotMatches
      ? new Set(snapshot.ids)
      : new Set(favIds || []);
    // Build a map listingUuid → rank (0 = most recent click). The scoring
    // uses this to give a direct, position-decayed bonus to listings the
    // user has been opening, so "Sugestões pensadas para si" surfaces them
    // again rather than only neighbours-by-category.
    const recentRanks = new Map();
    (recentIds || []).forEach((id, idx) => {
      if (id && !recentRanks.has(id)) recentRanks.set(id, idx);
    });

    const scoringCtx = {
      viewCounts,
      profileCities: profileCityTokens(currentUser),
      // userSeed makes the random jitter per-user — empty Account A and
      // empty Account B end up with different orderings even though they
      // share the popularity-dominant ranking.
      userSeed: currentUserId || 'anon',
      // mountSeed re-shuffles the order each time the component mounts
      // (logout → login, navigate away → back). Stable within one mount.
      mountSeed: mountSeedRef.current,
      recentRanks,
    };

    const filtered = candidates.filter(c => {
      if (!c?.id?.uuid) return false;
      if (excludeIds.has(c.id.uuid)) return false;
      const authorUuid = getAuthorUuid(c);
      if (authorUuid && currentUserId && authorUuid === currentUserId) return false;
      const stateAttr = c?.attributes?.state;
      if (stateAttr && stateAttr !== 'published') return false;
      return true;
    });

    const scored = filtered.map(c => ({
      listing: c,
      score: scoreCandidate(c, profile, scoringCtx),
    }));

    scored.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const dA = new Date(a.listing?.attributes?.createdAt || 0).getTime();
      const dB = new Date(b.listing?.attributes?.createdAt || 0).getTime();
      return dB - dA;
    });

    let top = scored.slice(0, MAX_RESULTS).map(x => x.listing);

    // Safety net: if filtering emptied the list but the API returned
    // candidates, show the raw pool (own + unpublished still filtered out)
    // so logged-in users always see something.
    if (top.length === 0) {
      top = filtered.slice(0, MAX_RESULTS);
    }
    return top;
  }, [
    isAuthenticated,
    candidates,
    signalListings,
    snapshot.userId,
    snapshot.ids,
    favIds,
    recentIds,
    viewCounts,
    currentUser,
    currentUserId,
  ]);

  if (!isAuthenticated) return null;

  const darkMode = appearance?.textColor === 'white';
  const classes = classNames(rootClassName || css.root, className);
  const wrapperClasses = classNames(css.grid, { [css.dark]: darkMode });

  // If marketplaceData hasn't loaded any listings yet (cold homepage hit
  // before Destaque populates the store) there's nothing to show — bail
  // and let other navigation populate marketplaceData. The component
  // re-renders automatically when Redux updates so the section appears
  // as soon as candidates are available.
  if (final.length === 0) return null;

  return (
    <SectionContainer
      id={sectionId || 'section-recommendations'}
      className={classes}
      appearance={appearance}
    >
      <header className={css.header}>
        <h2 className={css.title}>
          <FormattedMessage
            id="SectionRecommendations.title"
            defaultMessage={isEN ? 'Suggestions for you' : 'Sugestões pensadas para si'}
          />
        </h2>
        <hr className={css.divider} />
      </header>
      <ul className={wrapperClasses}>
        {final.map(listing => (
          <li key={listing.id.uuid} className={css.item}>
            <ListingCard listing={listing} />
          </li>
        ))}
      </ul>
    </SectionContainer>
  );
};

// Tiny error boundary so a crash inside SectionRecommendations (e.g. stale
// sessionStorage cache with an incompatible shape, a flaky third-party
// dependency, …) can never take down the entire homepage. Falls back to
// rendering nothing — the rest of the page keeps working.
class RecommendationsBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.warn('SectionRecommendations crashed and was suppressed:', error, info);
  }
  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}

const SafeSectionRecommendations = props => (
  <RecommendationsBoundary>
    <SectionRecommendations {...props} />
  </RecommendationsBoundary>
);

export default SafeSectionRecommendations;
