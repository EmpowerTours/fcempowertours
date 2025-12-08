# Pimlico + FastLane Hybrid Architecture

## Executive Summary

EmpowerTours will use **BOTH** Pimlico and FastLane strategically:

- **Pimlico**: Primary ERC-4337 bundler (already integrated, battle-tested)
- **FastLane shBundler**: Monad-optimized alternative (test in parallel)
- **shMON**: Liquid staking for all idle funds (critical value-add)
- **Strategy**: Keep what works, test what's better, integrate what's unique

---

## Current State: Pimlico Infrastructure

### What's Already Working ✅

**Bundler**: `https://api.pimlico.io/v2/monad-testnet/rpc?apikey={key}`
**EntryPoint**: `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (ERC-4337 v0.7)
**Integration**: 26+ files across codebase

### Key Files Using Pimlico

```
lib/pimlico/config.ts          - Pimlico client setup
lib/pimlico/smartAccount.ts    - MetaMask Smart Account
lib/pimlico-safe-aa.ts         - Safe Smart Account (850+ lines)
lib/user-safe.ts               - User-funded Safe mode
app/api/execute-delegated/     - Delegation system
app/api/stake-music/           - Music NFT staking
app/api/unstake-music/         - Music NFT unstaking
app/api/claim-rewards/         - Reward claims
+ 18 more files...
```

### How It Works

```typescript
// Platform Safe pays gas for user actions
const safeSmartAccount = await toSafeSmartAccount({
  client: publicClient,
  owners: [safeOwnerAccount],
  entryPoint: {
    address: ENTRYPOINT_ADDRESS,
    version: '0.7',
  },
});

const smartAccountClient = createSmartAccountClient({
  account: safeSmartAccount,
  chain: monadTestnet,
  bundlerTransport: http(PIMLICO_BUNDLER_URL),
  paymaster: pimlicoClient, // Pimlico sponsors gas
});

// Send UserOperation through Pimlico
const userOpHash = await smartAccountClient.sendUserOperation({
  account: smartAccountClient.account,
  calls: [{
    to: CONTRACT_ADDRESS,
    value: 0n,
    data: encodeFunctionData(...),
  }],
});
```

### What Pimlico Provides

1. **ERC-4337 Bundling** - Bundles UserOperations into transactions
2. **Paymaster** - Sponsors gas fees for users
3. **Safe Integration** - Works with Safe Smart Accounts
4. **Gas Estimation** - Accurate gas price fetching and estimation
5. **Battle-tested** - Widely used across EVM chains

---

## FastLane Alternative

### What FastLane Offers

**shBundler**: `https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz`
**EntryPoint**: Same (`0x0000000071727De22E5E9d8BAf0edAc6f37da032` - ERC-4337 standard)

### Key Differences vs Pimlico

| Feature | Pimlico | FastLane shBundler |
|---------|---------|-------------------|
| **ERC-4337 Compliant** | ✅ Yes | ✅ Yes |
| **Monad Testnet Support** | ✅ Yes | ✅ Yes |
| **Battle-tested** | ✅ Production-ready | ⚠️ Newer |
| **Integration Effort** | ✅ Already done (26+ files) | ❌ Requires migration |
| **Monad-optimized** | ❌ Generic bundler | ✅ Validator-integrated |
| **Gas Payment** | MON/ETH | ✅ shMON (liquid staking!) |
| **Parallel Execution** | ❌ Standard | ✅ Monad-specific optimization |
| **MEV Handling** | Standard | ✅ Robust escrow for async execution |

### FastLane's Unique Value

#### 1. Validator-Integrated Bundling
```typescript
// Pimlico: Middleware bundler (external service)
// FastLane: Direct integration with Monad validators

// Potential benefits:
// - Faster transaction processing
// - Lower latency
// - Better handling of Monad's 2-block execution lag
```

#### 2. shMON Gas Payments (THE KILLER FEATURE!)
```typescript
// Pay gas with shMON (earning 5% APY while spending!)
const userOp = await createUserOperation({
  sender: userAddress,
  callData: encodeFunctionCall(...),
  paymasterAndData: FASTLANE_PAYMASTER,
});

