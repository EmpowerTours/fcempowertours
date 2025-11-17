# EmpowerTours Mini-Apps Deployment Guide

Complete guide for deploying and verifying all EmpowerTours mini-app smart contracts on Monad testnet.

## 📋 Prerequisites

- [Foundry](https://book.getfoundry.sh/getting-started/installation) installed
- Private key with MON testnet tokens for deployment
- MonadScan API key (for verification)

## 🎯 Contracts to Deploy

1. **ActionBasedDemandSignal** - Tracks user demand signals for locations/artists
2. **ItineraryNFT** - Local experiences marketplace with passport stamping
3. **MusicBeatMatch** - Daily music guessing game with TOURS rewards
4. **CountryCollector** - Weekly country challenges with badges
5. **TandaPool** - Rotating savings and credit association (ROSCA) for group savings

## 🔧 Environment Setup

Create a `.env` file in the contracts directory:

```bash
# Deployment wallet
PRIVATE_KEY=your_private_key_here

# MonadScan verification (optional but recommended)
MONAD_SCAN_API_KEY=your_monad_scan_api_key
```

**IMPORTANT**: Never commit your `.env` file to git!

## 🚀 Deployment Steps

### Step 1: Run Tests (100% coverage required)

```bash
forge test --match-path "test/*.t.sol"
```

Expected result: **57/57 tests passing (100%)**

### Step 2: Deploy All Contracts

```bash
forge script script/DeployComplete.s.sol:DeployComplete \
    --rpc-url monad_testnet \
    --broadcast \
    --verify \
    -vvvv
```

This will:
- Deploy all 5 mini-app contracts
- Authorize the backend wallet for ActionBasedDemandSignal
- Output all contract addresses
- Provide next steps

### Step 3: Save Deployed Addresses

After deployment, create `deployed_addresses.txt`:

```bash
# Replace with actual deployed addresses
export DEMAND_SIGNAL_ADDR=0x...
export ITINERARY_NFT_ADDR=0x...
export BEAT_MATCH_ADDR=0x...
export COUNTRY_COLLECTOR_ADDR=0x...
export TANDA_POOL_ADDR=0x...
```

### Step 4: Verify Contracts (if auto-verify failed)

```bash
./script/VerifyAll.sh
```

Or verify manually:

```bash
# ActionBasedDemandSignal
forge verify-contract <ADDRESS> \
    contracts/ActionBasedDemandSignal.sol:ActionBasedDemandSignal \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address)" 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20)

# ItineraryNFT
forge verify-contract <ADDRESS> \
    contracts/ItineraryNFT.sol:ItineraryNFT \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address,address)" 0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163 0xa123600c82E69cB311B0e068B06Bfa9F787699B7)

# MusicBeatMatch
forge verify-contract <ADDRESS> \
    contracts/MusicBeatMatch.sol:MusicBeatMatch \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address,address)" 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20)

# CountryCollector
forge verify-contract <ADDRESS> \
    contracts/CountryCollector.sol:CountryCollector \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address,address,address)" 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20)

# TandaPool
forge verify-contract <ADDRESS> \
    contracts/TandaPool.sol:TandaPool \
    --chain monad_testnet \
    --constructor-args $(cast abi-encode "constructor(address)" 0xa123600c82E69cB311B0e068B06Bfa9F787699B7)
```

### Step 5: Fund Reward Contracts

```bash
./script/FundContracts.sh
```

This funds each reward contract with 10,000 TOURS tokens.

Or fund manually:

```bash
cast send 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
    "transfer(address,uint256)" \
    <ITINERARY_NFT_ADDR> \
    10000000000000000000000 \
    --private-key $PRIVATE_KEY \
    --rpc-url monad_testnet
```

### Step 6: Update Frontend Configuration

Add these environment variables to Railway/Vercel:

```bash
NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=<DEMAND_SIGNAL_ADDR>
NEXT_PUBLIC_ITINERARY_NFT=<ITINERARY_NFT_ADDR>
NEXT_PUBLIC_MUSIC_BEAT_MATCH=<BEAT_MATCH_ADDR>
NEXT_PUBLIC_COUNTRY_COLLECTOR=<COUNTRY_COLLECTOR_ADDR>
NEXT_PUBLIC_TANDA_POOL=<TANDA_POOL_ADDR>
```

## 📊 Contract Addresses Reference

### Existing Contracts (Already Deployed)
```
TOURS Token:      0xa123600c82E69cB311B0e068B06Bfa9F787699B7
Passport NFT v3:  0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163
Keeper (Safe):    0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
Backend Wallet:   0x37302543aeF0b06202adcb06Db36daB05F8237E9
```

## ✅ Post-Deployment Checklist

- [ ] All 5 contracts deployed successfully
- [ ] All contracts verified on MonadScan
- [ ] Backend wallet authorized in ActionBasedDemandSignal
- [ ] Reward contracts funded with TOURS
- [ ] Frontend environment variables updated
- [ ] Test transactions on each contract
- [ ] Monitor contract events

## 🧪 Testing Deployed Contracts

### Check TOURS Balance
```bash
cast call 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
    "balanceOf(address)" \
    <CONTRACT_ADDR> \
    --rpc-url monad_testnet
```

### Create Test Challenge (MusicBeatMatch)
```bash
cast send <BEAT_MATCH_ADDR> \
    "createDailyChallenge(uint256,string,string)" \
    1 "Despacito" "ipfs://audio" \
    --private-key $PRIVATE_KEY \
    --rpc-url monad_testnet
```

### Create Test Tanda Pool
```bash
cast send <TANDA_POOL_ADDR> \
    "createPool(string,uint256,uint256,uint256,uint8)" \
    "Test Pool" 3 "10000000000000000000" 3 0 \
    --private-key $PRIVATE_KEY \
    --rpc-url monad_testnet
```

## 🔍 Monitoring

View contract events on MonadScan:
```
https://testnet-scan.monad.xyz/address/<CONTRACT_ADDRESS>#events
```

## 🐛 Troubleshooting

### "Insufficient balance" error
Ensure deployer wallet has enough MON testnet tokens.

### "Verification failed" error
Check that:
- Constructor args are correct
- Solidity version matches (0.8.20)
- Contract source is correct

### "Transfer failed" when funding
Verify that:
- You have enough TOURS tokens
- Contract addresses are correct

## 📚 Additional Resources

- [Foundry Book](https://book.getfoundry.sh/)
- [Monad Testnet Documentation](https://docs.monad.xyz/)
- [EmpowerTours Documentation](https://docs.empowertours.com/)

## 🆘 Need Help?

- Check test output: `forge test -vvv`
- Review deployment logs
- Contact team on Discord/Telegram
