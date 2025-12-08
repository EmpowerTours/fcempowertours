# Contracts Ready to Deploy

## Summary

**Total Contracts:** 25 Solidity files
**Ready to Deploy:** 6 core contracts + 1 new contract
**Deployment Scripts:** 17 available

---

## ✅ PRIORITY 1: Core Contracts (Ready to Deploy Now)

### 1. **ExperienceNFT.sol** ⭐ NEW
**Status:** ✅ Ready, deployment script exists
**Purpose:** GPS-revealed travel experiences with check-in verification
**Deployment Script:** `script/DeployExperienceNFT.s.sol`

**Features:**
- Create experiences with hidden GPS coordinates
- Purchase to unlock location details
- GPS-based check-in verification (Haversine distance)
- Photo proof via IPFS
- Completion rewards in WMON
- Experience types (Food, Attraction, Cultural, etc.)

**Dependencies:**
- WMON token address

**Deploy Command:**
```bash
forge script script/DeployExperienceNFT.s.sol:DeployExperienceNFT \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow
```

---

### 2. **MusicBeatMatchV2.sol**
**Status:** ✅ Ready, fixed delegation visibility
**Purpose:** Daily music challenge game
**Deployment Script:** Need to create

**Features:**
- Daily challenges (artist, song title, country)
- Guess submissions with rewards
- Leaderboard system
- Delegation support (`submitGuessFor`)

**Dependencies:**
- WMON token
- TOURS token

---

### 3. **CountryCollectorV2.sol**
**Status:** ✅ Ready, fixed delegation visibility
**Purpose:** Country collection game
**Deployment Script:** Need to create

**Features:**
- Artist-country relationships
- Complete artist collections
- Delegation support (`completeArtistFor`)
- Rewards for completions

**Dependencies:**
- WMON token
- TOURS token

---

### 4. **ServiceMarketplace.sol**
**Status:** ✅ Ready, fixed delegation visibility
**Purpose:** Food delivery and ride services
**Deployment Script:** `script/DeployServiceMarketplace.s.sol`

**Features:**
- Food ordering with menu items
- Ride requests (car, motorcycle, scooter, bicycle, 4-wheeler)
- Escrow payment system
- Rating system
- Provider registration
- Delegation support for all actions

**Dependencies:**
- WMON token

**Deploy Command:**
```bash
forge script script/DeployServiceMarketplace.s.sol:DeployServiceMarketplace \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow
```

---

### 5. **DailyPassLotteryV2.sol**
**Status:** ✅ Ready, shMON integrated
**Purpose:** Daily lottery with MON or shMON entry
**Deployment Script:** `script/DeployLotteryV2.s.sol`

**Features:**
- Enter with MON or shMON
- Daily rounds with automated drawing
- Prize pool accumulation
- Delegation support (`enterWithMonFor`, `enterWithShMonFor`)
- shMON integration (address: `0x3a98250F98Dd388C211206983453837C8365BDc1`)

**Dependencies:**
- WMON token
- shMON token (deployed)

**Deploy Command:**
```bash
forge script script/DeployLotteryV2.s.sol:DeployLotteryV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow
```

---

### 6. **PassportNFTv3.sol**
**Status:** ✅ Ready, YieldStrategy V9 compatible
**Purpose:** Country passport NFTs with staking
**Deployment Script:** Need to create

**Features:**
- Mint country-specific passports
- Stake MON with passport collateral
- Two-step unstaking (YieldStrategy V9)
- Venue stamps
- Itinerary stamps (GPS-verified)
- Credit score calculation

**Dependencies:**
- YieldStrategy V9 address

---

## 🔄 PRIORITY 2: Yield Strategies (Choose One)

### 7. **EmpowerToursYieldStrategyV9.sol**
**Status:** ✅ Ready
**Purpose:** Yield strategy with two-step unstaking
**Deployment Script:** `script/DeployV9.s.sol`

