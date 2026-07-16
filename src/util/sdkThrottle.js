/**
 * Global SDK throttle.
 *
 * Wraps the Sharetribe SDK so that every outbound query/show/create/update
 * goes through a single in-process queue:
 *   - up to `MAX_CONCURRENT` requests run in parallel,
 *   - a `MIN_GAP_MS` gap is enforced between requests,
 *   - when any request returns 429 the queue **freezes for COOLDOWN_MS**,
 *     so retries don't keep hammering and extend the test-env cooldown,
 *   - each request gets up to `MAX_RETRIES` automatic retries on 429.
 *
 * This exists because V1H is on a tier of Sharetribe that aggressively
 * rate-limits the test environment (60 queries/min/IP). Without a global
 * coordinator, multiple components firing in parallel on a page load
 * exhaust the bucket instantly. Each component already has its own queue,
 * but they don't know about each other — this is the only spot where the
 * full rate can be controlled.
 *
 * The live (production) environment is *not* rate-limited, so the throttle
 * is essentially invisible there: at low/moderate traffic everything goes
 * through immediately because there's nothing to slow down.
 */

// Tuning for V1H's Sharetribe test tier (60 queries/min/IP). Numbers are
// deliberately aggressive — at 1 concurrent + 400ms gap we hit ~2.5 req/s,
// well under the budget, with headroom for the natural burstiness of
// route transitions. In live (production) this is essentially invisible
// because there's no 429 to trigger the cooldown.
const MAX_CONCURRENT = 1;
const MIN_GAP_MS = 400;
const COOLDOWN_MS = 30000; // 30 s freeze after a 429 slips through
const MAX_RETRIES = 2;

// Namespaces that contain HTTP-fetching methods. The rest of the SDK
// (`tokenStore`, `types`, `transit`, `util`) is left untouched because
// wrapping non-HTTP helpers would just slow down value lookups.
const HTTP_NAMESPACES = [
  'listings',
  'ownListings',
  'transactions',
  'users',
  'currentUser',
  'reviews',
  'messages',
  'images',
  'marketplace',
  'stock',
  'stockAdjustments',
  'availabilityExceptions',
  'timeslots',
  'bookings',
  'processTransitions',
  'passwordReset',
  'authInfo',
  'login',
  'logout',
  'exchangeToken',
  'newSession',
  'assetByAlias',
  'assetsByAlias',
];

let active = 0;
let lastStartedAt = 0;
let cooldownUntil = 0;
const waiters = [];

const sleep = ms => new Promise(r => setTimeout(r, ms));

const tick = () => {
  while (active < MAX_CONCURRENT && waiters.length > 0) {
    const now = Date.now();
    if (now < cooldownUntil) {
      // Schedule a retry exactly when the cooldown ends.
      setTimeout(tick, cooldownUntil - now + 5);
      return;
    }
    const sinceLast = now - lastStartedAt;
    if (sinceLast < MIN_GAP_MS) {
      setTimeout(tick, MIN_GAP_MS - sinceLast);
      return;
    }
    const next = waiters.shift();
    active += 1;
    lastStartedAt = now;
    next();
  }
};

const enqueue = () => new Promise(resolve => {
  waiters.push(resolve);
  tick();
});

const release = () => {
  active = Math.max(0, active - 1);
  tick();
};

const openCircuit = () => {
  cooldownUntil = Date.now() + COOLDOWN_MS;
};

const runThrottled = async (originalFn, args) => {
  for (let attempt = 0; ; attempt += 1) {
    await enqueue();
    try {
      const result = await originalFn(...args);
      release();
      return result;
    } catch (err) {
      release();
      const isRateLimited = err && err.status === 429;
      if (isRateLimited) {
        openCircuit();
        if (attempt < MAX_RETRIES) {
          // Wait through the cooldown before retrying.
          await sleep(COOLDOWN_MS + 50);
          continue;
        }
      }
      throw err;
    }
  }
};

const wrapNamespace = ns => {
  if (!ns || typeof ns !== 'object') return ns;
  const wrapped = {};
  for (const [key, value] of Object.entries(ns)) {
    if (typeof value === 'function') {
      wrapped[key] = function throttled(...args) {
        return runThrottled(value.bind(ns), args);
      };
    } else {
      wrapped[key] = value;
    }
  }
  return wrapped;
};

/**
 * Wrap an SDK instance with the global throttle. Returns a new object that
 * proxies the HTTP-fetching namespaces through the queue and leaves the
 * rest of the SDK surface untouched.
 *
 * Usage:
 *   import { createInstance } from './sdkLoader';
 *   import { throttleSdk } from './sdkThrottle';
 *   const sdk = throttleSdk(createInstance({...}));
 */
export const throttleSdk = sdk => {
  if (!sdk || typeof sdk !== 'object') return sdk;
  const wrapped = { ...sdk };
  for (const namespace of HTTP_NAMESPACES) {
    if (sdk[namespace]) {
      wrapped[namespace] = wrapNamespace(sdk[namespace]);
    }
  }
  return wrapped;
};

export default throttleSdk;
