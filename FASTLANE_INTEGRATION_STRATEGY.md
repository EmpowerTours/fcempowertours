# FastLane Integration Strategy for EmpowerTours

## Overview

FastLane Labs provides infrastructure specifically optimized for Monad's parallel execution model. This document evaluates which FastLane tools to integrate into EmpowerTours.

### ⚠️ Important: Relationship with Pimlico

**EmpowerTours already has Pimlico** as an ERC-4337 bundler/paymaster (26+ files integrated). **This is NOT wasted work!**

**Hybrid Approach:**
- ✅ **Keep Pimlico** - Working bundler, no migration needed
- ✅ **Add FastLane shBundler** - Test in parallel (Monad-optimized)
- ✅ **Integrate shMON** - Liquid staking is the killer feature
- ✅ **Pay gas with shMON yield** - Platform treasury earns while spending

**Key Insight:** Pimlico and FastLane shBundler both serve the same purpose (ERC-4337 bundling). The REAL value from FastLane is **shMON liquid staking** (5% APY on all idle funds) and **validator-integrated bundling** (Monad-specific optimization).

**Decision:** Use both strategically. See `PIMLICO_FASTLANE_HYBRID.md` for architecture details.

---

## FastLane Stack Components

### 1. **ShMonad** (Liquid Staking) ⭐⭐⭐⭐⭐
**Priority: CRITICAL - Integrate Immediately**

#### What It Does
- Stake MON → get shMON
- shMON earns staking rewards + MEV rewards
- Programmable policies for locked/unlocked shMON
- Liquid: can use shMON while earning

#### Why EmpowerTours Needs It
✅ **Already planned** in SHMONAD_INTEGRATION.md with 8 use cases:
1. Savings goals auto-staking (earn 5% APY on trip funds)
2. Group travel pooled staking
3. Experience "hold to earn" (stake while planning trip)
4. Game rewards auto-stake (50% liquid, 50% earning)
5. Daily lottery (already using)
6. Artist ticket staking
7. Service escrow staking (earn while food is being prepared)
8. Platform treasury staking

**Integration Points:**
```solidity
// When user deposits to savings goal
function depositToGoal(uint256 goalId, uint256 monAmount) external {
    // Stake MON → shMON
    uint256 shMonReceived = shMonContract.deposit{value: monAmount}();
    goal.balance += shMonReceived;
    // User earns 5% APY while saving for trip!
}

// When user buys experience
function purchaseExperience(uint256 expId) external {
    // Option: Stake WMON in escrow → earn yield until completion
    // This incentivizes users to complete experiences faster
}
```

**Status:**
- ✅ Architecture designed (SHMONAD_INTEGRATION.md)
- ⏳ Waiting for testnet contract deployment
- 🔜 Update all contracts when address available

---

### 2. **FastLane shBundler** (ERC-4337 Bundler) ⭐⭐⭐⭐
**Priority: HIGH - Test in Parallel with Pimlico**

#### What It Does
- ERC-4337 bundler (same as Pimlico)
- Validator-integrated (Monad-specific optimization)
- Users pay gas with shMON
- Optimized for Monad's parallel execution

#### Why Consider It
✅ **Monad-native optimization (vs generic Pimlico)**

**Current Setup (Pimlico):**
- ✅ Working ERC-4337 bundler
- ✅ 26+ files already integrated
- ✅ Safe Smart Account delegation
- ❌ Not Monad-optimized
- ❌ Can't pay gas with shMON

**FastLane shBundler Benefits:**
```typescript
// Validator-integrated = faster processing
// RPC: https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz

// Pay gas with shMON (earn 5% APY while spending!)
const userOp = await createUserOperation({
  sender: userAddress,
  callData: encodeFunctionCall(...),
  paymasterAndData: FASTLANE_PAYMASTER, // Uses shMON for gas
});
```

**Integration Strategy:**
- ✅ Keep Pimlico as primary (working)
- ✅ Test FastLane in parallel (A/B test)
- ✅ Measure: speed, reliability, cost
- ✅ Migrate IF FastLane proves 2x+ better
- ✅ Use abstraction layer (switch per use case)

**Status:**
- 🔄 **TEST ALONGSIDE PIMLICO**
- 📊 Measure performance before migrating
- 🔜 Deploy alongside Pimlico (not replace)

---

### 3. **Gas Relay** (Session Keys + Gasless) ⭐⭐⭐⭐
**Priority: HIGH - Integrate After Paymaster**

