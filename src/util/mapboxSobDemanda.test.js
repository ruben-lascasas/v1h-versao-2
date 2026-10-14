import { carregarMapboxGL } from './mapboxSobDemanda';

/**
 * O QUE ESTE FICHEIRO PROTEGE
 *
 * A biblioteca do mapa deixou de vir com a página inicial. Isso tirou 301 KB e
 * quase três segundos de CPU a quem lá chega — mas passa a haver um momento em
 * que o mapa existe no ecrã e a biblioteca ainda não chegou. Se este
 * carregador falhar em silêncio, o sintoma não é um erro: é uma caixa cinzenta
 * onde devia estar o mapa de Portugal, e ninguém repara até um cliente
 * perguntar.
 */

const limpar = () => {
  document.head.innerHTML = '';
  delete window.mapboxgl;
  jest.resetModules();
};

beforeEach(limpar);

const scriptDoMapa = () => document.getElementById('mapbox_GL_JS');

describe('carregarMapboxGL', () => {
  it('vai buscar a biblioteca e a folha de estilos', async () => {
    const p = carregarMapboxGL('tok-1');

    const script = scriptDoMapa();
    expect(script).not.toBeNull();
    expect(script.src).toContain('mapbox-gl.js');
    expect(document.getElementById('mapbox_GL_CSS').href).toContain('mapbox-gl.css');

    window.mapboxgl = {};
    script.dispatchEvent(new Event('load'));
    await p;

    expect(window.mapboxgl.accessToken).toBe('tok-1');
  });

  /**
   * Dois componentes podem pedir o mapa ao mesmo tempo. Se cada pedido
   * acrescentasse um `<script>`, o telemóvel descarregava 301 KB duas vezes —
   * exactamente o custo que isto veio evitar.
   */
  it('dois pedidos não descarregam o ficheiro duas vezes', async () => {
    const { carregarMapboxGL: carregar } = require('./mapboxSobDemanda');
    const p1 = carregar('tok');
    const p2 = carregar('tok');

    expect(document.querySelectorAll('script[id="mapbox_GL_JS"]').length).toBe(1);
    expect(p1).toBe(p2);

    window.mapboxgl = {};
    scriptDoMapa().dispatchEvent(new Event('load'));
    await Promise.all([p1, p2]);
  });

  it('se a biblioteca já lá estiver, não pede nada', async () => {
    const { carregarMapboxGL: carregar } = require('./mapboxSobDemanda');
    window.mapboxgl = { accessToken: 'ja-posto' };

    await carregar('outro');

    expect(scriptDoMapa()).toBeNull();
    expect(window.mapboxgl.accessToken).toBe('ja-posto');
  });

  /**
   * Uma falha de rede não pode condenar o mapa até ao fim da visita: quem
   * voltar a descer até à secção tem direito a nova tentativa.
   */
  it('uma falha deixa tentar outra vez', async () => {
    const { carregarMapboxGL: carregar } = require('./mapboxSobDemanda');
    const p = carregar('tok');
    scriptDoMapa().dispatchEvent(new Event('error'));
    await expect(p).rejects.toThrow();

    document.head.innerHTML = '';
    const segunda = carregar('tok');
    expect(scriptDoMapa()).not.toBeNull();

    window.mapboxgl = {};
    scriptDoMapa().dispatchEvent(new Event('load'));
    await segunda;
  });
});
