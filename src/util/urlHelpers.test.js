import { types as sdkTypes } from './sdkLoader';
import {
  createSlug,
  parseFloatNum,
  encodeLatLng,
  decodeLatLng,
  encodeLatLngBounds,
  decodeLatLngBounds,
  stringify,
  parse,
  toAbsoluteURL,
  isDemoSharingImage,
} from './urlHelpers';

const { LatLng, LatLngBounds } = sdkTypes;

const SPACE = encodeURIComponent(' ');
const COMMA = encodeURIComponent(',');

describe('urlHelpers', () => {
  describe('parseFloatNum()', () => {
    it('handles empty string (returns "")', () => {
      expect(createSlug('')).toEqual('no-slug');
    });

    it('handles space characters', () => {
      expect(createSlug('ice hockey    tournament')).toEqual('ice-hockey-tournament');
    });

    it('handles special characters', () => {
      expect(createSlug('ice hockey!%/@$€ for the win')).toEqual('ice-hockey-for-the-win');
    });

    it('handles multiple "-"', () => {
      expect(createSlug('testing ---- dashes')).toEqual('testing-dashes');
    });

    it('handles umlauts', () => {
      expect(createSlug('jääkiekko / pesäpallo')).toEqual('jaakiekko-pesapallo');
    });

    it('handles Emojis', () => {
      expect(createSlug('smiling 💩 emoji')).toEqual('smiling-emoji');
    });
  });

  describe('parseFloatNum()', () => {
    it('handles empty value', () => {
      expect(parseFloatNum('')).toBeNull();
    });

    it('handles non-numeric value', () => {
      expect(parseFloatNum('abc')).toBeNull();
    });

    it('handles int value with surrounding whitespace', () => {
      expect(parseFloatNum(' 123 \t')).toEqual(123);
    });

    it('handles float value', () => {
      expect(parseFloatNum('123.01')).toBeCloseTo(123.01, 2);
    });

    it('handles float value with trailing zeros', () => {
      expect(parseFloatNum('42.1000')).toBeCloseTo(42.1, 2);
    });

    it('handles trailing chars', () => {
      expect(parseFloatNum('123abc')).toBeNull();
    });

    it('does not parse comma as a separator', () => {
      expect(parseFloatNum('10,20')).toBeNull();
    });
  });

  describe('LatLng serialisation', () => {
    it('encodes and decodes', () => {
      const location = new LatLng(40, 60);
      expect(decodeLatLng(encodeLatLng(location))).toEqual(location);
    });
  });

  describe('LatLngBounds serialisation', () => {
    it('encodes and decodes', () => {
      const bounds = new LatLngBounds(new LatLng(50, 70), new LatLng(30, 50));
      expect(decodeLatLngBounds(encodeLatLngBounds(bounds))).toEqual(bounds);
    });
  });

  describe('stringify()', () => {
    it('handles empty params', () => {
      expect(stringify({})).toEqual('');
    });

    it('sorts params', () => {
      const params = { b: 'B', c: 'C', a: 'A' };
      expect(stringify(params)).toEqual('a=A&b=B&c=C');
    });

    it('encodes values', () => {
      const params = {
        space: 'A and b',
        num: 123,
        bool: true,
        undef: undefined,
        nil: null,
      };
      expect(stringify(params)).toEqual(`bool=true&num=123&space=A+and+b`);
    });

    it('encodes SDK types', () => {
      const params = {
        origin: new LatLng(40, 60),
        bounds: new LatLngBounds(new LatLng(50, 70), new LatLng(30, 50)),
      };
      const origin = `40${COMMA}60`;
      const bounds = `50${COMMA}70${COMMA}30${COMMA}50`;
      expect(stringify(params)).toEqual(`bounds=${bounds}&origin=${origin}`);
    });
  });

  describe('parse()', () => {
    it('handles empty string', () => {
      expect(parse('')).toEqual({});
    });

    it('handles null', () => {
      expect(parse(null)).toEqual({});
    });

    it('handles question mark', () => {
      expect(parse('?')).toEqual({});
    });

    it('decodes values', () => {
      const search = `bool1=true&bool2=false&num1=123&num2=-1.01&space=A${SPACE}and${SPACE}b&spaceEncoded=A%20and%20b`;
      expect(parse(search)).toEqual({
        space: 'A and b',
        spaceEncoded: 'A and b',
        num1: 123,
        num2: -1.01,
        bool2: false,
        bool1: true,
      });
    });

    it('decodes SDK types', () => {
      const origin = `40${COMMA}60`;
      const bounds = `50${COMMA}70${COMMA}30${COMMA}50`;
      const search = `bounds=${bounds}&origin=${origin}&invalid=a,10&badBounds=true`;
      const options = {
        latlng: ['origin', 'invalid'],
        latlngBounds: ['bounds', 'badBounds'],
      };
      expect(parse(search, options)).toEqual({
        origin: new LatLng(40, 60),
        invalid: null,
        bounds: new LatLngBounds(new LatLng(50, 70), new LatLng(30, 50)),
        badBounds: null,
      });
    });

    it('keeps SDK type info without options', () => {
      const origin = `40${COMMA}60`;
      const bounds = `50${COMMA}70${COMMA}30${COMMA}50`;
      const search = `bounds=${bounds}&origin=${origin}`;
      expect(parse(search)).toEqual({
        bounds: '50,70,30,50',
        origin: '40,60',
      });
    });
  });
});

