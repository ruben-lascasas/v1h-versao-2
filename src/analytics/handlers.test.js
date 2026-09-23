import { FacebookPixelHandler, GoogleAnalyticsHandler } from './handlers';

/**
 * O código que a Meta dá dispara um PageView ao carregar a página e mais
 * nenhum. Isto é uma aplicação de página única: a pessoa percorre a pesquisa,
 * abre três anúncios e vai ao checkout sem recarregar nada.
 */
describe('FacebookPixelHandler', () => {
  const handler = new FacebookPixelHandler();

  afterEach(() => {
    delete window.fbq;
  });

  it('conta a navegação dentro da aplicação', () => {
    window.fbq = jest.fn();

    handler.trackPageView('/s?address=Lisboa', '/');

    expect(window.fbq).toHaveBeenCalledWith('track', 'PageView');
  });

  // O primeiro carregamento já foi contado pelo próprio código do pixel;
  // contá-lo aqui outra vez duplicava a visita.
  it('não conta o carregamento inicial, que o pixel já contou', () => {
    window.fbq = jest.fn();

    handler.trackPageView('/', null);

    expect(window.fbq).not.toHaveBeenCalled();
  });

  /**
   * Sem consentimento de marketing o pixel nunca é carregado, e window.fbq não
   * existe. O handler continua registado à mesma — tem de aguentar isso sem
   * rebentar a navegação do site.
   */
  it('sem pixel carregado, não faz nada nem rebenta', () => {
    expect(() => handler.trackPageView('/s', '/')).not.toThrow();
  });
});

describe('GoogleAnalyticsHandler', () => {
  afterEach(() => {
    delete window.gtag;
    jest.useRealTimers();
  });

  // Fica aqui por companhia: os dois handlers partilham a regra de não contar
  // o carregamento inicial, e é bom que se note quando um deles a perder.
  it('também ignora o carregamento inicial', () => {
    jest.useFakeTimers();
    window.gtag = jest.fn();

    new GoogleAnalyticsHandler().trackPageView('/', null);
    jest.runAllTimers();

    expect(window.gtag).not.toHaveBeenCalled();
  });

  it('conta a navegação dentro da aplicação', () => {
    jest.useFakeTimers();
    window.gtag = jest.fn();

    new GoogleAnalyticsHandler().trackPageView('/s', '/');
    jest.runAllTimers();

    expect(window.gtag).toHaveBeenCalledWith('event', 'page_view', { page_path: '/s' });
  });
});
