# YieldStrategy V9 - Unstaking Mechanism Guide

## Overview

YieldStrategy V9 implements a **two-step unstaking process** that aligns with Kintsu's network-level constraints. This is required because Kintsu uses validator delegation on Monad, which has mandatory cooldown periods.

---

## How Unstaking Works

### 🔄 The Two-Step Process

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Step 1: REQUEST UNLOCK                                        │
│  ─────────────────────────                                     │
│  User calls: requestUnstake(positionId)                        │
│                                                                 │
│  What happens:                                                 │
│  1. Contract calls Kintsu.requestUnlock(shares)                │
│  2. Unlock request added to current batch                      │
│  3. Position state → PendingWithdrawal                         │
│  4. Unlock request info stored on position                     │
│                                                                 │
│  ⏳ WAIT ~7 DAYS (Cooldown Period) ⏳                          │
│                                                                 │
│  During cooldown:                                              │
│  - Batch submitted to validators (after 2 eras)                │
│  - Validators unbond the MON tokens                            │
│  - User can cancel if batch not yet submitted                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  Step 2: FINALIZE UNSTAKE                                      │
│  ──────────────────────────                                    │
│  User calls: finalizeUnstake(positionId)                       │
│                                                                 │
│  What happens:                                                 │
│  1. Contract calls Kintsu.redeem(unlockIndex)                  │
│  2. Kintsu returns unbonded MON to contract                    │
│  3. Yield calculated and added to principal                    │
│  4. Withdrawal fee (0.5%) deducted                             │
│  5. Net amount sent to user's wallet                           │
│  6. Position state → Closed                                    │
│  7. NFT collateral released                                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Kintsu Integration Details

### Kintsu's Unstaking Order of Operations

1. **Initiation:** User submits unlock request via `requestUnlock(shares, minSpotValue)`
2. **Request Batched:** Added to current batch of unlock requests
3. **Batch Submission:** After 2-era period, batch sent to validators
4. **Cooldown Period:** Wait for validators to unbond (~7 days on testnet)
5. **Token Return:** First redemption triggers `withdrawUnbonded()` from validators
6. **Redemption:** User redeems via `redeem(unlockIndex, receiver)`

### Our Implementation Maps To:

| Kintsu Function | Our Function | When Called |
|----------------|--------------|-------------|
| `requestUnlock()` | `requestUnstake()` | User initiates unstaking |
| `redeem()` | `finalizeUnstake()` | After cooldown elapsed |
| `cancelUnlockRequest()` | `cancelUnstake()` | Before batch submitted |

---

## Position States

```solidity
enum PositionState {
    Active,             // 0 - Position is actively staked in Kintsu
    PendingWithdrawal,  // 1 - Unlock requested, waiting for cooldown
    Closed              // 2 - Position fully closed and redeemed
}
```

### State Transitions

```
    Active
      │
      │ requestUnstake()
      ▼
PendingWithdrawal ──cancelUnstake()──▶ Active
      │
      │ finalizeUnstake()
      │ (after cooldown)
      ▼
    Closed
```

---

## User Experience Flow

### Scenario 1: Normal Unstaking

```typescript
// Day 0: User requests unstaking
await requestUnstake(positionId);
// Position state: PendingWithdrawal
// Expected ready time: ~7 days from now

// Day 1-6: User waits
// Show countdown timer in UI:
const remaining = getRemainingCooldown(requestTime, cooldownPeriod);
const display = formatCooldownRemaining(remaining); // "6d 12h 30m"

// Day 7+: Cooldown complete, user finalizes
await finalizeUnstake(positionId);
// Position state: Closed
// MON returned to wallet (principal + yield - fee)
```

### Scenario 2: Cancelled Unstaking

```typescript
// Day 0: User requests unstaking
await requestUnstake(positionId);
// Position state: PendingWithdrawal

// Day 1: User changes mind (before batch submitted)
await cancelUnstake(positionId);
// Position state: Active (restored)
// Can continue earning yield
```

### Scenario 3: Cannot Cancel (Batch Already Submitted)

```typescript
// Day 0: User requests unstaking
await requestUnstake(positionId);

// Day 3: Batch submitted to validators (after 2 eras)
// User tries to cancel:
await cancelUnstake(positionId);
// ❌ REVERTS: Batch already submitted

// User must wait and call finalizeUnstake() instead
```

---

## Technical Implementation

### UnlockRequest Tracking

```solidity
struct UnlockRequestInfo {
    uint256 kintsuUnlockIndex;  // Index in Kintsu's unlock array
    uint96 shares;               // Kintsu shares requested for unlock
    uint96 expectedSpotValue;    // Expected MON value at unlock
    uint40 requestTime;          // Timestamp of request
    bool exists;                 // Whether request exists
}
```

### Position Structure (Relevant Fields)

```solidity
struct StakingPosition {
    // ... other fields ...
    PositionState state;                // Current position state
    UnlockRequestInfo unlockRequest;    // Unlock request details
}
```

