// Tiny counter for PWA installs. Stored as JSON in `server/data/pwa-counter.json`
// — no database needed. The number is incremented from the frontend after the
// browser fires `appinstalled` and exposed via a GET endpoint so the install
// modal can show "X people already installed".
const fs = require('fs');
const path = require('path');

const COUNTER_DIR = path.join(__dirname, '..', 'data');
const COUNTER_FILE = path.join(COUNTER_DIR, 'pwa-counter.json');

const ensureFile = () => {
  if (!fs.existsSync(COUNTER_DIR)) {
    fs.mkdirSync(COUNTER_DIR, { recursive: true });
  }
  if (!fs.existsSync(COUNTER_FILE)) {
    fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count: 0 }), 'utf8');
  }
};

const readCount = () => {
  try {
    ensureFile();
    const raw = fs.readFileSync(COUNTER_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Number.isFinite(data.count) ? data.count : 0;
  } catch (e) {
    return 0;
  }
};

const writeCount = count => {
  ensureFile();
  fs.writeFileSync(COUNTER_FILE, JSON.stringify({ count }), 'utf8');
};

exports.get = (req, res) => {
  res.json({ count: readCount() });
};

exports.increment = (req, res) => {
  const next = readCount() + 1;
  writeCount(next);
  res.json({ count: next });
};
