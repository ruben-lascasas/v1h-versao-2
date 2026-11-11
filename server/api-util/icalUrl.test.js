/**
 * A validação dos endereços de calendário.
 *
 * O que está em jogo não é a comodidade do anfitrião — é que, a partir daqui,
 * o nosso servidor vai buscar coisas a sítios escolhidos por outra pessoa.
 * Um endereço interno que passe esta porta transforma a sincronização num
 * instrumento para espreitar a nossa própria rede.
 */

const { validarUrlCalendario, ehIpPrivado } = require('./icalUrl');

// Resolvedor falso: por omissão, tudo aponta para um endereço público.
const resolvePara = ip => async () => [{ address: ip, family: ip.includes(':') ? 6 : 4 }];
const publico = resolvePara('93.184.216.34');

describe('endereços que servem', () => {
  it('um https normal', async () => {
    const r = await validarUrlCalendario('https://calendar.google.com/cal/x.ics', {
      resolver: publico,
    });

    expect(r.ok).toBe(true);
  });

  /**
   * O Google, o Outlook e os PMS dão muitas vezes o endereço em webcal://.
   * Mandar a pessoa trocar à mão para https é uma forma simples de a perder.
   */
  it('webcal:// é aceite e convertido', async () => {
    const r = await validarUrlCalendario('webcal://exemplo.pt/sala.ics', { resolver: publico });

    expect(r.ok).toBe(true);
    expect(r.url).toBe('https://exemplo.pt/sala.ics');
  });

  it('espaços à volta não estragam nada', async () => {
    const r = await validarUrlCalendario('  https://exemplo.pt/a.ics  ', { resolver: publico });

    expect(r.ok).toBe(true);
  });
});

describe('endereços que não servem', () => {
  it('vazio', async () => {
    expect((await validarUrlCalendario('', { resolver: publico })).ok).toBe(false);
  });

  it('disparate', async () => {
    expect((await validarUrlCalendario('isto não é um url', { resolver: publico })).ok).toBe(false);
  });

  it('outro protocolo', async () => {
    const r = await validarUrlCalendario('file:///etc/passwd', { resolver: publico });

    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/http/);
  });
});

describe('a rede de dentro', () => {
  it('localhost', async () => {
    expect((await validarUrlCalendario('http://localhost/a.ics', { resolver: publico })).ok).toBe(
      false
    );
  });

  it('um IP privado escrito à letra', async () => {
    for (const u of [
      'http://127.0.0.1/a.ics',
      'http://10.0.0.5/a.ics',
      'http://192.168.1.1/a.ics',
      'http://172.16.0.1/a.ics',
    ]) {
      const r = await validarUrlCalendario(u, { resolver: publico });
      expect(r.ok).toBe(false);
    }
  });

  /**
   * O endereço de metadados do alojamento. É o alvo clássico: responde sem
   * autenticação a quem perguntar de dentro, e o que devolve são credenciais.
   */
  it('o endereço de metadados da nuvem', async () => {
    const r = await validarUrlCalendario('http://169.254.169.254/latest/meta-data/', {
      resolver: publico,
    });

    expect(r.ok).toBe(false);
  });

  /**
   * O caso que a verificação do nome sozinha não apanha: um domínio público
   * que resolve para dentro.
   */
  it('um nome público que aponta para um endereço interno', async () => {
    const r = await validarUrlCalendario('https://parece-normal.pt/a.ics', {
      resolver: resolvePara('10.1.2.3'),
    });

    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/não é acessível de fora/);
  });

  it('o mesmo em IPv6', async () => {
    const r = await validarUrlCalendario('https://parece-normal.pt/a.ics', {
      resolver: resolvePara('fd00::1'),
    });

    expect(r.ok).toBe(false);
  });

  it('um servidor que não existe', async () => {
    const r = await validarUrlCalendario('https://nao-existe.invalid/a.ics', {
      resolver: async () => {
        throw new Error('ENOTFOUND');
      },
    });

    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/encontrar/);
  });
});

describe('ehIpPrivado', () => {
  it('conhece as gamas privadas', () => {
    expect(ehIpPrivado('10.0.0.1')).toBe(true);
    expect(ehIpPrivado('172.31.255.255')).toBe(true);
    expect(ehIpPrivado('172.32.0.1')).toBe(false);
    expect(ehIpPrivado('192.168.0.1')).toBe(true);
    expect(ehIpPrivado('169.254.169.254')).toBe(true);
    expect(ehIpPrivado('8.8.8.8')).toBe(false);
    expect(ehIpPrivado('::1')).toBe(true);
    expect(ehIpPrivado('2001:4860:4860::8888')).toBe(false);
  });
});
