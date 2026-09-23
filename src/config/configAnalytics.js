////////////////////////////////////////////////////////////////////
// This file contains configs that add analytics integrations     //
////////////////////////////////////////////////////////////////////

// Note: These come from the analytics asset nowadays by default.
//       To use this built-in configuration, you need to remove the overwrite from configHelper.js (mergeAnalyticsConfig func)

// Optional
// Note that Google Analytics might need advanced opt-out option / cookie consent
// depending on jurisdiction (e.g. EU countries), since it relies on cookies.
export const googleAnalyticsId = process.env.REACT_APP_GOOGLE_ANALYTICS_ID;

// Optional
// If you add this Plausible integration, you should first create an account in plausible.io
// This adds data-domains for Plausible script through environment variable: REACT_APP_PLAUSIBLE_DOMAINS
// https://plausible.io/docs/plausible-script#can-i-send-stats-to-multiple-dashboards-at-the-same-time
// You can add multiple domains separated by comma
// E.g. REACT_APP_PLAUSIBLE_DOMAINS=example1.com,example2.com
export const plausibleDomains = process.env.REACT_APP_PLAUSIBLE_DOMAINS;

// Meta (Facebook) Pixel — publicidade e remarketing.
//
// O identificador não é segredo: vai no código da página e qualquer pessoa o lê
// em dois cliques. Fica aqui com valor por omissão para o site funcionar sem
// depender de uma variável na Render, e pode ser trocado por ambiente.
//
// ATENÇÃO: é um cookie de marketing. Só é carregado depois de o visitante
// aceitar essa categoria — ver util/includeScripts.js.
export const facebookPixelId =
  process.env.REACT_APP_FACEBOOK_PIXEL_ID || '1665995678431382';
