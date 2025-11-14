# Foundry Verification Quick Start

This guide will help you verify the V3 contract using Foundry from WSL.

## Prerequisites

1. **Install Foundry** (if not already installed):
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Add Foundry to PATH** (if needed):
   ```bash
   export PATH="$HOME/.foundry/bin:$PATH"
   ```

3. **Verify installation**:
   ```bash
   forge --version
   cast --version
   ```

## Quick Verification (Recommended)

Simply run the provided script:

```bash
./VERIFY_COMMAND.sh
```

This script will:
1. ✅ Check Foundry is installed
2. ✅ Build the contract with Solidity 0.8.20
3. ✅ Submit verification to Monadscan
4. ✅ Show results

## Manual Steps (If Script Fails)

### Step 1: Build the Contract

First, build the contract to generate artifacts (must use 0.8.30 to match deployment):

```bash
forge build --force --use 0.8.30
```

**If you get "solc not found" error:**

Update Foundry to get latest solc versions:
```bash
foundryup
```

Then retry the build.

### Step 2: Verify the Contract

Once the build succeeds, run verification:

```bash
export MONAD_API_KEY="FQSX86QUTQYPUNG1WJTYBNC665XPTRYD6J"

forge verify-contract \
  --watch \
  --chain-id 10143 \
  --compiler-version v0.8.30+commit.73712a01 \
  --optimizer-runs 10000 \
  --via-ir \
  --constructor-args $(cast abi-encode "constructor(address,address,address,address,address)" \
    "0x96aD3dEa5D1a4D3Db4e8bb7e86f0e47F02E1c48B" \
    "0xe1d2439b75fb9746e7Bc6cB777Ae10AA7f7ef9c5" \
    "0x66090c97f4f57c8f3cb5bec90ab35f8fa68de1e2" \
    "0xc57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea" \
    "0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9") \
  --etherscan-api-key "$MONAD_API_KEY" \
  0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086 \
  contracts/EmpowerToursYieldStrategyV3.sol:EmpowerToursYieldStrategyV3
```

## Troubleshooting

### "No matching artifact found"
**Cause:** Contract not built, or built with wrong compiler version.

**Fix:** Run `forge build --force --use 0.8.30` first.

### "Compiler version not found"
**Cause:** Solc 0.8.30 not installed.

**Fix:** Update Foundry:
```bash
foundryup
```

### API Returns HTML Instead of JSON
**Cause:** Monadscan API might not support automated verification yet.

**Fix:** Use manual verification. See `V3_VERIFICATION_INSTRUCTIONS.md` for steps.

### "Contract already verified"
**Cause:** Contract was already verified successfully.

**Fix:** Check the contract on Monadscan:
```
https://testnet.monadexplorer.com/address/0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086
```

## What Changed from Previous Attempts?

1. **Moved V2 Contract:** The V2 contract with `pragma ^0.8.24` was blocking builds. It's now in `archive/` folder.

2. **Build First:** Previous attempts failed because forge needs local build artifacts to verify. Now the script builds first.

3. **Correct Compiler:** The contract was deployed with Solidity 0.8.30 (from deploy-v3-contract.mjs using npm's solc package). Foundry must compile with the SAME version to match bytecode.

## Contract Details

- **Address:** `0x2804add55b205Ce5930D7807Ad6183D8f3345974`
- **Network:** Monad Testnet (Chain ID: 10143)
- **Compiler:** v0.8.30+commit.73712a01 (deployed with Foundry)
- **Optimization:** Yes (10000 runs)
- **Via IR:** Yes (CRITICAL - must match deployment)
- **EVM Version:** paris
- **Status:** ✅ VERIFIED on Monadscan

## After Verification Succeeds

Once verified, you can:

1. ✅ View source code on Monadscan
2. ✅ Interact with contract through explorer UI
3. ✅ See function names instead of hex data in transactions

Then update the backend:
- Update `YIELD_STRATEGY_V3` in `.env`
- Whitelist the Passport NFT (see V3_VERIFICATION_INSTRUCTIONS.md)

## Need Help?

If verification keeps failing:
1. Check if Monadscan supports API verification
2. Try manual verification (see V3_VERIFICATION_INSTRUCTIONS.md)
3. Verify build output matches foundry.toml settings
4. Check Monadscan status/documentation

---

**Contract:** EmpowerToursYieldStrategyV3
**Explorer:** https://testnet.monadexplorer.com/address/0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086
