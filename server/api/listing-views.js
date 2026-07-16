// Per-listing daily unique-viewer counter. Tracks which logged-in users have
// opened a given listing today, then exposes a count of unique viewers.
//
// Storage shape (server/data/listing-views.json):
//   {
//     "<listingId>": {
//       "2026-05-20": ["<userId1>", "<userId2>", ...],
//       "2026-05-19": ["..."],
//       "allTime": ["<userId1>", "<userId2>", ...]
//     }
//   }
//
// - Only counts unique user IDs per (listing, day) — one user reloading the
//   same listing 50× in a day still counts as 1.
// - Per-day arrays keep the last 7 days only (older entries pruned on every
//   write); the `allTime` array keeps every unique user that ever viewed the
//   listing so we can show the owner an "since-launch" count.
// - Anonymous visits are NOT counted (the frontend only POSTs when a user is
//   logged in).
//
// Endpoints:
//   POST /api/listing-views        body: { listingId, userId }
//   GET  /api/listing-views/:id    response: { todayCount, totalCount, allTimeCount }
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DATA_FILE = path.join(DATA_DIR, 'listing-views.json');
const KEEP_DAYS = 7;

const ensureFile = () => {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({}), 'utf8');
  }
};

const todayKey = () => {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const readData = () => {
  try {
    ensureFile();
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return JSON.parse(raw) || {};
  } catch (e) {
    return {};
  }
};

const writeData = data => {
  ensureFile();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data), 'utf8');
};

const isDayKey = k => /^\d{4}-\d{2}-\d{2}$/.test(k);

const pruneOldDays = listingMap => {
  // Keep only the most recent KEEP_DAYS day-keys (lexicographic sort works for
  // ISO yyyy-mm-dd dates). The non-day key `allTime` is preserved.
  const dayKeys = Object.keys(listingMap).filter(isDayKey).sort().reverse().slice(0, KEEP_DAYS);
  const kept = {};
  for (const d of dayKeys) kept[d] = listingMap[d];
  if (Array.isArray(listingMap.allTime)) kept.allTime = listingMap.allTime;
  return kept;
};

const countUnique = listingMap => {
  if (!listingMap) return { todayCount: 0, totalCount: 0, allTimeCount: 0 };
  const today = todayKey();
  const todayList = Array.isArray(listingMap[today]) ? listingMap[today] : [];
  // 7-day "total" — kept for backwards compatibility with existing frontend.
  const recentUsers = new Set();
  Object.entries(listingMap).forEach(([k, arr]) => {
    if (isDayKey(k) && Array.isArray(arr)) arr.forEach(uid => recentUsers.add(uid));
  });
  // Since-launch count. If `allTime` doesn't exist yet (legacy file), fall
  // back to the recent 7-day union so we don't return zero.
  const allTimeArr = Array.isArray(listingMap.allTime) ? listingMap.allTime : null;
  const allTimeCount = allTimeArr ? allTimeArr.length : recentUsers.size;
  return {
    todayCount: todayList.length,
    totalCount: recentUsers.size,
    allTimeCount,
  };
};

exports.record = (req, res) => {
  try {
    const { listingId, userId } = req.body || {};
    if (!listingId || typeof listingId !== 'string') {
      return res.status(400).json({ error: 'listingId-required' });
    }
    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({ error: 'userId-required' });
    }

    const data = readData();
    const listingMap = data[listingId] || {};
    const today = todayKey();
    const todayList = Array.isArray(listingMap[today]) ? listingMap[today] : [];
    const allTimeList = Array.isArray(listingMap.allTime) ? listingMap.allTime : [];

    // Skip listing owner viewing their own listing — would inflate the
    // number with the host opening it to check.
    // (The frontend already does this check but defend on the server too.)

    let mutated = false;
    if (!todayList.includes(userId)) {
      todayList.push(userId);
      listingMap[today] = todayList;
      mutated = true;
    }
    if (!allTimeList.includes(userId)) {
      allTimeList.push(userId);
      listingMap.allTime = allTimeList;
      mutated = true;
    }
    if (mutated) {
      data[listingId] = pruneOldDays(listingMap);
      writeData(data);
    }

    return res.json(countUnique(data[listingId]));
  } catch (e) {
    console.error('[listing-views] record failed:', e?.message || e);
    return res.status(500).json({ error: 'record-failed' });
  }
};

// Wipe both today's array and the cumulative allTime array for one listing.
// Called by the EditListingDetailsPanel when the owner changes a "structural"
// field (title, category, listingType, …) — the audience is effectively new
// because the listing now represents something different. Editing description
// / capacity / amenities does NOT call this.
exports.reset = (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'listingId-required' });

    const data = readData();
    if (data[id]) {
      data[id] = {};
      writeData(data);
    }
    return res.json(countUnique(data[id]));
  } catch (e) {
    console.error('[listing-views] reset failed:', e?.message || e);
    return res.status(500).json({ error: 'reset-failed' });
  }
};

// Bulk read: returns the counts for every listing the file knows about.
// Used by the homepage "Sugestões pensadas para si" recommendations so the
// ranking can factor in real audience size (popularity) without making N
// individual round trips. Keyed by listing UUID:
//   { "<listingId>": { todayCount, totalCount, allTimeCount }, ... }
exports.getAll = (_req, res) => {
  try {
    const data = readData();
    const out = {};
    Object.keys(data).forEach(listingId => {
      out[listingId] = countUnique(data[listingId]);
    });
    return res.json(out);
  } catch (e) {
    console.error('[listing-views] getAll failed:', e?.message || e);
    return res.status(500).json({ error: 'get-all-failed' });
  }
};

exports.get = (req, res) => {
  try {
    const { id } = req.params || {};
    if (!id) return res.status(400).json({ error: 'listingId-required' });

    const data = readData();
    return res.json(countUnique(data[id]));
  } catch (e) {
    console.error('[listing-views] get failed:', e?.message || e);
    return res.status(500).json({ error: 'get-failed' });
  }
};
