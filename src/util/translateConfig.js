/**
 * Translations for Sharetribe-hosted config data (categories, listing field labels, enum options).
 * These values come from Sharetribe Console API (not from react-intl files),
 * so they must be overridden at the config level when the locale is EN.
 */

// Category & subcategory name translations: Portuguese name (from API) → English name
const CATEGORY_NAME_EN = {
  // Top-level categories
  'Trabalho & Reuniões': 'Work & Meetings',
  'Educação & Cultura': 'Education & Culture',
  'Gastronomia & Convívio': 'Gastronomy & Social',
  'Eventos & Festas': 'Events & Parties',
  'Criatividade & Produção': 'Creativity & Production',
  'Saúde, Bem-estar & Corpo': 'Health, Wellness & Body',
  'Desporto & Actividade Física': 'Sport & Physical Activity',
  'Espaços ao Ar Livre': 'Outdoor Spaces',
  'Espaços Inusitados & Alternativos': 'Unusual & Alternative Spaces',

  // Subcategories — Trabalho & Reuniões
  'Salas de Reunião': 'Meeting Rooms',
  'Escritórios Privados': 'Private Offices',
  'Escritórios Partilhados / Coworking': 'Shared Offices / Coworking',
  'Consultórios Médicos e de Psicologia': 'Medical & Psychology Offices',
  'Gabinetes de Terapias e Coaching': 'Therapy & Coaching Rooms',
  'Salas de Formação': 'Training Rooms',
  'Salas de Entrevistas ou Avaliações': 'Interview & Assessment Rooms',

  // Subcategories — Educação & Cultura (current names in Sharetribe Console)
  'Auditórios': 'Auditoriums',
  'Bibliotecas': 'Libraries',
  'Centros de Estudos': 'Study Centres',
  'Salas de Aula / Universitárias': 'Classrooms / University Halls',
  'Laboratórios / Salas Técnicas': 'Laboratories / Technical Rooms',
  'Ateliers de Artes Plásticas': 'Visual Arts Ateliers',
  'Salas de Música': 'Music Rooms',
  // Legacy
  'Salas de Aula': 'Classrooms',
  'Bibliotecas e Salas de Estudo': 'Libraries & Study Rooms',
  'Auditórios e Anfiteatros': 'Auditoriums & Amphitheatres',
  'Museus e Galerias': 'Museums & Galleries',
  'Teatros e Salas de Espetáculo': 'Theatres & Performance Halls',
  'Espaços para Workshops': 'Workshop Spaces',

  // Subcategories — Gastronomia & Convívio (current names in Sharetribe Console)
  'Restaurantes Privados': 'Private Restaurants',
  'Cafés com Espaço Reservável': 'Cafés with Reservable Space',
  'Salas para Showcooking': 'Showcooking Rooms',
  'Cozinhas Profissionais Partilhadas': 'Shared Professional Kitchens',
  'Espaços para Degustações': 'Tasting Spaces',
  'Bares Reserváveis': 'Reservable Bars',
  // Legacy
  'Restaurantes': 'Restaurants',
  'Bares e Espaços de Cocktail': 'Bars & Cocktail Venues',
  'Cozinhas Profissionais': 'Professional Kitchens',
  'Salões de Festas e Convívio': 'Party & Social Halls',
  'Rooftops e Esplanadas': 'Rooftops & Terraces',

  // Subcategories — Eventos & Festas (current names in Sharetribe Console)
  'Quintas para Eventos': 'Event Estates',
  'Salões de Festas': 'Party Halls',
  'Pavilhões Multiusos': 'Multipurpose Pavilions',
  'Venues para Casamentos': 'Wedding Venues',
  'Casas de Campo / Espaços Rurais': 'Country Houses / Rural Spaces',
  'Palácios e Solares Históricos': 'Historical Palaces & Manors',
  'Discotecas': 'Nightclubs',
  'Rooftops': 'Rooftops',
  'Salas Privadas em Hotéis': 'Private Hotel Rooms',
  // Legacy names (kept for any older listings that still reference them)
  'Salas de Eventos': 'Event Rooms',
  'Quintas e Herdades': 'Farmhouses & Estates',
  'Palácios e Solares': 'Palaces & Manor Houses',
  'Espaços Industriais Reconvertidos': 'Repurposed Industrial Spaces',
  'Salas de Casamentos e Celebrações': 'Wedding & Celebration Halls',

  // Subcategories — Criatividade & Produção (current names in Sharetribe Console)
  'Estúdios Fotográficos': 'Photography Studios',
  'Estúdios de Vídeo e Cinema': 'Video & Film Studios',
  'Estúdios de Gravação Musical': 'Music Recording Studios',
  'Salas de Ensaio (Teatro, Dança, Música)': 'Rehearsal Rooms (Theatre, Dance, Music)',
  'Espaços de Exposição e Galerias de Arte': 'Exhibition Spaces & Art Galleries',
  'Blackbox / Estúdios Técnicos': 'Blackbox / Technical Studios',
  // Legacy
  'Estúdios de Fotografia': 'Photography Studios',
  'Estúdios de Gravação': 'Recording Studios',
  'Estúdios de Dança': 'Dance Studios',
  'Salas de Ensaio': 'Rehearsal Rooms',
  'Ateliers de Arte': 'Art Ateliers',
  'Espaços de Podcast e Vídeo': 'Podcast & Video Spaces',

  // Subcategories — Saúde, Bem-estar & Corpo (current names in Sharetribe Console)
  'Salas para Yoga, Pilates e Meditação': 'Yoga, Pilates & Meditation Rooms',
  'Estúdios de Movimento e Dança': 'Movement & Dance Studios',
  'Ginásios Privados ou Boutiques': 'Private or Boutique Gyms',
  'SPAs e Salas de Massagem': 'Spas & Massage Rooms',
  'Salas de Acupunctura e Terapias Holísticas': 'Acupuncture & Holistic Therapy Rooms',
  // Legacy
  'Ginásios e Boxes de Treino': 'Gyms & Training Boxes',
  'Estúdios de Yoga e Pilates': 'Yoga & Pilates Studios',
  'Salas de Massagem e Bem-Estar': 'Massage & Wellness Rooms',
  'Clínicas e Consultórios': 'Clinics & Consulting Rooms',
  'Espaços de Meditação': 'Meditation Spaces',

  // Subcategories — Desporto & Actividade Física (current names in Sharetribe Console)
  'Pavilhões Desportivos': 'Sports Pavilions',
  'Campos de Futebol / Futsal': 'Football / Futsal Pitches',
  'Campos de Padel / Ténis': 'Padel / Tennis Courts',
  'Ringues de Boxe ou Artes Marciais': 'Boxing & Martial Arts Rings',
  'Piscinas Cobertas ou ao Ar Livre': 'Indoor or Outdoor Pools',
  'Centros de Treino Funcional': 'Functional Training Centres',
  'Estádios': 'Stadiums',
  // Legacy
  'Campos de Futebol': 'Football Pitches',
  'Campos de Padel e Ténis': 'Padel & Tennis Courts',
  'Piscinas': 'Swimming Pools',
  'Pistas de Atletismo': 'Athletics Tracks',
  'Espaços de Escalada': 'Climbing Spaces',

  // Subcategories — Espaços ao Ar Livre (current names in Sharetribe Console)
  'Jardins e Quintais Reserváveis': 'Reservable Gardens & Backyards',
  'Terrenos para Glamping ou Eventos': 'Glamping & Event Land',
  'Parques Privados': 'Private Parks',
  'Espaços Rurais ou Agrícolas': 'Rural or Farm Spaces',
  'Praias Privadas ou Áreas Junto ao Rio': 'Private Beaches or Riverside Areas',
  'Espaços para Team Building ao Ar Livre': 'Outdoor Team Building Spaces',
  // Legacy
  'Jardins e Parques': 'Gardens & Parks',
  'Terraços e Rooftops': 'Terraces & Rooftops',
  'Espaços de Praia': 'Beach Spaces',
  'Espaços Rurais': 'Rural Spaces',
  'Pátios e Logradouros': 'Courtyards & Patios',

  // Subcategories — Espaços Inusitados & Alternativos (current names in Sharetribe Console)
  'Garagens e Armazéns': 'Garages & Warehouses',
  'Estúdios em Contentores': 'Container Studios',
  'Carros-casa, Caravanas ou Autocarros Estáticos': 'Camper Vans, Caravans or Static Buses',
  'Capelas / Igrejas Desativadas': 'Decommissioned Chapels / Churches',
  'Fábricas Desativadas': 'Decommissioned Factories',
  'Antigos Quartéis ou Edifícios Históricos': 'Former Barracks or Historical Buildings',
  'Estações de Comboio ou Carruagens': 'Train Stations or Carriages',
  // Legacy
  'Barcos e Embarcações': 'Boats & Vessels',
  'Caravanas e Autocarros': 'Caravans & Buses',
  'Caves e Adegas': 'Wine Cellars & Caves',
  'Igrejas e Capelas': 'Churches & Chapels',
  'Espaços Subterrâneos': 'Underground Spaces',
  'Árvores e Estruturas Elevadas': 'Treehouses & Elevated Structures',
};