#### What It Does
- Session keys with spending limits
- dApp pays gas, user signs intent
- No popup fatigue
- Works with Safe wallets

#### Why EmpowerTours Needs It
✅ **Eliminates wallet popup fatigue**

**Current Problem:**
- User plays game → popup to sign
- User buys food → popup to sign
- User checks in → popup to sign
- **Result: Bad UX, users quit**

**Gas Relay Solution:**
```typescript
// One-time: User creates session key with daily limit
createSessionKey({
  allowedContracts: [MUSIC_BEAT_MATCH, SERVICE_MARKETPLACE],
  dailyLimit: parseEther("100"), // Max 100 MON/day
  expiresIn: 7 * 24 * 60 * 60, // 1 week
});

// Now user can play games all day with ZERO popups
// Session key auto-approves up to limit
// Platform pays gas via Paymaster
```

**Integration Benefits:**
- ✅ No popup for every game guess
- ✅ Users set daily spending limits (security)
- ✅ Works with existing Safe wallets
- ✅ Platform controls which contracts session keys can access

**Status:**
- 🔥 High priority for UX
- ⏳ Waiting for testnet deployment
- 🔜 Integrate after Paymaster is working

---

### 4. **Task Manager** (On-Chain Cron) ⭐⭐⭐
**Priority: MEDIUM - Nice to Have**

#### What It Does
- On-chain scheduler (like cron jobs)
- Automated contract function calls
- No need for external keeper bots
- Guaranteed execution

#### Why EmpowerTours Might Need It
🤔 **Maybe - depends on reliability**

**Current Setup:**
- Daily challenge creation: Gemini AI API endpoint
- Triggered by cron-job.org (free external service)
- Works fine, but centralized

**Task Manager Alternative:**
```solidity
// Schedule daily challenge creation on-chain
taskManager.scheduleRecurring({
  target: MUSIC_BEAT_MATCH_V2,
  functionSelector: "createDailyChallenge(uint256,string,string,string)",
  interval: 24 hours,
  payment: 1 ether // Pay 1 MON per execution
});

// No need for external cron service!
// Guaranteed to run on-chain
```

**Pros:**
- ✅ Decentralized (no external service dependency)
- ✅ Guaranteed execution
- ✅ No external API needed

**Cons:**
- ❌ Can't call Gemini AI (need off-chain data)
- ❌ More expensive than free cron-job.org
- ❌ Less flexible than API endpoint

**Verdict:**
- ⚠️ **Keep current Gemini AI approach** for daily challenges (need AI intelligence)
- ✅ **Use Task Manager for** simpler recurring tasks:
  - Weekly lottery drawing
  - Monthly leaderboard resets
  - Automated savings goal transfers
  - Experience completion deadline enforcement

**Status:**
- ⏸️ Low priority initially
- 🔜 Evaluate after Paymaster + Gas Relay working
- 💡 Use for time-based automation only

---

### 5. **Atlas** (MEV Protection + Sequencing) ⭐⭐
**Priority: LOW - Future Optimization**

#### What It Does
- Application-specific sequencing
- MEV capture and redistribution
- Fair ordering guarantees
- Solver competition

#### Why EmpowerTours Might Not Need It Yet
🤷 **Overkill for current use case**

**Atlas is designed for:**
- High-value DeFi transactions (swaps, liquidations)
- MEV-sensitive operations
- Auction mechanisms
- Solver-based execution

**EmpowerTours transactions:**
- Game guesses (no MEV value)
- Food orders (no frontrunning risk)
- Experience purchases (no arbitrage)
- Simple transfers

**When Atlas Becomes Useful:**
- 🔮 **Future:** If we add token swaps (MON ↔ TOURS)
- 🔮 **Future:** If we add NFT marketplace with auctions
- 🔮 **Future:** If we add DeFi integrations (lending, AMM)

**Verdict:**
- ❌ **Don't integrate now** - unnecessary complexity
- 🔮 **Revisit in 6-12 months** when platform scales
- 💡 Focus on user-facing features first

**Status:**
- ⏸️ Deprioritized
- 📝 Keep on radar for future

---

## Integration Priority Ranking

### **CRITICAL (Do Now)**
1. **ShMonad** - Liquid staking for savings, escrow, treasury (REAL value-add)

### **HIGH (Test in Parallel)**
2. **FastLane shBundler** - Monad-optimized bundler (test alongside Pimlico)
3. **Gas Relay** - Session keys to eliminate popup fatigue

### **MEDIUM (Nice to Have)**
4. **Task Manager** - Automate time-based operations

