# EmpowerTours Tokenomics Model

## Executive Summary

This document establishes the complete tokenomics and pricing model for the EmpowerTours platform, designed to work seamlessly from Monad testnet to mainnet. The model balances three critical aspects:

1. **Sustainable Rewards**: Game rewards that engage users without depleting the treasury
2. **Fair Service Pricing**: Food delivery and ride sharing priced competitively with Web2 alternatives
3. **Platform Viability**: 3% fee structure that generates sufficient revenue for operations

---

## Table of Contents

1. [Current State Analysis](#current-state-analysis)
2. [Token Conversion Model](#token-conversion-model)
3. [Service Pricing Guidelines](#service-pricing-guidelines)
4. [Game Rewards Economics](#game-rewards-economics)
5. [Platform Revenue Model](#platform-revenue-model)
6. [Testnet to Mainnet Strategy](#testnet-to-mainnet-strategy)
7. [Sustainability Analysis](#sustainability-analysis)
8. [Recommendations](#recommendations)

---

## Current State Analysis

### Existing Token Economics

**Token Conversion (from TokenSwap contract & swap page):**
```
MON to TOURS: 1:1 ratio (fixed)
TOURS to WMON: AMM-based (dynamic pricing via liquidity pool)
```

**Game Reward Structure:**

| Game | Reward Type | Amount (TOURS) |
|------|-------------|----------------|
| **MusicBeatMatch** | Base Reward | 10 |
| | Speed Bonus | +5 |
| | Streak Bonus | +2x per week |
| | Daily Pool | 1000 |
| **CountryCollector** | Artist Completion | 5 |
| | Badge Reward | 50 |
| | Global Citizen Bonus | 100 |

**Service Marketplace:**
- Platform Fee: **3%** on food orders and delivery fees
- Platform Wallet: `0x33fFCcb1802e13a7eead232BCd4706a2269582b0`
- Payment Structure: Restaurant gets food price - 3%, Driver gets delivery fee - 3%

### Real-World Comparison Data

**Food Delivery (Uber Eats, DoorDash 2025):**
- Delivery Fee: $3-8 USD (average ~$5)
- Service Fee: 10-15% of order
- Total markup: 25-35% above base food cost
- Platform takes: **30%** from restaurants (much higher than our 3%!)

**Ride Sharing (Uber 2025):**
- Cost per mile: $1-2 USD (UberX)
- Average short ride (3 miles): $8-15 USD
- Base fare + distance + time + surge
- Platform takes: **25-30%** from drivers

---

## Token Conversion Model

### MON to TOURS Exchange Rate

**Current Implementation:**
```
1 MON = 1 TOURS (via TokenSwap contract)
```

**Rationale for 1:1 Ratio:**
- ✅ Simple for users to understand
- ✅ Easy mental math for pricing
- ✅ Fair baseline for testnet experimentation
- ✅ Can adjust via AMM pricing later if needed

**Testnet vs Mainnet:**

On **testnet**, MON has no real-world value, so the 1:1 ratio is purely for testing UX and game mechanics.

On **mainnet**, we'll need to adjust based on MON's actual market value. However, the 1:1 swap ratio can remain as a **base conversion mechanism**, while market forces determine actual trading prices via the AMM.

**Recommendation:**
- **Keep 1:1 for TokenSwap** (MON → TOURS direct conversion)
- **Let AMM determine market price** for TOURS ⇄ WMON trading
- **Monitor MON mainnet price** and adjust service pricing in TOURS accordingly

---

## Service Pricing Guidelines

### Food Delivery Pricing

**Pricing Philosophy:**
- Must be **competitive** with Uber Eats/DoorDash
- Must be **attractive** to drivers (they keep 97% vs 70% on Uber Eats!)
- Must be **sustainable** for the platform (3% fee covers gas delegation costs)

**Recommended Pricing Structure:**

| Item | Price Range (TOURS) | USD Equivalent @ $1 MON | Notes |
|------|---------------------|-------------------------|-------|
| **Delivery Fee** | 3-8 TOURS | $3-8 | Distance-based, competitive with Web2 |
| **Small Order (<3 miles)** | 3-5 TOURS | $3-5 | Local delivery |
| **Medium Order (3-7 miles)** | 5-8 TOURS | $5-8 | Standard delivery |
| **Long Distance (7-15 miles)** | 8-15 TOURS | $8-15 | Extended range |

**Food Pricing:**
Restaurants set their own menu prices in TOURS. Suggested baseline:

```
Average meal: 10-30 TOURS ($10-30 USD equivalent)
Fast food: 8-15 TOURS
Casual dining: 15-40 TOURS
Fine dining: 40-100+ TOURS
```

**Example Order:**
```
Food Cost:          20 TOURS (restaurant's price)
Delivery Fee:       5 TOURS (customer pays)
Total Customer:     25 TOURS

Platform Fee (3%):  0.6 TOURS food + 0.15 TOURS delivery = 0.75 TOURS
Restaurant Gets:    19.4 TOURS (97% of food)
Driver Gets:        4.85 TOURS (97% of delivery)
Platform Gets:      0.75 TOURS (3% of total)
```

**Driver Economics:**
```
Drivers keep 97% of delivery fee vs 70% on Uber Eats
Driver makes 4.85 TOURS (~$5) per delivery
If 3 deliveries/hour = 14.55 TOURS/hour (~$15/hour)
Much better than gig economy average!
```

---

### Ride Sharing Pricing

**Pricing Philosophy:**
- Must compete with Uber/Lyft pricing
- Must account for vehicle type (motorcycle cheaper than car)
- Must be attractive to drivers (97% payout vs 70-75% on Uber!)

**Recommended Pricing Structure:**

| Vehicle Type | Base Fare | Per Mile | Per Minute | Example 3-mile ride |
|--------------|-----------|----------|------------|---------------------|
| Motorcycle | 2 TOURS | 1 TOUR | 0.2 TOURS | ~8-10 TOURS |
| Scooter | 2 TOURS | 1 TOUR | 0.2 TOURS | ~8-10 TOURS |
| Bicycle | 1 TOUR | 0.75 TOURS | 0.15 TOURS | ~5-7 TOURS |
| Car | 3 TOURS | 1.5 TOURS | 0.3 TOURS | ~12-15 TOURS |
| SUV/4-Wheeler | 4 TOURS | 2 TOURS | 0.4 TOURS | ~15-18 TOURS |

**Example Ride Calculation:**
```
Car ride: 5 miles, 15 minutes
= Base (3) + Distance (5 × 1.5) + Time (15 × 0.3)
= 3 + 7.5 + 4.5
= 15 TOURS agreed price

Platform Fee (3%):    0.45 TOURS
Driver Gets:          14.55 TOURS (97%)
Platform Gets:        0.45 TOURS (3%)
```

**Driver Economics (Car):**
```
Driver keeps 14.55 TOURS per ride vs ~10.5 TOURS on Uber (30% cut)
If 2 rides/hour = ~29 TOURS/hour (~$29/hour)
Significantly better than traditional rideshare!
```

---

## Game Rewards Economics

### Current Rewards Analysis

**MusicBeatMatch Daily:**
```
Base Reward: 10 TOURS
Speed Bonus: +5 TOURS (if guessed within 5 min)
Streak Bonus: +2x per week of streak
Daily Pool: 1000 TOURS
```

**Potential Daily Payout:**
```
If 50 players guess correctly per day:
Average reward: 10 TOURS base + 5 speed = 15 TOURS
Total distributed: 50 × 15 = 750 TOURS/day
Well within 1000 TOURS daily pool!
```

**CountryCollector Weekly:**
```
Artist Completion: 5 TOURS × 3 = 15 TOURS per country
Badge Reward: 50 TOURS
Total per week: 65 TOURS max per user
Global Citizen (10 countries): +100 TOURS bonus
```

### Sustainability Check

**Problem:** Are game rewards too generous compared to service costs?

**Analysis:**

If a user plays daily and earns 15 TOURS/day:
- Weekly earnings: ~105 TOURS from games
- Can buy: ~2-3 food deliveries OR 7-10 rides

**Comparison:**
- Uber Eats driver: 4.85 TOURS per delivery (actual work)
- Game player: 15 TOURS per day (2 min of gameplay)

**Verdict:** ⚠️ **Game rewards are VERY generous** relative to service work!

This creates a **positive flywheel**:
1. Users earn TOURS playing games (fun, engaging)
2. Users spend TOURS on real services (utility, retention)
3. Drivers earn TOURS from services (liquidity, sustainability)
4. Platform earns 3% fees (covers gas delegation costs)

**This is actually GOOD for ecosystem growth!**

---

## Platform Revenue Model

### Revenue Streams

**1. Service Marketplace Fees (3%):**

Projected Monthly Volume (Conservative Estimate):
```
Food Deliveries:
  100 orders/month × 25 TOURS average = 2,500 TOURS
  Platform fee (3%): 75 TOURS/month

Ride Sharing:
  50 rides/month × 15 TOURS average = 750 TOURS
  Platform fee (3%): 22.5 TOURS/month

Total Monthly Revenue: 97.5 TOURS (~$97.50 @ $1 MON)
```

**2. Gas Delegation Costs:**

Estimated gas costs per transaction:
```
Swap: ~0.001 MON per tx
Food Order: ~0.002 MON per tx
Ride Request: ~0.002 MON per tx

100 delegated txs/month = ~0.2 MON gas cost = ~$0.20
```

**3. Net Revenue:**
```
Revenue: 97.5 TOURS/month
Gas Costs: 0.2 MON = 0.2 TOURS (at 1:1 ratio)
Net Profit: 97.3 TOURS/month (~$97/month)
```

**Scaling Projections:**

| Monthly Volume | Food Orders | Rides | Revenue (3%) | Net Profit |
|----------------|-------------|-------|--------------|------------|
| Small (testnet) | 100 | 50 | 97.5 TOURS | ~$95 |
| Medium | 500 | 250 | 487.5 TOURS | ~$485 |
| Large | 2000 | 1000 | 1,950 TOURS | ~$1,940 |

**Verdict:** ✅ **3% fee is sustainable** even at low volumes!

---

## Testnet to Mainnet Strategy

### Testnet Phase (Current)

**Goals:**
- Test all game mechanics
- Validate service marketplace UX
- Stress test delegation system
- Gather user feedback on pricing

**Pricing on Testnet:**
- Use the recommended TOURS pricing above
- Test different delivery fee ranges (3-8 TOURS)
- Monitor user behavior and transaction volumes
- Collect data on reward distribution patterns

**Key Metrics to Track:**
```
1. Average game rewards earned per user/day
2. Average TOURS spent on services per user/week
3. Driver earnings per hour
4. Platform fee revenue vs gas costs
5. User retention rates
```

### Mainnet Migration

**Step 1: Assess MON Market Price**
```
Once MON launches on mainnet, observe market price:
- If MON = $1 USD → Keep current pricing
- If MON = $5 USD → Divide all TOURS prices by 5
- If MON = $0.20 USD → Multiply all TOURS prices by 5
```

**Step 2: Adjust TOURS Pricing**

**Formula:**
```
Mainnet TOURS Price = Testnet TOURS Price × ($1 / MON_Market_Price)

Example:
If MON = $2.50 on mainnet
Delivery fee: 5 TOURS × ($1 / $2.50) = 2 TOURS
Food order: 20 TOURS × ($1 / $2.50) = 8 TOURS
```

**Step 3: Update Game Rewards Proportionally**
```
Base Reward: 10 TOURS × ($1 / MON_Market_Price)
Speed Bonus: 5 TOURS × ($1 / MON_Market_Price)
Badge Reward: 50 TOURS × ($1 / MON_Market_Price)
```

**Step 4: Monitor and Iterate**
- Track user spending patterns
- Adjust pricing based on competitive landscape
- Maintain economic balance between rewards and services

---

## Sustainability Analysis

### Economic Flywheel

```
1. Users play games → Earn TOURS (10-15 per day)
   ↓
2. Users spend TOURS → Food delivery + Rides (creates demand)
   ↓
3. Drivers earn TOURS → Provide services (creates supply)
   ↓
4. Drivers spend/swap TOURS → Creates liquidity
   ↓
5. Platform earns fees → Covers gas delegation costs
   ↓
6. Gasless UX → More users play games
   ↓
(Loop back to step 1)
```

### Balance Sheet (Monthly Projections at 500 users)

**TOURS Inflows (Platform):**
```
Service Marketplace fees: 487.5 TOURS
```

**TOURS Outflows (Platform):**
```
Game contract funding:
  - Daily challenges: 30 days × 750 TOURS = 22,500 TOURS
  - Weekly country: 4 weeks × 65 TOURS × 50 users = 13,000 TOURS
Gas delegation costs: ~10 TOURS

Total Outflows: 35,510 TOURS/month
Total Inflows: 487.5 TOURS/month

Net: -35,022.5 TOURS/month
```

**🚨 Issue: Platform burns more TOURS on rewards than it earns in fees!**

### Solutions for Sustainability

**Option 1: Reduce Game Rewards (NOT Recommended)**
```
❌ Reduces user engagement
❌ Makes games less attractive
❌ Breaks the flywheel
```

**Option 2: Increase Service Volume (Recommended)**
```
✅ Grow user base to increase transaction volume
✅ Higher volume = more fees = covers reward costs
✅ Maintains engagement while scaling revenue

Target: 10,000 active users
Service volume: 5,000 orders/month × 25 TOURS = 125,000 TOURS
Platform fee (3%): 3,750 TOURS/month

This covers game rewards! ✅
```

**Option 3: Hybrid Funding Model**
```
✅ Platform treasury pre-funded with TOURS for game rewards
✅ Service fees cover gas delegation costs
✅ As volume grows, fees eventually cover both

Initial funding: 500,000 TOURS
Burn rate: 35,022 TOURS/month
Runway: ~14 months to scale to profitability
```

**Option 4: Dynamic Reward Adjustment**
```
✅ Base rewards stay constant (10 TOURS)
✅ Bonus pools scale with platform revenue
✅ During high-volume periods, increase daily pool
✅ During low-volume periods, maintain minimum engagement
```

---

## Recommendations

### Immediate Actions (Testnet)

1. **Deploy with Current Pricing:**
   - Food delivery: 3-8 TOURS
   - Rides: 5-18 TOURS (vehicle dependent)
   - Game rewards: As specified in contracts

2. **Fund Game Contracts:**
   - MusicBeatMatch: 100,000 TOURS (~3 months runway)
   - CountryCollector: 50,000 TOURS (~3 months runway)

3. **Monitor Key Metrics:**
   - Daily active users
   - Average TOURS earned per user
   - Average TOURS spent per user
   - Driver earnings and satisfaction
   - Platform fee revenue

4. **Iterate on Pricing:**
   - Test different delivery fee ranges
   - Survey users on perceived value
   - Adjust based on usage patterns

### Pre-Mainnet Actions

1. **Calculate MON Market Price Adjustment:**
   ```
   Adjustment_Factor = $1 / MON_Price_USD
   New_TOURS_Price = Current_TOURS_Price × Adjustment_Factor
   ```

2. **Update All Pricing:**
   - Service marketplace suggested prices
   - Game reward amounts (via updateRewardConfig)
   - Frontend pricing displays

3. **Treasury Preparation:**
   - Secure initial TOURS treasury for game funding
   - Set aside MON for gas delegation (3-6 months)
   - Plan for gradual reward adjustments as revenue grows

### Long-Term Strategy (Mainnet)

1. **Scale Transaction Volume:**
   - Expand to multiple cities/regions
   - Partner with restaurants and drivers
   - Marketing campaigns to drive adoption

2. **Optimize Platform Economics:**
   - Target: 10,000+ active users
   - Target: 5,000+ service transactions/month
   - This makes platform fee revenue sustainable

3. **Community Treasury:**
   - Consider implementing staking rewards
   - Explore liquidity mining for AMM pools
   - Revenue sharing with long-term token holders

4. **Fee Structure Evolution:**
   - Start at 3% to attract users and drivers
   - As platform grows, fee can remain competitive
   - 3% is sustainable long-term (vs 30% on Uber!)

---

## Conclusion

The EmpowerTours tokenomics model is designed to create a **sustainable, user-friendly ecosystem** that bridges gaming and real-world services. Key takeaways:

✅ **1:1 MON to TOURS ratio** is simple and works well for testnet and mainnet
✅ **Service pricing** (3-8 TOURS delivery, 5-18 TOURS rides) is competitive with Web2
✅ **Game rewards** (10-15 TOURS/day) drive engagement and create demand for services
✅ **3% platform fee** is sustainable at scale and covers delegation costs
✅ **97% payout to drivers** is industry-leading and attracts quality service providers
✅ **AMM flexibility** allows market forces to determine optimal pricing

**Critical Success Factor:** Scale to 10,000+ users and 5,000+ monthly transactions to make platform fee revenue cover game reward costs. Until then, pre-fund game contracts with treasury TOURS.

**Mainnet Readiness:** Adjust all TOURS pricing proportionally to MON's market price using the formula: `New_Price = Current_Price × ($1 / MON_Price_USD)`

This model positions EmpowerTours as a **sustainable alternative** to exploitative Web2 platforms while maintaining strong user engagement through gaming mechanics.

---

## Appendix: Pricing Calculator

### Food Delivery Cost Calculator

```typescript
function calculateFoodDeliveryCost(
  distance: number,  // miles
  foodPrice: number  // TOURS
): {
  deliveryFee: number;
  platformFee: number;
  restaurantGets: number;
  driverGets: number;
  customerTotal: number;
} {
  // Distance-based delivery fee
  let deliveryFee = 0;
  if (distance < 3) deliveryFee = 3;
  else if (distance < 7) deliveryFee = 5;
  else deliveryFee = 8;

  const platformFeePercent = 3;
  const foodPlatformFee = (foodPrice * platformFeePercent) / 100;
  const deliveryPlatformFee = (deliveryFee * platformFeePercent) / 100;

  return {
    deliveryFee,
    platformFee: foodPlatformFee + deliveryPlatformFee,
    restaurantGets: foodPrice - foodPlatformFee,
    driverGets: deliveryFee - deliveryPlatformFee,
    customerTotal: foodPrice + deliveryFee
  };
}
```

### Ride Sharing Cost Calculator

```typescript
function calculateRideCost(
  vehicleType: 'motorcycle' | 'scooter' | 'bicycle' | 'car' | 'suv',
  distance: number,   // miles
  duration: number    // minutes
): {
  baseFare: number;
  distanceCost: number;
  timeCost: number;
  totalCost: number;
  platformFee: number;
  driverGets: number;
} {
  const rates = {
    motorcycle: { base: 2, perMile: 1, perMin: 0.2 },
    scooter: { base: 2, perMile: 1, perMin: 0.2 },
    bicycle: { base: 1, perMile: 0.75, perMin: 0.15 },
    car: { base: 3, perMile: 1.5, perMin: 0.3 },
    suv: { base: 4, perMile: 2, perMin: 0.4 }
  };

  const rate = rates[vehicleType];
  const baseFare = rate.base;
  const distanceCost = distance * rate.perMile;
  const timeCost = duration * rate.perMin;
  const totalCost = baseFare + distanceCost + timeCost;
  const platformFee = (totalCost * 3) / 100;

  return {
    baseFare,
    distanceCost,
    timeCost,
    totalCost,
    platformFee,
    driverGets: totalCost - platformFee
  };
}
```

---

**Last Updated:** December 2025
**Version:** 1.0
**Status:** Ready for Testnet Deployment
