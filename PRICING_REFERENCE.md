# EmpowerTours Pricing Reference (Frontend)

## Quick Reference for Developers

This document provides simplified pricing constants and formulas for frontend implementation.

---

## 🍔 Food Delivery Pricing

### Delivery Fee Calculator

```typescript
// constants/pricing.ts

export const FOOD_DELIVERY = {
  // Distance-based delivery fees (in MON/TOURS)
  FEES: {
    SHORT_RANGE: 3,      // < 3 miles
    MEDIUM_RANGE: 5,     // 3-7 miles
    LONG_RANGE: 8,       // 7-15 miles
  },

  // Distance thresholds (in miles)
  THRESHOLDS: {
    SHORT: 3,
    MEDIUM: 7,
    LONG: 15,
  },

  // Platform fee percentage
  PLATFORM_FEE_PERCENT: 3,

  // Suggested food price ranges (for display/examples)
  SUGGESTED_PRICES: {
    FAST_FOOD: { min: 8, max: 15 },
    CASUAL_DINING: { min: 15, max: 40 },
    FINE_DINING: { min: 40, max: 100 },
  }
} as const;

// Helper function
export function calculateDeliveryFee(distanceMiles: number): number {
  if (distanceMiles < FOOD_DELIVERY.THRESHOLDS.SHORT) {
    return FOOD_DELIVERY.FEES.SHORT_RANGE;
  } else if (distanceMiles < FOOD_DELIVERY.THRESHOLDS.MEDIUM) {
    return FOOD_DELIVERY.FEES.MEDIUM_RANGE;
  } else {
    return FOOD_DELIVERY.FEES.LONG_RANGE;
  }
}

export function calculateFoodOrderBreakdown(
  foodPrice: number,
  deliveryFee: number
) {
  const foodPlatformFee = (foodPrice * FOOD_DELIVERY.PLATFORM_FEE_PERCENT) / 100;
  const deliveryPlatformFee = (deliveryFee * FOOD_DELIVERY.PLATFORM_FEE_PERCENT) / 100;

  return {
    foodPrice,
    deliveryFee,
    totalPlatformFee: foodPlatformFee + deliveryPlatformFee,
    restaurantReceives: foodPrice - foodPlatformFee,
    driverReceives: deliveryFee - deliveryPlatformFee,
    customerTotal: foodPrice + deliveryFee,
  };
}
```

---

## 🚗 Ride Sharing Pricing

### Ride Cost Calculator

```typescript
// constants/pricing.ts

export const RIDE_SHARING = {
  // Vehicle type rates
  RATES: {
    MOTORCYCLE: {
      baseFare: 2,
      perMile: 1.0,
      perMinute: 0.2,
    },
    SCOOTER: {
      baseFare: 2,
      perMile: 1.0,
      perMinute: 0.2,
    },
    BICYCLE: {
      baseFare: 1,
      perMile: 0.75,
      perMinute: 0.15,
    },
    CAR: {
      baseFare: 3,
      perMile: 1.5,
      perMinute: 0.3,
    },
    FOUR_WHEELER: {
      baseFare: 4,
      perMile: 2.0,
      perMinute: 0.4,
    },
  },

  // Platform fee percentage
  PLATFORM_FEE_PERCENT: 3,

  // Capacity limits
  CAPACITY: {
    MOTORCYCLE: 2,
    SCOOTER: 2,
    BICYCLE: 1,
    CAR: 4,
    FOUR_WHEELER: 6,
  }
} as const;

export type VehicleType = keyof typeof RIDE_SHARING.RATES;

// Helper function
export function calculateRideCost(
  vehicleType: VehicleType,
  distanceMiles: number,
  durationMinutes: number
) {
  const rates = RIDE_SHARING.RATES[vehicleType];

  const baseFare = rates.baseFare;
  const distanceCost = distanceMiles * rates.perMile;
  const timeCost = durationMinutes * rates.perMinute;
  const totalCost = baseFare + distanceCost + timeCost;
  const platformFee = (totalCost * RIDE_SHARING.PLATFORM_FEE_PERCENT) / 100;

  return {
    baseFare,
    distanceCost,
    timeCost,
    totalCost,
    platformFee,
    driverReceives: totalCost - platformFee,
    // Breakdown for display
    breakdown: {
      base: `${baseFare} (base)`,
      distance: `${distanceCost.toFixed(2)} (${distanceMiles} mi × ${rates.perMile})`,
      time: `${timeCost.toFixed(2)} (${durationMinutes} min × ${rates.perMinute})`,
    }
  };
}

// Estimate ride based on typical city speeds (25 mph average)
export function estimateRideCost(
  vehicleType: VehicleType,
  distanceMiles: number
) {
  const estimatedMinutes = (distanceMiles / 25) * 60; // 25 mph average
  return calculateRideCost(vehicleType, distanceMiles, estimatedMinutes);
}
```

