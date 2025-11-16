# YieldStrategy V5 Deployment

## Deployment Summary
- **Network:** Monad Testnet
- **Chain ID:** 10143
- **Deployed:** 2025-11-15
- **Contract Address:** `0x6863674C89faD0c7e3C0B406BA35182649eE216b`
- **Deployer/Owner:** `0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9`

## Transaction Hashes
- **Deployment:** `0x6f7de5a1563c91a7d449547ec13c7d60d3cf126c75d79ed99a21ec84ac07f978`
- **NFT Whitelist:** `0x80deef62654c42ca9cd416f2b70aa39fff38da2804dcefc1d0b97d2d6ad2e8e9`

## Constructor Arguments
```solidity
address _toursToken      = 0xa123600c82E69cB311B0e068B06Bfa9F787699B7
address _kintsu          = 0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626
address _tokenSwap       = 0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2
address _dragonRouter    = 0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e
address _keeper          = 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
```

## ABI Encoded Constructor Args
```
0x000000000000000000000000a123600c82e69cb311b0e068b06bfa9f787699b7000000000000000000000000bcf4f90ce0b5ff4ed0458f7a33e27aa3ff6c26260000000000000000000000009a81bbba43e49733f0cbf91a2e16e68be14e07e200000000000000000000000000ea77cfcd29d461250b85d3569d0e235d8fbd1e0000000000000000000000002217d0bd793fc38dc9f9d9bc46cec91191ee4f20
```

## Configuration
- **Compiler:** Solidity 0.8.20
- **Optimizer:** Enabled (200 runs)
- **License:** MIT

## Whitelisted NFTs
- Passport NFT: `0x54e935c5f1ec987bb87f36fc046cf13fb393acc8` ✅

## Security Fixes (from V4)
1. ✅ **Fixed withdrawal calculation** - Uses `previewWithdraw` instead of `previewDeposit` (line 370)
2. ✅ **Prevented yield theft** - Implemented per-position yield tracking with `accYieldPerShare` (lines 84, 225, 270)
3. ✅ **Enabled owner recovery** - Both owner and beneficiary can unstake (line 263, 267-269)
4. ✅ **Removed NFT transfer requirement** - Only verifies ownership, no approval needed (line 194-197)

## Environment Variable
Add to `.env.local`:
```bash
NEXT_PUBLIC_YIELD_STRATEGY=0x6863674C89faD0c7e3C0B406BA35182649eE216b
```

## Manual Verification (when MonadScan is available)

### Using Foundry:
```bash
forge verify-contract \
  --watch \
  --chain 10143 \
  --verifier blockscout \
  --verifier-url https://[MONAD_EXPLORER_URL]/api \
  0x6863674C89faD0c7e3C0B406BA35182649eE216b \
  contracts/contracts/EmpowerToursYieldStrategyV5.sol:EmpowerToursYieldStrategyV5 \
  --constructor-args 0x000000000000000000000000a123600c82e69cb311b0e068b06bfa9f787699b7000000000000000000000000bcf4f90ce0b5ff4ed0458f7a33e27aa3ff6c26260000000000000000000000009a81bbba43e49733f0cbf91a2e16e68be14e07e200000000000000000000000000ea77cfcd29d461250b85d3569d0e235d8fbd1e0000000000000000000000002217d0bd793fc38dc9f9d9bc46cec91191ee4f20
```

### Or via Block Explorer UI:
1. Go to Monad testnet block explorer
2. Search for contract: `0x6863674C89faD0c7e3C0B406BA35182649eE216b`
3. Click "Verify & Publish"
4. Enter:
   - Compiler: v0.8.20
   - Optimization: Yes (200 runs)
   - Constructor arguments (ABI encoded): See above
5. Upload contract source code

## Testing
```bash
# Check owner
cast call 0x6863674C89faD0c7e3C0B406BA35182649eE216b "owner()" --rpc-url https://testnet-rpc.monad.xyz

# Check if NFT is whitelisted
cast call 0x6863674C89faD0c7e3C0B406BA35182649eE216b "acceptedNFTs(address)" 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 --rpc-url https://testnet-rpc.monad.xyz

# Check keeper
cast call 0x6863674C89faD0c7e3C0B406BA35182649eE216b "keeper()" --rpc-url https://testnet-rpc.monad.xyz
```

## Next Steps
1. ✅ Contract deployed
2. ✅ Passport NFT whitelisted
3. ⏳ Verify on block explorer (when available)
4. ⏳ Update `.env.local` with new contract address
5. ⏳ Test delegated staking flow
