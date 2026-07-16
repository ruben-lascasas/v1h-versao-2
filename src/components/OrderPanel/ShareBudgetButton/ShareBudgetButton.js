import React, { useState } from 'react';
import css from './ShareBudgetButton.module.css';

const ShareIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {/* Classic share glyph — three nodes connected by two lines. Reads
        clearly even at 14px and matches the outlined style of PdfIcon. */}
    <circle cx="18" cy="5" r="3"/>
    <circle cx="6" cy="12" r="3"/>
    <circle cx="18" cy="19" r="3"/>
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
  </svg>
);

const CheckIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12"/>
  </svg>
);

const PdfIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
    <polyline points="14 2 14 8 20 8"/>
    <line x1="16" y1="13" x2="8" y2="13"/>
    <line x1="16" y1="17" x2="8" y2="17"/>
    <polyline points="10 9 9 9 8 9"/>
  </svg>
);

const STRINGS = {
  pt: {
    quoteTitle: 'Orçamento de Reserva',
    periodTitle: 'Período da Reserva',
    start: 'Início',
    end: 'Fim',
    priceTitle: 'Detalhe de Preço',
    estimatedTotal: 'Total estimado',
    disclaimer: 'Este orçamento é uma estimativa e está sujeito a confirmação de disponibilidade.',
    contact: 'Para efectuar a reserva aceda a <strong>venue1hub.com</strong> ou contacte <strong>admin@v1h.net</strong>.',
    lineItems: {
      'line-item/hour': 'Reserva por hora',
      'line-item/day': 'Reserva por dia',
      'line-item/night': 'Reserva por noite',
      'line-item/item': 'Artigo',
      'line-item/fixed': 'Valor fixo',
      'line-item/provider-commission': 'Comissão da plataforma',
      'line-item/customer-commission': 'Taxa de serviço',
    },
    unitSuffix: { 'line-item/hour': 'h', 'line-item/day': 'dia', 'line-item/night': 'noite' },
    qtyLabel: (qty, suffix) => qty === 1 ? `1 ${suffix}` : `${qty} ${suffix}s`,
    decimalSep: ',',
  },
  en: {
    quoteTitle: 'Booking Quote',
    periodTitle: 'Booking Period',
    start: 'Start',
    end: 'End',
    priceTitle: 'Price Breakdown',
    estimatedTotal: 'Estimated total',
    disclaimer: 'This quote is an estimate and is subject to availability confirmation.',
    contact: 'To make a booking visit <strong>venue1hub.com</strong> or contact <strong>admin@v1h.net</strong>.',
    lineItems: {
      'line-item/hour': 'Hourly booking',
      'line-item/day': 'Daily booking',
      'line-item/night': 'Nightly booking',
      'line-item/item': 'Item',
      'line-item/fixed': 'Fixed price',
      'line-item/provider-commission': 'Platform commission',
      'line-item/customer-commission': 'Service fee',
    },
    unitSuffix: { 'line-item/hour': 'h', 'line-item/day': 'day', 'line-item/night': 'night' },
    qtyLabel: (qty, suffix) => qty === 1 ? `1 ${suffix}` : `${qty} ${suffix}s`,
    decimalSep: '.',
  },
};

const getStrings = locale => STRINGS[locale] || STRINGS.pt;

