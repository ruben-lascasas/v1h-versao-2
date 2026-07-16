/**
 * One-shot backfill: walks every published listing and sets
 *   publicData.averageRating = floor(avg of public review ratings)
 *   publicData.reviewCount   = count of public reviews
 *
 * Required env vars (already used by the rest of the server):
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 *   REACT_APP_SHARETRIBE_SDK_BASE_URL  (optional, defaults to prod)
 *
 * Run with:
 *   node scripts/backfill-listing-ratings.js
 *   node scripts/backfill-listing-ratings.js --dry-run
 */

require('dotenv').config();

const integrationSdkPkg = require('sharetribe-flex-integration-sdk');
const sharetribeSdk = require('sharetribe-flex-sdk');

const INTEGRATION_CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const INTEGRATION_CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;
const PUBLIC_CLIENT_ID = process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID;
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');

if (!INTEGRATION_CLIENT_ID || !INTEGRATION_CLIENT_SECRET) {
  console.error(
    'Missing SHARETRIBE_INTEGRATION_CLIENT_ID or SHARETRIBE_INTEGRATION_CLIENT_SECRET in .env'
  );
  process.exit(1);
}
if (!PUBLIC_CLIENT_ID) {
  console.error('Missing REACT_APP_SHARETRIBE_SDK_CLIENT_ID in .env');
  process.exit(1);
}

// Integration SDK: write listing publicData. Does NOT expose `reviews`.
const sdk = integrationSdkPkg.createInstance({
  clientId: INTEGRATION_CLIENT_ID,
  clientSecret: INTEGRATION_CLIENT_SECRET,
  ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
});

// Public Marketplace SDK: read public reviews (no auth required).
const publicSdk = sharetribeSdk.createInstance({
  clientId: PUBLIC_CLIENT_ID,
  ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
});

const PER_PAGE = 100;

const fetchAllListings = async () => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await sdk.listings.query({
      states: ['published'],
      page,
      perPage: PER_PAGE,
    });
    const items = res?.data?.data || [];
    all.push(...items);
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
};

const fetchAllReviews = async listingId => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await publicSdk.reviews.query({
      listing_id: listingId,
      state: 'public',
      page,
      perPage: PER_PAGE,
    });
    const items = res?.data?.data || [];
    all.push(...items);
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
};

(async () => {
  console.log(`[backfill] mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  const listings = await fetchAllListings();
  console.log(`[backfill] ${listings.length} published listings`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const listing of listings) {
    const id = listing.id?.uuid;
    const title = listing.attributes?.title || '(no title)';
    try {
      const reviews = await fetchAllReviews(id);
      const ratings = reviews
        .map(r => r?.attributes?.rating)
        .filter(r => typeof r === 'number');

      const reviewCount = ratings.length;
      const averageExact =
        reviewCount > 0 ? ratings.reduce((a, b) => a + b, 0) / reviewCount : null;
      const averageRating = averageExact != null ? Math.floor(averageExact) : null;

      const existing = listing.attributes?.publicData || {};
      if (
        existing.averageRating === averageRating &&
        existing.reviewCount === reviewCount
      ) {
        skipped += 1;
        continue;
      }

      console.log(
        `  ${id}  ${title}  →  rating=${averageRating} (${averageExact?.toFixed?.(2) ?? 'null'}), count=${reviewCount}`
      );

      if (!DRY_RUN) {
        await sdk.listings.update({
          id,
          publicData: { averageRating, reviewCount },
        });
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ${id}  ${title}  FAILED:`, err?.message || err);
    }
  }

  console.log(`[backfill] done. updated=${updated} skipped=${skipped} failed=${failed}`);
})();