**Features:**
- Two-step unstaking (request → finalize)
- NFT collateral support
- Position-based tracking
- Compatible with PassportNFTv3

**Deploy Command:**
```bash
forge script script/DeployV9.s.sol:DeployV9 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --slow
```

---

### 8. **EmpowerToursYieldV10_shMONAD.sol** ⭐ RECOMMENDED
**Status:** ✅ Ready, shMON integrated
**Purpose:** Simplified yield using shMONAD liquid staking
**Deployment Script:** Need to create

**Features:**
- Stake MON → get shMON (auto-compounding)
- Instant unstake OR cooldown unstake
- Integrated with shMONAD vault
- Lower gas costs (delegates to shMONAD)
- 5% APY from staking rewards

**Dependencies:**
- shMON address: `0x3a98250F98Dd388C211206983453837C8365BDc1`
- Treasury address

**Why V10 over V9:**
- ✅ Uses battle-tested shMONAD vault
- ✅ Auto-compounding rewards
- ✅ Simpler architecture
- ✅ Lower maintenance
- ✅ Already earning 5% APY

---

## 📋 PRIORITY 3: Supporting Contracts (Optional)

### 9. **MusicLicenseNFTv5.sol**
**Status:** ✅ Ready
**Purpose:** Music NFT minting with Gemini AI generation
**Deployment Script:** `script/DeployEmpowerToursNFTv7.s.sol`

**Features:**
- AI-generated music NFTs
- Staking with YieldStrategy
- Burn for rewards
- Delegation support

---

### 10. **ItineraryNFTv2.sol**
**Status:** ⚠️ Being replaced by ExperienceNFT
**Purpose:** Travel itineraries (legacy)

**Note:** ExperienceNFT is the upgraded version with GPS verification

---

### 11. **TandaPool.sol**
**Status:** ✅ Ready
**Purpose:** Rotating savings pool (ROSCA)

**Note:** Low priority, niche feature

---

## ❌ DON'T DEPLOY (Legacy/Testing)

- `EmpowerToursYieldStrategyV5.sol` - Old version
- `EmpowerToursYieldStrategyV6.sol` - Old version
- `EmpowerToursYieldStrategyV7.sol` - Old version
- `EmpowerToursYieldStrategyV8.sol` - Old version
- `DailyPassLottery.sol` - V1 (use V2)
- `DailyPassLotterySecure.sol` - Intermediate version
- `CountryCollector.sol` - V1 (use V2)
- `MusicBeatMatch.sol` - V1 (use V2)
- `ItineraryNFT.sol` - V1 (use V2 or ExperienceNFT)
- `ActionBasedDemandSignal.sol` - Experimental
- `MonadMirrorNFT.sol` - Testing contract
- `LotteryPayout.sol` - Helper contract
- `SimpleLiquidityPool.sol` - AMM testing
- `WMON.sol` - Already deployed by Monad

---

## 🚀 Recommended Deployment Order

### Phase 1: Foundation (Deploy First)
1. ✅ **WMON** - Already deployed: `0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701`
2. ✅ **shMON** - Already deployed: `0x3a98250F98Dd388C211206983453837C8365BDc1`
3. **EmpowerToursYieldV10_shMONAD** - Yield strategy using shMON
4. **PassportNFTv3** - Passport NFTs with staking (needs YieldV10)

### Phase 2: Core Features
5. **ExperienceNFT** - GPS-revealed experiences ⭐ NEW
6. **ServiceMarketplace** - Food & rides
7. **DailyPassLotteryV2** - Daily lottery with shMON

### Phase 3: Games
8. **MusicBeatMatchV2** - Music challenge game
9. **CountryCollectorV2** - Country collection game
10. **MusicLicenseNFTv5** - Music NFT minting

### Phase 4: Optional
11. **TandaPool** - Rotating savings (if needed)

---

## 📝 Deployment Checklist

### Before Deploying:

