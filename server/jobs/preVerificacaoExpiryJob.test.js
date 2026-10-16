const { correr } = require('./preVerificacaoExpiryJob');

/**
 * ESTE TRABALHO FECHA ANÚNCIOS DE PESSOAS
 *
 * É a única parte da pré-publicação que destrói visibilidade sem ninguém
 * pedir. Um erro aqui não dá erro nenhum: dá um espaço que desapareceu da
 * plataforma e um anfitrião que não percebe porquê.
 *
 * Por isso o que se verifica não é só que fecha quando deve — é sobretudo que
 * **não fecha** em todos os casos em que não deve, e que nunca fecha nada sem
 * ter avisado primeiro.
 */

const DIA = 24 * 60 * 60 * 1000;
const AGORA = Date.parse('2026-10-16T05:00:00.000Z');
const haDias = n => new Date(AGORA - n * DIA).toISOString();

const AUTOR_POR_VERIFICAR = 'autor-por-verificar';
const AUTOR_VERIFICADO = 'autor-verificado';
const AUTOR_ANTIGO = 'autor-sem-marca';

const sdkFalso = anuncios => {
  const chamadas = { update: [], close: [] };
  return {
    chamadas,
    listings: {
      query: async () => ({
        data: {
          data: anuncios,
          included: [
            // Com email: sem ele o envio nem era tentado e os testes do aviso
            // passavam pela razão errada — descoberto por um deles a falhar.
            { id: { uuid: AUTOR_POR_VERIFICAR }, type: 'user', attributes: { email: 'host@exemplo.pt', profile: { firstName: 'Rita', metadata: { podeReceberReservas: false } } } },
            { id: { uuid: AUTOR_VERIFICADO }, type: 'user', attributes: { email: 'ok@exemplo.pt', profile: { firstName: 'Ana', metadata: { podeReceberReservas: true } } } },
            { id: { uuid: AUTOR_ANTIGO }, type: 'user', attributes: { email: 'antigo@exemplo.pt', profile: { firstName: 'Luis', metadata: {} } } },
          ],
          meta: { totalPages: 1 },
        },
      }),
      update: async args => { chamadas.update.push(args); },
      close: async args => { chamadas.close.push(args); },
    },
  };
};

const resendQueEnvia = () => {
  const enviados = [];
  return { enviados, emails: { send: async m => { enviados.push(m); return { id: 'e-1' }; } } };
};

const anuncio = (publicData, autor = AUTOR_POR_VERIFICAR, id = 'l-1') => ({
  id,
  attributes: { title: 'Espaço', publicData, state: 'published' },
  relationships: { author: { data: { id: { uuid: autor } } } },
});

describe('o relógio começa quando o anúncio é visto, não quando foi criado', () => {
  it('na primeira passagem só carimba', async () => {
    const sdk = sdkFalso([anuncio({})]);
    const r = await correr(sdk, AGORA);

    expect(r.carimbados).toBe(1);
    expect(r.avisados).toBe(0);
    expect(sdk.chamadas.close).toHaveLength(0);
    expect(sdk.chamadas.update[0].publicData.preVerificacaoDesde).toBe(new Date(AGORA).toISOString());
  });
});

describe('o aviso', () => {
  it('aos 59 dias ainda não se avisa', async () => {
    const sdk = sdkFalso([anuncio({ preVerificacaoDesde: haDias(59) })]);
    const r = await correr(sdk, AGORA);

    expect(r.avisados).toBe(0);
    expect(sdk.chamadas.close).toHaveLength(0);
  });

  it('aos 60 dias avisa-se, e só se avisa', async () => {
    const sdk = sdkFalso([anuncio({ preVerificacaoDesde: haDias(60) })]);
    const r = await correr(sdk, AGORA, resendQueEnvia());

    expect(r.avisados).toBe(1);
    expect(sdk.chamadas.close).toHaveLength(0);
    expect(sdk.chamadas.update[0].publicData.avisoPreVerificacao).toBeTruthy();
  });

  it('não se avisa duas vezes', async () => {
    const sdk = sdkFalso([
      anuncio({ preVerificacaoDesde: haDias(70), avisoPreVerificacao: haDias(2) }),
    ]);
    const r = await correr(sdk, AGORA);

    expect(r.avisados).toBe(0);
    expect(sdk.chamadas.update).toHaveLength(0);
  });
});