---

## Frontend Integration

### Display Position Status

```typescript
const { useGetPosition, useGetPositionState, useEstimatedCooldownPeriod } = useYieldStrategyV9();

const position = useGetPosition(positionId);
const state = useGetPositionState(positionId);
const cooldownPeriod = useEstimatedCooldownPeriod();

// Show different UI based on state
switch (position.state) {
  case PositionState.Active:
    return <ActivePositionUI onUnstake={() => requestUnstake(positionId)} />;

  case PositionState.PendingWithdrawal:
    const remaining = getRemainingCooldown(
      position.unlockRequest.requestTime,
      cooldownPeriod
    );
    return (
      <PendingWithdrawalUI
        remainingTime={formatCooldownRemaining(remaining)}
        onFinalize={() => finalizeUnstake(positionId)}
        onCancel={() => cancelUnstake(positionId)}
      />
    );

  case PositionState.Closed:
    return <ClosedPositionUI />;
}
```

### Cooldown Timer Component

```typescript
const CooldownTimer = ({ requestTime, cooldownPeriod }) => {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      const seconds = getRemainingCooldown(requestTime, cooldownPeriod);
      setRemaining(seconds);
    }, 1000);

    return () => clearInterval(interval);
  }, [requestTime, cooldownPeriod]);

  const isReady = remaining <= 0;

  return (
    <div className={isReady ? 'text-green-500' : 'text-orange-500'}>
      {isReady ? (
        <>
          ✅ Ready to finalize
          <button onClick={onFinalize}>Finalize Unstake</button>
        </>
      ) : (
        <>
          ⏳ Cooldown: {formatCooldownRemaining(remaining)}
        </>
      )}
    </div>
  );
};
```

---

## Common Issues & Solutions

### Issue: "Position not active"
**Cause:** Position already in PendingWithdrawal or Closed state
**Solution:** Check `getPositionState(positionId)` before calling `requestUnstake()`

### Issue: "No pending unstake"
**Cause:** Trying to finalize/cancel when no unlock request exists
**Solution:** Call `requestUnstake()` first

### Issue: "Cooldown not elapsed"
**Cause:** Trying to finalize before 7-day period
**Solution:** Wait until `block.timestamp >= requestTime + ESTIMATED_COOLDOWN_PERIOD`

### Issue: Cannot cancel unlock request
**Cause:** Batch already submitted to validators
**Solution:** Wait and call `finalizeUnstake()` instead - cancellation no longer possible

### Issue: "No unlock request" when finalizing
**Cause:** Kintsu unlock request index changed (rare)
**Solution:** Check `getAllUserUnlockRequests()` on Kintsu contract

---

## Comparison: V8 vs V9

| Feature | V8 (OLD - Broken) | V9 (NEW - Fixed) |
|---------|-------------------|------------------|
| Unstake Steps | 1 (immediate) | 2 (request → finalize) |
| Cooldown | ❌ None | ✅ ~7 days |
| Kintsu Integration | ❌ Wrong (called redeem directly) | ✅ Correct (requestUnlock → redeem) |
| Position States | 2 (Active, Closed) | 3 (Active, Pending, Closed) |
| Can Cancel | ❌ No | ✅ Yes (before batch) |
| Works with Kintsu | ❌ NO | ✅ YES |

---

## Why Two Steps Are Required

Kintsu is a liquid staking protocol that delegates MON to validators. When users unstake:

1. **Network Constraint:** Monad validators have a mandatory unbonding period (~7 days)
2. **Batch Processing:** Kintsu batches unlock requests to optimize gas and validator distribution
3. **Daily Limits:** Network has daily unbonding request limits per validator
4. **Constant Retargeting:** Kintsu uses algorithm to keep withdrawals balanced across validators

**Result:** Instant unstaking is impossible. Two-step process is the only viable solution.

---

## Testing Checklist

- [ ] Deploy V9 contract
- [ ] Whitelist Passport NFT
- [ ] Stake MON with NFT collateral
- [ ] Request unstake → verify state = PendingWithdrawal
- [ ] Check unlock request details stored correctly
- [ ] Cancel unstake → verify state = Active
- [ ] Request unstake again
- [ ] Wait 7 days (or use time manipulation on testnet)
- [ ] Finalize unstake → verify MON returned
- [ ] Check position state = Closed
- [ ] Verify NFT collateral released

---

## Support

For issues or questions:
- Check position state with `getPosition(positionId)`
- View unlock requests with Kintsu's `getAllUserUnlockRequests()`
- Monitor cooldown with `ESTIMATED_COOLDOWN_PERIOD` constant
- Review transaction logs on MonadScan

**Documentation:** `DEPLOYMENT_V9.md`
**Contract:** `contracts/contracts/EmpowerToursYieldStrategyV9.sol`
**Frontend Hooks:** `src/hooks/useYieldStrategyV9.ts`
