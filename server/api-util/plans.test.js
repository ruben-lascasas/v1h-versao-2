const {
  FREE,
  PRO,
  BUSINESS,
  ENTERPRISE,
  normalisePlan,
  metadataForPlan,
  priceIdFor,
  planForPriceId,
  publicCatalogue,
} = require('./plans');
const { resolveCommission } = require('./hostCommission');

describe('normalisePlan', () => {
  it('aceita os quatro planos', () => {
    expect(normalisePlan('pro')).toBe(PRO);
    expect(normalisePlan('BUSINESS')).toBe(BUSINESS);
    expect(normalisePlan(' enterprise ')).toBe(ENTERPRISE);
  });

  it('cai no Gratuito perante lixo', () => {
    expect(normalisePlan('ouro')).toBe(FREE);
    expect(normalisePlan(null)).toBe(FREE);
    expect(normalisePlan(42)).toBe(FREE);
  });
});

describe('metadataForPlan', () => {
  it('Gratuito e Pro ficam ambos em Standard', () => {
    expect(metadataForPlan(FREE)).toEqual({ plan: FREE, commissionModel: 'standard' });
    expect(metadataForPlan(PRO)).toEqual({ plan: PRO, commissionModel: 'standard' });
  });

  it('Business fica em Enterprise com 8% de tabela', () => {
    expect(metadataForPlan(BUSINESS)).toEqual({
      plan: BUSINESS,
      commissionModel: 'enterprise',
      commissionProviderPercentage: 8,
    });
  });

  // O Enterprise é negociado caso a caso: não se escreve percentagem nenhuma,
  // para não esmagar um valor acordado à mão.
  it('Enterprise não traz percentagem', () => {
    expect(metadataForPlan(ENTERPRISE)).toEqual({
      plan: ENTERPRISE,
      commissionModel: 'enterprise',
    });
  });
});

// O ponto de ligação entre os dois módulos: o que os planos escrevem tem de ser
// exactamente o que o motor de comissões lê.
describe('planos ligados ao motor de comissões', () => {
  const CONSOLE = { providerCommission: { percentage: 15 }, customerCommission: { percentage: 0 } };
  const percentagesFor = plan => {
    const { providerCommission, customerCommission } = resolveCommission(
      CONSOLE,
      metadataForPlan(plan)
    );
    return [providerCommission.percentage, customerCommission.percentage];
  };

  it('Gratuito paga 10% + 5%', () => expect(percentagesFor(FREE)).toEqual([10, 5]));
  it('Pro paga o mesmo que o Gratuito', () => expect(percentagesFor(PRO)).toEqual([10, 5]));
  it('Business paga 8% + 5%', () => expect(percentagesFor(BUSINESS)).toEqual([8, 5]));

  // Sem valor negociado, o Enterprise fica no topo do intervalo — nunca a
  // beneficiar de um desconto que ninguém concedeu.
  it('Enterprise sem negociação fica em 12% + 5%', () =>
    expect(percentagesFor(ENTERPRISE)).toEqual([12, 5]));

  // A escada tem de subir: quanto mais caro o plano, menor a comissão.
  it('a comissão do anfitrião nunca sobe com o plano', () => {
    const [gratuito] = percentagesFor(FREE);
    const [pro] = percentagesFor(PRO);
    const [business] = percentagesFor(BUSINESS);
    expect(pro).toBeLessThanOrEqual(gratuito);
    expect(business).toBeLessThan(pro);
  });

  // O que estava errado na leitura literal do plano de negócios: com o Pro a
  // 12%, assinar custava sempre mais do que não assinar.
  it('assinar o Pro nunca sai mais caro que o Gratuito em comissão', () => {
    const reservas = 1000;
    const custoGratuito = (reservas * percentagesFor(FREE)[0]) / 100;
    const custoPro = 19 + (reservas * percentagesFor(PRO)[0]) / 100;
    expect(custoPro - custoGratuito).toBe(19); // exactamente a mensalidade, nada mais
  });

  it('o Business compensa-se acima de ~2.950 € de reservas por mês', () => {
    const custo = (reservas, mensalidade, pct) => mensalidade + (reservas * pct) / 100;
    const gratuito = r => custo(r, 0, percentagesFor(FREE)[0]);
    const business = r => custo(r, 59, percentagesFor(BUSINESS)[0]);
    expect(business(2000)).toBeGreaterThan(gratuito(2000));
    expect(business(3500)).toBeLessThan(gratuito(3500));
  });
});

describe('Price IDs vindos do ambiente', () => {
  const OLD = process.env;
  beforeEach(() => {
    process.env = { ...OLD, STRIPE_PRICE_PRO_MONTH: 'price_pro_m', STRIPE_PRICE_BUSINESS_YEAR: 'price_biz_y' };
  });
  afterEach(() => {
    process.env = OLD;
  });

  it('encontra o price configurado', () => {
    expect(priceIdFor(PRO, 'month')).toBe('price_pro_m');
    expect(priceIdFor(BUSINESS, 'year')).toBe('price_biz_y');
  });

  it('devolve null quando não está configurado', () => {
    expect(priceIdFor(PRO, 'year')).toBeNull();
  });

  it('planos que não se compram não têm price', () => {
    expect(priceIdFor(FREE, 'month')).toBeNull();
    expect(priceIdFor(ENTERPRISE, 'month')).toBeNull();
  });

  it('faz o caminho inverso, do price para o plano', () => {
    expect(planForPriceId('price_pro_m')).toEqual({ plan: PRO, interval: 'month' });
    expect(planForPriceId('price_biz_y')).toEqual({ plan: BUSINESS, interval: 'year' });
    expect(planForPriceId('price_desconhecido')).toBeNull();
    expect(planForPriceId(null)).toBeNull();
  });

  it('o catálogo marca como indisponível o que não tem price', () => {
    const cat = publicCatalogue();
    const byKey = Object.fromEntries(cat.map(p => [p.key, p]));
    expect(byKey[PRO].available).toBe(true); // tem o mensal
    expect(byKey[BUSINESS].available).toBe(true); // tem o anual
    expect(byKey[FREE].available).toBe(true); // não precisa de price
  });

  it('o catálogo não expõe nomes de variáveis de ambiente', () => {
    expect(JSON.stringify(publicCatalogue())).not.toMatch(/STRIPE_/);
  });
});
