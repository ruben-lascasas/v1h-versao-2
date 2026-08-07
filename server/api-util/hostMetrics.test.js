const { detailedMetrics, isCancelled } = require('./hostMetrics');

const NOW = new Date('2026-08-15T12:00:00Z');

const tx = ({ id = 't', amount = 10000, transition = 'transition/complete', at = '2026-08-10', listing = 'l1' }) => ({
  id: { uuid: id },
  attributes: {
    lastTransition: transition,
    payinTotal: { amount, currency: 'EUR' },
    createdAt: `${at}T10:00:00Z`,
  },
  relationships: { listing: { data: { id: { uuid: listing } } } },
});

const listings = {
  l1: { attributes: { title: 'Sala Azul' } },
  l2: { attributes: { title: 'Auditório' } },
};

describe('detecção de cancelamentos', () => {
  // Os quatro processos usam nomes diferentes para o mesmo acto.
  it.each([
    'transition/cancel',
    'transition/customer-cancel-long-term',
    'transition/provider-cancel-long-term',
    'transition/operator-cancel-long-term-pending',
  ])('reconhece %s', t => {
    expect(isCancelled(tx({ transition: t }))).toBe(true);
  });

  it.each(['transition/complete', 'transition/accept', 'transition/review-1-by-customer'])(
    'não confunde %s com cancelamento',
    t => {
      expect(isCancelled(tx({ transition: t }))).toBe(false);
    }
  );

  it('aguenta uma transação sem transição', () => {
    expect(isCancelled({})).toBe(false);
    expect(isCancelled(null)).toBe(false);
  });
});

describe('ticket médio', () => {
  it('é a média do que foi efectivamente reservado', () => {
    const m = detailedMetrics(
      [tx({ amount: 10000 }), tx({ amount: 20000 }), tx({ amount: 30000 })],
      listings,
      NOW
    );
    expect(m.avgTicket).toBe(20000);
  });

  // Contar cancelamentos no ticket médio dá ao anfitrião um número que nunca
  // viu na conta.
  it('ignora as reservas canceladas', () => {
    const m = detailedMetrics(
      [
        tx({ amount: 10000 }),
        tx({ amount: 30000 }),
        tx({ amount: 100000, transition: 'transition/cancel' }),
      ],
      listings,
      NOW
    );
    expect(m.avgTicket).toBe(20000);
  });

  it('é zero quando não há reservas', () => {
    expect(detailedMetrics([], listings, NOW).avgTicket).toBe(0);
  });
});

describe('taxa de cancelamento', () => {
  it('conta sobre o total, não sobre as efectivas', () => {
    const m = detailedMetrics(
      [tx({}), tx({}), tx({}), tx({ transition: 'transition/cancel' })],
      listings,
      NOW
    );
    expect(m.cancellationRate).toBe(25);
    expect(m.cancelledCount).toBe(1);
    expect(m.totalCount).toBe(4);
  });

  // Sem reservas não há taxa: é diferente de "nenhuma foi cancelada".
  it('é null sem reservas, e 0 quando nenhuma foi cancelada', () => {
    expect(detailedMetrics([], listings, NOW).cancellationRate).toBeNull();
    expect(detailedMetrics([tx({})], listings, NOW).cancellationRate).toBe(0);
  });
});

describe('receita por espaço', () => {
  it('agrupa e ordena do maior para o menor', () => {
    const m = detailedMetrics(
      [
        tx({ listing: 'l1', amount: 10000 }),
        tx({ listing: 'l2', amount: 50000 }),
        tx({ listing: 'l1', amount: 15000 }),
      ],
      listings,
      NOW
    );
    expect(m.revenueByListing).toEqual([
      { listingId: 'l2', title: 'Auditório', bookings: 1, revenue: 50000 },
      { listingId: 'l1', title: 'Sala Azul', bookings: 2, revenue: 25000 },
    ]);
  });

  it('não conta cancelamentos na receita do espaço', () => {
    const m = detailedMetrics(
      [tx({ listing: 'l1', amount: 10000 }), tx({ listing: 'l1', amount: 90000, transition: 'transition/cancel' })],
      listings,
      NOW
    );
    expect(m.revenueByListing[0].revenue).toBe(10000);
    expect(m.revenueByListing[0].bookings).toBe(1);
  });

  it('aguenta um anúncio que já não vem incluído', () => {
    const m = detailedMetrics([tx({ listing: 'apagado', amount: 5000 })], {}, NOW);
    expect(m.revenueByListing[0]).toEqual({
      listingId: 'apagado',
      title: null,
      bookings: 1,
      revenue: 5000,
    });
  });
});

describe('comparação com o mês anterior', () => {
  it('calcula a subida em percentagem', () => {
    const m = detailedMetrics(
      [
        tx({ at: '2026-07-05', amount: 10000 }),
        tx({ at: '2026-08-05', amount: 15000 }),
      ],
      listings,
      NOW
    );
    expect(m.previousMonthRevenue).toBe(10000);
    expect(m.currentMonthRevenue).toBe(15000);
    expect(m.revenueChangePercent).toBe(50);
  });

  it('calcula a descida', () => {
    const m = detailedMetrics(
      [tx({ at: '2026-07-05', amount: 20000 }), tx({ at: '2026-08-05', amount: 15000 })],
      listings,
      NOW
    );
    expect(m.revenueChangePercent).toBe(-25);
  });

  // Sem mês anterior não há variação: mostrar "+100%" ou "Infinity" ao primeiro
  // mês de actividade seria enganador.
  it('é null quando não há mês anterior com que comparar', () => {
    const m = detailedMetrics([tx({ at: '2026-08-05', amount: 15000 })], listings, NOW);
    expect(m.previousMonthRevenue).toBe(0);
    expect(m.revenueChangePercent).toBeNull();
  });
});

describe('robustez', () => {
  it('não rebenta sem argumentos', () => {
    expect(() => detailedMetrics()).not.toThrow();
    expect(detailedMetrics().avgTicket).toBe(0);
  });

  it('aguenta transações mal formadas', () => {
    const m = detailedMetrics([{}, { attributes: {} }, tx({ amount: 10000 })], listings, NOW);
    expect(m.totalCount).toBe(3);
    expect(m.avgTicket).toBeGreaterThan(0);
  });
});