### **LOW (Future)**
5. **Atlas** - Only if we add MEV-sensitive features

---

## Implementation Roadmap

### Phase 1: ShMonad Integration (Week 1-2)
**When testnet contracts are deployed:**

```bash
# Update env vars
NEXT_PUBLIC_SHMONAD_ADDRESS=<testnet_address>
```

**Update contracts:**
- TravelSavings.sol - stake deposits
- GroupTravel.sol - stake pooled funds
- ExperienceNFT.sol - stake completion rewards
- ServiceMarketplace.sol - stake escrow funds

**Frontend:**
- Show APY on all staking opportunities
- "Earning 5% APY" badges
- Savings goal progress includes yield

---

### Phase 2: FastLane shBundler Testing (Week 3-4)
**Test alongside Pimlico (not replace):**

**Current (Pimlico - Keep Running):**
```typescript
// Platform Safe pays gas for user
await executeDelegated(userAddress, functionCall);
// Uses: https://api.pimlico.io/v2/monad-testnet/rpc
```

**New (FastLane shBundler - Test in Parallel):**
```typescript
// Create bundler abstraction layer
const bundlerUrl = getBundlerUrl('fastlane'); // or 'pimlico'

// Test FastLane with 10% of transactions
const userOp = await createUserOperation({
  sender: userAddress,
  callData: encodeFunctionCall(...),
  paymasterAndData: FASTLANE_PAYMASTER, // Uses shMON for gas
});
await sendUserOperation(userOp, bundlerUrl);
```

**Test Metrics:**
- Speed: tx confirmation time (Pimlico vs FastLane)
- Reliability: success rate over 1000 txs
- Cost: gas fees comparison
- shMON integration: verify gas paid from staking yield

**Decision Criteria:**
- Migrate IF FastLane is 2x+ faster AND more reliable
- Otherwise: Keep Pimlico, use FastLane for shMON gas payments only

---

### Phase 3: Gas Relay Integration (Week 5-6)
**Add session key management:**

**Frontend flow:**
```typescript
// One-time setup per user
const sessionKey = await gasRelay.createSessionKey({
  allowedContracts: [
    MUSIC_BEAT_MATCH_V2,
    COUNTRY_COLLECTOR_V2,
    SERVICE_MARKETPLACE,
    EXPERIENCE_NFT,
  ],
  dailyLimit: parseEther("100"),
  expiresIn: 7 * 24 * 60 * 60, // 1 week
});

// Store in local storage
localStorage.setItem('sessionKey', sessionKey);

// Now all actions use session key = NO POPUPS!
```

**User settings page:**
- View active session keys
- Set daily limits
- Revoke keys
- See spending history

---

### Phase 4: Task Manager (Optional - Month 2)
**Automate recurring tasks:**

```solidity
// Weekly lottery drawing
taskManager.scheduleRecurring(
  LOTTERY_ADDRESS,
  "drawWinner()",
  7 days
);

// Monthly leaderboard reset
taskManager.scheduleRecurring(
  MUSIC_BEAT_MATCH_V2,
  "resetMonthlyLeaderboard()",
  30 days
);
```

---

## Testnet Addresses

### FastLane shBundler (LIVE on Monad Testnet)
```typescript
// lib/contracts.ts
export const FASTLANE_BUNDLER_URL = 'https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz';

export const FASTLANE_CONTRACTS = {
  SHMONAD: '0x...' as Address,              // ⏳ Waiting for deployment
  PAYMASTER: FASTLANE_BUNDLER_URL,          // ✅ LIVE (bundler + paymaster)
  GAS_RELAY: '0x...' as Address,            // ⏳ Waiting
  TASK_MANAGER: '0x...' as Address,         // ⏳ Waiting
  ATLAS: '0x...' as Address,                // ⏳ Waiting (deprioritized)
};
```

### Pimlico (Current - Keep)
```typescript
export const PIMLICO_BUNDLER_URL = `https://api.pimlico.io/v2/monad-testnet/rpc?apikey=${PIMLICO_API_KEY}`;
export const ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'; // v0.7
```

**Monitoring:**
- Watch https://github.com/FastLane-Labs/fastlane-contracts/tree/testnet-shmonad-v0
- Join FastLane Discord for deployment announcements
- Test both bundlers in parallel before full migration

---

## Cost-Benefit Analysis

### With FastLane Integration

**Current Cost (Per 1000 Users/Day):**
```
Daily game guesses: 1000 users × 1 guess × 0.01 MON gas = 10 MON/day
Food orders: 100 orders × 0.02 MON gas = 2 MON/day
Total: ~12 MON/day × 30 days = 360 MON/month
```

**With Paymaster (Paying from shMON Yield):**
```
Platform stakes 10,000 MON → earns 5% APY = 500 MON/year = 41.67 MON/month
Gas costs paid from yield: 360 MON/month

