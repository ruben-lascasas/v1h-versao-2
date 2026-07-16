// Extracts the 11-character video ID from any common YouTube URL format:
//   https://www.youtube.com/watch?v=XXXXXXXXXXX
//   https://youtu.be/XXXXXXXXXXX
//   https://www.youtube.com/embed/XXXXXXXXXXX
//   https://www.youtube.com/shorts/XXXXXXXXXXX
// Returns null if the input doesn't look like a valid YouTube link.
const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;

export const extractYouTubeVideoId = url => {
  if (!url || typeof url !== 'string') return null;
  const trimmed = url.trim();
  if (!trimmed) return null;

  // Bare ID — accept it as-is.
  if (VIDEO_ID_RE.test(trimmed)) return trimmed;

  // Allow bare-domain inputs like `youtube.com/watch?v=...` or `youtu.be/...`
  // by prepending the scheme so `new URL` can parse them.
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  let parsed;
  try {
    parsed = new URL(withScheme);
  } catch (_) {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    return VIDEO_ID_RE.test(id) ? id : null;
  }

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
    const v = parsed.searchParams.get('v');
    if (v && VIDEO_ID_RE.test(v)) return v;

    const parts = parsed.pathname.split('/').filter(Boolean);
    // /embed/XXX or /shorts/XXX or /v/XXX
    if (parts.length === 2 && ['embed', 'shorts', 'v'].includes(parts[0])) {
      return VIDEO_ID_RE.test(parts[1]) ? parts[1] : null;
    }
  }

  return null;
};

// Convenience helper: full embed URL for an `<iframe>`. Returns null if the
// caller's input isn't a recognised YouTube link.
export const youtubeEmbedUrl = url => {
  const id = extractYouTubeVideoId(url);
  return id ? `https://www.youtube.com/embed/${id}` : null;
};
