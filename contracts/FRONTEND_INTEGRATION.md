# Frontend Integration Guide

Complete guide for integrating the deployed mini-app contracts into your EmpowerTours UI.

---

## 📁 Step 1: Update Contract Configuration

### Location: `src/config/contracts.ts`

Create or update your contracts configuration file:

```typescript
// src/config/contracts.ts

export const MONAD_TESTNET_CHAIN_ID = 10143;

export const CONTRACT_ADDRESSES = {
  // Existing contracts
  toursToken: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7',
  passportNFT: '0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163',
  yieldStrategy: '0x...', // Your existing YieldStrategyV9 address

  // Mini-App Contracts (NEW)
  actionBasedDemandSignal: process.env.NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL!,
  itineraryNFT: process.env.NEXT_PUBLIC_ITINERARY_NFT!,
  musicBeatMatch: process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH!,
  countryCollector: process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR!,
  tandaPool: process.env.NEXT_PUBLIC_TANDA_POOL!,
} as const;

// Type-safe contract addresses
export type ContractName = keyof typeof CONTRACT_ADDRESSES;
