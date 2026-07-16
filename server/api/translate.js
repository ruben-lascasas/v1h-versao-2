/**
 * POST /api/translate
 * Proxies translation requests to Google Translate (public endpoint, no key required).
 *
 * Body:
 *   { text: string, target: 'pt' | 'en', source?: string }
 *
 * Response: { translated: string }
 */

const MAX_CHARS = 5000;

module.exports = async (req, res) => {
  const { text, target = 'pt' } = req.body || {};
  if (!text || typeof text !== 'string') {
    return res.status(400).json({ error: 'text-required' });
  }
  const trimmed = text.trim();
  if (!trimmed) {
    return res.status(400).json({ error: 'text-empty' });
  }
  if (trimmed.length > MAX_CHARS) {
    return res.status(413).json({ error: 'text-too-long', max: MAX_CHARS });
  }

  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=auto&tl=${encodeURIComponent(target)}&dt=t&q=${encodeURIComponent(trimmed)}`;

  try {
    const r = await fetch(url, { method: 'GET' });
    if (!r.ok) {
      return res.status(502).json({ error: 'upstream-failed', status: r.status });
    }
    const data = await r.json();

    // Response format: [ [ ["translated", "original", ...], ... ], ... ]
    const translated = data?.[0]?.map(chunk => chunk?.[0] || '').join('') || '';

    if (!translated) {
      return res.status(502).json({ error: 'no-translation' });
    }

    // If the result is identical to the input, the languages were already the same
    const finalText = translated.trim() === trimmed ? trimmed : translated;

    return res.status(200).json({ translated: finalText });
  } catch (e) {
    console.error('[translate] failed:', e?.message || e);
    return res.status(500).json({ error: 'translate-failed' });
  }
};