// Listing type label translations: Portuguese → English
const LISTING_TYPE_LABEL_EN = {
  'Aluguer diário': 'Daily rental',
  'Aluguer por hora': 'Hourly rental',
  'Aluguer por hora (duração fixa)': 'Fixed-duration hourly rental',
  'Aluguer semanal': 'Weekly rental',
  'Aluguer mensal': 'Monthly rental',
  'Reserva': 'Booking',
  'Inquérito': 'Inquiry',
  'Negociação': 'Negotiation',
  'Compra': 'Purchase',
};

// Field label translations (showConfig, filterConfig, saveConfig): Portuguese → English
const FIELD_LABEL_EN = {
  'Número de pessoas que o espaço pode acolher': 'Number of people the space can accommodate',
  'Comodidades': 'Amenities',
  'Tipo de espaço': 'Type of space',
  'Tipo de anúncio': 'Listing type',
};

// Enum option label translations: Portuguese → English
const ENUM_OPTION_LABEL_EN = {
  // Amenities
  'Wi-Fi': 'Wi-Fi',
  'Parque de estacionamento': 'Parking',
  'Acessibilidade': 'Accessibility',
  'Acesso para pessoas com mobilidade reduzida': 'Wheelchair access',
  'Catering': 'Catering',
  'Casa de Banho': 'Bathroom',
  'Cozinha': 'Kitchen',
  'Ar condicionado': 'Air conditioning',
  'Aquecimento': 'Heating',
  'Projetor': 'Projector',
  'Ecrã / Televisão': 'Screen / TV',
  'Sistema de som': 'Sound system',
  'Microfone': 'Microphone',
  'Iluminação profissional': 'Professional lighting',
  'Vestiários': 'Changing rooms',
  'Cacifos': 'Lockers',
  'Piscina': 'Swimming pool',
  'Jardim': 'Garden',
  'Terraço': 'Terrace',
  'Elevador': 'Lift',
  'Segurança 24h': '24h Security',
  'Receção': 'Reception',
  'Sala de espera': 'Waiting room',
  'Internet de alta velocidade': 'High-speed internet',
  'Quadro branco': 'Whiteboard',
  'Quadro interativo': 'Interactive board',
  'Impressora': 'Printer',
  'Cofre': 'Safe',
  'Gerador': 'Generator',
  // Space types
  'Sala de reuniões': 'Meeting room',
  'Escritório': 'Office',
  'Auditório': 'Auditorium',
  'Restaurante': 'Restaurant',
  'Galeria': 'Gallery',
  'Estúdio': 'Studio',
  'Sala de ensaio': 'Rehearsal room',
  'Espaço ao ar livre': 'Outdoor space',
  'Sala de eventos': 'Event space',
  'Consultório': 'Consulting room',
  'Coworking': 'Coworking',
  'Armazém': 'Warehouse',
};

