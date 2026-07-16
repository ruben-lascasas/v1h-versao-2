/**
 * Landing Page Configuration Examples
 * 
 * This file contains example configurations for the landing page sections.
 * Use these as templates when configuring your landing page in Sharetribe Console.
 */

/**
 * EXAMPLE 1: Highlighted Listing Section (NEW)
 * 
 * This displays a single featured space/listing prominently with image and info side-by-side.
 * Best used once per page for maximum impact.
 */
export const highlightedListingExampleConfig = {
  sectionId: 'highlighted-space',
  sectionType: 'highlightedListing',
  sectionName: 'Highlighted Listing',
  
  title: { fieldType: 'heading2', content: 'Espaços mais populares' },
  description: { fieldType: 'paragraph', content: 'Veja os mais reservados no último mês' },
  callToAction: { fieldType: 'primaryButton', label: 'Ver detalhes', url: '/s' },

  appearance: {
    backgroundColor: '#ffffff',
    textColor: 'dark'
  },
  
  // 'featured' queries pub_featured=true via Sharetribe API — visível em todos os dispositivos.
  // Requer que o campo "featured" esteja configurado como pesquisável no Sharetribe Console.
  listingSelection: 'featured'
};

/**
 * EXAMPLE 2: Multiple Highlighted Listings (one per marketplace category)
 * Use 'queryString' to show latest listing from specific categories
 */
export const highlightedListingByCategoryConfig = [
  {
    sectionId: 'highlighted-camping',
    sectionType: 'highlightedListing',
    title: { fieldType: 'heading', content: 'Camping Gear' },
    listingSelection: 'queryString',
    listingSearchQuery: 'pub_categoryLevel1=camping-and-outdoors'
  },
  {
    sectionId: 'highlighted-urban',
    sectionType: 'highlightedListing',
    title: { fieldType: 'heading', content: 'Urban Essentials' },
    listingSelection: 'queryString',
    listingSearchQuery: 'pub_categoryLevel1=urban-essentials'
  }
];

/**
 * EXAMPLE 3: Standard Listings Section (existing)
 * Shows multiple listings in a carousel
 */
export const standardListingsExampleConfig = {
  sectionId: 'featured-listings',
  sectionType: 'listings',
  sectionName: 'Featured Listings',
  
  title: {
    fieldType: 'heading',
    content: 'Available Spaces'
  },
  
  description: {
    fieldType: 'paragraph',
    content: 'Browse our most popular listings'
  },
  
  // Number of columns: 3 or 4
  numColumns: 3,
  
  // Featured listing configuration
  listingSelection: 'newest',
  
  // Alternative: use queryString for filtered results
  // listingSelection: 'queryString',
  // listingSearchQuery: 'price=0%2C5000',
};

/**
 * EXAMPLE 4: Complete Landing Page with Hero + Highlighted + Carousel
 * A realistic full-page configuration
 */
export const completeLandingPageExampleConfig = {
  sections: [
    {
      sectionType: 'hero',
      sectionId: 'hero-banner',
      title: {
        fieldType: 'heading',
        content: 'Welcome to Our Marketplace'
      },
      description: {
        fieldType: 'paragraph',
        content: 'Find the perfect space for your needs'
      }
    },
    {
      sectionId: 'highlighted-space',
      sectionType: 'highlightedListing',
      title: {
        fieldType: 'heading',
        content: 'Featured Space'
      },
      listingSelection: 'newest'
    },
    {
      sectionId: 'featured-listings',
      sectionType: 'listings',
      title: {
        fieldType: 'heading',
        content: 'More Available Spaces'
      },
      numColumns: 3,
      listingSelection: 'newest'
    }
  ],
  meta: {
    pageTitle: {
      fieldType: 'metaTitle',
      content: 'Home - Our Marketplace'
    },
    pageDescription: {
      fieldType: 'metaDescription',
      content: 'Discover amazing spaces available for rent'
    }
  }
};

/**
 * QUERY STRING EXAMPLES FOR FILTERED LISTINGS
 * 
 * These can be used with listingSelection: 'queryString'
 * Replace %2C with comma and %20 with space when copying to Console.
 */
export const queryStringExamples = {
  // Latest listings (searches newest first)
  newest: '',
  
  // By price range (in currency subunits, e.g. $0-$100 = 0-10000)
  under100: 'price=0%2C10000',
  
  // By category
  camping: 'pub_categoryLevel1=camping-and-outdoors',
  
  // Category + price
  campingUnder50: 'pub_categoryLevel1=camping-and-outdoors&price=0%2C5000',
  
  // By keywords
  vintage: 'keywords=vintage%20camera',
  
  // Multiple categories
  multiCategory: 'pub_categoryLevel1=camping-and-outdoors,outdoor-activities'
};

export const landingMapConfig = {
  sectionId: 'landing-map',
  sectionType: 'landingMap',
  sectionName: 'Mapa de Anúncios',
};

export const whyUsConfig = {
  sectionId: 'why-us',
  sectionType: 'whyUs',
  sectionName: 'Porquê a V1HUB?',
  title: { fieldType: 'heading2', content: 'Porquê a V1HUB?' },
  description: {
    fieldType: 'paragraph',
    content:
      'A V1HUB é a plataforma de referência para encontrar e reservar espaços únicos em Portugal. Desde salas de reunião a estúdios criativos, temos o espaço certo para si.',
  },
  // Adiciona URLs de imagens reais aqui (3 fotos para os polaroids)
  staticImages: [
    'https://cdn0.casamentos.pt/vendor/3004/3_2/960/jpg/0983-emilie-tiago_6_93004.jpeg',
    'https://avilaspaces.com/wp-content/uploads/2025/09/Private-Office04-1024x681.jpg',
    'https://cdn0.casamentos.com.br/article/1287/3_2/1280/jpg/57821-diseo-sin-ttulo-2023-04-26t173057-952.webp',
  ],
};

export default {
  highlightedListingExampleConfig,
  highlightedListingByCategoryConfig,
  standardListingsExampleConfig,
  completeLandingPageExampleConfig,
  queryStringExamples,
};
