const sharetribeSdk = require('sharetribe-flex-sdk');
const { getIntegrationSdk, typeHandlers } = require('../api-util/sdk');

const PER_PAGE = 100;

// The Integration SDK does not expose `reviews` (only listings/users/transactions/etc.),
// so we use the public Marketplace SDK with just the client ID — public reviews are
// readable without auth.
const CLIENT_ID = process.env.REACT_APP_SHARETRIBE_SDK_CLIENT_ID;
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;

let cachedPublicSdk = null;
const getPublicSdk = () => {
  if (cachedPublicSdk) return cachedPublicSdk;
  cachedPublicSdk = sharetribeSdk.createInstance({
    clientId: CLIENT_ID,
    typeHandlers,
    ...(BASE_URL ? { baseUrl: BASE_URL } : {}),
  });
  return cachedPublicSdk;
};

const fetchAllReviews = async (publicSdk, listingId) => {
  const all = [];
  let page = 1;
  while (true) {
    const response = await publicSdk.reviews.query({
      listing_id: listingId,
      state: 'public',
      page,
      perPage: PER_PAGE,
    });
    const items = response?.data?.data || [];
    all.push(...items);
    const meta = response?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
};

module.exports = async (req, res) => {
  const { listingId } = req.body || {};

  if (!listingId || typeof listingId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid listingId.' });
  }

  const integrationSdk = getIntegrationSdk();
  if (!integrationSdk) {
    return res
      .status(503)
      .json({ error: 'Integration SDK not configured on this environment.' });
  }

  try {
    const publicSdk = getPublicSdk();
    const reviews = await fetchAllReviews(publicSdk, listingId);
    const ratings = reviews
      .map(r => r?.attributes?.rating)
      .filter(r => typeof r === 'number');

    const reviewCount = ratings.length;
    const averageExact =
      reviewCount > 0 ? ratings.reduce((a, b) => a + b, 0) / reviewCount : null;
    const averageRating = averageExact != null ? Math.floor(averageExact) : null;

    await integrationSdk.listings.update({
      id: listingId,
      publicData: {
        averageRating,
        reviewCount,
      },
    });

    return res.status(200).json({
      listingId,
      averageRating,
      averageExact,
      reviewCount,
    });
  } catch (err) {
    const status = err?.status || 500;
    const message = err?.message || 'Failed to recompute listing rating.';
    // eslint-disable-next-line no-console
    console.error('[recompute-listing-rating]', message, err?.data);
    return res.status(status).json({ error: message });
  }
};
