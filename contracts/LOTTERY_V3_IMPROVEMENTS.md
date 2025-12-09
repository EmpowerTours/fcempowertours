# DailyPassLotteryV3 - Improvements Summary

## Critical Fixes

### 1. Caller Reward Accounting Fix
**Problem**: V2 paid 0.02 MON in caller rewards from prize pool but didn't deduct from escrow, causing "MON failed" errors.

**Solution**:
- Added `callerRewardsPaid` tracking to DailyRound struct
- Escrow amount = `prizePoolMon - callerRewardsPaid`
- Ensures contract always has enough MON to pay winners

**Example**:
```
V2 (Broken):
- Entry fees: 2 MON → Prize pool: 1.8 MON
- Commit reward: 0.01 MON paid
- Reveal reward: 0.01 MON paid
- Escrow created: 1.8 MON
- Contract balance: 1.78 MON
- Winner claims: FAILS ❌

V3 (Fixed):
- Entry fees: 2 MON → Prize pool: 1.8 MON
- Commit reward: 0.01 MON paid (tracked)
- Reveal reward: 0.01 MON paid (tracked)
- Escrow created: 1.78 MON (1.8 - 0.02)
- Contract balance: 1.78 MON
- Winner claims: SUCCESS ✅
```

**Changed Files**:
- `contracts/DailyPassLotteryV3.sol` lines 96, 424, 465, 471-473, 554-556

---

### 2. Auto Round Rotation
**Problem**: V2 required someone to click "Enter" to start new rounds, causing UX confusion.

**Solution - Option 2 (Contract)**:
Added `_checkAndRotateRound()` calls to:
- `revealWinner()` - Line 476: After winner is revealed
- `_claimPrize()` - Line 620: After winner claims prize
- `reclaimExpiredEscrow()` - Line 646: After expired escrow is reclaimed

**Benefit**: New rounds start automatically when any of these actions occur.

**Changed Files**:
- `contracts/DailyPassLotteryV3.sol` lines 476, 620, 646

---

**Solution - Option 3 (Keeper Bot Backup)**:
Enhanced cron job to force new rounds if contract rotation fails.

**Flow**:
```
Every 6 hours:
1. Check if current round is Finalized
2. Check if round has passed endTime
3. If yes → call forceNewRound()
4. Also check for pending commit/reveal
5. Announce winners via Farcaster
```

**Changed Files**:
- `app/api/cron/finalize-lottery/route.ts` lines 128-167

**Cron Configuration**:
```json
{
  "schedule": "0 */6 * * *",
  "command": "curl https://fcempowertours-production-6551.up.railway.app/api/cron/finalize-lottery?key=$KEEPER_SECRET"
}
```

---

## Full V3 Feature Set

### Fixed from V2:
✅ Caller reward accounting bug
✅ Automatic round rotation (3 methods)
✅ No more "stuck" rounds

### Kept from V2:
✅ Delegation support (gasless entry via Safe)
✅ Dual-token support (MON + shMON)
✅ Commit-reveal randomness
✅ Incentivized finalization (0.01 MON rewards)
✅ 7-day escrow claim window
✅ Lazy finalization fallback

### New in V3:
✅ Smart escrow calculation (prize pool - caller rewards)
✅ Auto-rotation after reveal
✅ Auto-rotation after claim
✅ Auto-rotation after expired escrow
✅ Keeper bot backup rotation

---

## Deployment Checklist

### Before Deploy:
- [ ] Compile V3 contract with viaIR enabled
- [ ] Test on local fork
- [ ] Verify all auto-rotation triggers
- [ ] Test with 2 players, commit, reveal, claim

### Deploy V3:
```bash
forge script script/DeployDailyPassLotteryV3.s.sol:DeployDailyPassLotteryV3 \
  --rpc-url monad_testnet \
  --broadcast \
  --legacy
```