Net cost: 360 - 41.67 = 318.33 MON/month
Savings: 11.6%
```

**With Larger Treasury:**
```
Platform stakes 100,000 MON → earns 416.67 MON/month
Gas costs: 360 MON/month
Net cost: PROFITABLE! (+56.67 MON/month)
```

**Conclusion:** Once platform has enough MON staked, gasless transactions become **FREE** (paid by staking yield)!

---

## Security Considerations

### ShMonad
- ✅ Audited by FastLane team
- ⚠️ Smart contract risk (staking lock-ups)
- ✅ Liquid (can unstake anytime, but may have delay)

### Paymaster
- ✅ ERC-4337 standard (widely audited)
- ⚠️ Platform must fund paymaster with shMON
- ✅ Can set spending limits per user

### Gas Relay
- ✅ Session keys are revocable
- ⚠️ Daily limits must be set conservatively
- ✅ Users can revoke at any time
- ⚠️ Session key compromise = limited damage (daily limit)

**Best Practices:**
1. Start with low daily limits (10 MON/day)
2. Monitor for abuse patterns
3. Implement rate limiting
4. Require re-auth for high-value txs (>100 MON)

---

## Testing Strategy

### Phase 1: Testnet Testing (2 weeks)
1. Deploy all contracts to Monad testnet
2. Integrate ShMonad staking in TravelSavings
3. Test Paymaster with game transactions
4. Test Gas Relay with session keys
5. Monitor gas costs and yield generation

### Phase 2: Beta Testing (1 month)
1. Invite 50 beta users
2. Provide testnet MON
3. Monitor UX improvements
4. Track gas savings
5. Collect feedback on session keys

### Phase 3: Mainnet Migration (Month 3)
1. Audit all FastLane integrations
2. Deploy to mainnet
3. Gradual rollout (10% → 50% → 100% of users)
4. Monitor costs and performance
5. Optimize based on real data

---

## Success Metrics

### UX Improvements
- [ ] Wallet popup count reduced by 90%
- [ ] New user onboarding time < 30 seconds
- [ ] Zero "you need MON for gas" errors
- [ ] User retention increased by 30%

### Cost Savings
- [ ] Gas costs reduced by 50%
- [ ] Platform treasury self-sustaining (yield > costs)
- [ ] Gas paid by staking yield alone

### Technical Performance
- [ ] Transaction success rate > 99%
- [ ] Average tx confirmation time < 5 seconds
- [ ] Zero security incidents
- [ ] Uptime > 99.9%

---

## Conclusion: Hybrid Approach

### ✅ Keep (Already Working)
1. **Pimlico** - ERC-4337 bundler (26+ files integrated, battle-tested)

### ✅ Integrate (Critical Value)
2. **ShMonad** - Liquid staking for all idle funds (5% APY)
3. **FastLane shBundler** - Test alongside Pimlico (Monad-optimized)

### ✅ Evaluate (Nice to Have)
4. **Gas Relay** - Session keys to eliminate popup fatigue
5. **Task Manager** - Automate time-based tasks
6. **Atlas** - Only if we add DeFi/MEV-sensitive features

### Timeline
- **Week 1-2:** ShMonad integration (when deployed)
- **Week 3-4:** FastLane shBundler testing (alongside Pimlico)
- **Week 5-6:** Bundler comparison analysis
- **Week 7-8:** Migrate to FastLane OR keep Pimlico (data-driven decision)
- **Month 2+:** Gas Relay, Task Manager (optional)
- **Month 6+:** Atlas (if needed)

### The Hybrid Strategy
**Don't replace Pimlico** - it's working. **Add FastLane strategically:**
- Use shMON for liquid staking (5% APY on treasury)
- Test FastLane bundler in parallel (validator-optimized)
- Pay gas from shMON yield (sustainable!)
- Choose best bundler per use case (abstraction layer)

**Result:** EmpowerTours transforms from "Web3 app with gas costs" to "Farcaster mini app with PROFITABLE gasless UX" (staking yield > gas costs).

---

**Last Updated:** December 2025
**Status:** Hybrid architecture designed - see `PIMLICO_FASTLANE_HYBRID.md`
**Next Step:** Integrate shMONAD when deployed, test FastLane bundler in parallel
