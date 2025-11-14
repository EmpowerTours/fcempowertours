# Contract Verification Guide

## Contract Information

- **Address:** `0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c`
- **Network:** Monad Testnet (Chain ID: 10143)
- **Contract Name:** `EmpowerToursYieldStrategyV2`

## Compilation Settings

- **Compiler Version:** `v0.8.20+commit.a1b79de6`
- **Optimization:** Enabled
- **Optimization Runs:** 10000
- **Via IR:** Yes (enabled)
- **EVM Version:** paris

## Constructor Arguments (ABI-Encoded)

```
00000000000000000000000096ad3dea5d1a4d3db4e8bb7e86f0e47f02e1c48b000000000000000000000000e1d2439b75fb9746e7bc6cb777ae10aa7f7ef9c500000000000000000000000066090c97f4f57c8f3cb5bec90ab35f8fa68de1e2000000000000000000000000c57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea00000000000000000000000037302543aef0b06202adcb06db36dab05f8237e9
```

### Constructor Arguments (Decoded)

1. **TOURS Token:** `0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B`
2. **Kintsu:** `0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5`
3. **TokenSwap:** `0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2`
4. **DragonRouter:** `0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea`
5. **Keeper:** `0x37302543aeF0b06202adcb06Db36daB05F8237E9`

## Manual Verification Steps

### Option 1: Monad Explorer Web UI

1. Visit: https://testnet.monadexplorer.com/address/0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c
2. Click **"Verify & Publish"** or **"Code"** tab
3. Select **"Solidity (Single file)"** or **"Solidity (Standard JSON)"**
4. Enter the following:
   - **Compiler:** `v0.8.20+commit.a1b79de6`
   - **Optimization:** Yes
   - **Runs:** 10000
   - **Via IR:** Yes (if available)
   - **EVM Version:** paris
5. Paste the contract source from `contracts/EmpowerToursYieldStrategyV2.sol`
6. Paste the constructor arguments (encoded, from above)
7. Click **Verify**

### Option 2: Using Hardhat (when network is available)

```bash
npx hardhat verify --network monadTestnet \
  0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c \
  "0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B" \
  "0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5" \
  "0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2" \
  "0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea" \
  "0x37302543aeF0b06202adcb06Db36daB05F8237E9"
```

### Option 3: Using Foundry (when installed)

```bash
forge verify-contract \
  0xbc65380d216c83a7f12b789ce5aa66ff03c32c7c \
  contracts/EmpowerToursYieldStrategyV2.sol:EmpowerToursYieldStrategyV2 \
  --chain-id 10143 \
  --compiler-version v0.8.20+commit.a1b79de6 \
  --optimizer-runs 10000 \
  --via-ir \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,address)" "0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B" "0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5" "0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2" "0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea" "0x37302543aeF0b06202adcb06Db36daB05F8237E9")
```

## Important Notes

1. **Pragma Version:** The contract source has been updated to `pragma solidity ^0.8.20` to match the compiler version
2. **Via IR:** This is critical - the contract MUST be compiled with `viaIR: true` enabled
3. **Optimizer Runs:** Must be exactly 10000 runs
4. **Dependencies:** The contract imports from OpenZeppelin v5.x

## Troubleshooting

If verification fails:

1. **Check compiler version exactly:** Must be `0.8.20` with commit hash `a1b79de6`
2. **Verify Via IR is enabled:** This changes the bytecode significantly
3. **Check constructor arguments:** Must be ABI-encoded in the correct order
4. **Try flattened contract:** Use `npx hardhat flatten` to create a single file

## Contract Source Location

- **File:** `contracts/EmpowerToursYieldStrategyV2.sol`
- **Lines:** 1-336
