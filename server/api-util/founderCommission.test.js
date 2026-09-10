const {
  MODELS,
  resolveCommission,
  modeloParaConta,
  ensureCommissionModel,
  limiteFundador,
  vagasFundador,
} = require('./hostCommission');
const { calculateTotalPriceFromPercentage, constructValidLineItems } = require('./lineItemHelpers');
const { transactionLineItems } = require('./lineItems');
const { types } = require('sharetribe-flex-sdk');
const { Money } = types;

const LIMITE = '2026-12-31T23:59:59Z';

const conta = (createdAt, over = {}) => ({
  id: { uuid: 'u-1' },
  attributes: {
    createdAt,
    profile: {
      publicData: { userType: 'anunciante' },
      metadata: {},
      ...over,
    },
  },
});

describe('condição de fundador', () => {
  const antes = process.env.FOUNDER_COMMISSION_UNTIL;
  beforeEach(() => {
    process.env.FOUNDER_COMMISSION_UNTIL = LIMITE;
  });
  afterAll(() => {
    if (antes === undefined) delete process.env.FOUNDER_COMMISSION_UNTIL;
    else process.env.FOUNDER_COMMISSION_UNTIL = antes;
  });

  describe('percentagens', () => {
    // O popup anuncia "menos de metade". Se um dia estas duas percentagens se
    // aproximarem, é este teste que avisa antes de o site ficar a prometer
    // aquilo que já não dá.
    it('fundador paga menos de metade do standard', () => {
      expect(MODELS.fundador.provider).toBe(5);
      expect(MODELS.standard.provider).toBe(12.5);
      expect(MODELS.fundador.provider).toBeLessThan(MODELS.standard.provider / 2);
    });

    it('nenhum dos modelos cobra nada ao hóspede', () => {
      // A comissão sai toda do lado de quem recebe. O hóspede paga o preço do
      // anúncio, seja o anfitrião fundador ou não.
      expect(MODELS.fundador.customer).toBe(0);
      expect(MODELS.standard.customer).toBe(0);
    });
  });

  describe('quem entra na campanha', () => {
    it('quem se registou antes do limite é fundador', () => {
      expect(modeloParaConta(conta('2026-09-08T10:00:00Z'))).toBe('fundador');
    });

    it('no próprio limite ainda entra', () => {
      expect(modeloParaConta(conta(LIMITE))).toBe('fundador');
    });

    it('um segundo depois já não entra', () => {
      expect(modeloParaConta(conta('2027-01-01T00:00:01Z'))).toBe('standard');
    });

    it('prestadores de serviços também entram — também pagam comissão', () => {
      const u = conta('2026-09-08T10:00:00Z', {
        publicData: { userType: 'prestador_de_servicos' },
      });
      expect(modeloParaConta(u)).toBe('fundador');
    });

    it('um visitante fica de fora — não ganha comissão nenhuma', () => {
      const u = conta('2026-09-08T10:00:00Z', { publicData: { userType: 'visitante' } });
      expect(modeloParaConta(u)).toBeNull();
    });

    it('sem data limite configurada não há campanha', () => {
      // Preferimos não marcar ninguém a assumir uma data: dar 5% por engano é
      // dinheiro que não se recupera.
      delete process.env.FOUNDER_COMMISSION_UNTIL;
      expect(limiteFundador()).toBeNull();
      expect(modeloParaConta(conta('2026-09-08T10:00:00Z'))).toBeNull();
    });

    it('uma data limite inválida também não marca ninguém', () => {
      process.env.FOUNDER_COMMISSION_UNTIL = 'dezembro';
      expect(limiteFundador()).toBeNull();
    });
  });

  describe('gravar na conta', () => {
    let gravado;
    const sdk = {
      users: {
        // Sem fundadores marcados: há vagas de sobra, e estes testes são sobre
        // a gravação, não sobre o limite.
        query: async () => ({ data: { data: [], meta: { totalPages: 1 } } }),
        updateProfile: async p => {
          gravado = p;
          return {};
        },
      },
    };
    beforeEach(() => {
      gravado = null;
    });

    it('grava o modelo e a data em que foi decidido', async () => {
      const r = await ensureCommissionModel(sdk, conta('2026-09-08T10:00:00Z'));
      expect(r).toBe('fundador');
      expect(gravado.metadata.commissionModel).toBe('fundador');
      expect(gravado.metadata.commissionModelSetAt).toBeTruthy();
    });

    it('não volta a escrever por cima do que já está gravado', async () => {
      // A marcação é feita uma vez e nunca mais. Sem isto, uma alteração à data
      // limite podia mexer no que já tinha sido prometido a alguém.
      const u = conta('2027-06-01T10:00:00Z', {
        publicData: { userType: 'anunciante' },
        metadata: { commissionModel: 'fundador' },
      });
      expect(await ensureCommissionModel(sdk, u)).toBeNull();
      expect(gravado).toBeNull();
    });

    it('não despromove um fundador depois de a campanha acabar', async () => {
      const u = conta('2026-09-08T10:00:00Z', {
        publicData: { userType: 'anunciante' },
        metadata: { commissionModel: 'fundador' },
      });
      expect(await ensureCommissionModel(sdk, u)).toBeNull();
      expect(gravado).toBeNull();
    });
  });

  describe('limite de vagas', () => {
    let gravado;
    const sdkCom = fundadores => ({
      users: {
        // A varredura devolve `fundadores` contas já marcadas.
        query: async () => ({
          data: {
            data: Array.from({ length: fundadores }, () => ({
              attributes: { profile: { metadata: { commissionModel: 'fundador' } } },
            })),
            meta: { totalPages: 1 },
          },
        }),
        updateProfile: async p => {
          gravado = p;
          return {};
        },
      },
    });

    beforeEach(() => {
      gravado = null;
      process.env.FOUNDER_COMMISSION_MAX = '100';
    });
    afterAll(() => delete process.env.FOUNDER_COMMISSION_MAX);

    it('a vaga 100 ainda é fundador', async () => {
      const r = await ensureCommissionModel(sdkCom(99), conta('2026-09-08T10:00:00Z'));
      expect(r).toBe('fundador');
    });

    it('a 101 já não é — passa a standard mesmo dentro do prazo', async () => {
      // A campanha acaba no que vier primeiro: prazo ou vagas.
      const r = await ensureCommissionModel(sdkCom(100), conta('2026-09-08T10:00:00Z'));
      expect(r).toBe('standard');
      expect(gravado.metadata.commissionModel).toBe('standard');
    });

    it('quem chega fora do prazo não consome vaga nenhuma', async () => {
      // Já era standard pela data; as vagas nem são consultadas.
      const r = await ensureCommissionModel(sdkCom(0), conta('2027-03-01T10:00:00Z'));
      expect(r).toBe('standard');
    });

    it('a contagem pode ser passada de fora, para processar em série', async () => {
      // O script de marcação percorre centenas de contas: varrer os
      // utilizadores todos a cada uma seria absurdo.
      const sdkQueExplode = {
        users: {
          query: async () => {
            throw new Error('não devia ter sido chamado');
          },
          updateProfile: async p => {
            gravado = p;
            return {};
          },
        },
      };
      const r = await ensureCommissionModel(sdkQueExplode, conta('2026-09-08T10:00:00Z'), {
        jaMarcados: 100,
      });
      expect(r).toBe('standard');
    });

    it('o limite é configurável', async () => {
      process.env.FOUNDER_COMMISSION_MAX = '3';
      expect(await ensureCommissionModel(sdkCom(2), conta('2026-09-08T10:00:00Z'))).toBe('fundador');
      expect(await ensureCommissionModel(sdkCom(3), conta('2026-09-08T10:00:00Z'))).toBe('standard');
    });
  });

  describe('o que a reserva acaba por cobrar', () => {
    const consola = {
      providerCommission: { percentage: 10, minimum_amount: 0 },
      customerCommission: { percentage: 5, minimum_amount: 0 },
    };

    it('fundador: 5% ao anfitrião, nada ao hóspede', () => {
      const r = resolveCommission(consola, { commissionModel: 'fundador' });
      expect(r.providerCommission.percentage).toBe(5);
      expect(r.customerCommission.percentage).toBe(0);
      expect(r.appliedModel).toBe('fundador');
    });

    it('standard: 12,5% ao anfitrião', () => {
      const r = resolveCommission(consola, { commissionModel: 'standard' });
      expect(r.providerCommission.percentage).toBe(12.5);
    });

    // Mesmo com a Console noutro valor. Quem ainda não foi marcado paga a taxa
    // cheia; a condição de fundador é a única que precisa de estar gravada.
    it('sem modelo gravado paga o standard, não o valor da Console', () => {
      const r = resolveCommission(consola, {});
      expect(consola.providerCommission.percentage).toBe(10);
      expect(r.providerCommission.percentage).toBe(12.5);
      expect(r.appliedModel).toBe('standard');
    });

    // Do lado do anfitrião o mínimo faz sentido e mantém-se. Do lado do
    // hóspede não, porque ele não paga taxa nenhuma.
    it('o mínimo da Console é preservado do lado do anfitrião', () => {
      const comMinimo = {
        providerCommission: { percentage: 10, minimum_amount: 250 },
        customerCommission: { percentage: 5, minimum_amount: 100 },
      };
      const r = resolveCommission(comMinimo, { commissionModel: 'fundador' });
      expect(r.providerCommission.minimum_amount).toBe(250);
      expect(r.customerCommission).toEqual({ percentage: 0 });
    });
  });

  // Uma taxa com casa decimal produz meios cêntimos, e meio cêntimo não existe
  // em nenhum processador de pagamentos. Estes casos fixam o que acontece nessa
  // fronteira, para a mudança de 10% para 12,5% não trazer um cêntimo perdido
  // sem ninguém dar por isso.
  describe('12,5% em cêntimos', () => {
    const comissao = (cents, taxa) =>
      calculateTotalPriceFromPercentage(new Money(cents, 'EUR'), taxa).amount;

    it('valores redondos dão contas exactas', () => {
      expect(comissao(10000, 12.5)).toBe(1250); // 100,00 € → 12,50 €
      expect(comissao(8000, 12.5)).toBe(1000); // 80,00 € → 10,00 €
    });

    it('o meio cêntimo arredonda para cima, não desaparece', () => {
      // 12,04 € × 12,5% = 1,505 €. Sem arredondamento explícito ficava 1,50 € e
      // a plataforma perdia o meio cêntimo em cada reserva destas.
      expect(comissao(1204, 12.5)).toBe(151);
      expect(comissao(1212, 12.5)).toBe(152); // 1,515 → 1,52
    });

    it('o resultado é sempre inteiro — não há meios cêntimos a sair daqui', () => {
      for (let cents = 1; cents <= 2000; cents++) {
        expect(Number.isInteger(comissao(cents, 12.5))).toBe(true);
      }
    });
  });

  // Os testes acima olham para as percentagens. Este passa uma reserva pelo
  // mesmo caminho que o endpoint usa — `resolveCommission` seguido de
  // `transactionLineItems` — e conta o dinheiro no fim. É o que apanha uma
  // regressão que as percentagens sozinhas não mostrariam.
  describe('uma reserva inteira, do princípio ao fim', () => {
    // Os valores que a Console devolve hoje, verificados na API a 2026-09-10.
    const consolaReal = {
      providerCommission: { percentage: 10, minimum_amount: 0 },
      customerCommission: { percentage: 5, minimum_amount: 0 },
    };

    const anuncioDe100 = {
      attributes: {
        price: new Money(10000, 'EUR'),
        publicData: { unitType: 'day' },
      },
    };
    const umDia = {
      bookingStart: new Date('2026-10-01T00:00:00Z'),
      bookingEnd: new Date('2026-10-02T00:00:00Z'),
    };

    const contas = metadata => {
      const { providerCommission, customerCommission } = resolveCommission(consolaReal, metadata);
      const linhas = transactionLineItems(
        anuncioDe100,
        umDia,
        providerCommission,
        customerCommission
      );
      const validas = constructValidLineItems(linhas);
      const total = c => validas.find(l => l.code === `line-item/${c}`)?.lineTotal?.amount ?? null;
      return { base: total('day'), anfitriao: total('provider-commission'), hospede: total('customer-commission') };
    };

    it('standard: hóspede paga 100,00 e o anfitrião fica com 87,50', () => {
      const { base, anfitriao, hospede } = contas({ commissionModel: 'standard' });
      expect(base).toBe(10000);
      expect(anfitriao).toBe(-1250); // negativo: é o que se retira ao anfitrião
      expect(hospede).toBeNull(); // a linha nem chega a existir
    });

    it('fundador: hóspede paga 100,00 e o anfitrião fica com 95,00', () => {
      const { anfitriao, hospede } = contas({ commissionModel: 'fundador' });
      expect(anfitriao).toBe(-500);
      expect(hospede).toBeNull();
    });

    // A Console continua a dizer 5% ao hóspede. Se algum dia isto falhar, é
    // porque esse valor voltou a chegar ao checkout.
    it('a linha de taxa ao hóspede não é criada em nenhum dos casos', () => {
      expect(consolaReal.customerCommission.percentage).toBe(5);
      expect(contas({}).hospede).toBeNull();
      expect(contas({ commissionModel: 'fundador' }).hospede).toBeNull();
    });
  });
});