// Platform treasury: Stake 100,000 MON → earn 416 MON/month
// Gas costs: 360 MON/month
// Net result: +56 MON/month PROFITABLE!
```

#### 3. Monad-Specific Optimizations
- Handles asynchronous execution model
- Escrow system for delayed solvency
- Optimized for parallel transaction processing

---

## Hybrid Architecture Strategy

### Phase 1: Keep Pimlico (Baseline)

**Status**: ✅ Production-ready
**Action**: No changes needed
**Rationale**: Working infrastructure, 26+ files integrated

```typescript
// Continue using Pimlico for all current operations
const pimlicoClient = createPimlicoClient({
  transport: http(PIMLICO_BUNDLER_URL),
  entryPoint: entryPoint07Address,
});
```

### Phase 2: Add FastLane Abstraction Layer

**New file**: `lib/bundler-config.ts`

```typescript
export type BundlerProvider = 'pimlico' | 'fastlane';

export function getBundlerUrl(provider: BundlerProvider = 'pimlico'): string {
  switch (provider) {
    case 'pimlico':
      return env.PIMLICO_BUNDLER_URL;
    case 'fastlane':
      return env.FASTLANE_BUNDLER_URL;
    default:
      return env.PIMLICO_BUNDLER_URL; // Fallback
  }
}

export function shouldUseFastLane(userAddress: Address): boolean {
  // A/B test: 10% of transactions use FastLane
  const hash = hashMessage(userAddress);
  return parseInt(hash.slice(-2), 16) < 26; // ~10%
}

export async function createBundlerClient(provider: BundlerProvider) {
  const bundlerUrl = getBundlerUrl(provider);

  return createPimlicoClient({
    transport: http(bundlerUrl),
    entryPoint: entryPoint07Address,
  });
}
```

### Phase 3: Parallel Testing (A/B Test)

**Goal**: Compare performance metrics

```typescript
// lib/bundler-metrics.ts
interface BundlerMetrics {
  provider: BundlerProvider;
  txHash: string;
  userOpHash: string;
  startTime: number;
  confirmationTime: number;
  gasUsed: bigint;
  success: boolean;
  error?: string;
}

export async function sendUserOpWithMetrics(
  userOp: UserOperation,
  provider: BundlerProvider
): Promise<BundlerMetrics> {
  const startTime = Date.now();
  const bundlerClient = await createBundlerClient(provider);

  try {
    const userOpHash = await bundlerClient.sendUserOperation(userOp);
    const receipt = await bundlerClient.waitForUserOperationReceipt({ hash: userOpHash });

    return {
      provider,
      txHash: receipt.receipt.transactionHash,
      userOpHash,
      startTime,
      confirmationTime: Date.now() - startTime,
      gasUsed: receipt.receipt.gasUsed,
      success: receipt.success,
    };
  } catch (error) {
    return {
      provider,
      txHash: '',
      userOpHash: '',
      startTime,
      confirmationTime: Date.now() - startTime,
      gasUsed: 0n,
      success: false,
      error: error.message,
    };
  }
}
```

### Phase 4: Data-Driven Decision

**Test Criteria** (run 1000 transactions each):

| Metric | Target | Decision |
|--------|--------|----------|
| **Confirmation Time** | FastLane < 0.5x Pimlico | ✅ Migrate |
| **Success Rate** | FastLane > 99% AND > Pimlico | ✅ Migrate |
| **Gas Cost** | FastLane ≤ Pimlico | ✅ Neutral |
| **Error Rate** | FastLane < Pimlico | ✅ Migrate |

**Migration Decision Tree**:
```
IF FastLane is 2x+ faster AND more reliable:
  → Migrate all transactions to FastLane
  → Keep Pimlico as fallback

ELSE IF FastLane is marginally better:
  → Use FastLane for high-priority txs (game submissions, purchases)
  → Use Pimlico for low-priority txs (background tasks)

ELSE IF FastLane is equal or worse:
  → Keep Pimlico as primary
  → Use FastLane only for shMON gas payments
```

---

## shMON Integration (Independent of Bundler Choice)

### Critical Insight

**shMON liquid staking is THE REAL VALUE** - it works with EITHER bundler!

```typescript
// When user deposits to savings goal
function depositToGoal(uint256 goalId, uint256 monAmount) external {
  // Stake MON → get shMON
  uint256 shMonReceived = shMonContract.deposit{value: monAmount}();
  goal.balance += shMonReceived;
  // User earns 5% APY while saving for trip!
}

