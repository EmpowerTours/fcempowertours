# Mainnet Deployment Strategy

## Current Status

**Monad Mainnet:** LIVE (launched ~10 days ago!)
**Current Phase:** Perfect testnet implementation
**Timeline:** No rush → Quality over speed
**Goal:** Launch on mainnet when feature-complete and battle-tested

---

## Testnet Perfection Phase (3-4 months)

### Month 1-2: Core Features
- ✅ Deploy ServiceMarketplace
- ✅ Deploy MusicBeatMatchV2
- ✅ Deploy CountryCollectorV2
- 🔥 Build Experience + GPS + Transport (PRIORITY 1)
- Fund contracts with TOURS
- Test delegation flows
- Gather user feedback

### Month 3: Secondary Features
- Artist Booking marketplace
- Savings Goals
- Test economic balance
- Monitor reward sustainability

### Month 4: Final Features + Polish
- Group Travel (if desired)
- Bug fixes from user feedback
- Security audits
- Performance optimization
- UX refinements

---

## Mainnet Migration Checklist

### Pre-Migration (Before Mainnet Launch)

- [ ] **All contracts audited**
  - Internal review complete
  - Consider external audit (Consensys, Trail of Bits)
  - No critical vulnerabilities

- [ ] **Testnet metrics healthy**
  - 500+ active users
  - 1000+ transactions
  - <1% transaction failures
  - No critical bugs reported

- [ ] **Economic model validated**
  - Game rewards sustainable
  - Service fees cover costs
  - Treasury runway confirmed
  - Pricing makes sense

- [ ] **Frontend stable**
  - All features working
  - Mobile responsive
  - Farcaster integration smooth
  - No critical UX issues

---

### Migration Steps

#### Step 1: Calculate MON Market Price Adjustment

```bash
# Check MON price on mainnet
# Example: MON = $2.50 USD

ADJUSTMENT_FACTOR = $1.00 / $2.50 = 0.4

# All TOURS prices multiply by 0.4
Testnet delivery fee: 5 TOURS
Mainnet delivery fee: 5 × 0.4 = 2 TOURS

Testnet game reward: 10 TOURS
Mainnet game reward: 10 × 0.4 = 4 TOURS
```

#### Step 2: Update Contract Parameters

```solidity
// MusicBeatMatchV2 mainnet deployment
constructor(
    address _toursToken,
    address _keeper
) {
    // Adjusted rewards based on MON price
    BASE_REWARD = 4 ether;           // Was 10 TOURS on testnet
    STREAK_BONUS_MULTIPLIER = 2;     // Unchanged
    PERFECT_SPEED_BONUS = 2 ether;   // Was 5 TOURS
    DAILY_POOL = 400 ether;          // Was 1000 TOURS
}

// Similar adjustments for all contracts
```

#### Step 3: Deploy Mainnet Contracts

```bash
# Set mainnet environment variables
export MAINNET_RPC="https://rpc.monad.xyz"
export MAINNET_DEPLOYER_KEY="..." # Hardware wallet recommended!

# Deploy in order
forge script script/DeployMusicBeatMatchV2Mainnet.s.sol \
  --rpc-url $MAINNET_RPC \
  --broadcast \
  --verify

forge script script/DeployCountryCollectorV2Mainnet.s.sol \
  --rpc-url $MAINNET_RPC \
  --broadcast \
  --verify

forge script script/DeployServiceMarketplaceMainnet.s.sol \
  --rpc-url $MAINNET_RPC \
  --broadcast \
  --verify

forge script script/DeployExperienceNFTMainnet.s.sol \
  --rpc-url $MAINNET_RPC \
  --broadcast \
  --verify

# ... additional contracts as needed
```

#### Step 4: Fund Mainnet Contracts

```bash
# Calculate adjusted funding amounts
TESTNET_MUSIC_FUNDING=200000 TOURS
MAINNET_MUSIC_FUNDING=200000 × 0.4 = 80000 TOURS

# Fund contracts
cast send $MAINNET_TOURS_TOKEN \
  "transfer(address,uint256)" \
  $MAINNET_MUSIC_BEAT_MATCH \
  80000000000000000000000 \
  --rpc-url $MAINNET_RPC \
  --private-key $DEPLOYER_KEY
```

#### Step 5: Update Frontend Configuration

```typescript
// lib/contracts.ts

export const CONTRACTS = {
  // Mainnet addresses (update after deployment)
  TOURS_TOKEN: '0x...', // Mainnet TOURS address
  WMON: '0x...', // Mainnet WMON address
  MUSIC_BEAT_MATCH_V2: '0x...',
  COUNTRY_COLLECTOR_V2: '0x...',
  SERVICE_MARKETPLACE: '0x...',
  EXPERIENCE_NFT: '0x...',
  ARTIST_BOOKING: '0x...',
  TRAVEL_SAVINGS: '0x...',
  GROUP_TRAVEL: '0x...',
  PLATFORM_SAFE: '0x...'
};

export const NETWORK = {
  chainId: 12345, // Monad mainnet chain ID
  rpcUrl: 'https://rpc.monad.xyz',
  explorerUrl: 'https://explorer.monad.xyz'
};
```

