# Migration Guide: V8 → V9

## Overview

This guide covers migrating from the **broken V8 contract** to the **fixed V9 contract** with proper Kintsu unstaking support.

⚠️ **CRITICAL:** V8 cannot unstake from Kintsu. All users must migrate to V9.

---

## Migration Strategy

### Option 1: Fresh Deployment (Recommended)

**Best for:** New deployments or when V8 has no active positions

1. Deploy V9 contract
2. Update frontend to point to V9
3. Deprecate V8 (mark as deprecated in UI)
4. Users create new positions in V9

### Option 2: Gradual Migration

**Best for:** V8 has existing active positions

1. Deploy V9 contract alongside V8
2. Allow V8 positions to complete naturally
3. Redirect new stakes to V9
4. Eventually sunset V8 when all positions closed

### Option 3: Emergency Migration (If V8 is stuck)

**Best for:** V8 positions cannot unstake and need rescue

⚠️ This requires admin intervention and may need custom recovery contract

---

## Pre-Migration Checklist

- [ ] Check how many active V8 positions exist
- [ ] Identify users with V8 positions
- [ ] Determine if any V8 unstakes are stuck
- [ ] Test V9 deployment on testnet
- [ ] Prepare user communication
- [ ] Update frontend code
- [ ] Prepare rollback plan

---

## Step-by-Step Migration

### Phase 1: Deploy V9

```bash
# 1. Deploy V9 contract
forge script contracts/script/DeployV9.s.sol:DeployV9 \
  --rpc-url monad_testnet \
  --broadcast \
  --verify \
  -vvvv

# 2. Save deployed address
V9_ADDRESS=<deployed_address>

# 3. Whitelist Passport NFT
cast send $V9_ADDRESS \
  "whitelistNFT(address,bool)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  true \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz

# 4. Verify whitelisting
cast call $V9_ADDRESS \
  "acceptedNFTs(address)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  --rpc-url https://testnet-rpc.monad.xyz
```

### Phase 2: Update Frontend

#### 2.1 Update Environment Variables

```bash
# .env.local
NEXT_PUBLIC_YIELD_STRATEGY_V8=0x... # Old V8 address (for reference)
NEXT_PUBLIC_YIELD_STRATEGY=0x...    # New V9 address
```

#### 2.2 Update Contract Config

```typescript
// src/config/contracts.ts

// Keep V8 config for backward compatibility
export const yieldStrategyV8Config = {
  address: process.env.NEXT_PUBLIC_YIELD_STRATEGY_V8 as Address,
  abi: YieldStrategyV8ABI,
  chainId: 41454,
};

// Add V9 config (primary)
export const yieldStrategyConfig = {
  address: process.env.NEXT_PUBLIC_YIELD_STRATEGY as Address,
  abi: YieldStrategyV9ABI,
  chainId: 41454,
};
```

#### 2.3 Update Hook Imports

```typescript
// OLD
import { useYieldStrategy } from '@/hooks/useYieldStrategy';

// NEW
import { useYieldStrategyV9 } from '@/hooks/useYieldStrategyV9';
import { useYieldStrategy as useYieldStrategyV8 } from '@/hooks/useYieldStrategy'; // For V8 positions
```

#### 2.4 Update Staking Component

```typescript
// components/StakingUI.tsx

import { useYieldStrategyV9 } from '@/hooks/useYieldStrategyV9';
import { useYieldStrategy as useYieldStrategyV8 } from '@/hooks/useYieldStrategy';

export function StakingUI() {
  // V9 for new stakes
  const {
    stakeWithDeposit,
    requestUnstake,
    finalizeUnstake,
    cancelUnstake,
    useGetUserPositions: useGetV9Positions,
  } = useYieldStrategyV9();

  // V8 for legacy positions (read-only)
  const { useGetUserPositions: useGetV8Positions } = useYieldStrategyV8();

  const v9Positions = useGetV9Positions(userAddress);
  const v8Positions = useGetV8Positions(userAddress);

  return (
    <div>
      {/* New staking always goes to V9 */}
      <StakeForm onStake={(nft, amount) => stakeWithDeposit(nft, 0, userAddress, amount)} />

      {/* Show V9 positions */}
      <h2>Active Positions (V9)</h2>
      {v9Positions?.map(positionId => (
        <PositionCardV9
          key={positionId}
          positionId={positionId}
          onRequestUnstake={requestUnstake}
          onFinalizeUnstake={finalizeUnstake}
          onCancelUnstake={cancelUnstake}
        />
      ))}

      {/* Show V8 positions with migration warning */}
      {v8Positions?.length > 0 && (
        <>
          <h2>Legacy Positions (V8) ⚠️</h2>
          <div className="bg-yellow-100 p-4 rounded">
            <p>These positions are on the old V8 contract.</p>
            <p>V8 cannot unstake from Kintsu. Please contact support for migration.</p>
          </div>
          {v8Positions.map(positionId => (
            <PositionCardV8ReadOnly key={positionId} positionId={positionId} />
          ))}
        </>
      )}
    </div>
  );
}
```

