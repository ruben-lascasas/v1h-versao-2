// Minimal service worker — required for the browser to recognise the site as
// a Progressive Web App and offer the "Install" prompt. We don't pre-cache
// content (Sharetribe assets change often and stale caches cause confusing
// bugs), but we still hook the fetch event so the install criteria is met.
const CACHE_NAME = 'v1hub-pwa-shell-v1';

self.addEventListener('install', event => {
  // Activate the new SW immediately so users don't have to refresh twice.
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  // Take control of all open tabs as soon as the SW is ready.
  event.waitUntil(self.clients.claim());

  // Drop old caches from previous SW versions.
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
});

// Network-first fetch handler. Required for installability — the browser
// considers a site PWA-eligible only when a SW with a fetch handler is active.
self.addEventListener('fetch', event => {
  // Pass through every request unmodified. Letting the network handle things
  // keeps the UX identical to a normal site visit while the SW is registered.
  return;
});