#### Step 6: Update Environment Variables

```bash
# .env.local (mainnet)
NEXT_PUBLIC_NETWORK=mainnet
NEXT_PUBLIC_CHAIN_ID=12345
NEXT_PUBLIC_RPC_URL=https://rpc.monad.xyz

# Contract addresses (from deployments)
NEXT_PUBLIC_TOURS_TOKEN=0x...
NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=0x...
NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=0x...
NEXT_PUBLIC_SERVICE_MARKETPLACE=0x...
NEXT_PUBLIC_EXPERIENCE_NFT=0x...

# Railway (production)
# Update all env vars to mainnet values
```

#### Step 7: Gradual Rollout

1. **Internal Testing (Week 1)**
   - Team tests all features on mainnet
   - Real MON transactions (small amounts)
   - Verify everything works

2. **Beta Launch (Week 2)**
   - Invite 50 trusted testnet users
   - Monitor closely for issues
   - Gather feedback

3. **Public Launch (Week 3+)**
   - Announce on Farcaster
   - Marketing campaign
   - Onboard new users
   - Monitor metrics

---

## Mainnet Pricing Strategy

### If MON = $1 USD (Ideal)
- Keep testnet pricing exactly as is
- No adjustments needed
- 1:1 migration

### If MON = $2-5 USD (Likely)
- Divide all TOURS amounts by MON price
- Example at $2.50:
  - Food delivery: 5 TOURS → 2 TOURS
  - Game reward: 10 TOURS → 4 TOURS
  - Experience: 50 TOURS → 20 TOURS

### If MON = $10+ USD (Bullish!)
- More aggressive adjustment needed
- Keep MON amounts reasonable (< $100 per experience)
- May need to introduce fractional TOURS

---

## Post-Launch Monitoring

### Critical Metrics (Daily)
- Transaction success rate
- Gas costs (ensure affordable)
- User retention
- Revenue vs burn rate
- Smart contract balances

### Weekly Reviews
- User feedback analysis
- Bug reports and fixes
- Economic adjustments if needed
- Feature usage analytics

### Monthly Audits
- Full treasury audit
- Security review
- Performance optimization
- Competitor analysis

---

## Emergency Procedures

### If Critical Bug Found:
1. **Pause contracts** (if pause mechanism exists)
2. Announce to users immediately
3. Deploy fix to testnet
4. Test thoroughly
5. Deploy fix to mainnet
6. Resume operations

### If Economic Model Breaks:
1. Analyze root cause (rewards too high? fees too low?)
2. Adjust parameters via admin functions
3. Communicate changes to users
4. Monitor for 1 week
5. Iterate if needed

### If Mainnet Gas Too Expensive:
1. Optimize contract code
2. Batch transactions where possible
3. Consider L2 or rollup solution
4. Subsidize gas for critical features

---

## Success Criteria (First 3 Months on Mainnet)

### User Metrics:
- [ ] 1,000+ active users
- [ ] 500+ experiences minted
- [ ] 200+ service transactions (food + rides)
- [ ] 50+ artist bookings

### Financial Metrics:
- [ ] Treasury runway > 6 months
- [ ] Platform fees cover gas costs
- [ ] Sustainable reward distribution
- [ ] Positive user acquisition cost

### Technical Metrics:
- [ ] 99%+ transaction success rate
- [ ] < 1 critical bug per month
- [ ] < 2 second average page load
- [ ] Zero security incidents

---

## Long-Term Roadmap (Post-Mainnet)

### Quarter 1:
- Mainnet stability
- User growth (organic + marketing)
- Feature iteration based on feedback

### Quarter 2:
- Expand to new cities/countries
- Partnership with tour operators
- Multi-language support

### Quarter 3:
- TOURS governance activation
- DAO formation
- Community-driven features

### Quarter 4:
- Mobile native apps
- Advanced DeFi integrations
- B2B partnerships (hotels, airlines)

---

## Key Principles

1. **Quality > Speed**: Perfect testnet first, mainnet when ready
2. **User Safety**: Audits, testing, gradual rollout
3. **Economic Sustainability**: Adjust pricing based on real MON value
4. **Community First**: Listen to feedback, iterate quickly
5. **Long-term Vision**: Build for years, not months

---

## Deployment Timeline

```
NOW (Dec 2025): Testnet perfection phase
↓
Month 1-2: Experience + GPS + Transport
↓
Month 3: Artist Booking + Savings
↓
Month 4: Group Travel + Polish
↓
Month 5: Security audits + Testing
↓
Month 6: Mainnet migration preparation
↓
Month 6+: Gradual mainnet launch
↓
Month 7+: Public mainnet launch 🚀
```

**No rush. Perfect the Farcaster mini app. Launch when it's truly ready.**

---

**Last Updated:** December 2025
**Mainnet Status:** Live, but we're perfecting testnet first
**Timeline:** 6+ months to perfect before mainnet migration
**Philosophy:** Quality, security, sustainability over speed
