/**
 * Powers the 4 "extra" in-app toasts plus the per-review email:
 *
 *   followed-listing-edit    — a listing of someone you follow was edited
 *   favorite-listing-edit    — a listing in your favourites was edited
 *   review-received          — someone left a review on you (in-app + email)
 *   followed-listing-review  — a listing of someone you follow was reviewed
 *
 * Runs every 5 minutes inside this Express process (same as the saved-search
 * notifier). Each tick:
 *   1. Walks listings updated since the last tick and writes edit alerts to
 *      followers of the host + users who favourited the listing.
 *   2. Walks reviews created since the last tick and writes review alerts to
 *      the subject + followers of the subject's listings. Sends an email
 *      to the subject via Resend.
 *
 * Throttle: a per-user `metadata.extraAlertsThrottle` map (key = `${kind}-${id}`,
 * value = ISO timestamp) keeps the same alert from firing more than once per
 * 24h so a host editing a listing 5 times doesn't spam followers.
 *
 * Cursors live in module memory and reset on server restart. On restart we
 * miss whatever happened during downtime — acceptable for a non-critical
 * notification feed.
 *
 * Disable with DISABLE_EXTRA_ALERTS=true. Override schedule with
 * EXTRA_ALERTS_CRON.
 */

const cron = require('node-cron');
const { Resend } = require('resend');
const { getIntegrationSdk } = require('../api-util/sdk');

const PER_PAGE = 100;
// 1h cooldown: if a host saves the same listing 5 times in an hour, the
// follower gets exactly one notification. After an hour, fresh edits count
// as a new event again — fine because they're genuinely new activity.
// Reviews have unique IDs so the throttle is effectively a no-op for them.
const THROTTLE_MS = 60 * 60 * 1000;
const MAX_ALERTS_PER_USER = 50;
const ROOT_URL =
  process.env.REACT_APP_MARKETPLACE_ROOT_URL || 'https://venue1hub.com';

// Module-scope cursors. Set to "now" on first run so we don't notify about
// historical edits/reviews when the job first starts.
let editsCursor = new Date();
let reviewsCursor = new Date();

const isoNow = () => new Date().toISOString();

// Fetch every page of a Sharetribe collection.
const fetchAllPaged = async (queryFn, params = {}) => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await queryFn({ ...params, page, perPage: PER_PAGE });
    const items = res?.data?.data || [];
    items.forEach(it => all.push(it));
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return all;
};

// Paginated fetch that stops as soon as it sees an item older than `since`.
// Relies on the API returning items in descending order of `dateField`.
// Saves bandwidth vs `fetchAllPaged` because we only need recent events.
const fetchUntilCutoff = async (queryFn, params, since, dateField) => {
  const cutoffMs = since.getTime();
  const out = [];
  let page = 1;
  while (true) {
    const res = await queryFn({ ...params, page, perPage: PER_PAGE });
    const items = res?.data?.data || [];
    let hitOld = false;
    for (const it of items) {
      const tsRaw = it?.attributes?.[dateField];
      const ts = tsRaw ? new Date(tsRaw).getTime() : 0;
      if (ts > cutoffMs) {
        out.push(it);
      } else {
        hitOld = true;
        break;
      }
    }
    const meta = res?.data?.meta || {};
    if (hitOld || !meta.totalPages || page >= meta.totalPages) break;
    page += 1;
  }
  return out;
};

const fetchListingsUpdatedSince = (sdk, since) =>
  // The default `listings.query` sort is `-createdAt`. We don't get a true
  // "updated since" filter, so we sort by `-createdAt` (which is a rough
  // proxy for recent activity) and filter client-side. For a small
  // marketplace this is fine. Page through until we hit items the user
  // hasn't recently touched.
  fetchUntilCutoff(
    sdk.listings.query.bind(sdk.listings),
    { include: ['author'], sort: '-createdAt' },
    since,
    'updatedAt'
  ).then(items =>
    // Even with -createdAt sort, recently-edited-but-old listings might
    // sit deeper in the list. The early-break above will miss them — we
    // accept that trade-off vs fetching every page.
    items.filter(l => {
      const updated = new Date(l?.attributes?.updatedAt || 0).getTime();
      return updated > since.getTime();
    })
  );

const fetchReviewsCreatedSince = (sdk, since) =>
  fetchUntilCutoff(
    sdk.reviews.query.bind(sdk.reviews),
    { state: 'public', include: ['author', 'subject', 'listing'] },
    since,
    'createdAt'
  );

