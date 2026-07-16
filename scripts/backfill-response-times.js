/**
 * One-shot backfill: walks every transaction, looks at the message
 * threads, and computes per-user response time stats:
 *   publicData.responseStats = {
 *     totalReplies: <int>,
 *     totalSeconds: <int>,
 *     lastUpdated: <ISO string>,
 *   }
 *
 * Logic: in each thread, sort messages by createdAt. Whenever the sender
 * changes, that's a "reply" — credit the new sender with the time gap
 * (capped at 72h to avoid skewing the average with abandoned threads).
 *
 * Required env vars:
 *   SHARETRIBE_INTEGRATION_CLIENT_ID
 *   SHARETRIBE_INTEGRATION_CLIENT_SECRET
 *   REACT_APP_SHARETRIBE_SDK_BASE_URL  (optional, defaults to prod)
 *
 * Run with:
 *   node scripts/backfill-response-times.js
 *   node scripts/backfill-response-times.js --dry-run
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
const MAX_GAP_SECONDS = 72 * 60 * 60; // 72h cap

const fetchAllTransactions = async () => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await sdk.transactions.query({
      include: ['messages', 'messages.sender'],
      page,
      perPage: PER_PAGE,
    });
    const items = res?.data?.data || [];
    const included = res?.data?.included || [];
    all.push({ items, included });
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
};

// Build a map of messageId -> { senderId, createdAt } from `included`.
const indexMessages = pages => {
  const messagesById = new Map();
  for (const { included } of pages) {
    for (const item of included) {
      if (item.type !== 'message') continue;
      const id = item.id?.uuid;
      const senderRel = item.relationships?.sender?.data;
      const senderId = senderRel?.id?.uuid;
      const createdAt = item.attributes?.createdAt
        ? new Date(item.attributes.createdAt)
        : null;
      if (id && senderId && createdAt) {
        messagesById.set(id, { senderId, createdAt });
      }
    }
  }
  return messagesById;
};

const computeStatsPerUser = pages => {
  const messagesById = indexMessages(pages);
  // userId -> { totalReplies, totalSeconds }
  const stats = new Map();

  for (const { items } of pages) {
    for (const tx of items) {
      const msgRels = tx.relationships?.messages?.data || [];
      const msgs = msgRels
        .map(rel => messagesById.get(rel.id?.uuid))
        .filter(Boolean)
        .sort((a, b) => a.createdAt - b.createdAt);

      for (let i = 1; i < msgs.length; i++) {
        const prev = msgs[i - 1];
        const cur = msgs[i];
        if (prev.senderId === cur.senderId) continue; // not a reply
        const gapSec = Math.min(
          MAX_GAP_SECONDS,
          Math.floor((cur.createdAt - prev.createdAt) / 1000)
        );
        if (gapSec <= 0) continue;
        const s = stats.get(cur.senderId) || { totalReplies: 0, totalSeconds: 0 };
        s.totalReplies += 1;
        s.totalSeconds += gapSec;
        stats.set(cur.senderId, s);
      }
    }
  }

  return stats;
};

const fetchUser = async id => {
  const res = await sdk.users.show({ id });
  return res?.data?.data;
};

(async () => {
  console.log(`[response-times] mode: ${DRY_RUN ? 'DRY-RUN' : 'WRITE'}`);

  const pages = await fetchAllTransactions();
  const totalTx = pages.reduce((n, p) => n + p.items.length, 0);
  console.log(`[response-times] scanned ${totalTx} transactions`);

  const stats = computeStatsPerUser(pages);
  console.log(`[response-times] ${stats.size} users with at least one reply`);

  let updated = 0;
  let skipped = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const [userId, s] of stats.entries()) {
    try {
      const user = await fetchUser(userId);
      const existing = user?.attributes?.profile?.publicData?.responseStats || {};
      if (
        existing.totalReplies === s.totalReplies &&
        existing.totalSeconds === s.totalSeconds
      ) {
        skipped += 1;
        continue;
      }

      const avgH = (s.totalSeconds / s.totalReplies / 3600).toFixed(2);
      console.log(
        `  ${userId}  →  replies=${s.totalReplies}, totalSec=${s.totalSeconds} (avg ~${avgH}h)`
      );

      if (!DRY_RUN) {
        await sdk.users.updateProfile({
          id: userId,
          publicData: {
            responseStats: {
              totalReplies: s.totalReplies,
              totalSeconds: s.totalSeconds,
              lastUpdated: now,
            },
          },
        });
      }
      updated += 1;
    } catch (err) {
      failed += 1;
      console.error(`  ${userId}  FAILED:`, err?.message || err);
    }
  }

  console.log(
    `[response-times] done. updated=${updated} skipped=${skipped} failed=${failed}`
  );
})();
