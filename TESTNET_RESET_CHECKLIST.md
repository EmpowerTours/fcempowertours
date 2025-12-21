# Testnet Reset Checklist

## Overview
Monad testnet was regenerated, all contracts were erased. Here's what needs to be redeployed/checked.

## 1. Core Infrastructure (Check First)

### EntryPoint v0.7 (ERC-4337)
- **Address**: `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (canonical)
- **Check if deployed**:
  ```bash
  cast code 0x0000000071727De22E5E9d8BAf0edAc6f37da032 --rpc-url https://testnet-rpc.monad.xyz
  ```
- **Status**: ❓ Need to verify
- **Action**: If returns `0x`, EntryPoint needs to be deployed by Monad team or manually

### Safe Infrastructure Contracts
- **Safe Singleton**: Factory and implementation contracts
- **Check**: Safe contracts should be deployed at canonical addresses
- **Status**: ❓ Need to verify
- **Action**: If missing, Safe contracts need deployment (use Safe's deployment scripts)

### Pimlico Bundler
- **URL**: `https://api.pimlico.io/v2/monad-testnet/rpc?apikey={key}`
- **Check**: Should still work (it's off-chain)
- **Status**: ✅ Probably working (external service)
- **Action**: Test with API call

## 2. Platform Safe Smart Account

### Safe Deployment
- **Target Address**: `0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20`
- **Deterministic**: ✅ YES - will redeploy to same address
- **Auto-deploys**: ✅ On first UserOperation
- **Owner**: Uses `SAFE_OWNER_PRIVATE_KEY` from env
- **Status**: ⚠️ Not deployed yet (will auto-deploy)

### Before First Use
```bash
# 1. Check if Safe is deployed
cast code 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 --rpc-url https://testnet-rpc.monad.xyz

# 2. Check Safe balance
cast balance 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 --rpc-url https://testnet-rpc.monad.xyz

# 3. Fund the Safe BEFORE first transaction
# Send 10+ MON to: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
# Use Monad faucet: https://testnet.monad.xyz/faucet
```

**CRITICAL**: Fund Safe with **10 MON minimum** before attempting any UserOperations!

## 3. Smart Contracts to Redeploy

### WMON (Wrapped MON)
- **Current Address**: `0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541`
- **Status**: ✅ DEPLOYED (canonical wrapped MON contract)
- **Action**: None - already deployed and verified
- **Note**: Old incorrect address was `0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701`

### EmpowerToursNFTv9 (Art & Music NFT)
- **Old Address**: Unknown (needs redeployment)
- **Dependencies**: WMON, TOURS token
- **Status**: ❌ Needs deployment
- **Script**: `contracts/script/DeployEmpowerToursNFTv9.s.sol`

### MusicSubscription
- **Old Address**: Unknown (needs redeployment)
- **Dependencies**: WMON, TOURS, EmpowerToursNFTv9
- **Status**: ❌ Needs deployment
- **Script**: `contracts/script/DeployMusicSubscription.s.sol`

### DailyPassLotteryWMON (New)
- **Status**: ✅ New contract, not deployed yet
- **Dependencies**: WMON, Pyth Entropy
- **Script**: `contracts/script/DeployDailyPassLotteryWMON.s.sol`

### TOURS Token
- **Status**: ❓ Check if needs redeployment
- **Action**: Verify if TOURS token exists at previous address

## 4. Deployment Order

```bash
# 1. Verify infrastructure
cast code 0x0000000071727De22E5E9d8BAf0edAc6f37da032 --rpc-url https://testnet-rpc.monad.xyz
# If empty, contact Monad team or deploy EntryPoint

# 2. Fund Platform Safe BEFORE any operations
# Send 10 MON to 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20

# 3. Verify WMON (already deployed at 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541)
cast code 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541 --rpc-url https://rpc-testnet.monadinfra.com/

# 4. Deploy TOURS (if needed)
# Deploy or verify existing TOURS token

# 5. Deploy EmpowerToursNFTv9
forge script script/DeployEmpowerToursNFTv9.s.sol:DeployEmpowerToursNFTv9 \
  --rpc-url $MONAD_TESTNET_RPC \
  --broadcast

# 6. Deploy MusicSubscription
forge script script/DeployMusicSubscription.s.sol:DeployMusicSubscription \
  --rpc-url $MONAD_TESTNET_RPC \
  --broadcast

# 7. Deploy DailyPassLotteryWMON
forge script script/DeployDailyPassLotteryWMON.s.sol:DeployDailyPassLotteryWMON \
  --rpc-url $MONAD_TESTNET_RPC \
  --broadcast
```

## 5. Update Environment Variables

After deployments, update `.env` and `.env.local`:

```bash
# Platform Safe (same address)
NEXT_PUBLIC_SAFE_ACCOUNT="0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"
SAFE_OWNER_PRIVATE_KEY="<your-key>"  # Same as before

# Contract addresses
NEXT_PUBLIC_WMON_ADDRESS="0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541"
NEXT_PUBLIC_NFT_ADDRESS="<new-nft-v9-address>"
NEXT_PUBLIC_MUSIC_SUBSCRIPTION="<new-subscription-address>"
NEXT_PUBLIC_LOTTERY_WMON_ADDRESS="<new-lottery-address>"

# Pyth Entropy (testnet)
NEXT_PUBLIC_ENTROPY_ADDRESS="0x825c0390f379c631f3cf11a82a37d20bddf93c07"

# Pimlico (should still work)
NEXT_PUBLIC_PIMLICO_API_KEY="<your-key>"
NEXT_PUBLIC_PIMLICO_BUNDLER_URL="https://api.pimlico.io/v2/monad-testnet/rpc"
NEXT_PUBLIC_ENTRYPOINT_ADDRESS="0x0000000071727De22E5E9d8BAf0edAc6f37da032"
```

## 6. Test Safe Deployment

```bash
# After funding the Safe, test first UserOperation
# This will auto-deploy the Safe contract
npm run test-delegation
```

The Safe will auto-deploy on first UserOperation through Pimlico.

## 7. Verify Deployments

```bash
# Check Safe is deployed
cast code 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 --rpc-url https://testnet-rpc.monad.xyz

# Check Safe balance
cast balance 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 --rpc-url https://testnet-rpc.monad.xyz

# Check WMON is deployed
cast code $WMON_ADDRESS --rpc-url https://testnet-rpc.monad.xyz

# Check NFT is deployed
cast code $NFT_ADDRESS --rpc-url https://testnet-rpc.monad.xyz
```

## Quick Start Commands

```bash
# 1. Fund Safe (CRITICAL FIRST STEP!)
# Go to https://testnet.monad.xyz/faucet
# Send 10 MON to: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20

# 2. Verify infrastructure
npm run check-infrastructure

# 3. Deploy contracts
npm run deploy:testnet

# 4. Update env vars
npm run update-env

# 5. Test Safe delegation
npm run test-safe
```

## Common Issues

### Issue: "EntryPoint not deployed"
**Solution**: Contact Monad team or deploy EntryPoint v0.7 manually

### Issue: "Safe balance too low"
**Solution**: Fund Safe with 10+ MON from faucet

### Issue: "Gas estimation failed"
**Solution**: Increase gas limits or check Safe has been deployed

### Issue: "UserOperation reverted"
**Solution**: Check Safe modules and fallback handler are configured

## Status Tracking

- [ ] Verify EntryPoint v0.7 deployed
- [ ] Verify Safe infrastructure deployed
- [ ] Fund Platform Safe (10 MON minimum)
- [x] Deploy WMON (already deployed at 0xFb8bf4c1CC7a94c73D209a149eA2AbEa852BC541)
- [ ] Deploy/verify TOURS
- [ ] Deploy EmpowerToursNFTv9
- [ ] Deploy MusicSubscription
- [ ] Deploy DailyPassLotteryWMON
- [ ] Update environment variables
- [ ] Test Safe auto-deployment
- [ ] Test delegation functionality

---

**Last Updated**: 2025-12-21
**Testnet**: Monad Testnet (Chain ID: 10143)
**Safe Address**: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 (deterministic)