---

## 🎮 Game Rewards Reference

```typescript
// constants/rewards.ts

export const GAME_REWARDS = {
  // MusicBeatMatch
  MUSIC_BEAT_MATCH: {
    BASE_REWARD: 10,
    SPEED_BONUS: 5,        // If guessed within 5 minutes
    STREAK_MULTIPLIER: 2,  // Per week of streak
    DAILY_POOL: 1000,
  },

  // CountryCollector
  COUNTRY_COLLECTOR: {
    ARTIST_COMPLETION: 5,
    BADGE_REWARD: 50,
    GLOBAL_CITIZEN_BONUS: 100,
    GLOBAL_CITIZEN_THRESHOLD: 10, // countries
  }
} as const;

// Helper to estimate potential earnings
export function estimateDailyGameEarnings(
  playedMusicBeat: boolean,
  wasSpeedBonus: boolean,
  streakWeeks: number,
  completedArtists: number
): number {
  let total = 0;

  if (playedMusicBeat) {
    total += GAME_REWARDS.MUSIC_BEAT_MATCH.BASE_REWARD;
    if (wasSpeedBonus) {
      total += GAME_REWARDS.MUSIC_BEAT_MATCH.SPEED_BONUS;
    }
    if (streakWeeks > 0) {
      total += GAME_REWARDS.MUSIC_BEAT_MATCH.BASE_REWARD * streakWeeks * GAME_REWARDS.MUSIC_BEAT_MATCH.STREAK_MULTIPLIER;
    }
  }

  if (completedArtists > 0) {
    total += completedArtists * GAME_REWARDS.COUNTRY_COLLECTOR.ARTIST_COMPLETION;
  }

  return total;
}
```

---

## 💰 Platform Fees

```typescript
// constants/fees.ts

export const PLATFORM = {
  FEE_PERCENT: 3,
  FEE_WALLET: '0x33fFCcb1802e13a7eead232BCd4706a2269582b0',
} as const;

export function calculatePlatformFee(amount: number): number {
  return (amount * PLATFORM.FEE_PERCENT) / 100;
}

export function calculateNetAmount(grossAmount: number): number {
  return grossAmount - calculatePlatformFee(grossAmount);
}
```

---

## 🌍 Distance Calculator (Haversine Formula)

```typescript
// utils/distance.ts

export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  // Haversine formula for distance between two GPS coordinates
  const R = 3959; // Earth's radius in miles
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimals
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}
```

---

## 📊 Example Usage in Components

### Food Order Price Display

```tsx
// components/FoodOrderSummary.tsx
import { calculateFoodOrderBreakdown, calculateDeliveryFee } from '@/constants/pricing';
import { calculateDistance } from '@/utils/distance';

export function FoodOrderSummary({
  foodPrice,
  restaurantLocation,
  customerLocation,
}: {
  foodPrice: number;
  restaurantLocation: { lat: number; lon: number };
  customerLocation: { lat: number; lon: number };
}) {
  const distance = calculateDistance(
    restaurantLocation.lat,
    restaurantLocation.lon,
    customerLocation.lat,
    customerLocation.lon
  );

  const deliveryFee = calculateDeliveryFee(distance);
  const breakdown = calculateFoodOrderBreakdown(foodPrice, deliveryFee);

  return (
    <div className="pricing-summary">
      <div>Food: {breakdown.foodPrice} MON</div>
      <div>Delivery ({distance} mi): {breakdown.deliveryFee} MON</div>
      <div className="border-t pt-2">
        <strong>Total: {breakdown.customerTotal} MON</strong>
      </div>

      {/* Show driver how much they'll earn */}
      <div className="text-sm text-gray-600 mt-2">
        Driver earns: {breakdown.driverReceives.toFixed(2)} MON (97%)
      </div>
    </div>
  );
}
```

### Ride Estimate Display