// Platform treasury staking (for gas payments)
function stakeTreasury(uint256 monAmount) external onlyOwner {
  uint256 shMonReceived = shMonContract.deposit{value: monAmount}();
  treasuryShMon += shMonReceived;
  // Earn yield to pay for gas fees!
}
```

### shMON + Bundler Integration

```typescript
// Option A: Pay gas with shMON via FastLane
const userOp = await createUserOperation({
  sender: userAddress,
  callData: encodeFunctionCall(...),
  paymasterAndData: FASTLANE_PAYMASTER, // Uses platform's shMON
});

// Option B: Pay gas with MON via Pimlico
const userOp = await createUserOperation({
  sender: userAddress,
  callData: encodeFunctionCall(...),
  paymasterAndData: PIMLICO_PAYMASTER, // Uses platform's MON
});

// BOTH earn from shMON staking in treasury!
```

---

## Implementation Roadmap

### Week 1: Infrastructure Setup
- [x] Update `FASTLANE_INTEGRATION_STRATEGY.md` with hybrid approach
- [x] Create `PIMLICO_FASTLANE_HYBRID.md` architecture doc
- [ ] Add `FASTLANE_BUNDLER_URL` to `lib/env.ts`
- [ ] Create `lib/bundler-config.ts` abstraction layer
- [ ] Update `.env.example`

### Week 2: Testing Framework
- [ ] Create `lib/bundler-metrics.ts` for performance tracking
- [ ] Add A/B test logic to `app/api/execute-delegated/route.ts`
- [ ] Deploy test endpoint `/api/test-bundler`
- [ ] Set up metrics collection (Vercel Analytics or custom)

### Week 3-4: Parallel Testing
- [ ] Run 1000 transactions through Pimlico (baseline)
- [ ] Run 1000 transactions through FastLane (test)
- [ ] Compare metrics: speed, reliability, cost
- [ ] Document findings

### Week 5-6: Decision & Migration (If Beneficial)
- [ ] Analyze data
- [ ] Make migration decision
- [ ] IF migrating: Update all 26+ files gradually
- [ ] Keep Pimlico as fallback
- [ ] Monitor production metrics

### Week 7+: shMON Integration (Independent)
- [ ] Wait for shMON testnet deployment
- [ ] Integrate shMON in TravelSavings.sol
- [ ] Integrate shMON in ServiceMarketplace.sol
- [ ] Stake platform treasury in shMON
- [ ] Test gas payments from shMON yield

---

## Environment Variables

### Update `lib/env.ts`

```typescript
export const env = {
  // ... existing vars ...

  // Pimlico (Current)
  PIMLICO_API_KEY: process.env.NEXT_PUBLIC_PIMLICO_API_KEY || '',
  PIMLICO_BUNDLER_URL: process.env.NEXT_PUBLIC_PIMLICO_BUNDLER_URL || '',

  // FastLane (New)
  FASTLANE_BUNDLER_URL: process.env.NEXT_PUBLIC_FASTLANE_BUNDLER_URL ||
    'https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz',
  FASTLANE_ENABLED: process.env.NEXT_PUBLIC_FASTLANE_ENABLED === 'true',

  // shMON (When deployed)
  SHMONAD_ADDRESS: process.env.NEXT_PUBLIC_SHMONAD_ADDRESS || '',

  // Shared
  ENTRYPOINT_ADDRESS: process.env.NEXT_PUBLIC_ENTRYPOINT_ADDRESS ||
    '0x0000000071727De22E5E9d8BAf0edAc6f37da032', // v0.7
} as const;
```

### Update `.env.example`

```bash
# ERC-4337 Account Abstraction

## Pimlico (Current Bundler)
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key
NEXT_PUBLIC_PIMLICO_BUNDLER_URL=https://api.pimlico.io/v2/monad-testnet/rpc

## FastLane (Monad-Optimized Bundler - Testing)
NEXT_PUBLIC_FASTLANE_BUNDLER_URL=https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz
NEXT_PUBLIC_FASTLANE_ENABLED=false  # Set to 'true' to enable A/B testing

