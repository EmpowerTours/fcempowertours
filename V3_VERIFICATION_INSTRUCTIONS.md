# V3 Contract Verification Instructions

## Contract Details

- **Contract Address:** `0x2804add55b205Ce5930D7807Ad6183D8f3345974`
- **Network:** Monad Testnet (Chain ID: 10143)
- **Contract Name:** `EmpowerToursYieldStrategyV3`
- **Deployed:** November 14, 2025
- **Status:** ✅ VERIFIED on Monadscan

## Quick Links

- **Explorer:** https://testnet.monadexplorer.com/address/0x2804add55b205Ce5930D7807Ad6183D8f3345974
- **Verify Page:** https://testnet.monadexplorer.com/address/0x2804add55b205Ce5930D7807Ad6183D8f3345974#code

## Compilation Settings

**IMPORTANT:** Contract was deployed with Foundry using Solidity 0.8.30

```
Compiler Version: v0.8.30+commit.73712a01
Optimization: Enabled
Optimization Runs: 10000
Via IR: Yes (CRITICAL - must be enabled!)
EVM Version: paris
License Type: MIT (option 3)
```

## Constructor Arguments

### Decoded Arguments

1. **TOURS Token:** `0x96ad3dEA5d1a4D3dB4E8Bb7E86F0e47F02e1c48b`
2. **Kintsu:** `0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5`
3. **TokenSwap:** `0x66090C97F4f57C8f3cB5Bec90Ab35f8Fa68DE1E2`
4. **DragonRouter:** `0xc57c80C43C0dAf5c40f4eb37e6db32dBFA2f09ea`
5. **Keeper:** `0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9`

### ABI-Encoded Arguments (for verification form)

```
00000000000000000000000096ad3dea5d1a4d3db4e8bb7e86f0e47f02e1c48b000000000000000000000000e1d2439b75fb9746e7bc6cb777ae10aa7f7ef9c500000000000000000000000066090c97f4f57c8f3cb5bec90ab35f8fa68de1e2000000000000000000000000c57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea000000000000000000000000e67e13d545c76c2b4e28dfe27ad827e1fc18e8d9
```

## Contract Source Files

**Option 1: Flattened Contract (RECOMMENDED)**
- File: `contracts/EmpowerToursYieldStrategyV3.flattened.sol`
- This file has all OpenZeppelin imports inlined
- Easier to verify - just paste the entire file

**Option 2: Original Contract with Imports**
- File: `contracts/EmpowerToursYieldStrategyV3.sol`
- Requires multi-file verification
- Need to upload OpenZeppelin dependencies separately

## Step-by-Step Manual Verification

### 1. Go to the Contract Page
Visit: https://testnet.monadexplorer.com/address/0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086

### 2. Click "Verify & Publish" or "Code" Tab
Look for a button that says "Verify Contract" or similar

### 3. Select Verification Method
- Choose: **"Solidity (Single file)"** if using flattened contract
- OR: **"Solidity (Standard JSON)"** if using original files

### 4. Enter Contract Details

```
Contract Address: 0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086
Contract Name: EmpowerToursYieldStrategyV3
Compiler Version: v0.8.30+commit.73712a01
```

### 5. Optimization Settings

```
☑ Optimization Enabled
Runs: 10000
☑ Via IR Enabled (CRITICAL!)
EVM Version: paris
```

### 6. Paste Contract Source
- Copy the ENTIRE contents of `contracts/EmpowerToursYieldStrategyV3.flattened.sol`
- Paste into the source code field

### 7. Constructor Arguments
- Paste the ABI-encoded arguments (shown above)
- Make sure there's NO `0x` prefix

### 8. License Type
- Select: **MIT License** (option 3)

### 9. Submit Verification
- Click "Verify and Publish"
- Wait for confirmation

## Verification Scripts

Several helper scripts are available:

1. **`scripts/verify-v3-monadscan.mjs`**
   - Generates all verification info
   - Creates flattened contract
   - Run with: `node scripts/verify-v3-monadscan.mjs`

2. **`scripts/submit-verification.mjs`**
   - Attempts API verification (may fail due to network)
   - Run with: `node scripts/submit-verification.mjs`

3. **`scripts/verify-v3-contract.sh`**
   - Foundry verification (requires forge/cast installed)
   - Run with: `./scripts/verify-v3-contract.sh`

## Troubleshooting

### "Bytecode does not match"
- ✅ Make sure "Via IR" is enabled
- ✅ Check compiler version exactly: v0.8.30+commit.73712a01
- ✅ Verify optimization runs: 10000
- ✅ Ensure EVM version is "paris"

### "Constructor arguments invalid"
- ✅ Remove `0x` prefix from constructor args
- ✅ Verify the encoded arguments match exactly
- ✅ All addresses should be checksummed

### "Source code does not compile"
- ✅ Use the flattened contract file
- ✅ Ensure all OpenZeppelin imports are included
- ✅ Check pragma version matches compiler

## What Happens After Verification?

Once verified, users can:
- ✅ Read the contract source code on Monadscan
- ✅ See function names instead of hex data
- ✅ Interact with the contract through the explorer UI
- ✅ Verify the contract matches what you deployed

## Next Steps After Verification

1. **Update Backend Config**
   - Update `YIELD_STRATEGY_V3` in `.env`
   - Set to: `0xb2e9ee8b35c84bdaaf2c14fb2cdd95983043e086`

2. **Update Frontend Code**
   - Update contract address in `app/api/execute-delegated/route.ts`
   - Change from V2 address to V3 address

3. **Whitelist NFT**
   - Run: `node scripts/whitelist-execute.mjs addAcceptedNFT 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8`
   - This whitelists the Passport NFT for staking

## Contract Features (V3)

V3 includes all V1 features plus V2 upgrades:

### From V1 (Original)
- ✅ KEEPER parameter for automated harvest() calls
- ✅ Kintsu integration for yield farming
- ✅ TokenSwap for TOURS <-> MON conversion
- ✅ DragonRouter yield allocation
- ✅ Owner-controlled harvest function

### From V2 (Upgrades)
- ✅ BENEFICIARY parameter for delegated staking
- ✅ NFT whitelist for collateral validation
- ✅ Safe can stake on behalf of NFT owner
- ✅ Beneficiary receives rewards (not the staker)

### V3 Improvements
- ✅ Correct pragma version (^0.8.20)
- ✅ Matches compiler version used
- ✅ Clean verification process
- ✅ All functionality working together

## Support

If verification fails, check:
1. Monad Explorer documentation
2. Try different verification methods (single file vs JSON)
3. Verify locally with Foundry first
4. Check if explorer API is accessible

---

**Generated:** November 14, 2025
**Script:** `scripts/verify-v3-monadscan.mjs`
