# EmpowerTours Monad Testnet Setup

## Overview

This repository contains the EmpowerTours Farcaster mini app integrated with verified smart contracts on Monad testnet.

## Verified Contracts (Monad Testnet - ChainID 10143)

All contracts are deployed and verified on Monad testnet:

| Contract | Address | Status |
|----------|---------|--------|
| **YieldStrategy** | `0x8D3d70a5F4eeaE446A70F6f38aBd2adf7c667866` | ✅ Verified |
| **PassportNFTv2** | `0x04a8983587B79cd0a4927AE71040caf3baA613f1` | ✅ Verified |
| **DragonRouter** | `0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e` | ✅ Verified |
| **DemandSignalEngine** | `0xC2Eb75ddf31cd481765D550A91C5A63363B36817` | ✅ Verified |
| **SmartEventManifest** | `0x5cfe8379058cA460aA60ef15051Be57dab4A651C` | ✅ Verified |
| **TandaYieldGroup** | `0xE0983Cd98f5852AD6BF56648B4724979B75E9fC8` | ✅ Verified |
| **CreditScoreCalculator** | `0x9598397899CCcf9d0CFbDB40dEf1EF34e550c0c5` | ✅ Verified |
| **TOURS Token** | `0xa123600c82E69cB311B0e068B06Bfa9F787699B7` | ✅ Verified |

**Network Details:**
- RPC: https://testnet-rpc.monad.xyz
- ChainID: 10143
- Explorer: https://testnet.monadscan.com

## Project Structure

```
fcempowertours/
├── src/
│   ├── abis/                    # Contract ABIs
│   │   ├── YieldStrategy.json
│   │   ├── PassportNFTv2.json
│   │   ├── DragonRouter.json
│   │   ├── DemandSignalEngine.json
│   │   ├── SmartEventManifest.json
│   │   ├── TandaYieldGroup.json
│   │   ├── CreditScoreCalculator.json
│   │   └── ToursToken.json
│   ├── config/
│   │   └── contracts.ts         # Contract addresses & configurations
│   ├── hooks/                   # React hooks for contract interactions
│   │   ├── usePassportNFT.ts
│   │   ├── useYieldStrategy.ts
│   │   ├── useDragonRouter.ts
│   │   ├── useDemandSignalEngine.ts
│   │   ├── useSmartEventManifest.ts
│   │   ├── useTandaYieldGroup.ts
│   │   └── useCreditScoreCalculator.ts
│   ├── components/              # UI components
│   │   ├── MintPassport.tsx
│   │   ├── StakeTours.tsx
│   │   ├── PortfolioDisplay.tsx
│   │   ├── PassportStamps.tsx
│   │   ├── DemandSignalDisplay.tsx
│   │   ├── EventList.tsx
│   │   ├── TandaGroup.tsx
│   │   └── CreditScoreBadge.tsx
│   └── lib/
│       ├── pimlicoWrapper.ts    # Gasless transaction utilities
│       └── graphql/
│           └── queries.ts       # Envio GraphQL queries
├── app/
│   └── api/
│       └── frames/              # Farcaster frame endpoints
│           ├── events/
│           ├── staking/
│           └── tanda/
├── empowertours-envio/          # Envio indexer
│   ├── config.yaml              # Updated with new contracts
│   └── src/
│       └── EventHandlers.ts
└── lib/
    └── pimlico/                 # Pimlico AA setup
        ├── config.ts
        └── smartAccount.ts
```

## Features

### 1. **Passport NFT System**
- Mint travel passports as NFTs
- Track countries visited
- Display passport stamps collection
- Component: `MintPassport`, `PassportStamps`

### 2. **Yield Strategy (Staking)**
- Stake TOURS tokens to earn yield
- View staking statistics and APY
- Claim rewards
- Component: `StakeTours`, `PortfolioDisplay`

### 3. **Dragon Router (DEX)**
- Swap tokens
- Add/remove liquidity
- View liquidity pools
- Hook: `useDragonRouter`

### 4. **Demand Signal Engine**
- Signal demand for events
- View trending events
- Withdraw demand signals
- Component: `DemandSignalDisplay`

### 5. **Smart Event Manifest**
- Create and manage events
- Purchase tickets
- View event details
- Component: `EventList`

### 6. **Tanda Yield Groups**
- Create rotating savings groups (ROSCA)
- Join existing groups
- Make contributions
- Claim payouts
- Component: `TandaGroup`

### 7. **Credit Score System**
- Calculate user credit scores
- View score breakdown
- Track payment history
- Component: `CreditScoreBadge`

## Setup Instructions

