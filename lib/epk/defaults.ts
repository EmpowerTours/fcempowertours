import type { TechnicalRider, HospitalityRider } from './types';

/**
 * Default technical rider for a solo artist / DJ
 * Used as fallback when AI generation fails
 */
export const DEFAULT_TECHNICAL_RIDER: TechnicalRider = {
  stage: {
    title: 'Stage Requirements',
    items: [
      '20ft x 15ft minimum stage area',
      'Stable, level surface with non-slip finish',
      'Clear sightlines to audience',
    ],
  },
  sound: {
    title: 'Sound System',
    items: [
      'Full-range PA system suitable for venue size',
      '2 wedge monitors (artist preference)',
      'DJ mixer with 2+ channels',
      'XLR and 1/4" inputs available',
    ],
  },
  lighting: {
    title: 'Lighting',
    items: [
      'Basic stage wash lighting',
      'LED color-changing fixtures preferred',
      'Haze machine for atmosphere',
    ],
  },
  video: {
    title: 'Video / LED',
    items: [],
  },
  backline: {
    title: 'Backline',
    items: [
      'Sturdy table or DJ booth for laptop/controller',
      'Power strip with 4+ outlets within reach',
      'USB-C or USB-A power available',
    ],
  },
  soundcheck: {
    title: 'Soundcheck',
    items: [
      '30-minute soundcheck required',
      'Minimum 1 hour before showtime',
    ],
  },
  crew: {
    title: 'Crew Requirements',
    items: [
      '1x sound engineer on-site',
      '1x stage hand for setup/teardown',
    ],
  },
};

/**
 * Default hospitality rider for a solo artist
 * Used as fallback when AI generation fails
 */
export const DEFAULT_HOSPITALITY_RIDER: HospitalityRider = {
  dressingRoom: {
    title: 'Dressing Room',
    items: [
      'Private room or sectioned-off area',
      'Comfortable seating for 4 people',
      'Access to clean restroom',
      'WiFi access',
    ],
  },
  catering: {
    title: 'Catering',
    items: [
      'Hot meal for 4 people',
      'Vegetarian option available',
      'Fresh fruit and light snacks',
    ],
  },
  beverages: {
    title: 'Beverages',
    items: [
      'Still and sparkling water',
      'Assorted soft drinks and juice',
      'Coffee and tea',
      'Energy drinks (Red Bull or similar)',
    ],
  },
  transport: {
    title: 'Transportation',
    items: [
      'Airport/hotel pickup and drop-off',
    ],
  },
  hotel: {
    title: 'Hotel',
    items: [
      'Hotel room for night of performance',
      'Late checkout requested',
    ],
  },
  security: {
    title: 'Security',
    items: [
      'Venue security at stage area',
      'Secured backstage access',
    ],
  },
  guestList: {
    title: 'Guest List',
    items: [
      '4 complimentary general admission',
      '2 VIP/backstage passes',
    ],
  },
  payment: {
    title: 'Payment',
    items: [
      'WMON deposit required for booking confirmation',
      'Crypto payments accepted (WMON on Monad)',
    ],
  },
};
