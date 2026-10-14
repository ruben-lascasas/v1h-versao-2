import { carregarMapboxGL, pedirAoPrimeiroGesto } from './mapboxSobDemanda';

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

/**
 * O GATILHO: PRIMEIRO GESTO **E** PROXIMIDADE
 *
 * Isto existe porque me enganei duas vezes antes de chegar aqui. Primeiro
 * carreguei o mapa quando estivesse a 600px de ser visto; depois a 100px. Nas
 * duas o pedido saía no instante em que a página abria, porque num telemóvel a
 * secção do mapa fica a ~160px da dobra — está praticamente lá. Media-se e via-
 * se: 806ms, antes do primeiro pixel aparecer.
 *
 * Estes testes fixam as duas condições. Se alguém um dia tirar o gesto e
 * deixar só a proximidade, voltamos ao ponto de partida sem dar por isso: o
 * mapa continua a funcionar, só a página é que volta a ficar lenta — o pior
 * tipo de regressão, a que não parte nada.
 */
describe('pedirAoPrimeiroGesto', () => {
  let observados;
  let dispararInterseccao;
  // Cada chamada deixa ouvintes no `window`; se não se desligarem, o gesto de
  // um teste acorda o observador do teste anterior. A própria função devolve o
  // desligador — é para isto que ele serve.
  let porDesligar;

  beforeEach(() => {
    observados = [];
    dispararInterseccao = null;
    porDesligar = [];
    window.IntersectionObserver = class {
      constructor(cb) {
        dispararInterseccao = () => cb([{ isIntersecting: true }]);
      }
      observe(el) { observados.push(el); }
      disconnect() {}
    };
  });

  afterEach(() => {
    porDesligar.forEach(d => d());
    delete window.IntersectionObserver;
  });

  const alvo = () => document.createElement('div');
  const vigiar = (el, fn, op) => {
    const d = pedirAoPrimeiroGesto(el, fn, op);
    porDesligar.push(d);
    return d;
  };

  it('não vigia nada enquanto ninguém mexer na página', () => {
    const aoAtingir = jest.fn();
    vigiar(alvo(), aoAtingir);

    expect(observados).toHaveLength(0);
    expect(aoAtingir).not.toHaveBeenCalled();
  });

  it('ao primeiro gesto começa a vigiar — mas ainda não pede', () => {
    const aoAtingir = jest.fn();
    vigiar(alvo(), aoAtingir);

    window.dispatchEvent(new Event('scroll'));

    expect(observados).toHaveLength(1);
    expect(aoAtingir).not.toHaveBeenCalled();
  });

  it('pede quando o elemento se aproxima, depois do gesto', () => {
    const aoAtingir = jest.fn();
    vigiar(alvo(), aoAtingir);

    window.dispatchEvent(new Event('scroll'));
    dispararInterseccao();

    expect(aoAtingir).toHaveBeenCalledTimes(1);
  });

  it('vários gestos não põem o mesmo elemento a ser vigiado duas vezes', () => {
    vigiar(alvo(), jest.fn());

    window.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('wheel'));
    window.dispatchEvent(new Event('touchstart'));

    expect(observados).toHaveLength(1);
  });

  it('depois de desligar, um gesto já não faz nada', () => {
    const aoAtingir = jest.fn();
    const desligar = vigiar(alvo(), aoAtingir);

    desligar();
    window.dispatchEvent(new Event('scroll'));

    expect(observados).toHaveLength(0);
    expect(aoAtingir).not.toHaveBeenCalled();
  });

  // Um browser sem IntersectionObserver não tem como saber da proximidade.
  // Entre não ter mapa e pagar o carregamento, paga-se.
  it('sem IntersectionObserver, pede logo', () => {
    delete window.IntersectionObserver;
    const aoAtingir = jest.fn();

    vigiar(alvo(), aoAtingir);

    expect(aoAtingir).toHaveBeenCalledTimes(1);
  });
});
