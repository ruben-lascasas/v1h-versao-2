/**
 * Walks every user's `privateData.following` array, builds the inverted
 * follower-list per target user, and writes:
 *   publicData.followersCount = N
 *   metadata.followedBy = [fanIds]
 *
 * Run once after deploying the follow-counter feature so existing follows
 * (which were stored only as `privateData.following` on each fan) become
 * visible as follower counts on the targets.
 *
 *   node scripts/backfill-follower-counts.js --dry-run
 *   node scripts/backfill-follower-counts.js
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

const DRY_RUN = process.argv.includes('--dry-run');

const fetchAllUsers = async () => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await sdk.users.query({ page, perPage: 100 });
    const items = res?.data?.data || [];
    all.push(...items);
    if (page >= (res?.data?.meta?.totalPages || 0)) break;
    page += 1;
  }
  return all;
};

(async () => {
  try {
    console.log('▶ Reading all users…');
    const users = await fetchAllUsers();
    console.log(`  ${users.length} users total`);

    // Build {targetId: Set<fanId>} from each fan's privateData.following.
    const followersMap = new Map();
    users.forEach(u => {
      const fanId = u.id?.uuid;
      const following = u?.attributes?.profile?.privateData?.following;
      if (!Array.isArray(following)) return;
      following.forEach(targetId => {
        if (!targetId || targetId === fanId) return;
        if (!followersMap.has(targetId)) followersMap.set(targetId, new Set());
        followersMap.get(targetId).add(fanId);
      });
    });

    // Write each target's followedBy + followersCount, then zero-out any user
    // whose count we previously had but no longer applies.
    const userIndex = new Map(users.map(u => [u.id?.uuid, u]));
    let updated = 0;

    for (const [targetId, fanSet] of followersMap.entries()) {
      const target = userIndex.get(targetId);
      if (!target) continue; // follower references a non-existent user
      const fanArr = [...fanSet];
      const meta = target?.attributes?.profile?.metadata || {};
      const pub = target?.attributes?.profile?.publicData || {};
      const sameList =
        Array.isArray(meta.followedBy) &&
        meta.followedBy.length === fanArr.length &&
        meta.followedBy.every(id => fanSet.has(id));
      const sameCount = pub.followersCount === fanArr.length;
      if (sameList && sameCount) continue;

      console.log(`  - ${targetId} → ${fanArr.length} followers`);
      if (!DRY_RUN) {
        await sdk.users.updateProfile({
          id: targetId,
          publicData: { followersCount: fanArr.length },
          metadata: { followedBy: fanArr },
        });
      }
      updated += 1;
    }

    // Clear stale data on users who used to have followers but don't now.
    for (const u of users) {
      const uid = u.id?.uuid;
      if (!uid || followersMap.has(uid)) continue;
      const meta = u?.attributes?.profile?.metadata || {};
      const pub = u?.attributes?.profile?.publicData || {};
      const hadFollowers =
        (Array.isArray(meta.followedBy) && meta.followedBy.length > 0) ||
        (typeof pub.followersCount === 'number' && pub.followersCount > 0);
      if (!hadFollowers) continue;
      console.log(`  - ${uid} → cleared (no followers)`);
      if (!DRY_RUN) {
        await sdk.users.updateProfile({
          id: uid,
          publicData: { followersCount: 0 },
          metadata: { followedBy: [] },
        });
      }
      updated += 1;
    }

    console.log(`✓ Users updated: ${updated}${DRY_RUN ? ' (dry-run, no writes)' : ''}`);
  } catch (e) {
    console.error('Failed:', e?.message || e, e?.data?.errors);
    process.exit(1);
  }
})();
