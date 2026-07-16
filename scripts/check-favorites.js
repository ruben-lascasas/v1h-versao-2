/**
 * Reads every listing via the Integration SDK and prints likedBy + publicData
 * favouritesCount so we can see whether the /api/listing-like writes are
 * actually persisting on the Sharetribe side.
 *
 *   node scripts/check-favorites.js
 */

require('dotenv').config();

const integrationSdkPkg = require('sharetribe-flex-integration-sdk');

const sdk = integrationSdkPkg.createInstance({
  clientId: process.env.SHARETRIBE_INTEGRATION_CLIENT_ID,
  clientSecret: process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET,
  ...(process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL
    ? { baseUrl: process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL }
    : {}),
});

(async () => {
  let page = 1;
  let totalWith = 0;
  while (true) {
    const res = await sdk.listings.query({ page, perPage: 100 });
    const items = res?.data?.data || [];
    for (const l of items) {
      const meta = l?.attributes?.metadata || {};
      const pub = l?.attributes?.publicData || {};
      const likedByLen = Array.isArray(meta.likedBy) ? meta.likedBy.length : 0;
      const publicCount = pub.favoritesCount;
      if (likedByLen > 0 || typeof publicCount === 'number') {
        totalWith += 1;
        console.log(
          `${l.id.uuid}  ${l.attributes.title}  likedBy=${likedByLen}  publicData.favoritesCount=${publicCount}`
        );
      }
    }
    if (page >= (res?.data?.meta?.totalPages || 0)) break;
    page += 1;
  }
  console.log(`---\n${totalWith} listings with like data.`);
})().catch(e => {
  console.error(e?.message || e, e?.data?.errors);
  process.exit(1);
});
