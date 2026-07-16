const SEEN_KEY = 'v1hub_seenTransactions';

// Normalize Date objects or strings to a consistent string key
const toKey = d => {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString();
  return String(d);
};

const getSeenMap = () => {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}');
  } catch {
    return {};
  }
};

export const markTransactionSeen = (txId, lastTransitionedAt) => {
  if (!txId) return false;
  const key = toKey(lastTransitionedAt);
  const seen = getSeenMap();
  const alreadySeen = seen[txId] === key;
  seen[txId] = key;
  localStorage.setItem(SEEN_KEY, JSON.stringify(seen));
  return !alreadySeen;
};

export const isTransactionSeen = (txId, lastTransitionedAt) => {
  if (!txId) return false;
  const key = toKey(lastTransitionedAt);
  const seen = getSeenMap();
  return seen[txId] === key;
};
