const {
  MODELS,
  resolveCommission,
  modeloParaConta,
  ensureCommissionModel,
  limiteFundador,
} = require('./hostCommission');

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
    it('fundador paga metade do standard', () => {
      expect(MODELS.fundador.provider).toBe(5);
      expect(MODELS.standard.provider).toBe(10);
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

    it('standard: 10% ao anfitrião', () => {
      const r = resolveCommission(consola, { commissionModel: 'standard' });
      expect(r.providerCommission.percentage).toBe(10);
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
});
