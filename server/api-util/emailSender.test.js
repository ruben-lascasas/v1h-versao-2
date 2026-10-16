/**
 * O REMETENTE, E SABER SE O EMAIL FOI ACEITE.
 *
 * Este ficheiro existe por causa de uma avaria encontrada a 2026-10-16: a
 * conta Resend não tinha nenhum domínio registado, todos os envios eram
 * recusados com 403 — e as 26 chamadas do servidor davam todas sucesso.
 *
 * A razão é simples e não está escrita em sítio nenhum óbvio: o SDK do Resend
 * NÃO lança exceção quando a API recusa. Devolve `{ data: null, error }` e a
 * promessa resolve. Quem envolver o envio num try/catch fica convencido de que
 * entregou.
 *
 * Por isso o que se testa aqui é sobretudo a recusa, não o sucesso.
 */

const { mailFrom, isEnglish, t, enviarEmail } = require('./emailSender');

const ERRO_403 = {
  data: null,
  error: {
    statusCode: 403,
    name: 'validation_error',
    message: 'The venue1hub.eu domain is not verified.',
  },
};

const resendFalso = resposta => {
  const enviados = [];
  return {
    enviados,
    emails: {
      send: async m => {
        enviados.push(m);
        if (typeof resposta === 'function') return resposta(m);
        return resposta;
      },
    },
  };
};

const carta = { para: 'alguem@exemplo.pt', subject: 'Assunto', html: '<p>olá</p>' };

let erros;
beforeEach(() => {
  erros = [];
  jest.spyOn(console, 'error').mockImplementation((...a) => erros.push(a.join(' ')));
});
afterEach(() => {
  jest.restoreAllMocks();
});

describe('enviarEmail', () => {
  it('devolve true quando o Resend aceita', async () => {
    const resend = resendFalso({ data: { id: 'e-1' }, error: null });

    await expect(enviarEmail(resend, carta)).resolves.toBe(true);
    expect(resend.enviados).toHaveLength(1);
  });

  /**
   * O caso que originou este ficheiro.
   */
  it('devolve false quando o Resend recusa sem lançar nada', async () => {
    const resend = resendFalso(ERRO_403);

    await expect(enviarEmail(resend, carta)).resolves.toBe(false);
  });

  it('e deixa a razão da recusa nos registos, não um silêncio', async () => {
    await enviarEmail(resendFalso(ERRO_403), { ...carta, contexto: '[pre-verificacao]' });

    expect(erros.join('\n')).toContain('[pre-verificacao]');
    expect(erros.join('\n')).toContain('domain is not verified');
    expect(erros.join('\n')).toContain('alguem@exemplo.pt');
  });

  it('devolve false quando a chamada atira', async () => {
    const partido = {
      emails: {
        send: async () => {
          throw new Error('sem rede');
        },
      },
    };

    await expect(enviarEmail(partido, carta)).resolves.toBe(false);
    expect(erros.join('\n')).toContain('sem rede');
  });

  it('sem Resend, ou sem destinatário, não inventa um envio', async () => {
    await expect(enviarEmail(null, carta)).resolves.toBe(false);
    await expect(enviarEmail(resendFalso({ data: {} }), { ...carta, para: '' })).resolves.toBe(
      false
    );
  });

  it('manda o remetente que o mailFrom decide', async () => {
    const resend = resendFalso({ data: { id: 'e-1' } });
    process.env.EMAIL_FROM = 'Venue1Hub <noreply@venue1hub.eu>';

    await enviarEmail(resend, { ...carta, etiqueta: 'Reservas' });

    expect(resend.enviados[0].from).toBe('Venue1Hub Reservas <noreply@venue1hub.eu>');
    delete process.env.EMAIL_FROM;
  });

  /**
   * A armadilha que apanhei nos trabalhos da pré-verificação: passavam
   * `mailFrom('Venue1Hub')` e o nome saía duplicado, porque a etiqueta é um
   * SUFIXO do nome e não o nome.
   */
  it('sem etiqueta não duplica o nome', async () => {
    process.env.EMAIL_FROM = 'Venue1Hub <noreply@venue1hub.eu>';

    expect(mailFrom()).toBe('Venue1Hub <noreply@venue1hub.eu>');
    expect(mailFrom('Venue1Hub')).toBe('Venue1Hub Venue1Hub <noreply@venue1hub.eu>');

    delete process.env.EMAIL_FROM;
  });
});

describe('isEnglish', () => {
  it('aceita o perfil, o utilizador inteiro, ou só a string', () => {
    expect(isEnglish('en')).toBe(true);
    expect(isEnglish('en-GB')).toBe(true);
    expect(isEnglish('pt')).toBe(false);
    expect(isEnglish({ publicData: { locale: 'en' } })).toBe(true);
    expect(isEnglish({ attributes: { profile: { publicData: { locale: 'en' } } } })).toBe(true);
    expect(isEnglish({ profile: { publicData: { locale: 'pt' } } })).toBe(false);
  });

  it('sem língua guardada, fica em português', () => {
    expect(isEnglish(undefined)).toBe(false);
    expect(isEnglish({})).toBe(false);
  });
});

describe('t', () => {
  it('escolhe conforme a língua', () => {
    expect(t(false, 'olá', 'hello')).toBe('olá');
    expect(t(true, 'olá', 'hello')).toBe('hello');
  });
});