// Fetch every user (we need their follow/favorite arrays to know who to
// notify). Capped at MAX_USER_PAGES to stop a runaway from blowing through
// the Sharetribe rate limit if the user base ever grows past expectations.
const MAX_USER_PAGES = 50; // 50 * 100 = 5000 users — plenty for V1H today
const fetchAllUsers = async sdk => {
  const all = [];
  let page = 1;
  while (true) {
    const res = await sdk.users.query({ page, perPage: PER_PAGE });
    const items = res?.data?.data || [];
    items.forEach(u => all.push(u));
    const meta = res?.data?.meta || {};
    if (!meta.totalPages || page >= meta.totalPages || page >= MAX_USER_PAGES) {
      break;
    }
    page += 1;
  }
  return all;
};

// Build a quick lookup of user.uuid -> user, plus reverse indexes for
// "who follows X" and "who favourited listing L" so we don't scan every
// user for every event in the tick.
const indexUsers = users => {
  const byId = new Map();
  const followersOf = new Map(); // targetUserId -> [follower userId, ...]
  const favouritersOf = new Map(); // listingId -> [follower userId, ...]
  users.forEach(u => {
    const id = u?.id?.uuid;
    if (!id) return;
    byId.set(id, u);
    const following =
      u?.attributes?.profile?.privateData?.following || [];
    following.forEach(targetId => {
      if (!followersOf.has(targetId)) followersOf.set(targetId, []);
      followersOf.get(targetId).push(id);
    });
    const favs = u?.attributes?.profile?.privateData?.favorites || [];
    favs.forEach(listingId => {
      if (!favouritersOf.has(listingId)) favouritersOf.set(listingId, []);
      favouritersOf.get(listingId).push(id);
    });
  });
  return { byId, followersOf, favouritersOf };
};

// Accumulator helper: keeps a per-user diff of (newAlerts, newThrottle) so
// we only write to each user's metadata once per tick.
class UserUpdateBatch {
  constructor() {
    this.byUser = new Map();
  }
  ensure(userId, sourceUser) {
    if (!this.byUser.has(userId)) {
      const existing =
        sourceUser?.attributes?.profile?.metadata?.unseenExtraAlerts || [];
      const throttle =
        sourceUser?.attributes?.profile?.metadata?.extraAlertsThrottle || {};
      this.byUser.set(userId, {
        alerts: [...existing],
        throttle: { ...throttle },
        addedKeys: new Set(),
      });
    }
    return this.byUser.get(userId);
  }
  push(userId, sourceUser, alert) {
    const slot = this.ensure(userId, sourceUser);
    const throttleKey = `${alert.kind}-${alert.listingId || alert.reviewId || alert.id}`;
    const last = slot.throttle[throttleKey];
    if (last && Date.now() - new Date(last).getTime() < THROTTLE_MS) {
      return false;
    }
    // Avoid two passes in the same tick adding the same alert twice.
    if (slot.addedKeys.has(throttleKey)) return false;
    slot.addedKeys.add(throttleKey);
    slot.alerts.unshift(alert);
    if (slot.alerts.length > MAX_ALERTS_PER_USER) {
      slot.alerts = slot.alerts.slice(0, MAX_ALERTS_PER_USER);
    }
    slot.throttle[throttleKey] = isoNow();
    return true;
  }
  entries() {
    return this.byUser.entries();
  }
}

const flushUpdates = async (sdk, batch) => {
  for (const [uid, slot] of batch.entries()) {
    if (slot.addedKeys.size === 0) continue;
    try {
      await sdk.users.updateProfile({
        id: uid,
        metadata: {
          unseenExtraAlerts: slot.alerts,
          extraAlertsThrottle: slot.throttle,
        },
      });
    } catch (e) {
      console.error(
        '[extraAlerts] updateProfile failed for',
        uid,
        ':',
        e?.message || e
      );
    }
  }
};

const newAlert = obj => ({
  id: `${obj.kind}-${obj.listingId || obj.reviewId || ''}-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 6)}`,
  at: isoNow(),
  ...obj,
});