/**
 * A imagem de partilha do site vive no repositório e entra como
 * "/static/media/...jpg". Quem lê as etiquetas de partilha não segue caminhos
 * relativos: mostrava a partilha sem imagem nenhuma.
 */
describe('toAbsoluteURL', () => {
  it('põe o domínio num caminho do próprio site', () => {
    expect(toAbsoluteURL('/static/media/cartao.jpg', 'https://venue1hub.eu')).toBe(
      'https://venue1hub.eu/static/media/cartao.jpg'
    );
  });

  it('não duplica a barra quando a raiz já a tem', () => {
    expect(toAbsoluteURL('/x.jpg', 'https://venue1hub.eu/')).toBe('https://venue1hub.eu/x.jpg');
  });

  // As imagens da Console já vêm com domínio.
  it('deixa em paz um endereço que já é absoluto', () => {
    const url = 'https://sharetribe-assets.imgix.net/abc.jpg';
    expect(toAbsoluteURL(url, 'https://venue1hub.eu')).toBe(url);
  });

  // Sem raiz configurada, mais vale devolver o que havia do que inventar um
  // endereço partido.
  it('sem raiz, devolve o que recebeu', () => {
    expect(toAbsoluteURL('/x.jpg', undefined)).toBe('/x.jpg');
    expect(toAbsoluteURL('/x.jpg', '')).toBe('/x.jpg');
  });

  it('aguenta não receber endereço nenhum', () => {
    expect(toAbsoluteURL(null, 'https://venue1hub.eu')).toBeNull();
    expect(toAbsoluteURL(undefined, 'https://venue1hub.eu')).toBeUndefined();
  });
});

/**
 * O marketplace nasceu com conteúdo de demonstração da Sharetribe, e nele duas
 * imagens de partilha: fetos na página principal e um anfiteatro na marca.
 * Era a dos fetos que aparecia a quem recebia uma ligação do venue1hub.eu.
 */
describe('isDemoSharingImage', () => {
  const fetos =
    'https://sharetribe-assets.imgix.net/6a7c32f3/raw/db/f5d3ed6a44c89c6ccc440e11a273d108f98eac?auto=format&w=1200';
  const anfiteatro =
    'https://sharetribe-assets.imgix.net/6a7c32f3/raw/b3/f565a06609d9132ad4d8e0046a99dcd3d8b325?auto=format&w=600';

  it('reconhece as duas que vieram com a demonstração', () => {
    expect(isDemoSharingImage(fetos)).toBe(true);
    expect(isDemoSharingImage(anfiteatro)).toBe(true);
  });

  /**
   * É este o ponto de identificar por ficheiro em vez de desligar a Console:
   * no dia em que lá for posta uma imagem escolhida, ela manda, e isto deixa
   * de ter efeito sozinho.
   */
  it('uma imagem escolhida na Console continua a mandar', () => {
    expect(
      isDemoSharingImage('https://sharetribe-assets.imgix.net/6a7c32f3/raw/aa/outracoisa?w=1200')
    ).toBe(false);
  });

  it('e a nossa, do repositório, também', () => {
    expect(isDemoSharingImage('/static/media/venue1hub-facebook-sharing-1200x630.abc.jpg')).toBe(
      false
    );
  });

  it('aguenta não receber endereço nenhum', () => {
    expect(isDemoSharingImage(null)).toBe(false);
    expect(isDemoSharingImage(undefined)).toBe(false);
  });
});
