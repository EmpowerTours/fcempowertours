# YieldStrategy V5 Deployment Guide

## Overview

YieldStrategy V5 is a complete rewrite that fixes the delegated staking issues in V4:

### Key Improvements Over V4

1. **No NFT Transfer Required**: NFT stays with the beneficiary - contract only verifies ownership
2. **Proper Delegated Staking**: Safe can deposit TOURS on behalf of users who own NFTs
3. **Verification Ready**: Uses standard OpenZeppelin imports for easy MonadScan verification
4. **Function Alignment**: Uses `stakeWithDeposit(address,uint256,uint256,address)` matching the existing codebase

### Contract Location

- **Source**: `contracts/contracts/EmpowerToursYieldStrategyV5.sol`
- **Solidity Version**: 0.8.20
- **Optimizer**: Enabled (200 runs)
- **Dependencies**: OpenZeppelin Contracts ^5.0.0

## Deployment Steps

### Option 1: Manual Deployment via Remix (Recommended)

1. **Open Remix IDE**
   - Go to: https://remix.ethereum.org

2. **Upload Contract**
   - Create new file: `EmpowerToursYieldStrategyV5.sol`
   - Copy content from: `contracts/contracts/EmpowerToursYieldStrategyV5.sol`
   - Upload OpenZeppelin dependencies via npm package manager in Remix

3. **Compile Contract**
   - Compiler version: 0.8.20
   - Enable optimization: YES
   - Optimization runs: 200
   - EVM version: default
   - Click "Compile EmpowerToursYieldStrategyV5.sol"

4. **Connect to Monad Testnet**
   - Environment: "Injected Provider - MetaMask" (or "Wallet Connect")
   - OR use "Custom External HTTP Provider"
   - Network Details:
     - RPC URL: `https://testnet.monad.xyz` (or from NEXT_PUBLIC_MONAD_RPC)
     - Chain ID: 41454
     - Currency: MON

5. **Deploy Contract**
   - Constructor Parameters:
     ```
     _toursToken:    0xa123600c82E69cB311B0e068B06Bfa9F787699B7
     _kintsu:        0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626
     _tokenSwap:     0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2
     _dragonRouter:  0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e
     _keeper:        0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 (Safe account)
     ```
   - Ensure deployer has at least 0.5 MON for gas
   - Click "Deploy"
   - Confirm transaction in wallet

6. **Save Deployment Info**
   - Contract Address: `<copy from Remix>`
   - Transaction Hash: `<copy from Remix>`
   - Deployer Address: `<your wallet address>`

### Option 2: Hardhat Deployment (When Network Access Available)

```bash
cd contracts
npm install
npx hardhat compile
npx hardhat run scripts/deploy-v5.ts --network monadTestnet
```

## Post-Deployment Steps

### 1. Whitelist Passport NFT

Run the whitelist script:

```bash
# Set the deployed contract address
export NEXT_PUBLIC_YIELD_STRATEGY=<deployed-address>

# Option A: Using Hardhat
cd contracts
npx hardhat run scripts/whitelist-nft.ts --network monadTestnet

# Option B: Using existing script
npm run whitelist-nft-v5
```

Or manually via Remix:
- Call `addAcceptedNFT("0x54e935c5f1ec987bb87f36fc046cf13fb393acc8")`
- Confirm transaction

### 2. Verify Contract on MonadScan

#### Flattened Source Verification

1. Flatten the contract:
```bash
cd contracts
npx hardhat flatten contracts/EmpowerToursYieldStrategyV5.sol > YieldStrategyV5.flattened.sol
```

2. Submit to MonadScan:
   - Go to: https://testnet.monad.xyz/address/<your-contract-address>
   - Click "Verify & Publish"
   - Contract Address: `<your-deployed-address>`
   - Compiler Type: Solidity (Single file)
   - Compiler Version: v0.8.20+commit.a1b79de6
   - Optimization: Yes
   - Optimization Runs: 200
   - Paste flattened source code
   - Constructor Arguments (ABI-encoded):
     ```
     Use Remix or ethers.js to encode:
     ["0xa123600c82E69cB311B0e068B06Bfa9F787699B7",
      "0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626",
      "0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2",
      "0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e",
      "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"]
     ```

