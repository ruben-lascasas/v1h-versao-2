const { buildReport, renderEmail, previousMonthRange } = require('./monthlyReport');

// Corrida no dia 1 de Agosto: o relatório é de Julho.
const REFERENCE = new Date('2026-08-01T07:00:00Z');

const tx = ({ amount = 10000, at = '2026-07-10', transition = 'transition/complete', listing = 'l1' }) => ({
  attributes: {
    lastTransition: transition,
    payinTotal: { amount, currency: 'EUR' },
    createdAt: `${at}T10:00:00Z`,
  },
  relationships: { listing: { data: { id: { uuid: listing } } } },
});

const listings = { l1: { attributes: { title: 'Sala Azul' } }, l2: { attributes: { title: 'Auditório' } } };

describe('período do relatório', () => {
  it('cobre o mês anterior completo', () => {
    const { start, end } = previousMonthRange(REFERENCE);
    expect(start.getMonth()).toBe(6); // Julho
    expect(end.getMonth()).toBe(7); // exclusivo: 1 de Agosto
  });

  it('vira o ano correctamente em Janeiro', () => {
    const { start } = previousMonthRange(new Date('2027-01-01T07:00:00Z'));
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(11); // Dezembro
  });
});

describe('conteúdo do relatório', () => {
  it('conta só as transações do mês em causa', () => {
    const r = buildReport(
      [
        tx({ at: '2026-06-20', amount: 99999 }), // mês anterior a esse
        tx({ at: '2026-07-10', amount: 10000 }),
        tx({ at: '2026-07-25', amount: 20000 }),
        tx({ at: '2026-08-01', amount: 88888 }), // já é o mês corrente
      ],
      listings,
      REFERENCE
    );
    expect(r.bookings).toBe(2);
    expect(r.revenue).toBe(30000);
    expect(r.monthIndex).toBe(6);
    expect(r.year).toBe(2026);
  });

  it('separa canceladas de efectivas', () => {
    const r = buildReport(
      [tx({ amount: 10000 }), tx({ amount: 50000, transition: 'transition/customer-cancel-long-term' })],
      listings,
      REFERENCE
    );
    expect(r.bookings).toBe(1);
    expect(r.cancelled).toBe(1);
    expect(r.revenue).toBe(10000);
    expect(r.cancellationRate).toBe(50);
  });

  it('detalha por espaço', () => {
    const r = buildReport(
      [tx({ listing: 'l1', amount: 10000 }), tx({ listing: 'l2', amount: 40000 })],
      listings,
      REFERENCE
    );
    expect(r.byListing.map(l => l.title)).toEqual(['Auditório', 'Sala Azul']);
  });

  // Mandar um email de zeros todos os meses é a forma mais rápida de acabar no
  // spam, e não diz ao anfitrião nada que ele não saiba.
  it('não gera relatório quando não houve actividade', () => {
    expect(buildReport([], listings, REFERENCE)).toBeNull();
    expect(buildReport([tx({ at: '2026-08-15' })], listings, REFERENCE)).toBeNull();
  });
});

describe('email', () => {
  const report = () =>
    buildReport([tx({ amount: 12000 }), tx({ listing: 'l2', amount: 8000 })], listings, REFERENCE);

  it('em português nomeia o mês e o ano', () => {
    const { subject, html } = renderEmail(report(), 'pt', 'Rúben');
    expect(subject).toBe('O seu resumo de julho de 2026');
    expect(html).toContain('Olá Rúben,');
    expect(html).toContain('Reservas');
    expect(html).toContain('Ticket médio');
    expect(html).toContain('Sala Azul');
  });

  it('em inglês diz o mesmo', () => {
    const { subject, html } = renderEmail(report(), 'en', 'Ruben');
    expect(subject).toBe('Your July 2026 summary');
    expect(html).toContain('Hi Ruben,');
    expect(html).toContain('Average booking');
    expect(html).not.toContain('Ticket médio');
  });

  it('aguenta um anfitrião sem primeiro nome', () => {
    const { html } = renderEmail(report(), 'pt', null);
    expect(html).toContain('Olá,');
  });

  it('mostra travessão quando não há taxa de cancelamento', () => {
    const { html } = renderEmail({ ...report(), cancellationRate: null }, 'pt');
    expect(html).toContain('—');
  });

  it('explica porque é que o email chegou', () => {
    expect(renderEmail(report(), 'pt').html).toContain('o seu plano inclui relatórios mensais');
    expect(renderEmail(report(), 'en').html).toContain('your plan includes monthly reports');
  });
});
