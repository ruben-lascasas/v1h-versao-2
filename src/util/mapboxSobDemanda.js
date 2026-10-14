import { useEffect, useState } from 'react';

/**
 * Carregar o mapa só quando há mapa para mostrar.
 *
 * O QUE ISTO CUSTAVA
 *
 * O `mapbox-gl.js` são 301 KB comprimidos e, medido pelo Lighthouse num
 * telemóvel, **2 992 ms de CPU** — o maior consumidor da página inicial, à
 * frente do nosso próprio pacote. Era carregado em todas as páginas, com
 * `defer`, o que só adia a execução: o download e os três segundos de trabalho
 * aconteciam na mesma, à frente de tudo o que o visitante estava à espera de
 * ver.
 *
 * A página inicial tem mesmo um mapa, mas está muito abaixo da primeira dobra.
 * Não há razão para o pagar antes de se chegar lá.
 *
 * O QUE NÃO MUDA
 *
 * A pesquisa e a página do anúncio continuam a carregá-lo à cabeça, porque o
 * mapa delas é parte do que se vai ver (`prioritizeMapLibraryLoading` na
 * configuração das rotas). Isto só serve as rotas onde ele era adiado — na
 * prática, a página inicial.
 *
 * O geocoder da caixa de pesquisa não depende disto: usa o `mapbox-sdk`, que é
 * outro ficheiro, muito mais pequeno, e recebe o token da configuração.
 */

export const MAPBOX_GL_VERSAO = 'v3.7.0';
const URL_JS = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSAO}/mapbox-gl.js`;
const URL_CSS = `https://api.mapbox.com/mapbox-gl-js/${MAPBOX_GL_VERSAO}/mapbox-gl.css`;
const ID_JS = 'mapbox_GL_JS';
const ID_CSS = 'mapbox_GL_CSS';

// Uma só promessa para toda a aplicação: dois componentes a pedir o mapa ao
// mesmo tempo não podem pôr o browser a descarregar o ficheiro duas vezes.
let promessa = null;

/**
 * Põe o `mapbox-gl.js` disponível em `window.mapboxgl`, com o token já posto.
 *
 * Chamar quantas vezes se quiser: a partir da primeira é sempre a mesma
 * promessa. Se o script já lá estiver — porque a rota o carregou à cabeça —
 * resolve de imediato sem pedir nada.
 *
 * @param {string} accessToken token da Mapbox, vindo da configuração
 * @returns {Promise<void>}
 */
export const carregarMapboxGL = accessToken => {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  if (window.mapboxgl) {
    if (accessToken && !window.mapboxgl.accessToken) {
      window.mapboxgl.accessToken = accessToken;
    }
    return Promise.resolve();
  }
  if (promessa) {
    return promessa;
  }

  promessa = new Promise((resolve, reject) => {
    if (!document.getElementById(ID_CSS)) {
      const css = document.createElement('link');
      css.id = ID_CSS;
      css.rel = 'stylesheet';
      css.href = URL_CSS;
      css.crossOrigin = 'anonymous';
      document.head.appendChild(css);
    }

    const existente = document.getElementById(ID_JS);
    const script = existente || document.createElement('script');
    const aoCarregar = () => {
      if (accessToken && window.mapboxgl && !window.mapboxgl.accessToken) {
        window.mapboxgl.accessToken = accessToken;
      }
      resolve();
    };
    const aoFalhar = () => {
      // Deixa tentar outra vez: uma falha de rede não deve condenar o mapa até
      // ao fim da visita.
      promessa = null;
      reject(new Error('mapbox-gl.js não carregou'));
    };

    script.addEventListener('load', aoCarregar, { once: true });
    script.addEventListener('error', aoFalhar, { once: true });

    if (!existente) {
      script.id = ID_JS;
      script.src = URL_JS;
      script.async = true;
      script.crossOrigin = 'anonymous';
      document.head.appendChild(script);
    }
  });

  return promessa;
};

/**
 * Garante a biblioteca a quem está a desenhar um mapa.
 *
 * PORQUE É QUE ISTO TEM DE EXISTIR
 *
 * A primeira versão desta alteração decidia pela rota: as rotas marcadas como
 * "mostra mapa logo" recebiam a biblioteca, as outras não. Pareceu suficiente
 * e não era — a pesquisa mostra um mapa e, conforme a variante configurada na
 * Console, podia não estar marcada como tal. O mapa da pesquisa ficava uma
 * caixa vazia, e isso não dá erro nenhum: dá um buraco branco.
 *
 * Por isso a regra deixou de ser da rota e passou a ser de quem precisa. Um
 * componente que vai desenhar um mapa chama isto e a biblioteca vem — venha de
 * onde vier a página. A marcação na rota continua a servir para a trazer mais
 * cedo, mas já não é ela que decide se vem.
 *
 * Devolve nada de útil de propósito: o que interessa é que, quando a
 * biblioteca chega, o componente volta a desenhar e o `isMapsLibLoaded()` dele
 * passa a dizer que sim.
 *
 * @param {Object} mapsConfig `config.maps`
 */
export const useMapboxGL = mapsConfig => {
  const [, redesenhar] = useState(0);
  const ehMapbox = mapsConfig?.mapProvider === 'mapbox';
  const token = mapsConfig?.mapboxAccessToken;

  useEffect(() => {
    if (!ehMapbox || typeof window === 'undefined' || window.mapboxgl) return undefined;

    let vivo = true;
    carregarMapboxGL(token)
      .then(() => {
        if (vivo) redesenhar(n => n + 1);
      })
      .catch(() => {
        console.warn('[mapa] mapbox-gl.js não carregou');
      });

    return () => {
      vivo = false;
    };
  }, [ehMapbox, token]);
};