### Phase 3: Handle V8 Positions

#### Scenario A: V8 Position Never Staked to Kintsu (Contract Holds MON)

If V8 contract has MON balance that was never deposited to Kintsu:

```bash
# Check V8 contract MON balance
cast balance <V8_ADDRESS> --rpc-url https://testnet-rpc.monad.xyz

# If balance > 0, owner can emergency withdraw
cast send <V8_ADDRESS> \
  "emergencyWithdrawMON(uint256)" \
  <amount_in_wei> \
  --private-key $OWNER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz

# Then manually refund users or create positions in V9
```

#### Scenario B: V8 Position Staked to Kintsu (Stuck)

If MON is stuck in Kintsu via V8 contract:

**Option 1: Wait for Kintsu to return funds naturally**
- Kintsu may eventually distribute unbonded funds
- Monitor V8 contract balance
- When funds arrive, use emergencyWithdrawMON

**Option 2: Manual Kintsu interaction from V8 contract**
- Deploy a helper contract that can call Kintsu on behalf of V8
- Transfer V8 ownership to helper contract temporarily
- Execute proper unlock sequence via helper
- Recover funds to V8
- Emergency withdraw to refund users

**Option 3: Create migration contract**
```solidity
// MigrationHelper.sol
contract V8toV9Migration {
    // Track V8 position → V9 position mapping
    // Allow users to claim equivalent position in V9
    // Owner funds the migration pool
}
```

### Phase 4: User Communication

#### Email/Announcement Template

```
Subject: Important: YieldStrategy Upgrade to V9

Dear Users,

We've deployed an upgraded version (V9) of our YieldStrategy contract that fixes a critical issue with unstaking from Kintsu.

What's Changed:
- V9 implements proper two-step unstaking (request → wait ~7 days → finalize)
- V9 correctly integrates with Kintsu V2 interface
- V8 cannot unstake from Kintsu and is deprecated

Action Required:
1. New stakes: Use V9 contract only (automatic in updated UI)
2. Existing V8 positions: [Choose based on your situation]
   - If you have active V8 positions, contact support
   - If no V8 positions, no action needed

Migration Timeline:
- V9 deployed: [Date]
- V8 deprecated: [Date]
- V8 sunset: [Date] (no new operations)

Questions?
Contact support at: [email/discord]

Thank you for your patience!
```

---

## Frontend Code Changes Summary

### New Imports

```typescript
// Add V9 hook
import { useYieldStrategyV9, PositionState } from '@/hooks/useYieldStrategyV9';

// Keep V8 for legacy support
import { useYieldStrategy as useYieldStrategyV8 } from '@/hooks/useYieldStrategy';
```

### Updated Functions

```typescript
// OLD (V8 - Single step)
const { unstake } = useYieldStrategy();
await unstake(positionId);

// NEW (V9 - Two steps)
const { requestUnstake, finalizeUnstake, cancelUnstake } = useYieldStrategyV9();

// Step 1
await requestUnstake(positionId);

// Step 2 (7 days later)
await finalizeUnstake(positionId);
```

### New UI Components Needed

1. **Cooldown Timer**
```typescript
<CooldownTimer
  requestTime={position.unlockRequest.requestTime}
  cooldownPeriod={ESTIMATED_COOLDOWN_PERIOD}
  onReady={() => setCanFinalize(true)}
/>
```

2. **Position State Badge**
```typescript
<PositionStateBadge state={position.state} />
// Shows: Active | Pending Withdrawal | Closed
```

