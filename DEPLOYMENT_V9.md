# YieldStrategy V9 Deployment Guide

## Overview

**Version:** V9 - Two-Step Unstaking with Kintsu V2 Integration
**Network:** Monad Testnet
**Compiler:** Solidity 0.8.20
**License:** MIT

## Key Changes in V9

### 🔧 Critical Fixes
1. ✅ **Proper Kintsu V2 Interface** - Matches official Kintsu StakedMonad V2 contract
2. ✅ **Two-Step Unstaking** - Implements `requestUnlock()` → cooldown → `finalizeUnstake()`
3. ✅ **Position States** - Tracks Active, PendingWithdrawal, Closed states
4. ✅ **Unlock Request Tracking** - Stores batch IDs and expected values
5. ✅ **Cancellation Support** - Users can cancel before batch submission

### 📊 New Features
- Position state machine (Active → PendingWithdrawal → Closed)
- Unlock request metadata tracking
- Estimated cooldown period (7 days)
- Cancel pending unstakes before batch submission
- Separate yield withdrawal mechanism for keepers

### ⚠️ Breaking Changes from V8
- `unstake()` replaced with `requestUnstake()` and `finalizeUnstake()`
- Users must wait ~7 days between unstaking steps
- Position closes only after `finalizeUnstake()`, not immediately

---

## Prerequisites

### 1. Environment Setup

Ensure you have a `.env` file in the project root:

```bash
# Required
DEPLOYER_PRIVATE_KEY=0x...  # Your deployer private key (DO NOT COMMIT!)

# Optional (uses defaults if not set)
NEXT_PUBLIC_TOURS_TOKEN=0xa123600c82E69cB311B0e068B06Bfa9F787699B7
NEXT_PUBLIC_KINTSU=0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5
NEXT_PUBLIC_SWAP=0xe004F2eaCd0AD74E14085929337875b20975F0AA
NEXT_PUBLIC_DRAGON_ROUTER=0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e
NEXT_PUBLIC_SAFE_ACCOUNT=0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20

ETHERSCAN_API_KEY=FQSX86QUTQYPUNG1WJTYBNC665XPTRYD6J  # For verification
```

### 2. Fund Deployer Account

Ensure your deployer account has sufficient MON:

```bash
# Check balance
cast balance <YOUR_DEPLOYER_ADDRESS> --rpc-url https://testnet-rpc.monad.xyz

# You need at least 0.1 MON for deployment
```

Get testnet MON from Monad faucet if needed.

---

## Deployment Steps

### Step 1: Compile Contract

```bash
forge build
```

Verify compilation succeeds:
```
[⠊] Compiling...
[⠊] Compiling 1 files with Solc 0.8.20
[⠆] Solc 0.8.20 finished in X.XXs
Compiler run successful!
```

### Step 2: Deploy to Monad Testnet

```bash
forge script contracts/script/DeployV9.s.sol:DeployV9 \
  --rpc-url monad_testnet \
  --broadcast \
  --verify \
  -vvvv
```

**Expected Output:**
```
===========================================
Deploying YieldStrategy V9 to Monad Testnet
===========================================

Constructor arguments:
  TOURS Token: 0xa123600c82E69cB311B0e068B06Bfa9F787699B7
  Kintsu V2: 0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5
  Token Swap: 0xe004F2eaCd0AD74E14085929337875b20975F0AA
  Dragon Router: 0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e
  Keeper: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20

===========================================
DEPLOYMENT SUCCESSFUL
===========================================

YieldStrategy V9 deployed to: 0x[NEW_CONTRACT_ADDRESS]
```

**Save the deployed contract address!**

### Step 3: Whitelist Passport NFT

```bash
cast send <DEPLOYED_CONTRACT_ADDRESS> \
  "whitelistNFT(address,bool)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  true \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz
```

### Step 4: Verify Whitelisting

```bash
cast call <DEPLOYED_CONTRACT_ADDRESS> \
  "acceptedNFTs(address)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  --rpc-url https://testnet-rpc.monad.xyz
```

Expected output: `0x0000000000000000000000000000000000000000000000000000000000000001` (true)

---

## Verification on MonadScan

### Manual Verification (if auto-verify fails)

```bash
# Get constructor arguments (ABI encoded)
cast abi-encode "constructor(address,address,address,address,address)" \
  0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5 \
  0xe004F2eaCd0AD74E14085929337875b20975F0AA \
  0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e \
  0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
```

Then verify using Foundry:

```bash
forge verify-contract \
  --watch \
  --chain-id 41454 \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.monad.xyz/api \
  <DEPLOYED_CONTRACT_ADDRESS> \
  contracts/contracts/EmpowerToursYieldStrategyV9.sol:EmpowerToursYieldStrategyV9 \
  --constructor-args <ABI_ENCODED_CONSTRUCTOR_ARGS>
```

---

## Post-Deployment Configuration

### 1. Update Environment Variables

Add to `.env.local`:

```bash
NEXT_PUBLIC_YIELD_STRATEGY=<DEPLOYED_CONTRACT_ADDRESS>
```

### 2. Update Contract Config

Update `src/config/contracts.ts`:

```typescript
export const yieldStrategyConfig = {
  address: '<DEPLOYED_CONTRACT_ADDRESS>' as Address,
  abi: YieldStrategyV9ABI,
  chainId: 41454,
};
```

### 3. Generate ABI File

```bash
# Extract ABI from compiled artifacts
forge inspect EmpowerToursYieldStrategyV9 abi > src/abis/YieldStrategyV9.json
```

---

## Testing Deployment

### Basic Health Checks

