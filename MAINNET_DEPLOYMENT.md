# Monad Mainnet Deployment Checklist

## Network Information

| Property | Value |
|----------|-------|
| Chain ID | 143 |
| RPC | https://rpc.monad.xyz |
| Explorer | https://monadscan.com |
| Native Token | MON (18 decimals) |

## Protocol Addresses (Pre-deployed)

| Contract | Address |
|----------|---------|
| WMON | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |
| EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` |
| Pyth Entropy | `0xd458261E832415CFD3BAE5E416FdF3230CE6F134` |

---

## Deployment Phases

### Phase 1: Core Infrastructure

- [ ] **1.1 Platform Safe Multi-Sig**
  - Deploy via [Safe UI](https://app.safe.global/)
  - Configure 2/3 multi-sig with trusted signers
  - Record address: `_____________________________`

- [ ] **1.2 TOURS Token**
  ```bash
  forge script script/DeployTOURS.s.sol:DeployTOURS \
    --rpc-url https://rpc.monad.xyz --broadcast --verify
  ```
  - Record address: `_____________________________`

- [ ] **1.3 EmpowerToursTreasury**
  ```bash
  forge script script/DeployTreasury.s.sol:DeployTreasury \
    --rpc-url https://rpc.monad.xyz --broadcast --verify
  ```
  - Record address: `_____________________________`

### Phase 2: NFT Contracts

- [ ] **2.1 PassportNFT**
  ```bash
  forge script script/DeployPassportNFT.s.sol:DeployPassportNFT \
    --rpc-url https://rpc.monad.xyz --broadcast --verify
  ```
  - Record address: `_____________________________`

- [ ] **2.2 EmpowerToursNFT (Music NFTs)**
  ```bash
  forge script script/DeployNFT.s.sol:DeployNFT \
    --rpc-url https://rpc.monad.xyz --broadcast --verify
  ```
  - Record address: `_____________________________`

### Phase 3: DeFi & Staking

- [ ] **3.1 YieldStrategy**
  - Requires: PassportNFT, TOURS, EmpowerToursNFT
  - Record address: `_____________________________`

- [ ] **3.2 DAOReserve**
  ```bash
  DAO_ADDRESS=0x... forge script script/DeployTreasury.s.sol:DeployDAOReserve \
    --rpc-url https://rpc.monad.xyz --broadcast --verify
  ```
  - Record address: `_____________________________`

### Phase 4: Core Features

- [ ] **4.1 DailyPassLotteryWMON**
  ```bash
  PLATFORM_WALLET=0x... forge script script/DeployDailyPassLotteryWMON.s.sol \
    --rpc-url https://rpc.monad.xyz --broadcast --verify
  ```
  - Record address: `_____________________________`
  - Fund with TOURS for rewards

- [ ] **4.2 LiveRadio**
  ```bash
  forge script script/DeployLiveRadio.s.sol:DeployLiveRadio \
    --rpc-url https://rpc.monad.xyz --broadcast --verify
  ```
  - Record address: `_____________________________`
  - Call `startRadio()`
  - Fund with TOURS for rewards

- [ ] **4.3 MusicSubscriptionV2**
  - Record address: `_____________________________`

### Phase 5: Marketplace & Services

- [ ] **5.1 TourGuideRegistry (MirrorMate)**
  - Record address: `_____________________________`

- [ ] **5.2 EventSponsorshipV2**
  - Requires: Treasury, TOURS, Pyth Entropy, SponsorWhitelist
  - Record address: `_____________________________`

---

## Post-Deployment

### Environment Variables

Update `.env.production` with deployed addresses:

```bash
# Network
NEXT_PUBLIC_CHAIN_ID=143
NEXT_PUBLIC_MONAD_RPC=https://rpc.monad.xyz

# Tokens
NEXT_PUBLIC_WMON=0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A
NEXT_PUBLIC_TOURS_TOKEN=<DEPLOYED_ADDRESS>

# Core
NEXT_PUBLIC_SAFE_ACCOUNT=<PLATFORM_SAFE>
NEXT_PUBLIC_TREASURY=<TREASURY_ADDRESS>

# NFTs
NEXT_PUBLIC_PASSPORT_NFT=<PASSPORT_ADDRESS>
NEXT_PUBLIC_NFT_ADDRESS=<MUSIC_NFT_ADDRESS>

# Features
NEXT_PUBLIC_LOTTERY_WMON_ADDRESS=<LOTTERY_ADDRESS>
NEXT_PUBLIC_LIVE_RADIO=<LIVE_RADIO_ADDRESS>
NEXT_PUBLIC_MUSIC_SUBSCRIPTION=<SUBSCRIPTION_ADDRESS>

# Marketplace
NEXT_PUBLIC_TOUR_GUIDE_REGISTRY=<TOUR_GUIDE_ADDRESS>
NEXT_PUBLIC_EVENT_SPONSORSHIP=<SPONSORSHIP_ADDRESS>
```

### Verification

- [ ] All contracts verified on MonadScan
- [ ] Test basic operations on each contract
- [ ] Confirm Safe multi-sig works
- [ ] Pimlico bundler configured for mainnet
- [ ] Envio indexer updated for mainnet

### Funding

- [ ] Fund Platform Safe with MON for gas
- [ ] Fund Lottery with TOURS rewards
- [ ] Fund LiveRadio with TOURS rewards
- [ ] Fund Platform Wallet for operations

---

## Quick Reference

### Contract Verification Command

```bash
forge verify-contract <ADDRESS> <CONTRACT_PATH>:<CONTRACT_NAME> \
  --chain-id 143 \
  --verifier-url https://api.monadscan.com/api \
  --constructor-args $(cast abi-encode "constructor(arg1,arg2)" val1 val2)
```

### Check Contract on MonadScan

```
https://monadscan.com/address/<CONTRACT_ADDRESS>
```