describe('o fecho', () => {
  it('seis dias depois do aviso ainda não fecha', async () => {
    const sdk = sdkFalso([
      anuncio({ preVerificacaoDesde: haDias(66), avisoPreVerificacao: haDias(6) }),
    ]);
    await correr(sdk, AGORA);

    expect(sdk.chamadas.close).toHaveLength(0);
  });

  it('sete dias depois do aviso fecha', async () => {
    const sdk = sdkFalso([
      anuncio({ preVerificacaoDesde: haDias(67), avisoPreVerificacao: haDias(7) }),
    ]);
    const r = await correr(sdk, AGORA);

    expect(r.fechados).toBe(1);
    expect(sdk.chamadas.close[0].id).toBe('l-1');
  });

  /**
   * O caso que não pode acontecer de maneira nenhuma: fechar sem ter avisado.
   * Mesmo um anúncio parado há um ano tem direito aos sete dias.
   */
  it('nunca fecha sem ter avisado, por muito antigo que seja', async () => {
    const sdk = sdkFalso([anuncio({ preVerificacaoDesde: haDias(400) })]);
    const r = await correr(sdk, AGORA, resendQueEnvia());

    expect(sdk.chamadas.close).toHaveLength(0);
    expect(r.avisados).toBe(1);
  });
});

/**
 * O aviso e o carimbo têm de andar juntos. Se o email falhar e o anúncio
 * ficasse na mesma marcado como avisado, começava a contar os sete dias para
 * um fecho que o anfitrião nunca soube que vinha — exactamente o contrário do
 * que a regra existe para fazer.
 */
describe('quando o email do aviso falha', () => {
  const resendPartido = { emails: { send: async () => { throw new Error('sem rede'); } } };

  it('o anúncio não fica marcado como avisado', async () => {
    const sdk = sdkFalso([anuncio({ preVerificacaoDesde: haDias(60) })]);
    const r = await correr(sdk, AGORA, resendPartido);

    expect(r.avisados).toBe(0);
    expect(sdk.chamadas.update).toHaveLength(0);
    expect(sdk.chamadas.close).toHaveLength(0);
  });

  it('e volta a tentar na passagem seguinte', async () => {
    const sdk = sdkFalso([anuncio({ preVerificacaoDesde: haDias(60) })]);
    const resendBom = resendQueEnvia();

    await correr(sdk, AGORA, resendPartido);
    const r = await correr(sdk, AGORA + 24 * 60 * 60 * 1000, resendBom);

    expect(r.avisados).toBe(1);
  });
});

describe('quem se verifica entretanto', () => {
  it('fica com os carimbos apagados e não é fechado', async () => {
    const sdk = sdkFalso([
      anuncio(
        { preVerificacaoDesde: haDias(90), avisoPreVerificacao: haDias(30) },
        AUTOR_VERIFICADO
      ),
    ]);
    const r = await correr(sdk, AGORA);

    expect(sdk.chamadas.close).toHaveLength(0);
    expect(r.limpos).toBe(1);
    expect(sdk.chamadas.update[0].publicData).toEqual({
      preVerificacaoDesde: null,
      avisoPreVerificacao: null,
    });
  });
});

/**
 * As contas verificadas antes desta regra nunca tiveram `podeReceberReservas`
 * escrito. Se a ausência contasse como "por verificar", este trabalho fechava
 * os anúncios que hoje funcionam — em silêncio, de madrugada.
 */
describe('contas anteriores a esta regra', () => {
  it('não são tocadas', async () => {
    const sdk = sdkFalso([anuncio({ preVerificacaoDesde: haDias(400) }, AUTOR_ANTIGO)]);
    const r = await correr(sdk, AGORA);

    expect(sdk.chamadas.close).toHaveLength(0);
    expect(r.avisados).toBe(0);
    // Tinha carimbos de quando esteve por verificar: limpam-se.
    expect(r.limpos).toBe(1);
  });
});
