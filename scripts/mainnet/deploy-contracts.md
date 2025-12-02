# EmpowerTours Mainnet Deployment Guide

## Overview

This guide covers deploying the EmpowerTours smart contracts to Monad Mainnet.

**Monad Mainnet Configuration:**
- Chain ID: 143
- RPC: https://rpc.monad.xyz
- Explorer: https://monadscan.com
- WMON: 0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
- EntryPoint: 0x0000000071727De22E5E9d8BAf0edAc6f37da032

---

## Prerequisites

### 1. Install Dependencies
```bash
# Ensure Foundry is installed
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Verify installation
forge --version
```

### 2. Fund Deployer Wallet
- Ensure your deployer wallet has sufficient MON for gas
- Recommended: At least 10 MON for full deployment
- Get MON from exchanges or bridges

### 3. Environment Setup
```bash
# Copy example env
cp scripts/mainnet/.env.mainnet.example .env.mainnet

# Edit with your values
nano .env.mainnet
```

---

## Deployment Process

### Step 1: Compile Contracts
```bash
cd /home/empowertours/projects/fcempowertours/contracts

# Clean and compile
forge clean
forge build
```

### Step 2: Run Deployment Script
```bash
# Set private key (or use --interactive)
export PRIVATE_KEY=your_private_key_here

# Deploy to mainnet
forge script script/DeployMainnet.s.sol:DeployMainnet \
  --rpc-url https://rpc.monad.xyz \
  --broadcast \
  --verify \
  --verifier-url https://api.monadscan.com/api \
  -vvvv
```

### Step 3: Save Deployed Addresses
After deployment, save all contract addresses from the console output.
Update `.env.mainnet` with the new addresses.

---

## Individual Contract Deployment

If you need to deploy contracts individually:

### Deploy TOURS Token
```bash
forge create --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  contracts/ToursToken.sol:ToursToken \
  --constructor-args "EmpowerTours" "TOURS" \
  --verify --verifier-url https://api.monadscan.com/api
```

### Deploy Passport NFT
```bash
forge create --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  contracts/PassportNFT.sol:PassportNFT \
  --constructor-args $TOURS_TOKEN_ADDRESS \
  --verify --verifier-url https://api.monadscan.com/api
```

### Deploy Market
```bash
forge create --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  contracts/Market.sol:Market \
  --constructor-args $TOURS_TOKEN_ADDRESS $PASSPORT_NFT_ADDRESS \
  --verify --verifier-url https://api.monadscan.com/api
```

---

## Verification

### Verify on Monadscan
```bash
# If automatic verification failed
forge verify-contract \
  --chain-id 143 \
  --verifier-url https://api.monadscan.com/api \
  <CONTRACT_ADDRESS> \
  <CONTRACT_NAME> \
  --constructor-args $(cast abi-encode "constructor(args)" arg1 arg2)
```

### Manual Verification Steps
1. Go to https://monadscan.com
2. Find your contract address
3. Click "Verify & Publish"
4. Select compiler version and optimization settings
5. Paste source code
6. Submit verification

---

## Post-Deployment Configuration

### 1. Set Up Safe (Multi-sig)
```bash
# Deploy Safe with multiple signers
# Use Safe{Wallet} UI: https://safe.global

# Configure required signatures (e.g., 2-of-3)
```

### 2. Configure Contract Permissions
```javascript
// Using cast or script

// Authorize backend wallet on ActionBasedDemandSignal
cast send $DEMAND_SIGNAL_ADDRESS \
  "authorizeContract(address,bool)" \
  $BACKEND_WALLET true \
  --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY

// Whitelist NFT contracts on Yield Strategy
cast send $YIELD_STRATEGY_ADDRESS \
  "whitelistNFT(address,bool)" \
  $NFT_ADDRESS true \
  --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY
```

### 3. Transfer Ownership to Multi-sig
```bash
# Transfer admin rights to Safe
cast send $CONTRACT_ADDRESS \
  "transferOwnership(address)" \
  $SAFE_ADDRESS \
  --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY
```

---

## AMM Deployment

### Deploy TOURS-WMON Pool
```bash
forge script script/DeployAMMWithOfficialWMON.s.sol:DeployAMMWithOfficialWMON \
  --rpc-url https://rpc.monad.xyz \
  --broadcast \
  --verify \
  --verifier-url https://api.monadscan.com/api \
  -vvvv
```

### Add Initial Liquidity
```bash
forge script script/AddInitialLiquidity.s.sol:AddInitialLiquidity \
  --rpc-url https://rpc.monad.xyz \
  --broadcast \
  -vvvv
```

---

## Troubleshooting

### Transaction Failed
- Check deployer wallet has sufficient MON
- Verify RPC endpoint is responsive
- Check gas price settings

### Verification Failed
- Ensure compiler version matches
- Check optimization settings
- Verify constructor arguments encoding

### Contract Interaction Failed
- Confirm contract is deployed at expected address
- Verify you have correct permissions
- Check function signature matches ABI

---

## Security Reminders

1. **Never commit private keys** to version control
2. **Use hardware wallets** for production admin keys
3. **Transfer ownership** to multi-sig after deployment
4. **Verify all contracts** on block explorer
5. **Test all functions** before announcing launch
6. **Monitor transactions** for unexpected behavior

---

## Contract Dependencies

```
ToursToken
    |
    +-- PassportNFT
    |       |
    |       +-- Market
    |       +-- CountryCollector
    |       +-- ItineraryNFT
    |
    +-- Vault
    |       |
    |       +-- YieldStrategy
    |
    +-- MusicBeatMatch
    +-- TandaPool
    +-- ActionBasedDemandSignal (no token dependency)
```

---

## Support

- Technical issues: Create GitHub issue
- Security concerns: Contact team directly
- Documentation: See project README