#### Hardhat Verification (Alternative)

```bash
cd contracts
npx hardhat verify --network monadTestnet <contract-address> \
  "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
  "0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626" \
  "0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2" \
  "0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e" \
  "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"
```

### 3. Update Environment Variables

Update `.env.local`:
```bash
NEXT_PUBLIC_YIELD_STRATEGY=<deployed-v5-address>
```

### 4. Update Application Code (If Needed)

The contract function signature matches the existing code:
```solidity
function stakeWithDeposit(
    address nftAddress,
    uint256 nftTokenId,
    uint256 toursAmount,
    address beneficiary
) external returns (uint256 positionId)
```

No changes needed to `app/api/execute-delegated/route.ts` - it already calls the correct function!

## Testing Deployment

### Test 1: Check Whitelist

```typescript
const yieldStrategy = await publicClient.readContract({
  address: '<deployed-address>',
  abi: parseAbi(['function acceptedNFTs(address) view returns (bool)']),
  functionName: 'acceptedNFTs',
  args: ['0x54e935c5f1ec987bb87f36fc046cf13fb393acc8'], // Passport NFT
});
console.log('Passport NFT whitelisted:', yieldStrategy);
```

### Test 2: Try Delegated Staking

```bash
# Via Farcaster bot
!stake 10 TOURS

# Should now work without NFT approval errors!
```

## Troubleshooting

### Contract Won't Deploy
- **Issue**: Transaction reverts or fails
- **Solution**:
  - Check deployer has enough MON (need 0.5+ MON)
  - Verify all constructor addresses are valid deployed contracts
  - Check RPC endpoint is accessible

### Verification Fails
- **Issue**: MonadScan says "Invalid constructor arguments"
- **Solution**:
  - Make sure arguments are in correct order
  - Use ABI encoder tool to encode constructor args
  - Ensure compiler version and optimization settings match exactly

### Whitelist Transaction Fails
- **Issue**: addAcceptedNFT reverts with "Ownable: caller is not the owner"
- **Solution**:
  - Must call from the deployer address
  - Check `owner()` function to see current owner
  - Use the same wallet that deployed the contract

### Staking Still Fails
- **Issue**: "NFT not whitelisted" error
- **Solution**:
  - Verify whitelist transaction was confirmed
  - Check `acceptedNFTs(passport_address)` returns `true`
  - Make sure using correct Passport NFT address

## Contract Addresses (Monad Testnet)

```
TOURS Token:     0xa123600c82E69cB311B0e068B06Bfa9F787699B7
Kintsu:          0xBCF4F90cE0B5fF4eD0458F7A33e27AA3FF6C2626
Token Swap:      0x9A81bBba43e49733f0cBf91A2E16e68be14e07E2
Dragon Router:   0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e
Passport NFT:    0x54e935c5f1ec987bb87f36fc046cf13fb393acc8
Safe Account:    0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20

YieldStrategy V4: 0xe3d8E4358aD401F857100aB05747Ed91e78D6913 (deprecated)
YieldStrategy V5: <deploy and add here>
```

## Key Differences from V4

| Feature | V4 (Broken) | V5 (Fixed) |
|---------|-------------|------------|
| NFT Transfer | Required | **Not required** |
| NFT Approval Check | Blocks delegated staking | **Only checks when beneficiary = Safe** |
| Delegated Staking | ❌ Broken | ✅ Works |
| Function Name | Unknown/Changed | **stakeWithDeposit** (correct) |
| Verification | ❌ Failed | ✅ Ready with OpenZeppelin |
| Code Quality | Unknown | **Well-documented, clean** |

## Support

If you encounter issues:
1. Check this guide thoroughly
2. Verify all contract addresses are correct
3. Ensure network connection to Monad testnet
4. Check deployer wallet has sufficient MON
5. Review transaction errors for specific failure reasons
