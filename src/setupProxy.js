// Forward /api/* requests from the dev frontend (port 3000) to the dev API
// server (port 3500). Lets the frontend always call relative URLs like
// /api/pwa-counter and have them work the same way in dev (with or without
// ngrok), in production builds, and from a phone via the ngrok tunnel.
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  const apiPort = process.env.REACT_APP_DEV_API_SERVER_PORT;
  if (!apiPort) return;

  const target = `http://localhost:${apiPort}`;
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );
  app.use(
    '/site.webmanifest',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );
};