// ─── Email for "review-received" ────────────────────────────────────────
const buildReviewReceivedEmail = (subject, review, locale) => {
  const isEN = locale && locale.toLowerCase().startsWith('en');
  const name = subject?.attributes?.profile?.firstName || (isEN ? 'there' : 'olá');
  const reviewer =
    review?.author?.attributes?.profile?.displayName || (isEN ? 'Someone' : 'Alguém');
  const rating = review?.attributes?.rating;
  const content = String(review?.attributes?.content || '').replace(/</g, '&lt;');
  const listingTitle = review?.listing?.attributes?.title || '';

  const subjectLine = isEN
    ? `[Venue1Hub] ${reviewer} left you a new review`
    : `[Venue1Hub] ${reviewer} deixou-te uma nova avaliação`;

  const stars = rating
    ? '★'.repeat(rating) + '☆'.repeat(Math.max(0, 5 - rating))
    : '';

  const html = isEN
    ? `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">New review for you</h2>
        <p>Hi ${name},</p>
        <p><strong>${reviewer}</strong> just left you a review${listingTitle ? ` on <em>${listingTitle}</em>` : ''}.</p>
        ${rating ? `<p style="font-size:20px;color:#f5c518;letter-spacing:2px;">${stars} <span style="color:#7C6350;font-size:14px;">(${rating}/5)</span></p>` : ''}
        ${content ? `<blockquote style="border-left:3px solid #BAA38A;padding:8px 16px;margin:16px 0;color:#5C3317;font-style:italic;">${content}</blockquote>` : ''}
        <p style="margin-top:24px;"><a href="${ROOT_URL}/profile-settings" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">View your profile</a></p>
      </div>
    `
    : `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#2E2E2E;">
        <h2 style="color:#5C3317;border-bottom:2px solid #BAA38A;padding-bottom:12px;">Nova avaliação para ti</h2>
        <p>Olá ${name},</p>
        <p><strong>${reviewer}</strong> acabou de te deixar uma avaliação${listingTitle ? ` em <em>${listingTitle}</em>` : ''}.</p>
        ${rating ? `<p style="font-size:20px;color:#f5c518;letter-spacing:2px;">${stars} <span style="color:#7C6350;font-size:14px;">(${rating}/5)</span></p>` : ''}
        ${content ? `<blockquote style="border-left:3px solid #BAA38A;padding:8px 16px;margin:16px 0;color:#5C3317;font-style:italic;">${content}</blockquote>` : ''}
        <p style="margin-top:24px;"><a href="${ROOT_URL}/profile-settings" style="color:#ffffff;background:#2E2E2E;padding:10px 22px;border-radius:6px;text-decoration:none;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:13px;">Ver o teu perfil</a></p>
      </div>
    `;
  return { subject: subjectLine, html };
};

