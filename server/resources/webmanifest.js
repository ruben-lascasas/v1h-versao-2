const log = require('../log');
const sdkUtils = require('../api-util/sdk');

const rootUrl = process.env.REACT_APP_MARKETPLACE_ROOT_URL;

// NOTE: This assumes that branding asset is created.
//       If it's not, then the webmanifest returns dummy data.

// Generate icons with correct syntax for web app manifest
const generateIcons = variants => {
  const variantArray = Object.values(variants);
  return variantArray.map(variant => {
    const { url, width, height } = variant;
    return {
      src: url,
      // This should be square - as it is set to square in assetc schema
      sizes: `${width}x${height}`,
      // The image type is hard-coded - even though, Imgix default setup might return something else.
      type: 'image/png',
    };
  });
};

// Middleware to generate web app manifest for /site.webmanifest call
// https://developer.mozilla.org/en-US/docs/Web/Manifest
module.exports = (req, res) => {
  const sdk = sdkUtils.getSdk(req, res);

  // Note: marketplace.show endpoint is only called to fetch the name of the marketplace.
  // In your custom app, you might just hard-code this and remove the extra XHR call.
  const marketplacePromise = () => sdk.marketplace.show({ 'fields.marketplace': ['name'] });

  Promise.all([marketplacePromise(), sdkUtils.fetchBranding(sdk)])
    .then(response => {
      const [marketplaceResponse, brandingResponse] = response;

      // Get name
      const marketplace = marketplaceResponse.data.data;
      const marketplaceName = marketplace?.attributes?.name;

      // Collect data and included from the branding asset
      const brandingAssets = brandingResponse.data.data;
      const data = brandingAssets?.[0]?.attributes?.data;
      const included = brandingResponse.data?.included || {};

      // Marketplace color is used as theme_color
      const marketplaceColor = data?.marketplaceColors?.mainColor;
      // Tag the start URL so the frontend can recognise PWA launches and
      // hide the "Install our app" button when running inside the installed
      // window (display-mode standalone is the primary signal but this is a
      // belt-and-braces fallback).
      const startURL = rootUrl ? `${rootUrl.replace(/\/$/, '')}/?source=pwa` : '/?source=pwa';

      // App icons
      // Note: icons can be checked from design/branding.json asset (appIcon property),
      // but in your custom app, you might just hard-code this and remove the extra XHR call.
      const appIconId = data?.appIcon?._ref?.id;
      const appIcon = included.find(entity => entity.id === appIconId);
      const appIconVariants = appIcon?.attributes?.variants || {};
      const cmsIcons = generateIcons(appIconVariants);
      // Always include the local fallback PNGs from public/static/icons so the
      // PWA is installable even when the Sharetribe branding asset has no
      // appIcon configured (otherwise the icons array would be empty and
      // Chrome wouldn't offer install).
      const localIcons = [
        {
          src: '/static/icons/android-chrome-192x192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any maskable',
        },
        {
          src: '/static/icons/android-chrome-512x512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any maskable',
        },
      ];
      const icons = cmsIcons.length > 0 ? cmsIcons : localIcons;

      // Response as JSON data
      const jsonData = {
        name: marketplaceName || 'Venue1Hub',
        short_name: 'V1HUB',
        description: 'O seu principal parceiro de eventos — alugue espaços por hora ou por dia.',
        start_url: startURL,
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: marketplaceColor || '#2E2E2E',
        background_color: '#ffffff',
        lang: 'pt-PT',
        categories: ['business', 'lifestyle', 'travel'],
        icons,
      };

      // Format as JSON string (with indentation of 2 spaces)
      const json = JSON.stringify(jsonData, null, 2);

      // Set the content type for web app manifest
      res.setHeader('Content-Type', 'application/manifest+json');
      res.send(json);
    })
    .catch(e => {
      // Log error
      const is404 = e.status === 404;
      if (is404) {
        console.log('webmanifest-render-failed-no-asset-found');
      } else {
        log.error(e, 'webmanifest-render-failed');
      }

      // Return a valid PWA-installable manifest using the local icon fallback,
      // even when the Sharetribe SDK call fails (no creds, dev mode without
      // assets, network issues, etc.). Without these icons + display the
      // browser would refuse to offer the install prompt.
      const defaultJsonData = {
        name: 'Venue1Hub',
        short_name: 'V1HUB',
        description: 'O seu principal parceiro de eventos — alugue espaços por hora ou por dia.',
        start_url: '/?source=pwa',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#2E2E2E',
        background_color: '#ffffff',
        lang: 'pt-PT',
        categories: ['business', 'lifestyle', 'travel'],
        icons: [
          {
            src: '/static/icons/android-chrome-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any maskable',
          },
          {
            src: '/static/icons/android-chrome-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      };

      // Format as JSON string (with indentation of 2 spaces)
      const json = JSON.stringify(defaultJsonData, null, 2);

      // Set the content type for web app manifest
      res.setHeader('Content-Type', 'application/manifest+json');
      res.send(json);
    });
};
