import React, { useEffect, useState } from 'react';
import { NamedLink } from '../../../components';
import { listingHighlightsEnabled } from '../../../config/configFeatures';
import css from './HostDashboard.module.css';

const MONTH_NAMES_PT = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];
const DAY_NAMES_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const formatRevenue = cents => {
  if (!cents) return '0 €';
  return `${(cents / 100).toLocaleString('pt-PT', { minimumFractionDigits: 0 })} €`;
};

const StatCard = ({ value, label, loading }) => (
  <div className={css.card}>
    <div className={css.cardValue}>{loading ? '…' : value}</div>
    <div className={css.cardLabel}>{label}</div>
  </div>
);

const RevenueChart = ({ data }) => {
  if (!data) return null;
  const hasRevenue = data.some(d => d.revenue > 0);
  const maxRevenue = Math.max(...data.map(d => d.revenue), 1);

  return (
    <div className={css.section}>
      <div className={css.sectionTitle}>Receita nos últimos 6 meses</div>
      {!hasRevenue ? (
        <div className={css.emptyState}>
          Ainda não há reservas concluídas. O gráfico aparecerá assim que tiveres receita registada.
        </div>
      ) : (
        <div className={css.chart}>
          {data.map((d, i) => {
            const heightPct = Math.max(3, Math.round((d.revenue / maxRevenue) * 100));
            return (
              <div key={i} className={css.chartCol}>
                <div className={css.chartBarWrap}>
                  <div className={css.chartTooltip}>{formatRevenue(d.revenue)}</div>
                  <div className={css.chartBar} style={{ height: `${heightPct}%` }} />
                </div>
                <div className={css.chartLabel}>{d.month}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

const BookingCalendar = ({ upcomingBookings }) => {
  const [open, setOpen] = useState(false);
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const today = now.getDate();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();

  // Mark booked days in the current month
  const bookedDays = new Set();
  (upcomingBookings || []).forEach(b => {
    const bStart = new Date(b.start);
    const bEnd = new Date(b.end);
    const mStart = new Date(year, month, 1);
    const mEnd = new Date(year, month, daysInMonth, 23, 59, 59);
    if (bStart > mEnd || bEnd < mStart) return;
    let cursor = new Date(Math.max(bStart, mStart));
    const last = new Date(Math.min(bEnd, mEnd));
    while (cursor < last) {
      bookedDays.add(cursor.getDate());
      cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
    }
  });

  // Upcoming bookings (next 5, future only)
  const futureBookings = (upcomingBookings || [])
    .filter(b => new Date(b.start) >= now)
    .slice(0, 5);

  const cells = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <div className={css.section}>
      <div className={css.sectionHeader}>
        <div className={css.sectionTitle}>
          Calendário de {MONTH_NAMES_PT[month]} {year}
        </div>
        <button className={css.toggleBtn} onClick={() => setOpen(o => !o)}>
          {open ? '−' : '+'}
        </button>
      </div>
      {open && (
        <>
          <div className={css.calendarGrid}>
            {DAY_NAMES_PT.map(d => (
              <div key={d} className={css.calDayName}>{d}</div>
            ))}
            {cells.map((day, i) => {
              if (day === null) return <div key={`e-${i}`} className={css.calEmpty} />;
              const booked = bookedDays.has(day);
              const isToday = day === today;
              let cls = css.calDay;
              if (booked && isToday) cls = css.calDayTodayBooked;
              else if (booked) cls = css.calDayBooked;
              else if (isToday) cls = css.calDayToday;
              return <div key={day} className={cls}>{day}</div>;
            })}
          </div>

          <div className={css.calLegend}>
            <span className={css.legendDotBooked} />
            <span className={css.legendText}>Reservado</span>
            <span className={css.legendDotToday} />
            <span className={css.legendText}>Hoje</span>
            <span className={css.legendDotFree} />
            <span className={css.legendText}>Disponível</span>
          </div>

          {futureBookings.length > 0 && (
            <div className={css.upcomingList}>
              <div className={css.upcomingTitle}>Próximas reservas</div>
              {futureBookings.map((b, i) => {
                const start = new Date(b.start);
                const end = new Date(b.end);
                const fmt = d => d.toLocaleDateString('pt-PT', { day: '2-digit', month: 'short' });
                return (
                  <div key={i} className={css.upcomingItem}>
                    <div className={css.upcomingDot} />
                    <div className={css.upcomingInfo}>
                      <span className={css.upcomingListing}>{b.listingTitle}</span>
                      <span className={css.upcomingDates}>{fmt(start)} → {fmt(end)}</span>
                    </div>
                    <span className={css.upcomingAmount}>{formatRevenue(b.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};

const HostDashboard = ({ listings, activeCount, currentUser }) => {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/host-stats', { credentials: 'include' })
      .then(r => r.ok ? r.json() : null)
      .then(data => { setStats(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const ratings = (listings || [])
    .map(l => l.attributes?.publicData?.averageRating)
    .filter(r => r != null && r > 0);
  const avgRating = ratings.length > 0
    ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
    : null;

  const firstName = currentUser?.attributes?.profile?.firstName || '';

  const seasonLabel = stats?.seasonLabel;
  const seasonClass = seasonLabel === 'Alta'
    ? css.seasonHigh
    : seasonLabel === 'Baixa'
    ? css.seasonLow
    : css.seasonNormal;

  return (
    <div className={css.root}>
      <div className={css.header}>
        <span className={css.greeting}>
          {firstName ? `Olá, ${firstName}` : 'O meu painel'}
        </span>
        <NamedLink name="InboxPage" params={{ tab: 'sales' }} className={css.inboxLink}>
          Ver todas as reservas →
        </NamedLink>
      </div>

      <div className={css.cards}>
        <StatCard loading={loading} value={stats?.weeklyBookings ?? '—'} label="Reservas esta semana" />
        <StatCard loading={loading} value={stats ? formatRevenue(stats.monthlyRevenue) : '—'} label="Rendimento este mês" />
        <StatCard loading={false} value={avgRating ? `★ ${avgRating}` : '—'} label="Avaliação média" />
        <StatCard loading={false} value={activeCount ?? '—'} label="Anúncios ativos" />
        <StatCard loading={loading} value={stats ? `${stats.currentOccupancy}%` : '—'} label="Ocupação este mês" />
        <StatCard
          loading={loading}
          value={seasonLabel
            ? <span className={seasonClass}>Época {seasonLabel}</span>
            : '—'}
          label="Época atual"
        />
      </div>

      <RevenueChart data={stats?.monthlyData} />
      <BookingCalendar upcomingBookings={stats?.upcomingBookings} />

      {listingHighlightsEnabled ? (
        <div className={css.actions}>
          <NamedLink name="DestacaAnuncioPage" className={css.highlightBtn}>
            ⚡ Destacar um anúncio
          </NamedLink>
        </div>
      ) : null}
    </div>
  );
};

export default HostDashboard;