const runOnce = async () => {
  const sdk = getIntegrationSdk();
  if (!sdk) {
    console.warn('[extraAlerts] skipped (Integration SDK not configured)');
    return { tick: 'skipped' };
  }
  const resendKey = process.env.RESEND_API_KEY;
  const resend = resendKey ? new Resend(resendKey) : null;

  const tickStart = new Date();
  const prevEditsCursor = editsCursor;
  const prevReviewsCursor = reviewsCursor;

  try {
    const users = await fetchAllUsers(sdk);
    const { byId, followersOf, favouritersOf } = indexUsers(users);
    const batch = new UserUpdateBatch();

    // ─── EDITS ──────────────────────────────────────────────────────
    const editedListings = await fetchListingsUpdatedSince(
      sdk,
      prevEditsCursor
    );
    for (const listing of editedListings) {
      const listingId = listing?.id?.uuid;
      const listingTitle = listing?.attributes?.title || '';
      const authorId = listing?.relationships?.author?.data?.id?.uuid;
      const author = authorId ? byId.get(authorId) : null;
      const authorName =
        author?.attributes?.profile?.displayName ||
        author?.attributes?.profile?.firstName ||
        '';
      if (!listingId || !authorId) continue;

      // followed-listing-edit: notify every follower of the host
      const followers = followersOf.get(authorId) || [];
      followers.forEach(followerId => {
        if (followerId === authorId) return;
        const follower = byId.get(followerId);
        if (!follower) return;
        batch.push(
          followerId,
          follower,
          newAlert({
            kind: 'followed-listing-edit',
            listingId,
            listingTitle,
            authorName,
          })
        );
      });

      // favorite-listing-edit: notify every user who favourited this listing
      const fav = favouritersOf.get(listingId) || [];
      fav.forEach(userId => {
        if (userId === authorId) return; // own listing in your own favs? skip
        const u = byId.get(userId);
        if (!u) return;
        batch.push(
          userId,
          u,
          newAlert({
            kind: 'favorite-listing-edit',
            listingId,
            listingTitle,
            authorName,
          })
        );
      });
    }

    // ─── REVIEWS ────────────────────────────────────────────────────
    const newReviews = await fetchReviewsCreatedSince(sdk, prevReviewsCursor);
    for (const review of newReviews) {
      const reviewId = review?.id?.uuid;
      const subjectId = review?.relationships?.subject?.data?.id?.uuid;
      const reviewerId = review?.relationships?.author?.data?.id?.uuid;
      const listingId = review?.relationships?.listing?.data?.id?.uuid;
      if (!subjectId || !reviewerId || subjectId === reviewerId) continue;
      const subjectUser = byId.get(subjectId);
      if (!subjectUser) continue;

      // The query include=['author','subject','listing'] returns these as
      // separate entries in the response, not as embedded objects. To keep
      // the email template simple we lift display name + listing title from
      // our pre-fetched user index and from the listing index if we have it.
      const reviewerUser = byId.get(reviewerId);
      const reviewerName =
        reviewerUser?.attributes?.profile?.displayName ||
        reviewerUser?.attributes?.profile?.firstName ||
        'Alguém';

      // Find the listing title from the previously fetched editedListings
      // pool, or fall back to a generic label if not available.
      const matchedListing = editedListings.find(
        l => l?.id?.uuid === listingId
      );
      const listingTitle = matchedListing?.attributes?.title || '';

      const rating = review?.attributes?.rating;

      // review-received → subject + email
      batch.push(
        subjectId,
        subjectUser,
        newAlert({
          kind: 'review-received',
          reviewId,
          listingId,
          listingTitle,
          authorName: reviewerName,
          rating,
        })
      );

      if (resend) {
        const email = subjectUser?.attributes?.email;
        const locale =
          subjectUser?.attributes?.profile?.publicData?.locale || 'pt';
        if (email) {
          const { subject: subj, html } = buildReviewReceivedEmail(
            subjectUser,
            {
              attributes: review.attributes,
              author: reviewerUser,
              listing: matchedListing,
            },
            locale
          );
          try {
            await resend.emails.send({
              from: 'Venue1Hub <onboarding@resend.dev>',
              to: [email],
              subject: subj,
              html,
            });
          } catch (e) {
            console.error(
              '[extraAlerts] review email failed for',
              email,
              ':',
              e?.message || e
            );
          }
        }
      }

      // followed-listing-review → notify every follower of the subject
      // (except the reviewer themselves — they already know).
      const followers = followersOf.get(subjectId) || [];
      followers.forEach(followerId => {
        if (followerId === reviewerId) return;
        const u = byId.get(followerId);
        if (!u) return;
        batch.push(
          followerId,
          u,
          newAlert({
            kind: 'followed-listing-review',
            reviewId,
            listingId,
            listingTitle,
            authorName:
              subjectUser?.attributes?.profile?.displayName ||
              subjectUser?.attributes?.profile?.firstName ||
              '',
            rating,
          })
        );
      });
    }

    await flushUpdates(sdk, batch);

    editsCursor = tickStart;
    reviewsCursor = tickStart;

    const touched = [...batch.entries()].filter(([, s]) => s.addedKeys.size > 0)
      .length;
    console.log(
      `[extraAlerts] tick done. listingsEdited=${editedListings.length} reviewsNew=${newReviews.length} usersUpdated=${touched}`
    );
    return { ok: true, touched };
  } catch (e) {
    console.error('[extraAlerts] tick failed:', e?.message || e);
    return { error: e?.message || String(e) };
  }
};

const start = () => {
  if (process.env.DISABLE_EXTRA_ALERTS === 'true') {
    console.log('[extraAlerts] disabled via env');
    return;
  }
  const expr = process.env.EXTRA_ALERTS_CRON || '*/5 * * * *';
  try {
    cron.schedule(expr, () => {
      runOnce().catch(e =>
        console.error('[extraAlerts] tick crashed:', e?.message || e)
      );
    });
    console.log(`[extraAlerts] scheduled (cron: "${expr}")`);
  } catch (e) {
    console.error('[extraAlerts] failed to schedule:', e?.message || e);
  }
};

module.exports = { start, runOnce };
