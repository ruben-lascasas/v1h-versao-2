const {
  commissionModelFor,
  resolveCommission,
  hostMetadataFrom,
  ENTERPRISE_MIN,
  ENTERPRISE_MAX,
} = require('./hostCommission');

// A comissão que a Console devolve hoje: 15% para o anfitrião, nada ao cliente.
const CONSOLE = {
  providerCommission: { percentage: 15 },
  customerCommission: { percentage: 0 },
};

describe('modelos de comissão', () => {
  it('Standard aplica 10% ao anfitrião e 5% ao cliente', () => {
    const m = commissionModelFor({ commissionModel: 'standard' });
    expect(m).toEqual({ key: 'standard', provider: 10, customer: 5 });
  });

  it('Premium aplica 12% ao anfitrião e 5% ao cliente', () => {
    const m = commissionModelFor({ commissionModel: 'premium' });
    expect(m).toEqual({ key: 'premium', provider: 12, customer: 5 });
  });

  it('aceita o nome com espaços e maiúsculas', () => {
    expect(commissionModelFor({ commissionModel: '  Premium ' }).provider).toBe(12);
  });

  it('ignora um modelo desconhecido em vez de inventar uma taxa', () => {
    expect(commissionModelFor({ commissionModel: 'ouro' })).toBeNull();
    expect(commissionModelFor({})).toBeNull();
    expect(commissionModelFor(null)).toBeNull();
  });
});

describe('Enterprise negociado', () => {
  it('usa a percentagem negociada quando está dentro do intervalo', () => {
    const m = commissionModelFor({
      commissionModel: 'enterprise',
      commissionProviderPercentage: 9,
    });
    expect(m.provider).toBe(9);
  });

  it('sem valor negociado fica no topo do intervalo', () => {
    expect(commissionModelFor({ commissionModel: 'enterprise' }).provider).toBe(ENTERPRISE_MAX);
  });

  // Um erro de digitação na metadata não pode custar comissão nem afastar um
  // cliente com uma taxa absurda.
  it('trava valores abaixo do mínimo acordado', () => {
    const m = commissionModelFor({
      commissionModel: 'enterprise',
      commissionProviderPercentage: 2,
    });
    expect(m.provider).toBe(ENTERPRISE_MIN);
  });

  it('trava valores acima do máximo acordado', () => {
    const m = commissionModelFor({
      commissionModel: 'enterprise',
      commissionProviderPercentage: 40,
    });
    expect(m.provider).toBe(ENTERPRISE_MAX);
  });

  it('ignora um valor negociado que não seja número', () => {
    const m = commissionModelFor({
      commissionModel: 'enterprise',
      commissionProviderPercentage: 'nove',
    });
    expect(m.provider).toBe(ENTERPRISE_MAX);
  });

  // Só o Enterprise é negociável: pôr a percentagem na metadata de um anfitrião
  // Standard não lhe dá desconto nenhum.
  it('não deixa negociar fora do Enterprise', () => {
    const m = commissionModelFor({
      commissionModel: 'standard',
      commissionProviderPercentage: 3,
    });
    expect(m.provider).toBe(10);
  });
});

describe('resolveCommission', () => {
  it('sem modelo atribuído devolve a comissão da Console intacta', () => {
    const r = resolveCommission(CONSOLE, {});
    expect(r.providerCommission).toEqual({ percentage: 15 });
    expect(r.customerCommission).toEqual({ percentage: 0 });
    expect(r.appliedModel).toBeNull();
  });

  it('com modelo atribuído substitui as percentagens', () => {
    const r = resolveCommission(CONSOLE, { commissionModel: 'premium' });
    expect(r.providerCommission.percentage).toBe(12);
    expect(r.customerCommission.percentage).toBe(5);
    expect(r.appliedModel).toBe('premium');
  });

  // O mínimo continua a ser um mínimo, seja qual for o modelo.
  it('preserva o minimum_amount da Console', () => {
    const r = resolveCommission(
      { providerCommission: { percentage: 15, minimum_amount: 500 }, customerCommission: {} },
      { commissionModel: 'standard' }
    );
    expect(r.providerCommission).toEqual({ percentage: 10, minimum_amount: 500 });
  });

  it('funciona quando a Console não devolve comissão nenhuma', () => {
    const r = resolveCommission({}, { commissionModel: 'standard' });
    expect(r.providerCommission).toEqual({ percentage: 10 });
    expect(r.customerCommission).toEqual({ percentage: 5 });
  });

  it('não rebenta sem argumentos', () => {
    expect(() => resolveCommission(null, null)).not.toThrow();
  });
});

describe('hostMetadataFrom', () => {
  const response = included => ({ data: { data: {}, included } });

  it('encontra a metadata do autor incluído', () => {
    const r = response([
      { type: 'listing', attributes: {} },
      { type: 'user', attributes: { profile: { metadata: { commissionModel: 'premium' } } } },
    ]);
    expect(hostMetadataFrom(r)).toEqual({ commissionModel: 'premium' });
  });

  // Se o autor não vier, o cálculo do preço não pode falhar: cai na Console.
  it('devolve vazio quando o autor não vem incluído', () => {
    expect(hostMetadataFrom(response([{ type: 'listing', attributes: {} }]))).toEqual({});
    expect(hostMetadataFrom(response(undefined))).toEqual({});
    expect(hostMetadataFrom(undefined)).toEqual({});
  });

  it('em conjunto: autor ausente mantém a comissão da Console', () => {
    const r = resolveCommission(CONSOLE, hostMetadataFrom(undefined));
    expect(r.providerCommission.percentage).toBe(15);
  });
});

describe('exemplo do plano de negócios (§8.2)', () => {
  // Reserva de 100 €: cliente paga 105, anfitrião recebe 90, plataforma 15.
  const pct = (base, p) => (base * p) / 100;

  it('Standard: 15 € de receita sobre 100 €', () => {
    const { providerCommission, customerCommission } = resolveCommission(CONSOLE, {
      commissionModel: 'standard',
    });
    const provider = pct(100, providerCommission.percentage);
    const customer = pct(100, customerCommission.percentage);
    expect(customer).toBe(5); // cliente paga 105
    expect(100 - provider).toBe(90); // anfitrião recebe 90
    expect(provider + customer).toBe(15); // receita Venue1Hub
  });

  it('Premium: 17 € de receita sobre 100 €', () => {
    const { providerCommission, customerCommission } = resolveCommission(CONSOLE, {
      commissionModel: 'premium',
    });
    const provider = pct(100, providerCommission.percentage);
    const customer = pct(100, customerCommission.percentage);
    expect(100 - provider).toBe(88); // anfitrião recebe 88
    expect(provider + customer).toBe(17); // receita Venue1Hub
  });
});
