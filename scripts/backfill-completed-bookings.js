/**
 * One-shot backfill: counts how many completed transactions each user has
 * been part of (as customer OR provider) and stores it in:
 *   publicData.completedBookingsCount = <int>
 *
 * "Completed" is any transaction whose lastTransition is one of the terminal
 * transitions across booking/purchase/negotiation processes (see lists in
 * src/transactions/transactionProcess*.js — kept in sync here).
 *
 * Required env vars:
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 *   REACT_APP_SHARETRIBE_SDK_BASE_URL  (optional, defaults to prod)
 *
 * Run with:
 *   node scripts/backfill-completed-bookings.js
 *   node scripts/backfill-completed-bookings.js --dry-run
 */

require('dotenv').config();

const integrationSdkPkg = require('sharetribe-flex-integration-sdk');

const INTEGRATION_CLIENT_ID = process.env.SHARETRIBE_INTEGRATION_CLIENT_ID;
const INTEGRATION_CLIENT_SECRET = process.env.SHARETRIBE_INTEGRATION_CLIENT_SECRET;
const BASE_URL = process.env.REACT_APP_SHARETRIBE_SDK_BASE_URL;
const DRY_RUN = process.argv.includes('--dry-run');

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

// Union of all "completed" transitions across booking + purchase + negotiation.
const COMPLETED_TRANSITIONS = new Set([
  'transition/complete',
  'transition/operator-complete',
  'transition/auto-complete',
  'transition/accept-deliverable',
  'transition/auto-accept-deliverable',
  'transition/operator-accept-deliverable',
  'transition/review-1-by-customer',
  'transition/review-1-by-provider',
  'transition/review-2-by-customer',
  'transition/review-2-by-provider',
  'transition/expire-review-period',
  'transition/expire-customer-review-period',
  'transition/expire-provider-review-period',
]);

const fetchAllTransactions = async () => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await sdk.transactions.query({
      include: ['customer', 'provider'],
      page,
      perPage: PER_PAGE,
    });
    const items = res?.data?.data || [];
    all.push(items);
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return all.flat();
};

const countCompletedPerUser = transactions => {
  // userId -> Set<transactionId> (set so we never double-count a tx for the same user)
  const seen = new Map();
  for (const tx of transactions) {
    const last = tx.attributes?.lastTransition;
    if (!COMPLETED_TRANSITIONS.has(last)) continue;
    const txId = tx.id?.uuid;
    const customerId = tx.relationships?.customer?.data?.id?.uuid;
    const providerId = tx.relationships?.provider?.data?.id?.uuid;
    for (const uid of [customerId, providerId].filter(Boolean)) {
      if (!seen.has(uid)) seen.set(uid, new Set());
      seen.get(uid).add(txId);
    }
  }
  const counts = new Map();
  for (const [uid, set] of seen.entries()) counts.set(uid, set.size);
  return counts;
};

const fetchUser = async id => {
  const res = await sdk.users.show({ id });
  return res?.data?.data;
};

(async () => {
  console.log(`[completed-bookings] mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  const transactions = await fetchAllTransactions();
  console.log(`[completed-bookings] scanned ${transactions.length} transactions`);

  const counts = countCompletedPerUser(transactions);
  console.log(`[completed-bookings] ${counts.size} users with at least one completed booking`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const [userId, count] of counts.entries()) {
    try {
      const user = await fetchUser(userId);
      const existing = Number(user?.attributes?.profile?.publicData?.completedBookingsCount) || 0;
      if (existing === count) {
        skipped += 1;
        continue;
      }

      console.log(`  ${userId}  →  ${existing} → ${count}`);

      if (!DRY_RUN) {
        await sdk.users.updateProfile({
          id: userId,
          publicData: { completedBookingsCount: count },
        });
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ${userId}  FAILED:`, err?.message || err);
    }
  }

  console.log(
    `[completed-bookings] done. updated=${updated} skipped=${skipped} failed=${failed}`
  );
})();
