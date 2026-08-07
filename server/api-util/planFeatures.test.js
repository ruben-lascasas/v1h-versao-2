const { allows, featuresFor, rankOf } = require('./planFeatures');
const { FREE, PRO, BUSINESS, ENTERPRISE } = require('./plans');

describe('ordem dos planos', () => {
  it('sobe do Gratuito ao Enterprise', () => {
    expect(rankOf(FREE)).toBeLessThan(rankOf(PRO));
    expect(rankOf(PRO)).toBeLessThan(rankOf(BUSINESS));
    expect(rankOf(BUSINESS)).toBeLessThan(rankOf(ENTERPRISE));
  });

  it('um plano desconhecido vale o mesmo que o Gratuito', () => {
    expect(rankOf('ouro')).toBe(rankOf(FREE));
    expect(rankOf(null)).toBe(rankOf(FREE));
  });
});

describe('acesso por funcionalidade', () => {
  it('o Gratuito não tem nenhuma das funcionalidades pagas', () => {
    expect(allows(FREE, 'detailedStats')).toBe(false);
    expect(allows(FREE, 'monthlyReports')).toBe(false);
    expect(allows(FREE, 'advancedReports')).toBe(false);
  });

  it('o Pro tem estatísticas e relatórios mensais, mas não os avançados', () => {
    expect(allows(PRO, 'detailedStats')).toBe(true);
    expect(allows(PRO, 'monthlyReports')).toBe(true);
    expect(allows(PRO, 'advancedReports')).toBe(false);
  });

  it('o Business tem tudo o que o Pro tem, mais os avançados', () => {
    expect(allows(BUSINESS, 'detailedStats')).toBe(true);
    expect(allows(BUSINESS, 'monthlyReports')).toBe(true);
    expect(allows(BUSINESS, 'advancedReports')).toBe(true);
  });

  it('o Enterprise tem tudo', () => {
    Object.values(featuresFor(ENTERPRISE)).forEach(v => expect(v).toBe(true));
  });

  // Um erro de escrita no nome não pode abrir o que não devia.
  it('uma funcionalidade desconhecida falha fechada, mesmo no Enterprise', () => {
    expect(allows(ENTERPRISE, 'relatoriosMagicos')).toBe(false);
    expect(allows(ENTERPRISE, undefined)).toBe(false);
  });

  it('um plano em lixo não desbloqueia nada', () => {
    expect(allows('ouro', 'detailedStats')).toBe(false);
    expect(allows(undefined, 'detailedStats')).toBe(false);
  });
});

describe('mapa enviado ao frontend', () => {
  it('traz todas as funcionalidades, com booleanos', () => {
    const f = featuresFor(PRO);
    expect(Object.keys(f).sort()).toEqual(
      ['advancedReports', 'detailedStats', 'monthlyReports'].sort()
    );
    Object.values(f).forEach(v => expect(typeof v).toBe('boolean'));
  });

  // Cada degrau tem de dar pelo menos tanto quanto o anterior, senão a escada
  // de preços deixa de fazer sentido.
  it('nenhum plano perde uma funcionalidade que o anterior tinha', () => {
    const order = [FREE, PRO, BUSINESS, ENTERPRISE];
    for (let i = 1; i < order.length; i++) {
      const anterior = featuresFor(order[i - 1]);
      const actual = featuresFor(order[i]);
      Object.keys(anterior).forEach(k => {
        if (anterior[k]) expect(actual[k]).toBe(true);
      });
    }
  });
});
