import type { EPKMetadata } from './types';

// Redis key prefixes
export const EPK_SLUG_PREFIX = 'epk:slug:';
export const EPK_INQUIRY_PREFIX = 'epk:inquiry:';
export const EPK_CACHE_PREFIX = 'epk:cache:';

// Defaults
export const DEFAULT_MINIMUM_DEPOSIT = '100'; // 100 WMON
export const EPK_VERSION = '1.0.0';

// EPK Registry contract (to be updated after deployment)
export const EPK_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_EPK_REGISTRY || '';

// Event types for booking
export const EVENT_TYPES = [
  'Crypto Conference',
  'Web3 Music Festival',
  'NFT Gallery Opening',
  'Private Event',
  'DAO Celebration',
  'Corporate Event',
  'College / University',
  'Club Night',
  'Festival',
  'Other',
] as const;

// Earvin Gallardo seed data
export const EARVIN_GALLARDO_EPK: EPKMetadata = {
  version: EPK_VERSION,
  artist: {
    name: 'Earvin Gallardo',
    slug: 'earvin-gallardo',
    bio: "Born in Chilpancingo, Mexico and raised in Queens, New York, Earvin Gallardo is an artist and technologist at the intersection of AI-generated music and blockchain. With tracks minted on EmpowerTours on Monad, Earvin pioneers a new paradigm of music ownership where every stream, sale, and royalty payment is verifiable on-chain. His eclectic style blends alternative hip-hop with Latin influences and experimental AI production, shaped by NYC's diverse cultural landscape. Featured on Phoenix FM's Rising Stars, covered by Jamsphere and Soundlooks.",
    genre: ['AI Music', 'Electronic', 'Alternative Hip-Hop', 'Experimental'],
    location: 'Chilpancingo, Mexico / Queens, New York / Web3 Native',
    farcasterFid: undefined, // Set during seed
    walletAddress: undefined, // Set during seed
  },
  musicCatalog: {
    showCatalog: true,
  },
  media: {
    videos: [
      {
        title: 'Money Making Machine (AI Music Video)',
        url: 'https://rumble.com/v6zssqs-money-making-machine.html',
        platform: 'rumble',
      },
    ],
    photos: [],
  },
  press: [
    {
      outlet: 'Jamsphere',
      title: 'Earvin Gallardo - Love Hate Remorse - a creative with the ability to fully execute his own vision',
      url: 'https://jamsphere.com/newreleases/earvin-gallardo-love-hate-remorse-a-creative-with-the-ability-to-fully-execute-his-own-vision',
      date: '2021-11-12',
      excerpt: 'Earvin Gallardo is an NYC-based underground rapper demonstrating versatility across multiple tracks, blending hypnotic alternative hip-hop with Latin influences and poetic lyricism that sets him apart from his contemporaries.',
    },
    {
      outlet: 'Phoenix FM',
      title: 'Artist Feature: Earvin Gallardo',
      url: 'https://phoenixfm.com/2021/11/09/artist-feature-earvin-gallardo/',
      date: '2021-11-09',
      excerpt: "Featured on Phoenix FM's Rising Stars show with 'Yummy Brujerias.' Growing up in NYC's diverse cultural landscape shaped his eclectic musical taste, aiming to create music that unites people globally.",
    },
    {
      outlet: 'Soundlooks',
      title: 'Earvin Gallardo - Love Hate Remorse - his tracks have an alternative twist, which takes him out of the ordinary lane',
      url: 'https://soundlooks.com/2021/11/earvin-gallardo-love-hate-remorse-his-tracks-have-an-alternative-twist-which-takes-him-out-of-the-ordinary-lane/',
      date: '2021-11-12',
      excerpt: 'Earvin Gallardo distinguishes himself through alternative hip-hop production and introspective lyricism that sets him apart from mainstream contemporaries.',
    },
  ],
  booking: {
    pricing: 'Contact for rates',
    inquiryEnabled: true,
    availableFor: [
      'Crypto Conferences',
      'Web3 Music Festivals',
      'NFT Gallery Openings',
      'Private Events',
      'DAO Celebrations',
    ],
    territories: ['Global (North America, Europe, Asia, Middle East)'],
    targetEvents: [
      'Token2049 Dubai/Singapore',
      'Consensus',
      'ETH Denver',
      'Devcon',
      'Permissionless',
      'NFT.NYC',
      'Paris Blockchain Week',
      'Korea Blockchain Week',
    ],
    minimumDeposit: DEFAULT_MINIMUM_DEPOSIT,
  },
  technicalRider: {
    stage: {
      title: 'Stage Requirements',
      items: [
        '40ft x 30ft minimum stage area',
        '4ft+ stage height',
        'Non-slip surface with clean sightlines',
      ],
    },
    sound: {
      title: 'Sound System',
      items: [
        'Line array system (L-Acoustics K1/K2 or equivalent)',
        '8 boxes per side minimum',
        '8x dual-18" subwoofers',
        '6 wedge monitors (artist preference)',
        'IEM system: Shure PSM1000',
        'FOH Console: Yamaha CL5 or DiGiCo SD series',
      ],
    },
    lighting: {
      title: 'Lighting',
      items: [
        '12x Martin MAC Aura XB (wash)',
        '8x Clay Paky Sharpy Plus (beam)',
        '4x followspots',
        '20x LED PAR cans',
        '2x MDG hazers',
        'Console: grandMA3',
      ],
    },
    video: {
      title: 'Video / LED',
      items: [
        '2x side LED screens (12ft x 8ft minimum)',
        '1x upstage LED wall (20ft x 12ft)',
        'P3.9 pixel pitch or finer',
        '4K input capability',
      ],
    },
    backline: {
      title: 'Backline / DJ Equipment',
      items: [
        'Pioneer DDJ-1000 or CDJ-3000 pair with DJM-A9',
        'Laptop stand (sturdy, adjustable)',
        'USB-C hub with power delivery',
      ],
    },
    soundcheck: {
      title: 'Soundcheck',
      items: [
        '90-minute soundcheck required',
        'Minimum 3 hours before showtime',
        'Private soundcheck (no audience)',
      ],
    },
    crew: {
      title: 'Crew Requirements',
      items: [
        '1x dedicated sound engineer',
        '1x lighting technician',
        '1x stage manager',
        '6x security personnel (stage/backstage)',
      ],
    },
  },
  hospitalityRider: {
    dressingRoom: {
      title: 'Dressing Room',
      items: [
        'Private room: 200 sq ft minimum',
        'Private bathroom with shower',
        'Comfortable seating for 6 people',
        'WiFi: 50 Mbps+ dedicated connection',
        'Full-length mirror',
        'Iron and ironing board',
      ],
    },
    catering: {
      title: 'Catering',
      items: [
        'Hot meal for 8 people',
        'Grilled protein options (chicken, steak, fish)',
        'Vegetarian option required',
        'No pork',
        'Gluten-free options available',
        'Fresh fruit and snack platters',
      ],
    },
    beverages: {
      title: 'Beverages',
      items: [
        'Premium spirits: Grey Goose vodka, Don Julio 1942 tequila, Hennessy VSOP',
        '2x bottles Moet or Veuve Clicquot champagne',
        'Craft beer selection (local)',
        'Red Bull (regular and sugar-free)',
        'Coconut water',
        'Fresh-squeezed orange juice',
        'Still and sparkling water',
      ],
    },
    transport: {
      title: 'Transportation',
      items: [
        'Black SUV (Cadillac Escalade or Mercedes GLS)',
        'Private airport transfers (arrival and departure)',
        '24-hour on-call driver during engagement',
      ],
    },
    hotel: {
      title: 'Hotel',
      items: [
        '5-star luxury suite',
        '3 nights: night before, night of, night after show',
        'Late checkout (2 PM minimum)',
        '24-hour room service',
      ],
    },
    security: {
      title: 'Security',
      items: [
        '1x personal bodyguard (artist-approved)',
        '1x promoter-provided security',
        'Secure backstage area with controlled access',
      ],
    },
    guestList: {
      title: 'Guest List',
      items: [
        '10 complimentary general admission',
        '5 VIP passes with backstage access',
      ],
    },
    payment: {
      title: 'Payment & Crypto',
      items: [
        'WMON deposit required for booking confirmation',
        'Crypto payments accepted (WMON on Monad)',
        'TOURS rewards for organizers (coming once liquidity pool is live)',
        'Deposit released to artist upon event completion',
      ],
    },
  },
  socials: {
    farcaster: 'earvin',
  },
  onChain: {},
};