```tsx
// components/RideEstimate.tsx
import { estimateRideCost, VehicleType } from '@/constants/pricing';

export function RideEstimate({
  vehicleType,
  distance,
}: {
  vehicleType: VehicleType;
  distance: number;
}) {
  const estimate = estimateRideCost(vehicleType, distance);

  return (
    <div className="ride-estimate">
      <h3>Estimated Fare: {estimate.totalCost.toFixed(2)} MON</h3>

      <div className="breakdown text-sm">
        <div>{estimate.breakdown.base}</div>
        <div>{estimate.breakdown.distance}</div>
        <div>{estimate.breakdown.time}</div>
      </div>

      <div className="text-xs text-gray-500 mt-2">
        Driver receives: {estimate.driverReceives.toFixed(2)} MON (97%)
      </div>
    </div>
  );
}
```

---

## 🎯 Quick Reference Table

### Food Delivery

| Distance | Delivery Fee | Example Order | Customer Pays | Driver Gets (97%) |
|----------|--------------|---------------|---------------|-------------------|
| 2 miles | 3 MON | 20 MON food | 23 MON | 2.91 MON |
| 5 miles | 5 MON | 20 MON food | 25 MON | 4.85 MON |
| 10 miles | 8 MON | 20 MON food | 28 MON | 7.76 MON |

### Ride Sharing (3-mile ride, ~7 minutes)

| Vehicle | Base | Distance | Time | Total | Driver Gets |
|---------|------|----------|------|-------|-------------|
| Bicycle | 1 | 2.25 | 1.05 | ~4.30 | ~4.17 |
| Motorcycle | 2 | 3.00 | 1.40 | ~6.40 | ~6.21 |
| Scooter | 2 | 3.00 | 1.40 | ~6.40 | ~6.21 |
| Car | 3 | 4.50 | 2.10 | ~9.60 | ~9.31 |
| SUV | 4 | 6.00 | 2.80 | ~12.80 | ~12.42 |

### Game Rewards (Daily Earnings)

| Activity | Base | Bonus | Total Possible |
|----------|------|-------|----------------|
| Music Beat Match (no streak) | 10 | +5 (speed) | 15 MON |
| Music Beat Match (1 week streak) | 10 | +5 (speed) + 20 (streak) | 35 MON |
| Country Collector (1 artist) | 5 | — | 5 MON |
| Country Collector (badge) | 15 | +50 | 65 MON |

---

## 📱 Mainnet Migration Formula

When MON launches on mainnet, adjust all pricing:

```typescript
// utils/mainnetPricing.ts

export function adjustForMainnetPrice(
  testnetPrice: number,
  monMarketPrice: number
): number {
  const adjustmentFactor = 1 / monMarketPrice;
  return testnetPrice * adjustmentFactor;
}

// Example:
// If MON = $2.50 on mainnet
// Delivery fee: adjustForMainnetPrice(5, 2.50) = 2 MON
// Food order: adjustForMainnetPrice(20, 2.50) = 8 MON
```

---

## 🔄 Token Display Helpers

```typescript
// utils/tokenDisplay.ts

// Format token amounts for display
export function formatMON(amount: number): string {
  return `${amount.toFixed(2)} MON`;
}

export function formatTOURS(amount: number): string {
  return `${amount.toFixed(2)} TOURS`;
}

// Convert between tokens (if exchange rate differs from 1:1)
export function convertMONtoTOURS(monAmount: number, exchangeRate: number = 1): number {
  return monAmount * exchangeRate;
}

export function convertTOURStoMON(toursAmount: number, exchangeRate: number = 1): number {
  return toursAmount / exchangeRate;
}
```

---

## ✅ Implementation Checklist

- [ ] Add pricing constants to `constants/pricing.ts`
- [ ] Add reward constants to `constants/rewards.ts`
- [ ] Add platform fee constants to `constants/fees.ts`
- [ ] Implement distance calculator in `utils/distance.ts`
- [ ] Create food order summary component
- [ ] Create ride estimate component
- [ ] Add mainnet price adjustment utility
- [ ] Update all service request forms with live pricing
- [ ] Display driver earnings prominently (97% payout!)
- [ ] Add pricing preview before order confirmation

---

**Pro Tip:** Always show users what drivers/restaurants earn (97%) to highlight your competitive advantage over Uber/DoorDash (70% payout)!

**Last Updated:** December 2025
