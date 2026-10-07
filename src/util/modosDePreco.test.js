import { types as sdkTypes } from './sdkLoader';
import {
  outroModo,
  resolverModo,
  precosDoAnuncio,
  temDoisModos,
  modosDisponiveis,
  aceitaDoisModos,
} from './modosDePreco';

const { Money } = sdkTypes;

const anuncio = (unitType, price, precos) => ({
  attributes: {
    price: price != null ? new Money(price, 'EUR') : null,
    publicData: { unitType, ...(precos ? { precos } : {}) },
  },
});

describe('outroModo', () => {
  it('hora e dia são o oposto um do outro', () => {
    expect(outroModo('hour')).toBe('day');
    expect(outroModo('day')).toBe('hour');
  });

  it('as outras unidades não têm outro modo', () => {
    // 'fixed', 'item', 'night' e as de negociação ficam de fora: para elas
    // isto não significa nada, e oferecer-lhes um segundo preço era inventar.
    ['fixed', 'item', 'night', 'offer', 'request', undefined].forEach(u => {
      expect(outroModo(u)).toBe(null);
    });
  });
});

/**
 * Estas regras têm de ser as mesmas de server/api-util/modosDePreco.js. É de lá
 * que sai o preço cobrado; aqui só se mostra. Se um dia divergirem, é um destes
 * dois conjuntos de testes que o apanha.
 */
describe('precosDoAnuncio', () => {
  it('um anúncio antigo, sem `precos`, mantém o preço que tem', () => {
    expect(precosDoAnuncio(anuncio('day', 450000))).toEqual({ day: 450000 });
    expect(precosDoAnuncio(anuncio('hour', 2500))).toEqual({ hour: 2500 });
  });

  it('com os dois preços guardados, devolve os dois', () => {
    expect(precosDoAnuncio(anuncio('day', 450000, { day: 450000, hour: 60000 }))).toEqual({
      day: 450000,
      hour: 60000,
    });
  });

  it('ignora preços a zero, negativos ou que não sejam números', () => {
    expect(precosDoAnuncio(anuncio('day', 450000, { hour: 0 }))).toEqual({ day: 450000 });
    expect(precosDoAnuncio(anuncio('day', 450000, { hour: -100 }))).toEqual({ day: 450000 });
    expect(precosDoAnuncio(anuncio('day', 450000, { hour: '60000' }))).toEqual({ day: 450000 });
  });

  it('aguenta um anúncio a meio de ser criado, ainda sem preço', () => {
    expect(precosDoAnuncio(anuncio('day', null))).toEqual({});
    expect(precosDoAnuncio(undefined)).toEqual({});
  });
});

describe('temDoisModos', () => {
  it('só com os dois preços', () => {
    expect(temDoisModos(anuncio('day', 450000))).toBe(false);
    expect(temDoisModos(anuncio('day', 450000, { day: 450000, hour: 60000 }))).toBe(true);
  });
});

describe('modosDisponiveis', () => {
  /**
   * O primeiro da lista é o que abre no painel de reserva. Tem de ser o modo
   * que o anúncio sempre vendeu: um espaço que vive de alugueres diários não
   * deve passar a abrir no horário só porque o anfitrião acrescentou um preço.
   */
  it('começa pelo modo principal do anúncio', () => {
    expect(modosDisponiveis(anuncio('day', 450000, { day: 450000, hour: 60000 }))).toEqual([
      'day',
      'hour',
    ]);
    expect(modosDisponiveis(anuncio('hour', 60000, { day: 450000, hour: 60000 }))).toEqual([
      'hour',
      'day',
    ]);
  });

  it('um anúncio de um modo só devolve esse', () => {
    expect(modosDisponiveis(anuncio('day', 450000))).toEqual(['day']);
  });
});

describe('aceitaDoisModos', () => {
  it('sim para reservas à hora ou ao dia', () => {
    expect(aceitaDoisModos({ unitType: 'day', isBooking: true })).toBe(true);
    expect(aceitaDoisModos({ unitType: 'hour', isBooking: true })).toBe(true);
  });

  it('não para compras, durações fixas ou negociação', () => {
    expect(aceitaDoisModos({ unitType: 'item', isBooking: false })).toBe(false);
    expect(aceitaDoisModos({ unitType: 'fixed', isBooking: true })).toBe(false);
    expect(aceitaDoisModos({ unitType: 'request', isBooking: true })).toBe(false);
  });

  it('não quando as variantes de preço nativas estão em uso', () => {
    expect(
      aceitaDoisModos({ unitType: 'day', isBooking: true, isPriceVariationsInUse: true })
    ).toBe(false);
  });
});

describe('resolverModo', () => {
  const doisModos = anuncio('day', 450000, { day: 450000, hour: 60000 });

  it('respeita a escolha quando o anúncio a vende', () => {
    expect(resolverModo(doisModos, 'hour')).toBe('hour');
  });

  it('sem escolha, vale o modo principal', () => {
    expect(resolverModo(doisModos, null)).toBe('day');
  });

  /**
   * O caso que interessa: o anfitrião apaga o preço à hora enquanto alguém
   * tem a página aberta com "por hora" escolhido. Devolver 'hour' punha o
   * painel a mostrar um preço que já não existe e a pedir ao servidor uma
   * linha de fatura que ele não sabe calcular.
   */
  it('uma escolha que deixou de existir cai no modo principal', () => {
    expect(resolverModo(anuncio('day', 450000), 'hour')).toBe('day');
  });

  it('aguenta um anúncio sem preço nenhum', () => {
    expect(resolverModo(anuncio('day', null), 'hour')).toBe('day');
  });
});