## Shared
NEXT_PUBLIC_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032

## shMON Liquid Staking (FastLane)
NEXT_PUBLIC_SHMONAD_ADDRESS=  # TBD - waiting for testnet deployment
```

---

## Cost Analysis: Pimlico vs FastLane

### Scenario 1: Keep Pimlico Only

```
Platform Safe pays gas: 360 MON/month
Platform treasury staked in shMON: 100,000 MON → 416 MON/month yield
Net: +56 MON/month (PROFITABLE!)

Benefit: Works with existing infrastructure
```

### Scenario 2: Migrate to FastLane

```
FastLane pays gas from shMON: 360 MON/month
Platform treasury staked in shMON: 100,000 MON → 416 MON/month yield
Net: +56 MON/month (SAME PROFITABILITY!)

Additional benefits:
- Validator-integrated (potentially faster)
- Monad-specific optimizations
- Better async execution handling
```

### Scenario 3: Hybrid (Use Both)

```
Pimlico for standard txs: 180 MON/month
FastLane for priority txs: 180 MON/month
Total gas: 360 MON/month
Platform treasury yield: 416 MON/month
Net: +56 MON/month (SAME PROFITABILITY!)

Benefits:
- Redundancy (if one bundler fails)
- A/B testing continuous
- Use best bundler per use case
```

---

## Risk Analysis

### Keeping Pimlico Only
✅ **Pros**: No migration effort, battle-tested
❌ **Cons**: Not Monad-optimized, can't pay gas with shMON directly

### Migrating to FastLane Fully
✅ **Pros**: Monad-optimized, validator-integrated, shMON gas payments
❌ **Cons**: Migration effort (26+ files), newer infrastructure

### Hybrid Approach (RECOMMENDED)
✅ **Pros**: Best of both worlds, gradual migration, data-driven
✅ **Pros**: Redundancy, flexibility, minimize risk
❌ **Cons**: Slightly more complex infrastructure

---

## Decision Framework

### When to Use Pimlico
- ✅ Standard user transactions (game guesses, check-ins)
- ✅ Low-priority background tasks
- ✅ Fallback when FastLane unavailable
- ✅ Existing integrations that work fine

### When to Use FastLane
- ✅ High-priority transactions (purchases, escrow)
- ✅ When shMON gas payment is needed
- ✅ Monad-specific optimizations required
- ✅ After testing proves 2x+ better performance

### When to Use Both (Hybrid)
- ✅ During testing phase (A/B test)
- ✅ For redundancy (production resilience)
- ✅ Use case specific (different txs, different bundlers)
- ✅ When neither clearly dominates

---

## Success Metrics

### Technical Performance
- [ ] Transaction confirmation time < 3 seconds (both bundlers)
- [ ] Success rate > 99% (both bundlers)
- [ ] Gas costs within 10% (both bundlers)
- [ ] Zero downtime (redundancy working)

### Economic Performance
- [ ] Platform treasury earning > gas costs (profitable!)
- [ ] shMON integration generating 5% APY
- [ ] Gas payments sustainable from yield alone

### User Experience
- [ ] Zero "need gas" errors (gasless UX)
- [ ] Fast transaction confirmations
- [ ] Reliable execution (no failed txs)
- [ ] Transparent to users (they don't care which bundler)

---

## Conclusion

**The hybrid approach gives us:**

1. **Safety**: Keep Pimlico as baseline (working)
2. **Innovation**: Test FastLane in parallel (Monad-optimized)
3. **Profitability**: Integrate shMON staking (5% APY > gas costs)
4. **Flexibility**: Choose best bundler per use case
5. **Data-driven**: Migrate only if FastLane proves better

**This is NOT an either/or decision** - we can use both strategically and let data guide us to the optimal configuration.

**Next steps:**
1. Add FastLane to environment config
2. Create bundler abstraction layer
3. Run parallel testing (1000 txs each)
4. Analyze data and decide migration strategy
5. Integrate shMON when deployed (works with either bundler!)

---

**Last Updated**: December 2025
**Status**: Architecture designed, ready for implementation
**Owner**: Platform Team
