/**
 * One-shot reset for the favourites feature.
 *
 *   • Clears every user's `privateData.favorites` (per-user heart list).
 *   • Clears every listing's `metadata.likedBy` and `metadata.favoritesCount`.
 *
 * Use this during development to wipe test likes and start with a clean slate.
 *
 * Required env (same as the rest of the server):
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 *   REACT_APP_SHARETRIBE_SDK_BASE_URL  (optional)
 *
 * Run:
 *   node scripts/reset-favorites.js             # apply changes
 *   node scripts/reset-favorites.js --dry-run   # just print what would change
 *   node scripts/reset-favorites.js --listings-only
 *   node scripts/reset-favorites.js --users-only
 */

require('dotenv').config();

const integrationSdkPkg = require('sharetribe-flex-integration-sdk');

const INTEGRATION_CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const INTEGRATION_CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;

const DRY_RUN = process.argv.includes('--dry-run');
const LISTINGS_ONLY = process.argv.includes('--listings-only');
const USERS_ONLY = process.argv.includes('--users-only');

if (!INTEGRATION_CLIENT_ID || !INTEGRATION_CLIENT_SECRET) {
  console.error(
    'Missing SHARETRIBE_INTEGRATION_CLIENT_ID or SHARETRIBE_INTEGRATION_CLIENT_SECRET in .env'
  );
  process.exit(1);
}

const sdk = integrationSdkPkg.createInstance({
  clientId: INTEGRATION_CLIENT_ID,
  clientSecret: INTEGRATION_CLIENT_SECRET,
  ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
});

const PER_PAGE = 100;

const fetchAll = async resource => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await resource.query({ page, perPage: PER_PAGE });
    const items = res?.data?.data || [];
    all.push(...items);
    const totalPages = res?.data?.meta?.totalPages || 0;
    if (page >= totalPages) break;
    page += 1;
  }
  return all;
};

const resetListings = async () => {
  console.log('▶ Reading all listings…');
  const listings = await fetchAll(sdk.listings);
  console.log(`  ${listings.length} listings total`);

  let updated = 0;
  for (const l of listings) {
    const meta = l?.attributes?.metadata || {};
    const pub = l?.attributes?.publicData || {};
    const hasData =
      (Array.isArray(meta.likedBy) && meta.likedBy.length > 0) ||
      typeof meta.favoritesCount === 'number' ||
      typeof pub.favoritesCount === 'number';
    if (!hasData) continue;

    console.log(
      `  - ${l.id.uuid} → likedBy:${meta.likedBy?.length || 0} publicCount:${pub.favoritesCount ?? 0}`
    );
    if (!DRY_RUN) {
      await sdk.listings.update({
        id: l.id.uuid,
        publicData: { favoritesCount: null },
        metadata: { likedBy: null, favoritesCount: null },
      });
    }
    updated += 1;
  }
  console.log(`✓ Listings reset: ${updated}${DRY_RUN ? ' (dry-run, no writes)' : ''}`);
};

const resetUsers = async () => {
  console.log('▶ Reading all users…');
  const users = await fetchAll(sdk.users);
  console.log(`  ${users.length} users total`);

  let updated = 0;
  for (const u of users) {
    const favs = u?.attributes?.profile?.privateData?.favorites;
    if (!Array.isArray(favs) || favs.length === 0) continue;

    console.log(`  - ${u.id.uuid} → ${favs.length} favourites`);
    if (!DRY_RUN) {
      await sdk.users.updateProfile({
        id: u.id.uuid,
        privateData: { favorites: null },
      });
    }
    updated += 1;
  }
  console.log(`✓ Users reset: ${updated}${DRY_RUN ? ' (dry-run, no writes)' : ''}`);
};

(async () => {
  try {
    if (!USERS_ONLY) await resetListings();
    if (!LISTINGS_ONLY) await resetUsers();
    console.log('Done.');
  } catch (e) {
    console.error('Failed:', e?.message || e, e?.data?.errors);
    process.exit(1);
  }
})();
