# YieldStrategyV4 Deployment Guide

## What's Different in V4?

**V3 Problem**: Required batching `approve()` + `stakeWithNFT()` in one transaction, which broke AA bundler gas estimation.

**V4 Solution**:
- Safe approves YieldStrategy **ONCE** with unlimited allowance (one-time setup)
- After that, every stake is a **single transaction** using existing allowance
- Function renamed from `stakeWithNFT` to `stakeWithDeposit` for clarity

## Deployment Steps

### Option 1: Using Foundry (Recommended)

```bash
# 1. Install Foundry if not installed
curl -L https://foundry.paradigm.xyz | bash
foundryup

# 2. Deploy V4 contract
forge script script/DeployV4.s.sol:DeployV4 \\
  --rpc-url monad \\
  --broadcast \\
  --legacy \\
  --slow \\
  -vvv

# 3. Copy the deployed address from output
```

### Option 2: Using Node.js

```bash
# Deploy V4 contract
node scripts/deploy-v4-contract.mjs
```

## Post-Deployment Configuration

### 1. Update Backend Contract Address

Edit `app/api/execute-delegated/route.ts`:

```diff
- const YIELD_STRATEGY = '0x2804add55b205Ce5930D7807Ad6183D8f3345974' as Address; // V3
+ const YIELD_STRATEGY = '0xYOUR_V4_ADDRESS_HERE' as Address; // V4
```

### 2. Update Function Call

In the same file, change the stake function name:

```diff
  data: encodeFunctionData({
-   abi: parseAbi(['function stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary) external returns (uint256)']),
-   functionName: 'stakeWithNFT',
+   abi: parseAbi(['function stakeWithDeposit(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary) external returns (uint256)']),
+   functionName: 'stakeWithDeposit',
    args: [PASSPORT_NFT, BigInt(nftTokenId), stakeAmount, userAddress as Address],
  }) as Hex,
```

### 3. Whitelist Passport NFT

```bash
node scripts/whitelist-execute.mjs addAcceptedNFT 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8
```

### 4. Approve Safe for Unlimited TOURS (One-Time Setup)

Update `scripts/approve-yield-strategy-max.mjs` with V4 address, then run:

```bash
node scripts/approve-yield-strategy-max.mjs
```

This gives YieldStrategy V4 unlimited approval to spend TOURS from the Safe.
**After this, no more approve transactions needed!**

## Verification on Monadscan

```bash
# Get constructor args
cast abi-encode "constructor(address,address,address,address,address)" \\
  0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B \\
  0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5 \\
  0x66090C97F4f57C8f3cB5Bec90Ab35f8Fa68DE1E2 \\
  0xc57c80C43C0dAf5c40f4eb37e6db32dBFA2f09ea \\
  0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9

# Verify
forge verify-contract \\
  YOUR_V4_ADDRESS \\
  contracts/EmpowerToursYieldStrategyV4.sol:EmpowerToursYieldStrategyV4 \\
  --chain 10143 \\
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,address)" 0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B 0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5 0x66090C97F4f57C8f3cB5Bec90Ab35f8Fa68DE1E2 0xc57c80C43C0dAf5c40f4eb37e6db32dBFA2f09ea 0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9)
```

## Testing the Fix

1. Safe should have unlimited TOURS approval for YieldStrategy V4
2. User tries to stake TOURS with their passport NFT
3. **Single transaction** - no more batched approve + stake!
4. Bundler gas estimation works correctly
5. Transaction succeeds

## Why This Works

**Before (V3)**:
```
Transaction 1: approve(YieldStrategy, amount)
Transaction 2: stakeWithNFT(...)
```
OR batched:
```
UserOp: [approve(...), stakeWithNFT(...)]  ❌ Bundler drops this
```

**After (V4)**:
```
One-time setup: approve(YieldStrategy, MAX_UINT256)
Then forever after:
UserOp: [stakeWithDeposit(...)]  ✅ Works perfectly
```

The bundler can properly estimate gas for a single `stakeWithDeposit` call because there's no approve in the same transaction - the allowance already exists!
