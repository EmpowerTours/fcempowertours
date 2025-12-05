# Lottery-Funded Gas Economics

## Overview
Instead of users paying gas for every transaction, the lottery funds a gas pool that covers all delegated operations.

## Current Lottery Economics

**Entry Fee:** 1 MON per day
- **90%** (0.9 MON) → Prize Pool (winner gets it all)
- **10%** (0.1 MON) → Platform Wallet

**Platform Wallet splits:**
- **50%** of platform fee → Platform Profit (0.05 MON per entry)
- **50%** of platform fee → Gas Fund (0.05 MON per entry)

## Gas Fund Sustainability

### Daily Projections

| Users/Day | Gas Fund/Day | Gas Fund/Week | Gas Fund/Month |
|-----------|--------------|---------------|----------------|
| 10        | 0.5 MON      | 3.5 MON       | 15 MON         |
| 50        | 2.5 MON      | 17.5 MON      | 75 MON         |
| 100       | 5 MON        | 35 MON        | 150 MON        |
| 500       | 25 MON       | 175 MON       | 750 MON        |

### Gas Cost per Operation (Monad Testnet)

| Operation            | Gas Cost | MON Cost (@1 Gwei) |
|---------------------|----------|-------------------|
| Lottery Entry       | ~100k    | ~0.0001 MON       |
| Swap MON→TOURS      | ~150k    | ~0.00015 MON      |
| Mint Music NFT      | ~200k    | ~0.0002 MON       |
| Stake TOURS         | ~120k    | ~0.00012 MON      |
| Burn NFT            | ~100k    | ~0.0001 MON       |

**Average:** ~0.00015 MON per gasless transaction

### Sustainability Analysis

**With 50 users/day:**
- Gas Fund: 2.5 MON/day
- If each user does 5 gasless ops/day: 250 ops
- Gas cost: 250 × 0.00015 = 0.0375 MON
- **Surplus: 2.4625 MON/day** ✅

**With 100 users/day:**
- Gas Fund: 5 MON/day
- If each user does 10 gasless ops/day: 1000 ops
- Gas cost: 1000 × 0.00015 = 0.15 MON
- **Surplus: 4.85 MON/day** ✅

## Implementation Plan

### Phase 1: Backend Gas Management
1. Platform wallet receives 10% of all lottery entries
2. Backend script automatically transfers:
   - 50% → Platform profit wallet
   - 50% → Bot signer wallet (gas fund)
3. Monitor bot signer balance, alert if low

### Phase 2: Smart Contract Gas Fund (Optional)
If we want full transparency:
1. Deploy new lottery contract with 3-way split
2. Automatic distribution to 3 addresses:
   - 90% → Prize escrow
   - 5% → Platform wallet
   - 5% → Gas fund wallet

## Monitoring & Alerts

Track daily:
- Total lottery entries
- Gas fund balance
- Gas consumed
- Burn rate vs. income rate

Alert thresholds:
- 🟢 Green: Gas fund > 10 MON
- 🟡 Yellow: Gas fund < 5 MON
- 🔴 Red: Gas fund < 1 MON (increase split or pause gasless)

## Benefits

✅ **User Experience:** Pay once daily, use app gaslessly
✅ **Sustainable:** Gas fund grows faster than consumption
✅ **Flexible:** Can adjust split % based on usage
✅ **Transparent:** All funded by lottery, not VC money
