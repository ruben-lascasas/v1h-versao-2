/**
 * English content overrides for the Landing Page sections.
 *
 * These override the Portuguese content that comes from the Sharetribe Console
 * when the user selects the "EN" language.
 *
 * How to match sections:
 *   - 'sectionType' matches by section type (e.g. 'hero') — useful when there is only one.
 *   - 'sectionNameIncludes' matches if the section's sectionName contains this string (case-insensitive).
 *
 * Fields you can override per section:
 *   - title        → the main heading
 *   - description  → the body text
 *   - callToAction → { content: 'Button label' }
 *   - blocks       → array of block overrides (matched by index), each with { title, text, callToAction }
 */
const landingPageContentEN = [
  {
    // ── Why V1HUB Section ────────────────────────────────────────────────────
    match: { sectionType: 'whyUs' },
    title: 'Why V1HUB?',
    description:
      'V1HUB is the reference platform for finding and booking unique spaces in Portugal. From meeting rooms to creative studios, we have the right space for you.',
  },

  {
    // ── Highlighted Listing Section ──────────────────────────────────────────
    match: { sectionType: 'highlightedListing' },
    title: 'Most Popular Spaces',
    description: 'See the most booked spaces in the last month.',
    callToAction: { label: 'View Details' },
    staticHighlight: {
      officeName: 'Executive Office São Paulo',
      officeDescription: 'Sophisticated and functional space, with natural light, premium furniture and a social area.',
      features: ['2 workstations', 'Wi-Fi 1Gbps', 'Air conditioning', 'Reception'],
      reserveLabel: 'BOOK NOW',
      hostVerified: 'Verified host - responds within 1h',
    },
  },

  {
    // ── Section 1: Hero (carousel) ──────────────────────────────────────────
    // Slide 0 = hero's own content; slides 1-4 = blocks merged from the carousel section
    match: { sectionType: 'hero' },
    title: 'Empty Spaces? We Have the People Who Want to Use Them!',
    description:
      'Have a space that deserves more? At Venue1Hub we help transform underused commercial spaces into sources of income. Whether you have a meeting room, office, farmhouse, restaurant, or any space with potential for events, workshops, sessions, or experiences — you\'re in the right place. Join the platform that\'s set to revolutionise the space rental market in Portugal. No fixed costs, full control and security. Make the most of what you already have. Become a Venue1Host.',
    callToAction: { content: 'LIST YOUR SPACE' },
    blocks: [
      {
        title: 'Publish Your Space',
        text: 'Create a listing with your space\'s details — room, farmhouse, office or other. Add descriptions, photos and set your availability by the hour, by the day or both.',
        callToAction: { content: 'Publish Your Space' },
      },
      {
        title: 'Get Discovered',
        text: 'Clients search by location, type of space, availability and price. Your listing will be visible to anyone looking for exactly what you offer, for the time you make available.',
        callToAction: { content: 'Get Discovered', href: '#espacos-disponiveis' },
      },
      {
        title: 'Receive Bookings and Payments',
        text: 'Accept bookings through the platform and receive payments securely. The amount will be transferred to your account after the event or confirmed use.',
        callToAction: { content: 'Receive Bookings', href: '/inbox' },
      },
      {
        title: 'Count on Our Protection',
        text: 'All bookings are covered by public liability insurance and transaction protection. Guaranteed trust — for you and for those who book.',
        callToAction: { content: 'About our protection', href: '/terms-of-service' },
      },
    ],
  },

  {
    // ── Section 2: "A Maneira + Inteligente de Usar o Seu Espaço" ────────────
    // Kept for any case where this section still renders separately
    match: { sectionNameIncludes: 'maneira' },
    title: 'The Smartest Way to Use Your Space',
    description:
      'Do you have a space free for a few hours a day? An empty office in the afternoon? A room only used at weekends? At Venue1Hub, you can rent out your space by the hour, by the day, or for one-off events — with total flexibility, control and security. Turn what you already have into a source of income with just a few clicks. See how it works:',
    blocks: [
      {
        title: 'Publish Your Space',
        text: 'Create a listing with your space\'s details — room, farmhouse, office or other. Add descriptions, photos and set your availability by the hour, by the day or both.',
        callToAction: { content: 'Publish Your Space' },
      },
      {
        title: 'Get Discovered',
        text: 'Clients search by location, type of space, availability and price. Your listing will be visible to anyone looking for exactly what you offer, for the time you make available.',
        callToAction: { content: 'Get Discovered' },
      },
      {
        title: 'Receive Bookings and Payments',
        text: 'Accept bookings through the platform and receive payments securely. The amount will be transferred to your account after the event or confirmed use.',
        callToAction: { content: 'Receive Bookings' },
      },
      {
        title: 'Count on Our Protection',
        text: 'All bookings are covered by public liability insurance and transaction protection. Guaranteed trust — for you and for those who book.',
        callToAction: { content: 'About our protection' },
      },
    ],
  },

  {
    // ── Section 3: "Localizações em Destaque" / "Espaços Disponíveis" ─────────
    match: { sectionNameIncludes: 'localiza' },
    title: 'Available Spaces',
    description:
      'Explore the spaces listed on Venue1Hub — ready to book, with full details, real photos and up-to-date availability. Here you will find meeting rooms, farmhouses, offices, studios, restaurants and much more, available to rent by the hour, day or event.',
    blocks: [
      {
        // 1 — Trabalho & Reuniões
        title: 'Work & Meetings',
        text: 'Spaces ready to host meetings, coaching sessions, consultancies, training or individual work — with privacy, structure and flexibility.',
      },
      {
        // 2 — Educação & Cultura
        title: 'Education & Culture',
        text: 'Inspiring venues for classes, workshops, literary gatherings or cultural events. From the library to the classroom, it all starts here.',
      },
      {
        // 3 — Gastronomia & Convívio
        title: 'Gastronomy & Social',
        text: 'Restaurants, cafés, shared kitchens and showcooking spaces — perfect for private dinners, gastronomic experiences or flavourful events.',
      },
      {
        // 4 — Eventos & Festas
        title: 'Events & Parties',
        text: 'From farmhouses to party halls, rooftops and clubs — unique spaces to celebrate weddings, birthdays, launches or corporate gatherings.',
      },
      {
        // 5 — Criatividade & Produção
        title: 'Creativity & Production',
        text: 'Photography, recording, rehearsal and exhibition studios — designed for artists, creators, brands and producers who need space to bring their ideas to life.',
      },
      {
        // 6 — Saúde, Bem-estar & Corpo
        title: 'Health, Wellness & Body',
        text: 'Therapy rooms, yoga studios and gyms — everything to take care of body, mind and soul, with comfort, silence and purpose.',
      },
      {
        // 7 — Desporto & Actividade Física
        title: 'Sport & Physical Activity',
        text: 'Pavilions, fields, pools and training spaces for those who move, compete or coach — available by the hour, by the day or for one-off sporting events.',
      },
      {
        // 8 — Espaços ao Ar Livre
        title: 'Outdoor Spaces',
        text: 'Gardens, courtyards, parks and grounds — ideal for outdoor experiences, retreats, team buildings or celebrations in contact with nature.',
      },
      {
        // 9 — Espaços Inusitados & Alternativos
        title: 'Unusual & Alternative Spaces',
        text: 'Old factories, deactivated churches, carriages or creative containers — because the perfect setting isn\'t always the obvious one. Surprise yourself, here.',
      },
    ],
  },
];

export default landingPageContentEN;
