const { getSdk } = require('../api-util/sdk');

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

module.exports = async (req, res) => {
  try {
    const sdk = getSdk(req, res);

    const response = await sdk.transactions.query({
      only: 'provider',
      perPage: 100,
      include: ['listing', 'booking'],
      'fields.transaction': ['processName', 'lastTransition', 'payinTotal', 'createdAt'],
      'fields.booking': ['start', 'end'],
      'fields.listing': ['title'],
    });

    const transactions = response.data.data;
    const included = response.data.included || [];

    const bookingsMap = {};
    const listingsMap = {};
    included.forEach(item => {
      if (item.type === 'booking') bookingsMap[item.id.uuid] = item;
      if (item.type === 'listing') listingsMap[item.id.uuid] = item;
    });

    const now = new Date();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    const weeklyBookings = transactions.filter(
      t => new Date(t.attributes.createdAt) >= weekAgo
    ).length;

    // Last 6 months breakdown
    const monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const mStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);
      const daysInMonth = mEnd.getDate();

      const mTxs = transactions.filter(t => {
        const d = new Date(t.attributes.createdAt);
        return d >= mStart && d <= mEnd;
      });

      const revenue = mTxs.reduce((sum, t) => sum + (t.attributes.payinTotal?.amount || 0), 0);

      let bookedDays = 0;
      mTxs.forEach(t => {
        const bookingRel = t.relationships?.booking?.data;
        if (bookingRel) {
          const booking = bookingsMap[bookingRel.uuid];
          if (booking?.attributes?.start && booking?.attributes?.end) {
            const start = new Date(booking.attributes.start);
            const end = new Date(booking.attributes.end);
            bookedDays += Math.max(0, Math.ceil((end - start) / (1000 * 60 * 60 * 24)));
          }
        }
      });

      monthlyData.push({
        month: MONTH_NAMES[mStart.getMonth()],
        revenue,
        bookings: mTxs.length,
        occupancyRate: Math.min(100, Math.round((bookedDays / daysInMonth) * 100)),
      });
    }

    // Current month stats (index 5 = most recent)
    const monthlyRevenue = monthlyData[5].revenue;
    const currentOccupancy = monthlyData[5].occupancyRate;

    // Season: compare current month to previous months that had activity
    const prevRevenues = monthlyData.slice(0, 5).map(m => m.revenue);
    const prevWithActivity = prevRevenues.filter(r => r > 0);
    let seasonLabel;
    if (prevWithActivity.length >= 2) {
      const prevAvg = prevWithActivity.reduce((s, r) => s + r, 0) / prevWithActivity.length;
      const ratio = prevAvg > 0 ? monthlyRevenue / prevAvg : 1;
      seasonLabel = ratio >= 1.2 ? 'Alta' : ratio <= 0.8 ? 'Baixa' : 'Normal';
    } else {
      // Calendar-based fallback (Portugal)
      const m = now.getMonth();
      seasonLabel = (m >= 5 && m <= 8) ? 'Alta' : (m >= 10 || m <= 1) ? 'Baixa' : 'Normal';
    }

    // Bookings for calendar: current month onwards
    const calendarStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const upcomingBookings = [];
    transactions.forEach(t => {
      const bookingRel = t.relationships?.booking?.data;
      const listingRel = t.relationships?.listing?.data;
      if (!bookingRel) return;
      const booking = bookingsMap[bookingRel.uuid];
      if (!booking?.attributes?.start || !booking?.attributes?.end) return;
      const end = new Date(booking.attributes.end);
      if (end < calendarStart) return;
      const listing = listingRel ? listingsMap[listingRel.uuid] : null;
      upcomingBookings.push({
        start: booking.attributes.start,
        end: booking.attributes.end,
        listingTitle: listing?.attributes?.title || 'Anúncio',
        amount: t.attributes.payinTotal?.amount || 0,
      });
    });

    upcomingBookings.sort((a, b) => new Date(a.start) - new Date(b.start));

    return res.json({
      weeklyBookings,
      monthlyRevenue,
      monthlyData,
      seasonLabel,
      currentOccupancy,
      upcomingBookings,
    });
  } catch (e) {
    console.error('[host-stats]', e.message);
    return res.status(500).json({ error: 'Erro ao obter estatísticas.' });
  }
};
