# EmpowerTours Treasury Management Plan

## Overview

This document outlines the strategy for managing TOURS token treasury to fund game rewards and sustain platform operations during the growth phase.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Initial Treasury Setup](#initial-treasury-setup)
3. [Game Contract Funding](#game-contract-funding)
4. [Burn Rate Analysis](#burn-rate-analysis)
5. [Revenue Tracking](#revenue-tracking)
6. [Funding Schedule](#funding-schedule)
7. [Emergency Procedures](#emergency-procedures)
8. [Mainnet Migration Strategy](#mainnet-migration-strategy)

---

## Executive Summary

**Current Economic Reality:**
- Game rewards distribute ~35,500 TOURS/month (at 500 active users)
- Service marketplace generates ~487 TOURS/month in fees (at conservative volume)
- **Net burn: ~35,000 TOURS/month** during growth phase

**Solution:**
Pre-fund game contracts with sufficient TOURS to sustain 12-18 months of operations while scaling user base and transaction volume to profitability.

**Target for Sustainability:**
- 10,000+ active users
- 5,000+ service transactions/month
- At this scale, 3% fees (3,750 TOURS/month) fully cover game rewards

---

## Initial Treasury Setup

### Testnet Deployment

**Total Treasury Needed: 500,000 TOURS**

**Allocation:**
```
MusicBeatMatchV2:     200,000 TOURS  (40%)
CountryCollectorV2:   150,000 TOURS  (30%)
ServiceMarketplace:    50,000 TOURS  (10%)  (for potential refunds/disputes)
Platform Reserve:     100,000 TOURS  (20%)  (emergency fund)
```

### Contract Addresses (Update After Deployment)

```typescript
// .env.local and Railway
NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=0x... // Deploy first
NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=0x... // Deploy second
NEXT_PUBLIC_SERVICE_MARKETPLACE=0x...  // Deploy third
```

### Funding Commands

After deploying contracts, fund them using the TOURS token contract:

```bash
# MusicBeatMatchV2 (200,000 TOURS)
cast send $TOURS_TOKEN \
  "transfer(address,uint256)" \
  $MUSIC_BEAT_MATCH_V2 \
  200000000000000000000000 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY

# CountryCollectorV2 (150,000 TOURS)
cast send $TOURS_TOKEN \
  "transfer(address,uint256)" \
  $COUNTRY_COLLECTOR_V2 \
  150000000000000000000000 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY

# ServiceMarketplace (50,000 TOURS)
cast send $TOURS_TOKEN \
  "transfer(address,uint256)" \
  $SERVICE_MARKETPLACE \
  50000000000000000000000 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY
```

---

## Game Contract Funding

### MusicBeatMatchV2

**Daily Pool:** 1,000 TOURS
**Base Reward:** 10 TOURS per correct guess
**Speed Bonus:** 5 TOURS
**Streak Bonus:** Variable (2x per week)

**Monthly Burn Estimate:**
```
Conservative (20 players/day, 50% correct):
  20 players × 50% correct × 15 TOURS avg = 150 TOURS/day
  150 × 30 days = 4,500 TOURS/month

Medium (50 players/day, 60% correct):
  50 × 60% × 15 = 450 TOURS/day
  450 × 30 = 13,500 TOURS/month

High Volume (100 players/day, 70% correct):
  100 × 70% × 18 = 1,260 TOURS/day
  1,260 × 30 = 37,800 TOURS/month
```

**200,000 TOURS Runway:**
- Conservative: 44 months
- Medium: 14 months
- High Volume: 5 months

### CountryCollectorV2

**Artist Completion:** 5 TOURS × 3 = 15 TOURS
**Badge Reward:** 50 TOURS per country
**Global Citizen Bonus:** 100 TOURS (at 10 countries)

**Monthly Burn Estimate:**
```
Conservative (30 users completing badges):
  30 users × 65 TOURS = 1,950 TOURS/month

Medium (80 users completing badges):
  80 × 65 = 5,200 TOURS/month

High Volume (150 users completing badges):
  150 × 65 = 9,750 TOURS/month
```

**150,000 TOURS Runway:**
- Conservative: 76 months
- Medium: 28 months
- High Volume: 15 months

### Combined Runway Analysis

**Total Available: 350,000 TOURS** (excluding reserves)

| Scenario | Monthly Burn | Runway |
|----------|-------------|---------|
| Conservative (50 users) | ~6,500 TOURS | 53 months |
| Medium (130 users) | ~18,700 TOURS | 18 months |
| High Volume (250 users) | ~47,550 TOURS | 7 months |

**Target:** Reach profitability (10,000 users, 5,000 tx/month) within 12-18 months.

---

## Burn Rate Analysis

### Current Burn Rate Formula

```typescript
function calculateMonthlyBurn(
  dailyMusicPlayers: number,
  weeklyCountryCollectors: number,
  correctGuessRate: number = 0.6,
  avgReward: number = 15
): number {
  // MusicBeatMatch
  const dailyMusicBurn = dailyMusicPlayers * correctGuessRate * avgReward;
  const monthlyMusicBurn = dailyMusicBurn * 30;

  // CountryCollector (weekly challenge)
  const monthlyCountryBurn = (weeklyCountryCollectors * 4) * 65;

  return monthlyMusicBurn + monthlyCountryBurn;
}

// Example:
// 50 daily music players, 30 weekly country collectors
// = 450 TOURS/day music + 7,800 TOURS/month country
// = 13,500 + 7,800 = 21,300 TOURS/month burn
```

### Revenue Formula

```typescript
function calculateMonthlyRevenue(
  monthlyFoodOrders: number,
  monthlyRides: number,
  avgFoodOrder: number = 25,  // food + delivery
  avgRidePrice: number = 15,
  platformFeePercent: number = 3
): number {
  const foodRevenue = (monthlyFoodOrders * avgFoodOrder * platformFeePercent) / 100;
  const rideRevenue = (monthlyRides * avgRidePrice * platformFeePercent) / 100;

  return foodRevenue + rideRevenue;
}

// Example:
// 500 food orders, 250 rides per month
// = (500 × 25 × 0.03) + (250 × 15 × 0.03)
// = 375 + 112.5 = 487.5 TOURS/month revenue
```

### Break-Even Calculator

```typescript
function calculateBreakEvenVolume(
  monthlyBurn: number,
  avgFoodOrder: number = 25,
  avgRidePrice: number = 15,
  platformFeePercent: number = 3
): { foodOrders: number; rides: number } {
  // Assume 2:1 ratio of food to rides
  const avgRevenuePerFood = (avgFoodOrder * platformFeePercent) / 100;
  const avgRevenuePerRide = (avgRidePrice * platformFeePercent) / 100;

  const totalOrders = monthlyBurn / ((2 * avgRevenuePerFood) + avgRevenuePerRide);

  return {
    foodOrders: Math.ceil(totalOrders * 2),
    rides: Math.ceil(totalOrders)
  };
}

// Example: 21,300 TOURS/month burn
// = ~5,688 food orders + 2,844 rides needed to break even
```

---

## Revenue Tracking

### Key Metrics Dashboard

Track these metrics weekly to monitor treasury health:

```typescript
// metrics.ts
export interface TreasuryMetrics {
  // Contracts
  musicBeatMatchBalance: number;
  countryCollectorBalance: number;
  platformReserveBalance: number;

  // Burn Rate
  weeklyGameRewards: number;
  monthlyBurnRate: number;
  runwayMonths: number;

  // Revenue
  weeklyServiceFees: number;
  monthlyRevenue: number;
  monthlyNetBurn: number; // burn - revenue

  // Usage
  activeUsers: number;
  dailyGamePlayers: number;
  weeklyServiceTransactions: number;

  // Projection
  projectedBreakEvenDate: Date;
  projectedProfitableDate: Date;
}
```

### Monitoring Script

```bash
#!/bin/bash
# scripts/check-treasury.sh

echo "=== EmpowerTours Treasury Status ==="
echo ""

# Get contract balances
MUSIC_BALANCE=$(cast call $TOURS_TOKEN "balanceOf(address)(uint256)" $MUSIC_BEAT_MATCH_V2 --rpc-url https://testnet-rpc.monad.xyz)
COUNTRY_BALANCE=$(cast call $TOURS_TOKEN "balanceOf(address)(uint256)" $COUNTRY_COLLECTOR_V2 --rpc-url https://testnet-rpc.monad.xyz)
PLATFORM_BALANCE=$(cast call $TOURS_TOKEN "balanceOf(address)(uint256)" $PLATFORM_SAFE --rpc-url https://testnet-rpc.monad.xyz)

# Convert from wei to TOURS (divide by 1e18)
MUSIC_TOURS=$(echo "scale=2; $MUSIC_BALANCE / 1000000000000000000" | bc)
COUNTRY_TOURS=$(echo "scale=2; $COUNTRY_BALANCE / 1000000000000000000" | bc)
PLATFORM_TOURS=$(echo "scale=2; $PLATFORM_BALANCE / 1000000000000000000" | bc)

echo "MusicBeatMatch Balance: $MUSIC_TOURS TOURS"
echo "CountryCollector Balance: $COUNTRY_TOURS TOURS"
echo "Platform Safe Balance: $PLATFORM_TOURS TOURS"
echo ""

# Calculate runway
TOTAL_GAME_BALANCE=$(echo "$MUSIC_TOURS + $COUNTRY_TOURS" | bc)
MONTHLY_BURN=21300  # Update based on actual usage
RUNWAY=$(echo "scale=1; $TOTAL_GAME_BALANCE / $MONTHLY_BURN" | bc)

echo "Total Game Reserves: $TOTAL_GAME_BALANCE TOURS"
echo "Estimated Monthly Burn: $MONTHLY_BURN TOURS"
echo "Runway: $RUNWAY months"
echo ""

# Warning thresholds
if (( $(echo "$RUNWAY < 3" | bc -l) )); then
    echo "⚠️ WARNING: Less than 3 months runway!"
elif (( $(echo "$RUNWAY < 6" | bc -l) )); then
    echo "⚠️ CAUTION: Less than 6 months runway"
else
    echo "✅ Healthy runway"
fi
```

---

## Funding Schedule

### Phase 1: Initial Deployment (Month 0)

- [x] Deploy all contracts
- [x] Fund MusicBeatMatchV2: 200,000 TOURS
- [x] Fund CountryCollectorV2: 150,000 TOURS
- [x] Fund ServiceMarketplace: 50,000 TOURS
- [x] Reserve Platform Safe: 100,000 TOURS

**Total: 500,000 TOURS**

### Phase 2: Growth Monitoring (Months 1-6)

**Monthly Tasks:**
- Run `scripts/check-treasury.sh` weekly
- Track user growth and engagement
- Monitor service transaction volume
- Calculate actual burn rate vs projections

**Refill Threshold:**
If any contract drops below 50,000 TOURS, refill from Platform Reserve.

**Refill Command:**
```bash
# Example: Refill MusicBeatMatch with 50,000 TOURS
cast send $TOURS_TOKEN \
  "transfer(address,uint256)" \
  $MUSIC_BEAT_MATCH_V2 \
  50000000000000000000000 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $TREASURY_MANAGER_KEY
```

### Phase 3: Scale to Profitability (Months 6-18)

**Goals:**
- Reach 10,000 active users
- Achieve 5,000 service transactions/month
- Platform fees cover game rewards

**Actions:**
- Gradually reduce game rewards if needed (via `updateRewardConfig`)
- Introduce dynamic reward pools based on revenue
- Scale marketing and user acquisition

### Phase 4: Mainnet Migration (Month 18+)

- Pause testnet contracts
- Migrate treasury to mainnet
- Adjust all pricing for MON market price
- Resume operations on mainnet

---

## Emergency Procedures

### Low Balance Alert (<50,000 TOURS)

**Steps:**
1. Run treasury check script
2. Review actual vs projected burn rate
3. Refill from Platform Reserve if available
4. If reserve depleted, consider:
   - Temporarily reducing game rewards
   - Increasing platform fee to 5% (short term)
   - Emergency treasury raise from team/investors

### Rapid Depletion (>50% above projected burn)

**Possible Causes:**
- Exploit or bug in reward distribution
- Unexpected spike in game activity
- Incorrect reward calculations

**Actions:**
1. **Immediately pause affected contract:**
```solidity
// Add pause mechanism if needed
function pauseRewards() external onlyOwner {
    // Stop reward distribution
}
```

2. Investigate cause
3. Fix issue and resume
4. Refill if needed

### Dispute Surge (ServiceMarketplace)

If disputes spike and escrow funds are tied up:

**Actions:**
1. Review dispute resolution speed
2. Ensure 50,000 TOURS reserve in ServiceMarketplace
3. Implement automated dispute resolution for small claims (<10 TOURS)
4. Add additional funds from Platform Reserve if needed

---

## Mainnet Migration Strategy

### Treasury Conversion

**Step 1: Calculate MON Market Price**
```
Example: MON = $2.50 on mainnet
Adjustment Factor = $1 / $2.50 = 0.4
```

**Step 2: Adjust Treasury Amounts**
```
Testnet MusicBeatMatch: 200,000 TOURS
Mainnet MusicBeatMatch: 200,000 × 0.4 = 80,000 TOURS
```

**Step 3: Update Reward Amounts**
```
Testnet Base Reward: 10 TOURS
Mainnet Base Reward: 10 × 0.4 = 4 TOURS
```

**Step 4: Deploy and Fund Mainnet Contracts**
```bash
# Deploy mainnet contracts with adjusted reward amounts
forge script script/DeployMainnet.s.sol --broadcast --verify

# Fund with adjusted amounts
cast send $MAINNET_TOURS_TOKEN \
  "transfer(address,uint256)" \
  $MAINNET_MUSIC_BEAT_MATCH \
  80000000000000000000000 \
  --rpc-url $MAINNET_RPC \
  --private-key $MAINNET_DEPLOYER_KEY
```

### Testnet to Mainnet Migration Checklist

- [ ] Finalize all testnet transactions
- [ ] Withdraw remaining testnet TOURS from contracts
- [ ] Calculate MON market price adjustment
- [ ] Update all contract reward amounts
- [ ] Deploy mainnet contracts with new params
- [ ] Fund mainnet contracts with adjusted amounts
- [ ] Update frontend to point to mainnet
- [ ] Announce migration to users
- [ ] Monitor mainnet operations

---

## Best Practices

### Weekly Operations

1. **Monday:** Run treasury check script
2. **Wednesday:** Review user metrics and burn rate
3. **Friday:** Update projections and runway estimate

### Monthly Operations

1. Calculate actual burn vs projected
2. Review revenue from service fees
3. Adjust projections if needed
4. Report to stakeholders
5. Plan refills if needed

### Quarterly Operations

1. Comprehensive treasury audit
2. Evaluate reward structure effectiveness
3. Adjust tokenomics if needed
4. Plan for next quarter

---

## Quick Reference

### Contract Addresses (Testnet)

```
TOURS Token: 0xa123600c82E69cB311B0e068B06Bfa9F787699B7
Platform Safe: 0x33fFCcb1802e13a7eead232BCd4706a2269582b0

MusicBeatMatchV2: [TO BE DEPLOYED]
CountryCollectorV2: [TO BE DEPLOYED]
ServiceMarketplace: [TO BE DEPLOYED]
```

### Treasury Manager Private Key

**Security:**
- Store in 1Password/secure vault
- Never commit to git
- Use hardware wallet for mainnet
- Rotate periodically

### Commands Cheat Sheet

```bash
# Check balance
cast call $TOURS_TOKEN "balanceOf(address)(uint256)" $CONTRACT_ADDRESS --rpc-url $RPC

# Transfer TOURS
cast send $TOURS_TOKEN "transfer(address,uint256)" $RECIPIENT $AMOUNT --private-key $KEY --rpc-url $RPC

# Get contract owner
cast call $CONTRACT "owner()(address)" --rpc-url $RPC

# Update reward config (MusicBeatMatch)
cast send $MUSIC_BEAT_MATCH \
  "updateRewardConfig(uint256,uint256,uint256,uint256)" \
  10000000000000000000 \  # 10 TOURS base
  2 \                     # 2x streak multiplier
  5000000000000000000 \   # 5 TOURS speed bonus
  1000000000000000000000 \ # 1000 TOURS daily pool
  --private-key $KEY --rpc-url $RPC
```

---

## Conclusion

The treasury management plan ensures EmpowerTours can sustain 12-18 months of operations while scaling to profitability. By carefully monitoring burn rate, revenue, and user growth, the platform can reach sustainable economics where service fees cover game rewards.

**Key Success Metrics:**
- ✅ 500,000 TOURS initial funding
- ✅ Weekly treasury monitoring
- ✅ 12-18 month runway
- ✅ Target: 10,000 users, 5,000 tx/month for profitability

**Last Updated:** December 2025
**Version:** 1.0
**Status:** Ready for Testnet Deployment