3. **Two-Step Unstake UI**
```typescript
{position.state === PositionState.Active && (
  <button onClick={() => requestUnstake(positionId)}>
    Request Unstake
  </button>
)}

{position.state === PositionState.PendingWithdrawal && (
  <>
    <CooldownTimer {...cooldownProps} />
    <button onClick={() => finalizeUnstake(positionId)} disabled={!isReady}>
      Finalize Unstake
    </button>
    <button onClick={() => cancelUnstake(positionId)}>
      Cancel
    </button>
  </>
)}
```

---

## Testing Migration

### Test Plan

1. **Deploy V9 to testnet**
   - Verify deployment
   - Whitelist NFT
   - Test deposit

2. **Test V9 staking flow**
   - Create position
   - Request unstake
   - Cancel unstake
   - Request unstake again
   - Wait cooldown
   - Finalize unstake

3. **Test frontend migration**
   - Can create V9 positions
   - Can view V9 positions
   - Can view legacy V8 positions
   - Migration warning shows for V8

4. **Test edge cases**
   - User has both V8 and V9 positions
   - User only has V8 positions
   - User only has V9 positions

---

## Rollback Plan

If V9 deployment fails or has critical bugs:

1. **Keep V8 addresses in config**
```typescript
// Emergency rollback
export const yieldStrategyConfig = yieldStrategyV8Config;
```

2. **Frontend feature flag**
```typescript
const USE_V9 = process.env.NEXT_PUBLIC_USE_V9 === 'true';

const hooks = USE_V9 ? useYieldStrategyV9() : useYieldStrategyV8();
```

3. **Gradual rollout**
```typescript
// Canary deployment - only some users get V9
const useV9 = isCanaryUser(userAddress);
```

---

## Post-Migration Monitoring

### Metrics to Track

- [ ] Number of V9 positions created
- [ ] Number of successful V9 unstakes
- [ ] Average unstaking time (request → finalize)
- [ ] Number of cancelled unstakes
- [ ] Gas costs comparison (V8 vs V9)
- [ ] User feedback on two-step UX

### Health Checks

```bash
# Check V9 contract health
cast call <V9_ADDRESS> "getActivePositionCount()" --rpc-url https://testnet-rpc.monad.xyz
cast call <V9_ADDRESS> "getPendingWithdrawalCount()" --rpc-url https://testnet-rpc.monad.xyz
cast call <V9_ADDRESS> "totalMonStaked()" --rpc-url https://testnet-rpc.monad.xyz

# Check Kintsu integration
cast call <V9_ADDRESS> "getKintsuBalance()" --rpc-url https://testnet-rpc.monad.xyz
```

---

## Common Migration Issues

### Issue: V8 positions showing incorrect state
**Solution:** V8 doesn't have state enum. Show as "Legacy - Unknown State"

### Issue: Users confused by two-step unstaking
**Solution:** Add clear UI flow with progress indicator

### Issue: V8 contract still has MON locked
**Solution:** Use emergencyWithdrawMON if funds available in contract

### Issue: Kintsu shares from V8 unredeemable
**Solution:** Contact Kintsu team for manual intervention or create recovery helper

---

## Checklist

### Pre-Migration
- [ ] V9 contract deployed and verified
- [ ] Passport NFT whitelisted on V9
- [ ] Frontend updated with V9 hooks
- [ ] Migration plan documented
- [ ] User communication prepared
- [ ] Rollback plan ready

### During Migration
- [ ] Monitor V9 transactions
- [ ] Track user feedback
- [ ] Fix any UI bugs quickly
- [ ] Update documentation as needed

### Post-Migration
- [ ] All new stakes go to V9
- [ ] V8 marked as deprecated
- [ ] V8 positions handled (migrated or refunded)
- [ ] Users trained on two-step unstaking
- [ ] Monitoring dashboards updated

---

## Support

For migration issues:
- **V9 Contract:** `contracts/contracts/EmpowerToursYieldStrategyV9.sol`
- **Deployment Guide:** `DEPLOYMENT_V9.md`
- **Unstaking Guide:** `UNSTAKING_GUIDE.md`
- **Summary:** `V9_SUMMARY.md`

---

**Migration completed?** Update this checklist and archive V8 references.