### Prerequisites
- Node.js v18+
- Monad testnet MON tokens (for testing)
- Pimlico API key (for gasless transactions)
- Envio CLI (for indexer)

### 1. Install Dependencies
```bash
npm install
# or
pnpm install
```

### 2. Environment Variables
Create a `.env.local` file:

```env
# Network
NEXT_PUBLIC_MONAD_RPC=https://testnet-rpc.monad.xyz

# Pimlico (Account Abstraction)
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key

# Envio Indexer
NEXT_PUBLIC_ENVIO_GRAPHQL_URL=http://localhost:8080/v1/graphql

# App
NEXT_PUBLIC_URL=http://localhost:3000
```

### 3. Run the App
```bash
npm run dev
```

Visit `http://localhost:3000`

### 4. Setup Envio Indexer (Optional)
```bash
cd empowertours-envio
npm install
envio dev
```

The indexer will start syncing events from all contracts.

## Gasless Transactions with Pimlico

All transactions can be executed without gas using Pimlico's account abstraction:

```typescript
import { mintPassportGasless } from '@/src/lib/pimlicoWrapper';

// Mint passport without gas
await mintPassportGasless(
  userPrivateKey,
  userAddress,
  'John Doe',
  'US',
  'ipfs://...',
  'Traveler',
  'ipfs://metadata'
);
```

Supported gasless operations:
- Mint Passport NFT
- Stake TOURS tokens
- Submit demand signals
- Purchase event tickets
- Join Tanda groups
- Token approvals

## GraphQL Queries

Real-time data is indexed by Envio and queryable via GraphQL:

```typescript
import { executeQuery, GET_USER_STATS } from '@/src/lib/graphql/queries';

// Get user statistics
const data = await executeQuery(GET_USER_STATS, {
  address: '0x...',
});
```

Available queries:
- `GET_USER_STATS` - User activity and NFT holdings
- `GET_STAKING_ACTIVITIES` - Staking history
- `GET_DEMAND_SIGNALS` - Event demand data
- `GET_SMART_EVENTS` - Active events
- `GET_TANDA_GROUPS` - Tanda group data
- `GET_CREDIT_SCORE_HISTORY` - Credit score changes

## Farcaster Frames

Interactive frames for social engagement:

- `/api/frames/events` - Browse and buy event tickets
- `/api/frames/staking` - Stake TOURS and claim rewards
- `/api/frames/tanda` - Join and manage Tanda groups
- `/api/frames/passport` - Mint and view passports

## Contract Interactions

### Example: Stake TOURS
```typescript
import { useYieldStrategy } from '@/src/hooks/useYieldStrategy';

function StakingComponent() {
  const { stake, useGetStakedAmount, useGetPendingRewards } = useYieldStrategy();

  const { data: staked } = useGetStakedAmount(address!);
  const { data: rewards } = useGetPendingRewards(address!);

  const handleStake = () => {
    stake(parseUnits('100', 18)); // Stake 100 TOURS
  };

  return (
    <div>
      <p>Staked: {formatUnits(staked || 0n, 18)} TOURS</p>
      <p>Rewards: {formatUnits(rewards || 0n, 18)} TOURS</p>
      <button onClick={handleStake}>Stake 100 TOURS</button>
    </div>
  );
}
```

### Example: Create Event
```typescript
import { useSmartEventManifest } from '@/src/hooks/useSmartEventManifest';

function CreateEventComponent() {
  const { createEvent } = useSmartEventManifest();

  const handleCreate = () => {
    createEvent(
      'EmpowerTours Summit 2025',
      'San Francisco',
      BigInt(Math.floor(Date.now() / 1000) + 86400), // Start in 1 day
      BigInt(Math.floor(Date.now() / 1000) + 172800), // End in 2 days
      500n, // Capacity
      parseUnits('50', 18), // 50 TOURS price
      'ipfs://metadata'
    );
  };

  return <button onClick={handleCreate}>Create Event</button>;
}
```

## Testing

### Test on Monad Testnet
1. Get testnet MON from faucet
2. Deploy or interact with existing contracts
3. Use Pimlico for gasless transactions

### Run Tests
```bash
npm test
```

## Deployment

### Deploy to Production
```bash
npm run build
npm run start
```

### Deploy Envio Indexer
```bash
cd empowertours-envio
envio deploy
```

## Support

- [Monad Docs](https://docs.monad.xyz)
- [Pimlico Docs](https://docs.pimlico.io)
- [Envio Docs](https://docs.envio.dev)
- [EmpowerTours Discord](https://discord.gg/empowertours)

## License

MIT
