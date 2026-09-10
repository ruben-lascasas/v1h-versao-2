const { commissionModelFor, resolveCommission, hostMetadataFrom } = require('./hostCommission');

// A comissão que a Console devolve hoje. Os números são de propósito diferentes
// dos nossos: os testes abaixo provam que a Console não decide nada.
const CONSOLE = {
  providerCommission: { percentage: 15 },
  customerCommission: { percentage: 0 },
};

describe('modelos de comissão', () => {
  it('Fundador aplica 5% ao anfitrião e nada ao hóspede', () => {
    expect(commissionModelFor({ commissionModel: 'fundador' })).toEqual({
      key: 'fundador',
      provider: 5,
      customer: 0,
    });
  });

  it('Standard aplica 12,5% ao anfitrião e nada ao hóspede', () => {
    expect(commissionModelFor({ commissionModel: 'standard' })).toEqual({
      key: 'standard',
      provider: 12.5,
      customer: 0,
    });
  });

  it('aceita o nome com espaços e maiúsculas', () => {
    expect(commissionModelFor({ commissionModel: '  Fundador ' }).provider).toBe(5);
  });

  // Sem modelo gravado a conta não fica sem taxa: fica na taxa cheia.
  it('sem modelo gravado aplica o standard', () => {
    expect(commissionModelFor({}).key).toBe('standard');
    expect(commissionModelFor(null).key).toBe('standard');
    expect(commissionModelFor(undefined).provider).toBe(12.5);
  });

  // Um erro de escrita na metadata nunca pode virar desconto.
  it('um modelo desconhecido cai no standard, não num desconto', () => {
    const m = commissionModelFor({ commissionModel: 'ouro' });
    expect(m.key).toBe('standard');
    expect(m.provider).toBe(12.5);
  });

  // Só existem estes dois. Se alguém acrescentar um terceiro sem pensar no
  // popup, na FAQ e na facturação, é aqui que dá o berro.
  it('existem exactamente dois modelos', () => {
    expect(Object.keys(require('./hostCommission').MODELS).sort()).toEqual([
      'fundador',
      'standard',
    ]);
  });
});

describe('resolveCommission', () => {
  // A percentagem da Console é sempre descartada — há um só sítio onde a
  // comissão vive, e é o código.
  it('sem modelo atribuído ignora a Console e aplica o standard', () => {
    const r = resolveCommission(CONSOLE, {});
    expect(r.providerCommission.percentage).toBe(12.5);
    expect(r.appliedModel).toBe('standard');
  });

  it('com modelo atribuído substitui as percentagens', () => {
    const r = resolveCommission(CONSOLE, { commissionModel: 'fundador' });
    expect(r.providerCommission.percentage).toBe(5);
    expect(r.appliedModel).toBe('fundador');
  });

  // O mínimo continua a ser um mínimo, seja qual for o modelo.
  it('preserva o minimum_amount da Console', () => {
    const r = resolveCommission(
      { providerCommission: { percentage: 15, minimum_amount: 500 }, customerCommission: {} },
      { commissionModel: 'standard' }
    );
    expect(r.providerCommission).toEqual({ percentage: 12.5, minimum_amount: 500 });
  });

  it('funciona quando a Console não devolve comissão nenhuma', () => {
    const r = resolveCommission({}, { commissionModel: 'standard' });
    expect(r.providerCommission).toEqual({ percentage: 12.5 });
    expect(r.customerCommission).toEqual({ percentage: 0 });
  });

  // A Console tem hoje 5% ao hóspede. Este teste é o que garante que esse
  // valor nunca mais chega ao checkout.
  it('a taxa do hóspede da Console é descartada', () => {
    const r = resolveCommission(
      { providerCommission: {}, customerCommission: { percentage: 5, minimum_amount: 0 } },
      { commissionModel: 'standard' }
    );
    expect(r.customerCommission).toEqual({ percentage: 0 });
  });

  // Um mínimo do lado do hóspede sobreviveria à percentagem zero e cobrava-lhe
  // uma taxa fixa. Tem de desaparecer com ela.
  it('um mínimo do lado do hóspede também não passa', () => {
    const r = resolveCommission(
      { providerCommission: {}, customerCommission: { percentage: 5, minimum_amount: 300 } },
      { commissionModel: 'fundador' }
    );
    expect(r.customerCommission.minimum_amount).toBeUndefined();
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
      { type: 'user', attributes: { profile: { metadata: { commissionModel: 'fundador' } } } },
    ]);
    expect(hostMetadataFrom(r)).toEqual({ commissionModel: 'fundador' });
  });

  // Se o autor não vier, o cálculo do preço não pode falhar.
  it('devolve vazio quando o autor não vem incluído', () => {
    expect(hostMetadataFrom(response([{ type: 'listing', attributes: {} }]))).toEqual({});
    expect(hostMetadataFrom(response(undefined))).toEqual({});
    expect(hostMetadataFrom(undefined)).toEqual({});
  });

  // Sem autor não há como saber se é fundador, e aí cobra-se a taxa cheia.
  it('em conjunto: autor ausente cai no standard', () => {
    const r = resolveCommission(CONSOLE, hostMetadataFrom(undefined));
    expect(r.providerCommission.percentage).toBe(12.5);
  });
});

describe('o dinheiro numa reserva de 100 €', () => {
  const pct = (base, p) => (base * p) / 100;

  // O hóspede paga sempre o preço do anúncio e mais nada. A comissão sai toda
  // do lado de quem recebe.
  it('Standard: hóspede paga 100, anfitrião recebe 87,50', () => {
    const { providerCommission, customerCommission } = resolveCommission(CONSOLE, {
      commissionModel: 'standard',
    });
    const provider = pct(100, providerCommission.percentage);
    const customer = pct(100, customerCommission.percentage);
    expect(customer).toBe(0); // hóspede paga 100
    expect(100 - provider).toBe(87.5); // anfitrião recebe 87,50
    expect(provider + customer).toBe(12.5); // receita Venue1Hub
  });

  // O que o popup promete a quem se registar dentro do prazo.
  it('Fundador: hóspede paga 100, anfitrião recebe 95', () => {
    const { providerCommission, customerCommission } = resolveCommission(CONSOLE, {
      commissionModel: 'fundador',
    });
    const provider = pct(100, providerCommission.percentage);
    expect(pct(100, customerCommission.percentage)).toBe(0);
    expect(100 - provider).toBe(95); // anfitrião recebe 95
  });

});