### After Deploy:
- [ ] Update NEXT_PUBLIC_LOTTERY_ADDRESS in .env.local
- [ ] Restart Next.js app
- [ ] Test entry with MON
- [ ] Test entry with shMON
- [ ] Verify keeper bot targets new address
- [ ] Announce deployment on Farcaster

---

## Configuration

### Contract Addresses (Monad Testnet):
- Platform Safe: `0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3`
- Platform Wallet: `0x37302543aeF0b06202adcb06Db36daB05F8237E9`
- shMON Token: `0x3a98250F98Dd388C211206983453837C8365BDc1`

### Environment Variables:
```bash
NEXT_PUBLIC_LOTTERY_ADDRESS="<V3 Address>"
SAFE_OWNER_PRIVATE_KEY="<Owner Key>"
KEEPER_SECRET="<Secret for Cron>"
BOT_SIGNER_UUID="<Neynar Bot UUID>"
LOTTERY_ADMIN_KEY="EmpowerToursFTW2026MONAD"
```

---

## Testing Scenarios

### Scenario 1: Normal Flow
1. User A enters Round 1 (1 MON)
2. User B enters Round 1 (1 MON)
3. Round ends (24 hours)
4. Anyone calls commitRandomness() → earns 0.01 MON
5. After 10 blocks, anyone calls revealWinner() → earns 0.01 MON
6. **V3: Round 2 starts automatically** ✅
7. Winner claims 1.78 MON
8. **V3: Confirms Round 2 still active** ✅

### Scenario 2: Lazy Finalization
1. Round 1 ends but no one calls commit
2. User C tries to enter Round 2
3. V3: Lazy finalization triggers
4. V3: Round 1 auto-commits and auto-reveals
5. V3: Round 2 starts
6. User C enters Round 2 ✅

### Scenario 3: Keeper Bot Backup
1. Round 1 ends and winner revealed
2. Winner doesn't claim for 6+ hours
3. Keeper bot runs every 6 hours
4. V3: Bot sees Round 1 finalized and expired
5. V3: Bot calls forceNewRound()
6. Round 2 starts ✅

---

## Monitoring

### Check Round Status:
```javascript
const round = await lottery.getRound(roundId);
console.log('Status:', round.status); // 0=Active, 1=CommitPending, 2=RevealPending, 3=Finalized
console.log('Caller Rewards Paid:', round.callerRewardsPaid);
```

### Check Escrow:
```javascript
const escrow = await lottery.getEscrow(roundId);
console.log('Escrow MON:', escrow.monAmount);
console.log('Contract Balance:', await provider.getBalance(lotteryAddress));
// These should match!
```

### Check Auto-Rotation:
```javascript
// After reveal:
const currentRound = await lottery.currentRoundId();
// Should increment after revealWinner() is called
```

---

## Migration from V2

### Steps:
1. Deploy V3 contract
2. Update frontend to use new address
3. **Do NOT transfer funds from V2** - let V2 complete its current round
4. Once V2 round 1 winner claims, switch all traffic to V3
5. Keep V2 contract address for historical records

### No Data Migration Needed:
- V3 starts fresh at Round 1
- Old V2 rounds remain on V2 contract
- Users can still claim old V2 prizes

---

## Gas Costs (Estimated)

- Entry: ~150k gas (same as V2)
- Commit: ~100k gas (same as V2)
- Reveal: ~200k gas (+50k for auto-rotation check)
- Claim: ~100k gas (+50k for auto-rotation check)

**Total extra cost**: ~100k gas per round for auto-rotation
**Benefit**: No stuck rounds, better UX

---

## Support

If issues occur:
1. Check keeper bot logs: Railway dashboard → Logs
2. Check contract on MonadScan
3. Manual fallback: Call `forceNewRound()` as owner
4. Emergency: Deploy new V3.1 with fixes

---

Generated: 2025-12-09
Contract: DailyPassLotteryV3.sol