const formatDateTime = (ts, locale) =>
  new Date(Number(ts)).toLocaleString(locale === 'en' ? 'en-GB' : 'pt-PT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

const formatMoneyCents = (amount, currency, locale) => {
  const s = getStrings(locale);
  const value = (amount / 100).toFixed(2).replace('.', s.decimalSep);
  return `${value} ${currency || 'EUR'}`;
};

const formatLineItemDetail = (li, currency, locale) => {
  const s = getStrings(locale);
  const qty = li.units != null ? Number(li.units) : li.quantity != null ? Number(li.quantity) : null;
  const unitAmount = li.unitPrice?.amount;
  const suffix = s.unitSuffix[li.code];
  if (qty == null || unitAmount == null || !suffix) return null;
  return `${s.qtyLabel(qty, suffix)} × ${formatMoneyCents(unitAmount, currency, locale)}/${suffix}`;
};

const buildPrintHTML = ({ listingTitle, values, lineItems, currency, locale }) => {
  const s = getStrings(locale);
  const start = values?.bookingStartTime ? formatDateTime(values.bookingStartTime, locale) : '—';
  const end = values?.bookingEndTime ? formatDateTime(values.bookingEndTime, locale) : '—';
  const ref = `V1H-${Date.now().toString(36).toUpperCase()}`;
  const dateLocale = locale === 'en' ? 'en-GB' : 'pt-PT';
  const now = new Date().toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' });

  const customerItems = (lineItems || []).filter(
    li => !li.includeFor || li.includeFor.includes('customer')
  );
  const total = customerItems.reduce((sum, li) => sum + (li.lineTotal?.amount || 0), 0);

  const rowsHTML = customerItems.map(li => {
    const detail = formatLineItemDetail(li, currency, locale);
    const label = s.lineItems[li.code] || li.code;
    return `
    <tr>
      <td style="padding:10px 0;border-bottom:1px solid #eee;color:#444;">
        ${label}
        ${detail ? `<br/><span style="font-size:12px;color:#999;font-weight:400;">${detail}</span>` : ''}
      </td>
      <td style="padding:10px 0;border-bottom:1px solid #eee;text-align:right;font-weight:600;color:#2E2E2E;vertical-align:top;">
        ${formatMoneyCents(li.lineTotal?.amount || 0, currency, locale)}
      </td>
    </tr>`;
  }).join('');

  const lang = locale === 'en' ? 'en' : 'pt';

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <title>${s.quoteTitle} — ${listingTitle || 'Espaço'}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    @page { margin: 0; size: A4; }
    body { font-family: Arial, Helvetica, sans-serif; color: #2E2E2E; background: #fff; padding: 0 0 40px; }
    .doc-title { text-align: center; padding: 28px 24px 20px; }
    .doc-title-main { font-size: 22px; font-weight: 800; color: #2E2E2E; letter-spacing: -0.01em; }
    .doc-title-main span { color: #BAA38A; }
    .doc-title-sub { font-size: 12px; color: #999; margin-top: 4px; }
    .page { max-width: 680px; margin: 0 auto; padding: 0 40px 48px; }
    .header { background: #2E2E2E; padding: 28px 32px; border-radius: 8px 8px 0 0; display: flex; align-items: center; justify-content: space-between; }
    .logo { color: #fff; font-size: 22px; font-weight: 900; letter-spacing: 0.06em; }
    .logo span { color: #BAA38A; }
    .header-sub { color: rgba(255,255,255,0.6); font-size: 12px; text-align: right; }
    .body { border: 1px solid #e8e0d8; border-top: none; border-radius: 0 0 8px 8px; padding: 40px 32px 32px; }
    .title-block { text-align: center; padding-bottom: 28px; margin-bottom: 28px; border-bottom: 1px solid #f0ebe4; }
    .title { font-size: 30px; font-weight: 800; color: #2E2E2E; margin-bottom: 8px; line-height: 1.2; }
    .ref { font-size: 11px; color: #BAA38A; letter-spacing: 0.1em; text-transform: uppercase; }
    .section-label { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: #BAA38A; margin-bottom: 8px; border-bottom: 1px solid #BAA38A; padding-bottom: 4px; }
    .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 32px; }
    .info-item label { font-size: 11px; color: #999; display: block; margin-bottom: 2px; }
    .info-item span { font-size: 14px; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    .total-row td { padding: 14px 0; font-size: 16px; font-weight: 700; color: #2E2E2E; border-top: 2px solid #2E2E2E; }
    .total-row td:last-child { text-align: right; color: #BAA38A; font-size: 18px; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #eee; font-size: 11px; color: #bbb; text-align: center; line-height: 1.6; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="doc-title">
    <div class="doc-title-main">${s.quoteTitle} <span>—</span> ${listingTitle || '—'}</div>
    <div class="doc-title-sub">${now} &nbsp;·&nbsp; Ref. ${ref}</div>
  </div>
  <div class="page">
    <div class="header">
      <div class="logo">V1<span>HUB</span></div>
      <div class="header-sub">${s.quoteTitle}<br/>${now}</div>
    </div>
    <div class="body">
      <div class="title-block">
        <div class="title">${listingTitle || '—'}</div>
        <div class="ref">Ref. ${ref}</div>
      </div>

      <div class="section-label">${s.periodTitle}</div>
      <div class="info-grid" style="margin-bottom:32px;">
        <div class="info-item"><label>${s.start}</label><span>${start}</span></div>
        <div class="info-item"><label>${s.end}</label><span>${end}</span></div>
      </div>

      <div class="section-label">${s.priceTitle}</div>
      <table>
        ${rowsHTML}
        <tr class="total-row">
          <td>${s.estimatedTotal}</td>
          <td>${formatMoneyCents(total, currency, locale)}</td>
        </tr>
      </table>

      <div class="footer">
        ${s.disclaimer}<br/>
        ${s.contact}
      </div>
    </div>
  </div>
  <script>window.onload = function(){ window.print(); };<\/script>
</body>
</html>`;
};

const ShareBudgetButton = ({ values, lineItems, listingTitle, currency, locale }) => {
  const [copied, setCopied] = useState(false);

  const { bookingStartTime, bookingEndTime, seats } = values || {};
  if (!bookingStartTime || !bookingEndTime) return null;

  const handleShare = () => {
    try {
      const start = new Date(Number(bookingStartTime)).toISOString();
      const end = new Date(Number(bookingEndTime)).toISOString();
      const url = new URL(window.location.href);
      url.searchParams.set('orderOpen', 'true');
      url.searchParams.set('bookingStart', start);
      url.searchParams.set('bookingEnd', end);
      if (seats && Number(seats) > 1) url.searchParams.set('seats', String(seats));

      const write = text =>
        navigator.clipboard
          ? navigator.clipboard.writeText(text)
          : Promise.resolve(
              (() => {
                const ta = document.createElement('textarea');
                ta.value = text;
                ta.style.cssText = 'position:fixed;opacity:0';
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                document.body.removeChild(ta);
              })()
            );

      write(url.toString()).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      });
    } catch {}
  };

  const handlePdf = () => {
    try {
      const html = buildPrintHTML({ listingTitle, values, lineItems, currency, locale });
      const win = window.open('', '_blank', 'width=800,height=700');
      win.document.write(html);
      win.document.close();
    } catch {}
  };

  return (
    <div className={css.root}>
      <button
        type="button"
        className={copied ? css.buttonCopied : css.button}
        onClick={handleShare}
        disabled={copied}
      >
        <span className={css.icon}>{copied ? <CheckIcon /> : <ShareIcon />}</span>
        {copied ? 'Link copiado!' : 'Partilhar Orçamento'}
      </button>
      <button type="button" className={css.pdfButton} onClick={handlePdf}>
        <span className={css.icon}><PdfIcon /></span>
        Descarregar PDF
      </button>
    </div>
  );
};

export default ShareBudgetButton;