```bash
# Check owner
cast call <DEPLOYED_CONTRACT_ADDRESS> "owner()" --rpc-url https://testnet-rpc.monad.xyz

# Check keeper
cast call <DEPLOYED_CONTRACT_ADDRESS> "keeper()" --rpc-url https://testnet-rpc.monad.xyz

# Check Kintsu integration
cast call <DEPLOYED_CONTRACT_ADDRESS> "kintsu()" --rpc-url https://testnet-rpc.monad.xyz

# Check cooldown period
cast call <DEPLOYED_CONTRACT_ADDRESS> "ESTIMATED_COOLDOWN_PERIOD()" --rpc-url https://testnet-rpc.monad.xyz
```

### Test Staking Flow

1. **Stake with NFT collateral:**
```bash
cast send <DEPLOYED_CONTRACT_ADDRESS> \
  "stakeWithDeposit(address,uint256,address)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  <YOUR_NFT_TOKEN_ID> \
  <YOUR_ADDRESS> \
  --value 1ether \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz
```

2. **Check position:**
```bash
cast call <DEPLOYED_CONTRACT_ADDRESS> "getPosition(uint256)" 0 --rpc-url https://testnet-rpc.monad.xyz
```

3. **Request unstake:**
```bash
cast send <DEPLOYED_CONTRACT_ADDRESS> \
  "requestUnstake(uint256)" \
  0 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz
```

4. **Wait ~7 days for cooldown**

5. **Finalize unstake:**
```bash
cast send <DEPLOYED_CONTRACT_ADDRESS> \
  "finalizeUnstake(uint256)" \
  0 \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz
```

---

## Contract Addresses

### Monad Testnet

| Contract | Address |
|----------|---------|
| TOURS Token | `0xa123600c82E69cB311B0e068B06Bfa9F787699B7` |
| Kintsu V2 (StakedMonad) | `0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5` |
| Token Swap | `0xe004F2eaCd0AD74E14085929337875b20975F0AA` |
| Dragon Router | `0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e` |
| Passport NFT | `0x54e935c5f1ec987bb87f36fc046cf13fb393acc8` |
| **YieldStrategy V9** | `<TO_BE_DEPLOYED>` |

---

## Frontend Integration

### Update Imports

Replace old hooks:
```typescript
// OLD
import { useYieldStrategy } from '@/hooks/useYieldStrategy';

// NEW
import { useYieldStrategyV9 } from '@/hooks/useYieldStrategyV9';
```

### Two-Step Unstaking UI

```typescript
const {
  requestUnstake,
  finalizeUnstake,
  cancelUnstake,
  useGetPosition,
  useCanFinalizeUnstake,
  formatCooldownRemaining,
  getRemainingCooldown
} = useYieldStrategyV9();

// Step 1: Request unstake
const handleRequestUnstake = () => {
  requestUnstake(positionId);
};

// Step 2: Finalize after cooldown
const handleFinalizeUnstake = () => {
  finalizeUnstake(positionId);
};

// Cancel before batch submission
const handleCancelUnstake = () => {
  cancelUnstake(positionId);
};

// Show cooldown timer
const position = useGetPosition(positionId);
const remainingSeconds = getRemainingCooldown(
  position.unlockRequest.requestTime,
  ESTIMATED_COOLDOWN_PERIOD
);
const timeRemaining = formatCooldownRemaining(remainingSeconds);
```

---

## Troubleshooting

### Deployment Fails

**Issue:** "Insufficient funds"
- **Solution:** Fund deployer with more MON from faucet

**Issue:** "Contract already deployed"
- **Solution:** Check if using correct private key; contract may already exist

### Verification Fails

**Issue:** "Contract not found"
- **Solution:** Wait a few minutes for blockchain sync, then retry

**Issue:** "Constructor arguments mismatch"
- **Solution:** Ensure ABI-encoded args match deployment exactly

### Unstaking Fails

**Issue:** "Position not active"
- **Solution:** Check position state with `getPositionState(positionId)`

**Issue:** "Cooldown not elapsed"
- **Solution:** Wait until `ESTIMATED_COOLDOWN_PERIOD` has passed since `requestUnstake()`

**Issue:** "No unlock request"
- **Solution:** Call `requestUnstake()` first before `finalizeUnstake()`

---

## Security Notes

1. ✅ **Two-Step Withdrawal** - Prevents immediate rugpulls, aligns with Kintsu constraints
2. ✅ **Position State Tracking** - Prevents double withdrawals
3. ✅ **NFT Ownership Verification** - Checks beneficiary still owns NFT
4. ✅ **Withdrawal Fees** - 0.5% fee on all unstaking
5. ✅ **Reentrancy Protection** - All external calls protected
6. ✅ **Owner Recovery** - Both owner and beneficiary can unstake

---

## Next Steps After Deployment

1. ✅ Deploy contract
2. ✅ Whitelist Passport NFT
3. ⏳ Verify on MonadScan
4. ⏳ Update `.env.local` with new address
5. ⏳ Update frontend to use V9 hooks
6. ⏳ Test complete staking/unstaking flow
7. ⏳ Monitor first user transactions
8. ⏳ Set up keeper automation for harvest/yield redemption

---

## Support & Resources

- **Kintsu Docs:** https://docs.kintsu.xyz
- **Monad Testnet Explorer:** https://explorer.testnet.monad.xyz
- **Foundry Book:** https://book.getfoundry.sh

---

**Deployment Timestamp:** [TO BE FILLED]
**Deployed By:** [TO BE FILLED]
**Transaction Hash:** [TO BE FILLED]
**Contract Address:** [TO BE FILLED]
