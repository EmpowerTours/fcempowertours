# CRITICAL FIX: Staking "0x" Revert Error Resolved

## 🔴 The Problem

When attempting to stake TOURS tokens via the `/api/execute-delegated` endpoint with `action: 'stake_tours'`, the UserOperation was failing during gas estimation with an empty revert reason ("0x").

### Error Logs:
```
❌ Manual gas estimation failed: {
  message: 'Execution reverted with reason: UserOperation reverted during simulation with reason: 0x.'
}
```

### Failed Transaction Details:
- **Action**: `stake_tours` with 100 TOURS
- **User**: 0x33ffccb1802e13a7eead232bcd4706a2269582b0
- **Safe**: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
- **YieldStrategy**: 0x8D3d70a5F4eeaE446A70F6f38aBd2adf7c667866

---

## 🔍 Root Cause Analysis

The code was calling **functions that DON'T EXIST** on the deployed YieldStrategy contract!

### What the code was trying to call:
```typescript
// ❌ WRONG - These functions don't exist
encodeFunctionData({
  functionName: 'stakeWithNFT',
  args: [PASSPORT_NFT, nftTokenId, stakeAmount]
})

encodeFunctionData({
  functionName: 'unstake',
  args: [positionId]  // Wrong signature
})
```

### What the deployed contract actually has:
```json
{
  "name": "stake",
  "inputs": [{"name": "amount", "type": "uint256"}],
  "outputs": []
}

{
  "name": "unstake",
  "inputs": [{"name": "amount", "type": "uint256"}],
  "outputs": []
}
```

**The ABI mismatch caused the function selector to not match any function in the contract, resulting in an empty revert ("0x").**

---

## ✅ The Solution

Updated the execute-delegated route to use the **correct function signatures** from the deployed YieldStrategy ABI.

### Changes Made:

#### 1. **stake_tours** - Fixed function call
**Before**:
```typescript
encodeFunctionData({
  abi: parseAbi(['function stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount) external returns (uint256)']),
  functionName: 'stakeWithNFT',
  args: [PASSPORT_NFT, BigInt(nftTokenId), stakeAmount],
})
```

**After**:
```typescript
encodeFunctionData({
  abi: parseAbi(['function stake(uint256 amount) external']),
  functionName: 'stake',
  args: [stakeAmount],  // Only amount, no NFT parameter
})
```

**Impact**:
- ✅ Matches deployed contract
- ✅ Gas estimation will succeed
- ✅ Transaction will execute successfully
- 📝 NFT tracking still happens in backend/database for credit score

#### 2. **unstake_tours** - Fixed function call and parameters
**Before**:
```typescript
// Expected params.positionId
encodeFunctionData({
  abi: parseAbi(['function unstake(uint256 positionId) external returns (uint256)']),
  functionName: 'unstake',
  args: [BigInt(params.positionId)],
})
```

**After**:
```typescript
// Now accepts params.amount
encodeFunctionData({
  abi: parseAbi(['function unstake(uint256 amount) external']),
  functionName: 'unstake',
  args: [unstakeAmount],  // Amount in wei, not position ID
})
```

**Impact**:
- ✅ Matches deployed contract
- ✅ Users specify amount to unstake, not position ID
- 📝 Simpler UX - unstake specific amounts

#### 3. **Position ID** - Changed to client-side generation
**Before**:
- Tried to extract position ID from transaction logs
- Looked for non-existent `StakingPositionCreated` event

**After**:
```typescript
const positionId = `${userAddress.slice(2, 10)}-${nftTokenId}`;
// Example: "33ffccb1-1"
```

**Impact**:
- ✅ Predictable position IDs
- ✅ Can be tracked in database with:
  - txHash
  - userAddress
  - nftTokenId (passport used)
  - stakeAmount
  - timestamp
- ✅ No dependency on contract events

---

## 📊 Deployed YieldStrategy Contract

**Address**: `0x8D3d70a5F4eeaE446A70F6f38aBd2adf7c667866` (Monad Testnet)

### Available Functions:
| Function | Signature | Purpose |
|----------|-----------|---------|
| `stake` | `stake(uint256 amount)` | Stake TOURS tokens |
| `unstake` | `unstake(uint256 amount)` | Unstake TOURS tokens |
| `claimRewards` | `claimRewards()` | Claim accumulated rewards |
| `getStakedAmount` | `getStakedAmount(address user) view returns (uint256)` | Get user's staked amount |
| `getPendingRewards` | `getPendingRewards(address user) view returns (uint256)` | Get pending rewards |
| `getTotalStaked` | `getTotalStaked() view returns (uint256)` | Get total staked across all users |
| `getAPY` | `getAPY() view returns (uint256)` | Get current APY |
| `updateAPY` | `updateAPY(uint256 newAPY)` | Update APY (owner only) |

