/**
 * A permissão de publicar é o que separa quem pode criar um anúncio de quem
 * não pode. Antes disto, só era escrita para *conceder*: um visitante nunca via
 * a sua ser tocada e, como a Sharetribe deixa "allow" por omissão, passava na
 * verificação do EditListingPage e abria o formulário.
 */

const mockUpdatePermissions = jest.fn();
jest.mock('./sdk', () => ({
  ...jest.requireActual('./sdk'),
  getIntegrationSdk: () => ({ users: { updatePermissions: mockUpdatePermissions } }),
}));

const {
  syncPostingPermission,
  mayPostListings,
  EXEMPT_MARKER,
  DENIED_MARKER,
} = require('./verification');

const OLD_ENV = process.env;
beforeEach(() => {
  mockUpdatePermissions.mockReset();
  mockUpdatePermissions.mockResolvedValue({});
  process.env = {
    ...OLD_ENV,
    VERIFICATION_USER_TYPES: 'anunciante',
    POSTING_ALLOWED_USER_TYPES: 'prestador_de_servicos',
  };
});
afterEach(() => {
  process.env = OLD_ENV;
});

const permissaoEscrita = () => mockUpdatePermissions.mock.calls[0]?.[0]?.postListings;

describe('quem pode publicar', () => {
  it('o prestador de serviços pode', () => {
    expect(mayPostListings('prestador_de_servicos')).toBe(true);
  });

  it('o visitante não pode', () => {
    expect(mayPostListings('visitante')).toBe(false);
  });

  // O anunciante não é decidido aqui: quem lhe manda na permissão é o fluxo de
  // verificação, conforme o estado dos documentos.
  it('o anunciante não é abrangido por esta regra', () => {
    expect(mayPostListings('anunciante')).toBe(false);
  });

  it('um tipo desconhecido não pode', () => {
    expect(mayPostListings('test12')).toBe(false);
    expect(mayPostListings(undefined)).toBe(false);
  });
});

describe('escrita da permissão', () => {
  it('concede ao prestador de serviços', async () => {
    const marker = await syncPostingPermission('u1', 'prestador_de_servicos');
    expect(permissaoEscrita()).toBe('permission/allow');
    expect(marker).toBe(EXEMPT_MARKER);
  });

  // O buraco que isto fecha.
  it('nega ao visitante, em vez de o deixar como estava', async () => {
    const marker = await syncPostingPermission('u1', 'visitante');
    expect(permissaoEscrita()).toBe('permission/deny');
    expect(marker).toBe(DENIED_MARKER);
  });

  it('nega a um tipo desconhecido', async () => {
    await syncPostingPermission('u1', 'test12');
    expect(permissaoEscrita()).toBe('permission/deny');
  });
});

describe('não repete escritas', () => {
  it('não volta a escrever quando o marcador já bate certo', async () => {
    const marker = await syncPostingPermission('u1', 'visitante', DENIED_MARKER);
    expect(marker).toBeNull();
    expect(mockUpdatePermissions).not.toHaveBeenCalled();
  });

  it('escreve quando o marcador é de outro estado', async () => {
    // Alguém que era prestador e passou a visitante: o marcador antigo dizia
    // "isento" e a permissão tem mesmo de mudar.
    const marker = await syncPostingPermission('u1', 'visitante', EXEMPT_MARKER);
    expect(marker).toBe(DENIED_MARKER);
    expect(permissaoEscrita()).toBe('permission/deny');
  });

  it('escreve quando nunca foi aplicado nada', async () => {
    await syncPostingPermission('u1', 'prestador_de_servicos', null);
    expect(mockUpdatePermissions).toHaveBeenCalledTimes(1);
  });
});

describe('configuração por ambiente', () => {
  it('respeita uma lista de tipos autorizados diferente', () => {
    process.env.POSTING_ALLOWED_USER_TYPES = 'visitante,parceiro';
    expect(mayPostListings('visitante')).toBe(true);
    expect(mayPostListings('prestador_de_servicos')).toBe(false);
  });

  // "*" quer dizer "todos os que não têm de verificar".
  it('com asterisco, autoriza tudo menos os tipos que verificam', () => {
    process.env.POSTING_ALLOWED_USER_TYPES = '*';
    expect(mayPostListings('visitante')).toBe(true);
    expect(mayPostListings('anunciante')).toBe(false);
  });
});
