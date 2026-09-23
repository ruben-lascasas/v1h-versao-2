export class LoggingAnalyticsHandler {
  trackPageView(url) {
    console.log('Analytics page view:', url);
  }
}

// Google Analytics 4 (GA4) using gtag.js script, which is included in util/includeScripts.js
export class GoogleAnalyticsHandler {
  trackPageView(canonicalPath, previousPath) {
    // GA4 property. Manually send page_view events
    // https://developers.google.com/analytics/devguides/collection/gtagjs/single-page-applications
    // Note 1: You should turn "Enhanced measurement" off.
    //         It attaches own listeners to elements and that breaks in-app navigation.
    // Note 2: If previousPath is null (just after page load), gtag script sends page_view event automatically.
    //         Only in-app navigation needs to be sent manually from SPA.
    // Note 3: Timeout is needed because gtag script picks up <title>,
    //         and location change event happens before initial rendering.
    if (previousPath && window.gtag) {
      window.setTimeout(() => {
        window.gtag('event', 'page_view', {
          page_path: canonicalPath,
        });
      }, 300);
    }
  }
}

/**
 * Meta (Facebook) Pixel. O script é incluído em util/includeScripts.js, e só
 * depois de o visitante aceitar cookies de marketing.
 *
 * O código que a Meta dá dispara um PageView ao carregar a página e mais
 * nenhum. Isto é uma aplicação de página única: a pessoa percorre a pesquisa,
 * abre três anúncios e vai ao checkout sem nunca recarregar nada, e o pixel
 * contava uma visita só. Daí este handler.
 */
export class FacebookPixelHandler {
  trackPageView(canonicalPath, previousPath) {
    // Sem previousPath é o carregamento inicial, e esse já foi contado pelo
    // próprio código do pixel. Contá-lo aqui outra vez duplicava a visita.
    if (previousPath && typeof window !== 'undefined' && window.fbq) {
      window.fbq('track', 'PageView');
    }
  }
}