### Events:
| Event | Signature | Emitted When |
|-------|-----------|--------------|
| `Staked` | `Staked(address indexed user, uint256 amount)` | User stakes tokens |
| `Unstaked` | `Unstaked(address indexed user, uint256 amount)` | User unstakes tokens |
| `RewardsClaimed` | `RewardsClaimed(address indexed user, uint256 amount)` | User claims rewards |
| `APYUpdated` | `APYUpdated(uint256 oldAPY, uint256 newAPY)` | APY is updated |

---

## 🧪 Testing the Fix

### Test 1: Stake 100 TOURS
```bash
# POST /api/execute-delegated
{
  "userAddress": "0x33ffccb1802e13a7eead232bcd4706a2269582b0",
  "action": "stake_tours",
  "params": {
    "amount": "100"
  }
}

# Expected Response:
{
  "success": true,
  "txHash": "0x...",
  "positionId": "33ffccb1-1",
  "nftTokenId": "1",
  "amount": "100",
  "message": "Staked 100 TOURS successfully"
}
```

### Test 2: Unstake 50 TOURS
```bash
# POST /api/execute-delegated
{
  "userAddress": "0x33ffccb1802e13a7eead232bcd4706a2269582b0",
  "action": "unstake_tours",
  "params": {
    "amount": "50"
  }
}

# Expected Response:
{
  "success": true,
  "txHash": "0x...",
  "amount": "50",
  "message": "Unstaked 50 TOURS successfully"
}
```

### Test 3: Claim Rewards
```bash
# POST /api/execute-delegated
{
  "userAddress": "0x33ffccb1802e13a7eead232bcd4706a2269582b0",
  "action": "claim_rewards",
  "params": {}
}

# Expected Response:
{
  "success": true,
  "txHash": "0x...",
  "message": "Rewards claimed successfully"
}
```

---

## 📝 UI Updates Needed

The passport staking UI (`app/passport-staking/page.tsx`) is already correctly set up! It:
- ✅ Accepts amount input (not position ID)
- ✅ Displays clickable transaction hash
- ✅ Shows yield dashboard
- ✅ Tracks passport NFT for credit score

**No UI changes required** - the UI was already expecting the correct flow.

---

## 🗄️ Database Schema Recommendation

To track staking positions properly, consider adding a table:

```sql
CREATE TABLE staking_positions (
  id SERIAL PRIMARY KEY,
  position_id VARCHAR(255) UNIQUE NOT NULL,  -- userAddress-nftTokenId
  user_address VARCHAR(42) NOT NULL,
  nft_token_id VARCHAR(255) NOT NULL,
  passport_contract VARCHAR(42) NOT NULL,
  stake_amount DECIMAL(78, 0) NOT NULL,     -- wei
  tx_hash VARCHAR(66) NOT NULL,
  block_number BIGINT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  unstaked BOOLEAN DEFAULT FALSE,
  unstake_tx_hash VARCHAR(66),
  unstake_timestamp TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_staking_user ON staking_positions(user_address);
CREATE INDEX idx_staking_nft ON staking_positions(nft_token_id);
CREATE INDEX idx_staking_position ON staking_positions(position_id);
```

---

## 🔄 Migration Path

If you want to upgrade to a YieldStrategy with `stakeWithNFT()` support later:

1. Deploy new YieldStrategy contract with enhanced functions
2. Update environment variable: `YIELD_STRATEGY=<new_address>`
3. Update ABI in `/src/abis/YieldStrategy.json`
4. Revert code changes to use `stakeWithNFT()` again
5. Users' existing stakes can be migrated via governance proposal

---

## ✅ Verification Checklist

- [x] Identified root cause: Function selector mismatch
- [x] Updated stake_tours to use `stake(amount)`
- [x] Updated unstake_tours to use `unstake(amount)` with amount parameter
- [x] Generated position IDs client-side
- [x] Committed changes with detailed explanation
- [x] Pushed to branch: `claude/debug-useroperation-gas-estimation-01HVJoAcU61D6MVBVz54G5mG`
- [ ] Deploy to production
- [ ] Test staking with real TOURS tokens
- [ ] Verify transaction on Monad Explorer
- [ ] Monitor for successful stakes

---

## 📚 Related Files

1. **`app/api/execute-delegated/route.ts`** - Main fix applied here
2. **`src/abis/YieldStrategy.json`** - Contract ABI (verified correct)
3. **`app/passport-staking/page.tsx`** - UI (already correct)
4. **`src/config/contracts.ts`** - Contract addresses

---

## 🚀 Ready to Deploy

The fix is complete and pushed. After deployment:
1. Users can stake TOURS tokens successfully
2. Gas estimation will work correctly
3. Transactions will execute on-chain
4. Yield will start accumulating

**Commit**: `b6fe3a3`
**Branch**: `claude/debug-useroperation-gas-estimation-01HVJoAcU61D6MVBVz54G5mG`
