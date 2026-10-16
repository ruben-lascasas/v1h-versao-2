import { emPreVerificacao, ehOMeuAnuncioPorVerificar } from './preVerificacao';

const anuncioDe = (metadata, autorId = 'autor-1') => ({
  id: { uuid: 'l-1' },
  author: { id: { uuid: autorId }, attributes: { profile: { metadata } } },
});

describe('emPreVerificacao', () => {
  it('um anfitrião por verificar não recebe reservas', () => {
    expect(emPreVerificacao(anuncioDe({ podeReceberReservas: false }))).toBe(true);
  });

  it('um anfitrião verificado recebe', () => {
    expect(emPreVerificacao(anuncioDe({ podeReceberReservas: true }))).toBe(false);
  });

  /**
   * Isto é o caso que parte o site se for ao contrário. As contas que já
   * publicaram foram verificadas sob a regra antiga e nunca tiveram esta
   * marca escrita: se a ausência valesse "por verificar", o painel de reserva
   * desaparecia dos anúncios que hoje funcionam, no instante do deploy.
   */
  it('sem a marca escrita, não se assume o pior', () => {
    expect(emPreVerificacao(anuncioDe({}))).toBe(false);
    expect(emPreVerificacao(anuncioDe(undefined))).toBe(false);
    expect(emPreVerificacao(null)).toBe(false);
  });

  // Um valor estranho vindo da API não pode ligar a regra por acidente.
  it('só um `false` explícito conta', () => {
    expect(emPreVerificacao(anuncioDe({ podeReceberReservas: 'false' }))).toBe(false);
    expect(emPreVerificacao(anuncioDe({ podeReceberReservas: 0 }))).toBe(false);
  });
});

describe('ehOMeuAnuncioPorVerificar', () => {
  it('reconhece o dono, para lhe dizer o que falta', () => {
    const l = anuncioDe({ podeReceberReservas: false }, 'eu');
    expect(ehOMeuAnuncioPorVerificar(l, { id: { uuid: 'eu' } })).toBe(true);
  });

  it('quem chega de fora não é o dono', () => {
    const l = anuncioDe({ podeReceberReservas: false }, 'outro');
    expect(ehOMeuAnuncioPorVerificar(l, { id: { uuid: 'eu' } })).toBe(false);
  });

  it('nem quem não tem sessão iniciada', () => {
    const l = anuncioDe({ podeReceberReservas: false }, 'outro');
    expect(ehOMeuAnuncioPorVerificar(l, null)).toBe(false);
  });
});