const translateCategoryName = name => CATEGORY_NAME_EN[name] || name;

/**
 * Translates a single enum option label from Portuguese to English.
 * Safe to call with an already-English label (returns unchanged).
 */
export const translateEnumOptionLabel = label => ENUM_OPTION_LABEL_EN[label] || label;

const translateCategories = (categories = []) =>
  categories.map(cat => ({
    ...cat,
    name: translateCategoryName(cat.name),
    subcategories: cat.subcategories ? translateCategories(cat.subcategories) : [],
  }));

const translateLabel = label => FIELD_LABEL_EN[label] || label;

const translateEnumOption = label => ENUM_OPTION_LABEL_EN[label] || label;

const translateListingFields = (listingFields = []) =>
  listingFields.map(field => {
    const translated = { ...field };

    if (translated.filterConfig?.label) {
      translated.filterConfig = {
        ...translated.filterConfig,
        label: translateLabel(translated.filterConfig.label),
      };
    }
    if (translated.showConfig?.label) {
      translated.showConfig = {
        ...translated.showConfig,
        label: translateLabel(translated.showConfig.label),
      };
    }
    if (translated.saveConfig?.label) {
      translated.saveConfig = {
        ...translated.saveConfig,
        label: translateLabel(translated.saveConfig.label),
      };
    }
    if (Array.isArray(translated.enumOptions)) {
      translated.enumOptions = translated.enumOptions.map(opt => ({
        ...opt,
        label: translateEnumOption(opt.label),
      }));
    }
    return translated;
  });

const translateListingTypes = (listingTypes = []) =>
  listingTypes.map(lt => ({
    ...lt,
    label: LISTING_TYPE_LABEL_EN[lt.label] || lt.label,
  }));

/**
 * Returns a config object with category names, subcategory names, listing type labels,
 * field labels and enum options all translated to English.
 * When locale is not 'en', the original config is returned unchanged.
 * Applied globally at the ConfigurationProvider level so all pages benefit automatically.
 *
 * @param {Object} config - The marketplace configuration from configurationContext
 * @param {string} locale - Current locale ('pt' or 'en')
 * @returns {Object} config (possibly with translated strings)
 */
export const getTranslatedConfig = (config, locale) => {
  if (locale !== 'en' || !config) return config;

  const translatedCategories = translateCategories(
    config.categoryConfiguration?.categories || []
  );

  const translatedListingFields = translateListingFields(
    config.listing?.listingFields || []
  );

  const translatedListingTypes = translateListingTypes(
    config.listing?.listingTypes || []
  );

  return {
    ...config,
    categoryConfiguration: {
      ...config.categoryConfiguration,
      categories: translatedCategories,
    },
    listing: {
      ...config.listing,
      listingFields: translatedListingFields,
      listingTypes: translatedListingTypes,
    },
  };
};
