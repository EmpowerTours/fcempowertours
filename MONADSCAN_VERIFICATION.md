# YieldStrategyV4 Monadscan Verification

## Quick Start

All verification files are ready in: `/root/verification-package/`

Download the package:
```bash
# Download the tarball
scp user@server:/root/verification-package.tar.gz ~/Desktop/

# Or copy individual files from /root/verification-package/
```

## Files Included

1. **VERIFICATION_INSTRUCTIONS.txt** - Complete step-by-step guide
2. **EmpowerToursYieldStrategyV4.flattened.sol** - Contract source code
3. **constructor_args.txt** - ABI-encoded constructor arguments
4. **CONTRACT_SUMMARY.txt** - Contract overview and status

## Contract Details

- **Address**: `0xe3d8E4358aD401F857100aB05747Ed91e78D6913`
- **Network**: Monad Testnet (10143)
- **Verification URL**: https://testnet.monadscan.io/address/0xe3d8E4358aD401F857100aB05747Ed91e78D6913

## Critical Compiler Settings

- Compiler: `v0.8.20+commit.a1b79de6`
- Optimization: `YES`, `10000` runs
- **Via IR: MUST BE ENABLED** ← This is why previous attempts failed!
- EVM Version: `paris`

## Constructor Arguments (Copy This)

```
00000000000000000000000096ad3dea5d1a4d3db4e8bb7e86f0e47f02e1c48b000000000000000000000000e1d2439b75fb9746e7bc6cb777ae10aa7f7ef9c500000000000000000000000066090c97f4f57c8f3cb5bec90ab35f8fa68de1e2000000000000000000000000c57c80c43c0daf5c40f4eb37e6db32dbfa2f09ea000000000000000000000000e67e13d545c76c2b4e28dfe27ad827e1fc18e8d9
```

## Delegation Staking Status

✅ **READY** - Both requirements completed:
1. ✅ Safe has approved YieldStrategy for TOURS tokens
2. ✅ Passport NFT is whitelisted (TX: `0xcd15fa46710b9d46ada85cde055e62222f70adc231614cc042d23e814a732024`)

**Delegation can now stake TOURS!**
