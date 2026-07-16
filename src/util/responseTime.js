// Frontend self-tracking of how fast the current user replies to messages.
//
// Whenever the logged-in user sends a message in a transaction, we look at
// the most recent message from the OTHER party in that conversation, compute
// how long it took to reply, and add that to a running average stored in the
// user's own publicData.responseStats. The other side then reads that stat
// from publicData when rendering the user's public profile.
//
// Trade-offs: we only track replies the user makes through this site (no
// API access to off-platform messages), and we cap individual reply times
// at 72h so a single very-late reply doesn't ruin the average.

const MAX_TRACKED_GAP_SECONDS = 72 * 60 * 60; // 72h
const STATS_KEY = 'responseStats';

// Read messages -> array of `{ id, attributes: { content, createdAt }, sender: { id } }`.
// Find the most recent message NOT sent by `currentUserId`.
const findLastIncomingMessage = (messages, currentUserId) => {
  if (!Array.isArray(messages) || !currentUserId) return null;
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const m = messages[i];
    const senderId = m?.sender?.id?.uuid || m?.sender?.id;
    const isMine = senderId && String(senderId) === String(currentUserId);
    if (!isMine && m?.attributes?.createdAt) {
      return m;
    }
  }
  return null;
};

// Build the next stats object given the current ones and the gap to add.
const mergeStats = (existingStats, gapSeconds) => {
  const safe =
    existingStats && typeof existingStats === 'object' ? existingStats : {};
  const totalReplies = Number.isFinite(safe.totalReplies) ? safe.totalReplies : 0;
  const totalSeconds = Number.isFinite(safe.totalSeconds) ? safe.totalSeconds : 0;
  return {
    totalReplies: totalReplies + 1,
    totalSeconds: totalSeconds + gapSeconds,
    lastUpdated: new Date().toISOString(),
  };
};

// Public API — call after the user sends a message. `messages` should include
// the freshly-sent message at the end (so the previous-incoming search starts
// from before it). `sdk` is the Sharetribe SDK instance.
export const trackReplyTime = ({ sdk, messages, currentUser }) => {
  try {
    const currentUserId = currentUser?.id?.uuid;
    if (!sdk || !currentUserId) return Promise.resolve();

    // Skip the most recent message in the search if it was just sent by us
    // (which is the typical case after a send). We want the most recent
    // incoming reply BEFORE our outgoing one.
    const list = Array.isArray(messages) ? messages.slice() : [];
    while (list.length > 0) {
      const last = list[list.length - 1];
      const senderId = last?.sender?.id?.uuid || last?.sender?.id;
      if (senderId && String(senderId) === String(currentUserId)) {
        list.pop();
      } else {
        break;
      }
    }

    const incoming = findLastIncomingMessage(list, currentUserId);
    if (!incoming) return Promise.resolve();

    const incomingAt = new Date(incoming.attributes.createdAt).getTime();
    const gapSeconds = Math.floor((Date.now() - incomingAt) / 1000);
    if (gapSeconds <= 0 || gapSeconds > MAX_TRACKED_GAP_SECONDS) {
      return Promise.resolve();
    }

    const existing = currentUser?.attributes?.profile?.publicData?.[STATS_KEY];
    const next = mergeStats(existing, gapSeconds);

    return sdk.currentUser.updateProfile({
      publicData: { [STATS_KEY]: next },
    });
  } catch (_) {
    // Tracking is best-effort — never break the message-send flow.
    return Promise.resolve();
  }
};

// Track a reply made by accepting/declining/transitioning a reservation
// (anything the inbox lets the user do in response to the other party). The
// gap measured is between the previous transition by the OTHER party and now.
// Mirrors trackReplyTime but reads from a transaction's transitions history
// instead of the messages list.
//
// Transitions made by `'system'` are skipped because the user wasn't actively
// responding — they're auto-actions.
export const trackTransitionReplyTime = ({ sdk, transaction, currentUser }) => {
  try {
    const currentUserId = currentUser?.id?.uuid;
    if (!sdk || !currentUserId || !transaction?.attributes?.transitions) {
      return Promise.resolve();
    }

    const transitions = Array.isArray(transaction.attributes.transitions)
      ? transaction.attributes.transitions
      : [];
    if (transitions.length < 2) return Promise.resolve();

    // Figure out whether the current user acts as customer or provider on
    // this tx, so we know what `by` value they correspond to in transitions.
    const providerId =
      transaction.relationships?.provider?.data?.id?.uuid ||
      transaction.relationships?.provider?.data?.id ||
      null;
    const customerId =
      transaction.relationships?.customer?.data?.id?.uuid ||
      transaction.relationships?.customer?.data?.id ||
      null;
    let role = null;
    if (String(providerId) === String(currentUserId)) role = 'provider';
    else if (String(customerId) === String(currentUserId)) role = 'customer';
    if (!role) return Promise.resolve();

    // Walk the transitions newest-to-oldest. The most recent transition is
    // the one we just made (by `role`). We want the most recent transition
    // BEFORE that one that was made by the OTHER party.
    const otherParty = role === 'provider' ? 'customer' : 'provider';
    let lastIncoming = null;
    for (let i = transitions.length - 1; i >= 0; i -= 1) {
      const t = transitions[i];
      if (t?.by === otherParty && t?.createdAt) {
        lastIncoming = t;
        break;
      }
    }
    if (!lastIncoming) return Promise.resolve();

    const incomingAt = new Date(lastIncoming.createdAt).getTime();
    const gapSeconds = Math.floor((Date.now() - incomingAt) / 1000);
    if (gapSeconds <= 0 || gapSeconds > MAX_TRACKED_GAP_SECONDS) {
      return Promise.resolve();
    }

    const existing = currentUser?.attributes?.profile?.publicData?.[STATS_KEY];
    const next = mergeStats(existing, gapSeconds);

    return sdk.currentUser.updateProfile({
      publicData: { [STATS_KEY]: next },
    });
  } catch (_) {
    return Promise.resolve();
  }
};

// Compute a human-readable response time label from stored stats.
// Returns `null` if there's not enough data to display anything meaningful
// (e.g. the user hasn't replied to anyone yet).
export const formatResponseTime = (stats, isEN = false) => {
  if (!stats || typeof stats !== 'object') return null;
  const { totalReplies, totalSeconds } = stats;
  if (!Number.isFinite(totalReplies) || !Number.isFinite(totalSeconds)) return null;
  if (totalReplies < 1 || totalSeconds <= 0) return null;

  const avgSeconds = totalSeconds / totalReplies;
  const avgMinutes = avgSeconds / 60;
  const avgHours = avgMinutes / 60;

  if (avgMinutes < 60) {
    const m = Math.max(1, Math.round(avgMinutes));
    return isEN ? `Replies in ~${m} min` : `Responde em ~${m} min`;
  }
  if (avgHours < 24) {
    const h = Math.round(avgHours);
    return isEN ? `Replies in ~${h}h` : `Responde em ~${h}h`;
  }
  const d = Math.round(avgHours / 24);
  return isEN
    ? `Replies in ~${d} ${d === 1 ? 'day' : 'days'}`
    : `Responde em ~${d} ${d === 1 ? 'dia' : 'dias'}`;
};