- [ ] Set up deployer wallet with testnet MON
- [ ] Export private key: `export DEPLOYER_PRIVATE_KEY=0x...`
- [ ] Export WMON address: `export WMON_ADDRESS=0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701`
- [ ] Test compilation: `forge build`
- [ ] Run tests: `forge test`

### After Deploying Each Contract:

- [ ] Verify on Monadscan with Sourcify
- [ ] Add address to `.env.local`
- [ ] Update frontend environment variables
- [ ] Test contract functions
- [ ] Fund contracts if needed (rewards, liquidity)
- [ ] Set up delegation permissions if applicable

---

## 🔑 Environment Variables Needed

### For Deployment:
```bash
DEPLOYER_PRIVATE_KEY=0x...
WMON_ADDRESS=0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701
SHMON_ADDRESS=0x3a98250F98Dd388C211206983453837C8365BDc1
TREASURY_ADDRESS=your_treasury_address
```

### After Deployment (add to Railway):
```bash
# Core Contracts
NEXT_PUBLIC_EXPERIENCE_NFT=0x...
NEXT_PUBLIC_SERVICE_MARKETPLACE=0x...
NEXT_PUBLIC_DAILY_LOTTERY_V2=0x...
NEXT_PUBLIC_PASSPORT_NFT_V3=0x...

# Yield Strategy
NEXT_PUBLIC_YIELD_STRATEGY_V10=0x...

# Game Contracts
NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=0x...
NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=0x...
NEXT_PUBLIC_MUSIC_NFT_V5=0x...

# Already Deployed (keep existing)
NEXT_PUBLIC_WMON=0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701
NEXT_PUBLIC_SHMON_ADDRESS=0x3a98250F98Dd388C211206983453837C8365BDc1
```

---

## 💡 Key Decisions

### 1. Yield Strategy: V9 or V10?
**Recommendation: V10 (shMONAD)**

**Why V10:**
- ✅ Simpler (delegates to shMONAD)
- ✅ Battle-tested shMONAD vault
- ✅ Auto-compounding (no manual harvesting)
- ✅ 5% APY guaranteed
- ✅ Lower gas costs
- ✅ Less maintenance

**Why NOT V9:**
- More complex
- Manual yield tracking
- Higher gas costs
- More code to audit

### 2. Deploy ItineraryNFTv2 or ExperienceNFT?
**Recommendation: ExperienceNFT**

**Why ExperienceNFT:**
- ✅ GPS verification built-in
- ✅ Check-in with proof
- ✅ Better UX (hidden reveals)
- ✅ Modern architecture
- ✅ Already has deployment script

---

## 📊 Contract Statistics

**Total Contracts:** 25
**Ready to Deploy:** 10
**Legacy/Skip:** 15
**Deployment Scripts:** 17
**New Contract:** 1 (ExperienceNFT)

**Estimated Gas Costs:**
- Each contract deployment: ~2-5 MON
- Total for all 10 contracts: ~30-50 MON

---

## 🎯 Minimal Viable Deployment (MVP)

If you want to deploy the **absolute minimum** to get started:

1. **EmpowerToursYieldV10_shMONAD** - Staking/yield
2. **ExperienceNFT** - Core travel feature
3. **ServiceMarketplace** - Food & rides
4. **DailyPassLotteryV2** - Fun lottery feature

**Total: 4 contracts** (~15-20 MON gas)

This gives you:
- ✅ Travel experiences with GPS
- ✅ Food ordering
- ✅ Ride requests
- ✅ Daily lottery
- ✅ Yield earning (via shMON)

---

## Next Steps

1. **Choose deployment order** (recommended: follow Phase 1-4 above)
2. **Create missing deployment scripts** (MusicBeatMatchV2, CountryCollectorV2, YieldV10)
3. **Test locally** with `forge test`
4. **Deploy to testnet** one by one
5. **Verify on Monadscan** after each deployment
6. **Update frontend** with new addresses
7. **Test full user flows** before mainnet

---

**Last Updated:** December 2025
**Status:** Ready for deployment
**Testnet:** Monad Testnet (Chain ID: 41454)
