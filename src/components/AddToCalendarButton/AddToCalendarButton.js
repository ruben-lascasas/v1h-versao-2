import React, { useState, useEffect, useRef } from 'react';
import { useLocale } from '../../context/localeContext';
import css from './AddToCalendarButton.module.css';

// ---------- iCalendar (.ics) helpers ---------------------------------------
const toIcsDateTime = date => {
  const pad = n => String(n).padStart(2, '0');
  const d = new Date(date);
  return (
    d.getUTCFullYear() +
    pad(d.getUTCMonth() + 1) +
    pad(d.getUTCDate()) +
    'T' +
    pad(d.getUTCHours()) +
    pad(d.getUTCMinutes()) +
    pad(d.getUTCSeconds()) +
    'Z'
  );
};

const toIcsDate = date => {
  const pad = n => String(n).padStart(2, '0');
  const d = new Date(date);
  return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate());
};

const escapeText = s =>
  String(s || '')
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');

const buildVEvent = ({ uid, start, end, isAllDay, summary, location, description, url }) => {
  const dtStart = isAllDay ? `DTSTART;VALUE=DATE:${toIcsDate(start)}` : `DTSTART:${toIcsDateTime(start)}`;
  const dtEnd = isAllDay ? `DTEND;VALUE=DATE:${toIcsDate(end)}` : `DTEND:${toIcsDateTime(end)}`;
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${toIcsDateTime(new Date())}`,
    dtStart,
    dtEnd,
    `SUMMARY:${escapeText(summary)}`,
    location ? `LOCATION:${escapeText(location)}` : null,
    description ? `DESCRIPTION:${escapeText(description)}` : null,
    url ? `URL:${url}` : null,
    'END:VEVENT',
  ].filter(Boolean);
};

const buildIcs = events => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//V1HUB//Booking//PT',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...events.flatMap(buildVEvent),
    'END:VCALENDAR',
  ];
  return lines.join('\r\n');
};

const downloadIcs = (events, filename) => {
  const ics = buildIcs(events);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
};

// ---------- Deep-link URL builders -----------------------------------------
const googleCalendarUrl = ({ summary, start, end, isAllDay, location, description }) => {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary,
    dates: isAllDay
      ? `${toIcsDate(start)}/${toIcsDate(end)}`
      : `${toIcsDateTime(start)}/${toIcsDateTime(end)}`,
    location: location || '',
    details: description || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
};

const outlookUrl = ({ summary, start, end, isAllDay, location, description }) => {
  const fmt = d => new Date(d).toISOString();
  const params = new URLSearchParams({
    path: '/calendar/action/compose',
    rru: 'addevent',
    subject: summary,
    startdt: isAllDay ? toIcsDate(start) : fmt(start),
    enddt: isAllDay ? toIcsDate(end) : fmt(end),
    location: location || '',
    body: description || '',
  });
  if (isAllDay) params.set('allday', 'true');
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
};

// ---------- Icons ----------------------------------------------------------
const GoogleCalendarIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden style={{ flexShrink: 0 }}>
    <defs>
      <clipPath id="gcal-rounded">
        <rect x="2" y="2" width="20" height="20" rx="2.5" />
      </clipPath>
    </defs>
    <g clipPath="url(#gcal-rounded)">
      <rect x="2" y="2" width="10" height="10" fill="#4285F4" />
      <rect x="12" y="2" width="10" height="10" fill="#FBBC04" />
      <rect x="2" y="12" width="10" height="10" fill="#34A853" />
      <rect x="12" y="12" width="10" height="10" fill="#EA4335" />
    </g>
    <rect x="5" y="5" width="14" height="14" fill="#ffffff" />
    <text x="12" y="15.4" fontFamily="Arial, sans-serif" fontSize="8" fontWeight="700" fill="#1A73E8" textAnchor="middle">31</text>
  </svg>
);

const AppleIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#000" xmlns="http://www.w3.org/2000/svg" aria-hidden style={{ flexShrink: 0 }}>
    <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const OutlookIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden style={{ flexShrink: 0 }}>
    <rect x="2" y="4" width="20" height="16" rx="2" fill="#0078D4" />
    <text x="12" y="16.5" fontFamily="Arial, sans-serif" fontSize="11" fontWeight="700" fill="#fff" textAnchor="middle">O</text>
  </svg>
);

const DownloadIcon = ({ size = 22 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#2E2E2E" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0 }}>
    <line x1="12" y1="3" x2="12" y2="15" />
    <line x1="12" y1="15" x2="7" y2="10" fill="none" />
    <line x1="12" y1="15" x2="17" y2="10" fill="none" />
    <line x1="5" y1="20" x2="19" y2="20" />
  </svg>
);

const ChevronDown = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ marginLeft: 6 }}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);

// Toggle to surface the Apple / Outlook deep-link options. Hidden for now
// because the chefes only asked for Google Calendar — flip to `true` to bring
// the full menu back without touching any other code.
const SHOW_APPLE_OUTLOOK = false;

// ---------- Component ------------------------------------------------------
const AddToCalendarButton = props => {
  const { booking, listing, transaction, transactionId, transactionRole, customerName, className } = props;
  const { locale } = useLocale();
  const isEN = locale === 'en';
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef(null);

  // Close menu when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onDocClick = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  if (!booking?.attributes?.start || !booking?.attributes?.end) return null;

  const unitType = listing?.attributes?.publicData?.unitType;
  const isAllDay = unitType === 'day' || unitType === 'night';

  const additional =
    transaction?.attributes?.protectedData?.multipleBookings?.additionalBookings || [];
  const slots = [
    {
      start: booking.attributes.displayStart || booking.attributes.start,
      end: booking.attributes.displayEnd || booking.attributes.end,
    },
    ...additional.map(s => ({
      start: new Date(s.bookingStart),
      end: new Date(s.bookingEnd),
    })),
  ];

  const latestEnd = slots.reduce((max, s) => {
    const e = new Date(s.end).getTime();
    return e > max ? e : max;
  }, 0);
  if (latestEnd < Date.now()) return null;

  const isMulti = slots.length > 1;
  const title = listing?.attributes?.title || (isEN ? 'Booking' : 'Reserva');
  const isProvider = transactionRole === 'provider';
  // Title prefix differs for guest vs host so the calendar entry reads
  // naturally for each side. Body copy adds the counterparty's name when
  // we have it (only the host needs it — they want to know who's coming).
  const summaryPrefix = isProvider
    ? (isEN ? 'Booked' : 'Reservado')
    : (isEN ? 'You booked' : 'Reservaste');
  const baseSummary = `${summaryPrefix} — ${title}`;
  const loc = listing?.attributes?.publicData?.location || {};
  const locationStr = loc.address || '';
  const txUrl = transactionId
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/${isProvider ? 'sale' : 'order'}/${transactionId}`
    : null;
  const description = isProvider
    ? (isEN
        ? `${customerName || 'A guest'} booked your space via V1HUB.${txUrl ? `\nView: ${txUrl}` : ''}`
        : `${customerName || 'Um cliente'} reservou o teu espaço via V1HUB.${txUrl ? `\nVer: ${txUrl}` : ''}`)
    : (isEN
        ? `You confirmed this booking via V1HUB.${txUrl ? `\nView: ${txUrl}` : ''}`
        : `Confirmaste esta reserva via V1HUB.${txUrl ? `\nVer: ${txUrl}` : ''}`);

  // Build the events array used by the .ics download (covers single + multi).
  const events = slots.map((slot, i) => ({
    uid: `${transactionId || Date.now()}-${i}@venue1hub.com`,
    start: slot.start,
    end: slot.end,
    isAllDay,
    summary: isMulti ? `${baseSummary} (${i + 1}/${slots.length})` : baseSummary,
    location: locationStr,
    description,
    url: txUrl,
  }));

  const filename = `v1hub-reserva-${transactionId || 'evento'}.ics`;

  // Click handlers per option.
  const onPickGoogle = () => {
    setOpen(false);
    if (isMulti) {
      // Google's render URL only supports one event — fall back to .ics
      // (which covers all slots in a single download).
      downloadIcs(events, filename);
      return;
    }
    const url = googleCalendarUrl({
      summary: baseSummary,
      start: slots[0].start,
      end: slots[0].end,
      isAllDay,
      location: locationStr,
      description,
    });
    window.open(url, '_blank', 'noopener');
  };

  const onPickOutlook = () => {
    setOpen(false);
    if (isMulti) {
      downloadIcs(events, filename);
      return;
    }
    const url = outlookUrl({
      summary: baseSummary,
      start: slots[0].start,
      end: slots[0].end,
      isAllDay,
      location: locationStr,
      description,
    });
    window.open(url, '_blank', 'noopener');
  };

  const onPickApple = () => {
    setOpen(false);
    // Apple devices open .ics natively in Calendar.app — no deep link needed.
    downloadIcs(events, filename);
  };

  const onPickDownload = () => {
    setOpen(false);
    downloadIcs(events, filename);
  };

  return (
    <div ref={wrapperRef} className={`${css.wrapper} ${className || ''}`}>
      <button
        type="button"
        className={css.button}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <GoogleCalendarIcon size={30} />
        <span>{isEN ? 'Add to calendar' : 'Adicionar ao calendário'}</span>
        <ChevronDown />
      </button>

      {open && (
        <div className={css.menu} role="menu">
          <button type="button" className={css.menuItem} onClick={onPickGoogle} role="menuitem">
            <GoogleCalendarIcon />
            <span>Google Calendar</span>
          </button>
          {SHOW_APPLE_OUTLOOK ? (
            <button type="button" className={css.menuItem} onClick={onPickApple} role="menuitem">
              <AppleIcon />
              <span>{isEN ? 'Apple Calendar' : 'Apple Calendar'}</span>
            </button>
          ) : null}
          {SHOW_APPLE_OUTLOOK ? (
            <button type="button" className={css.menuItem} onClick={onPickOutlook} role="menuitem">
              <OutlookIcon />
              <span>Outlook</span>
            </button>
          ) : null}
          <button type="button" className={css.menuItem} onClick={onPickDownload} role="menuitem">
            <DownloadIcon />
            <span>{isEN ? 'Download .ics' : 'Descarregar .ics'}</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default AddToCalendarButton;
