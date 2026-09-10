const {
  MODELS,
  resolveCommission,
  modeloParaConta,
  ensureCommissionModel,
  limiteFundador,
  vagasFundador,
} = require('./hostCommission');
const { calculateTotalPriceFromPercentage } = require('./lineItemHelpers');
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

    it('a comissão do cliente não muda com a campanha', () => {
      // A promoção é sobre o que se cobra ao anfitrião. O hóspede paga o mesmo.
      expect(MODELS.fundador.customer).toBe(MODELS.standard.customer);
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

    it('não sobrepõe condições já negociadas', async () => {
      // Um anfitrião com acordo próprio não pode ser reposto para standard por
      // uma passagem automática.
      const u = conta('2027-06-01T10:00:00Z', {
        publicData: { userType: 'anunciante' },
        metadata: { commissionModel: 'enterprise' },
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

    it('fundador: 5% ao anfitrião, 5% ao cliente', () => {
      const r = resolveCommission(consola, { commissionModel: 'fundador' });
      expect(r.providerCommission.percentage).toBe(5);
      expect(r.customerCommission.percentage).toBe(5);
      expect(r.appliedModel).toBe('fundador');
    });

    it('standard: 12,5% ao anfitrião', () => {
      const r = resolveCommission(consola, { commissionModel: 'standard' });
      expect(r.providerCommission.percentage).toBe(12.5);
    });

    it('sem modelo gravado usa o valor da Console', () => {
      const r = resolveCommission(consola, {});
      expect(r.providerCommission.percentage).toBe(10);
      expect(r.appliedModel).toBeNull();
    });

    it('o mínimo da Console é preservado seja qual for o modelo', () => {
      const comMinimo = {
        providerCommission: { percentage: 10, minimum_amount: 250 },
        customerCommission: { percentage: 5, minimum_amount: 100 },
      };
      const r = resolveCommission(comMinimo, { commissionModel: 'fundador' });
      expect(r.providerCommission.minimum_amount).toBe(250);
      expect(r.customerCommission.minimum_amount).toBe(100);
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
});
