# EmpowerTours Integration Analysis & Action Plan

## Part 1: Smart Contract Audit

### ✅ Correct Contracts (Ready to Deploy)
1. **EmpowerToursYieldStrategy.sol** - Good architecture
   - Kintsu integration for MON yield
   - TokenSwap for TOURS ↔ MON
   - NFT collateral staking
   - Position management

2. **DragonRouter.sol** - Simple and effective
   - Location-based yield allocation
   - Pool management per destination

3. **DemandSignalEngine.sol** - FREE demand signaling (no payment)
   - Gasless interest registration
   - Location-based aggregation
   - Artist demand tracking

4. **CreditScoreCalculator.sol** - Reputation system
   - Multi-component scoring
   - Tier-based borrowing power

### ⚠️ CRITICAL ISSUES TO FIX

#### Issue 1: PassportNFTv2 Version Mismatch

**You have TWO different PassportNFTv2 contracts:**

**Version A** (from your original code):
```solidity
contract PassportNFTv2 is ERC721, ERC721URIStorage, Ownable {
    struct PassportMetadata {
        string countryCode;
        string countryName;
        string region;
        string continent;
        uint256 mintedAt;
    }
    // ... full country data
}
```

**Version B** (from new contracts):
```solidity
contract PassportNFTv2 is ERC721, Ownable {
    // NO country metadata!
    // NO PassportMetadata struct!
    // Only basic ERC721
}
```

**PROBLEM**: Version B loses all country tracking!

**SOLUTION**: Use Version A (the one already deployed at `0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8`)

---

#### Issue 2: SmartEventManifest Has No Integration with Venues

**Current code**:
```solidity
function manifestEventIfReady(
    string memory location,
    uint256 artistId,
    uint256 venueId,  // ⚠️ Just a uint, no venue verification
    ...
)
```

**Missing**:
- No VenueNFT contract reference
- No venue capacity validation
- No venue commission calculation
- No venue owner approval

**SOLUTION**: Add VenueNFT integration (I'll provide updated contract)

---

#### Issue 3: TandaYieldGroup Approval Issues

**Current code**:
```solidity
function contribute(uint256 tandaId) external {
    toursToken.safeTransferFrom(msg.sender, address(this), amount);
    toursToken.approve(address(yieldStrategy), amount);  // ⚠️
    IYieldStrategy(yieldStrategy).stakeWithNFT(...);
}
```

**PROBLEM**:
- User must approve TandaYieldGroup contract
- Then Tanda approves YieldStrategy
- Double approval = bad UX

**SOLUTION**: Use Safe delegation or have users approve YieldStrategy directly

---

## Part 2: Architecture Decisions

### Currency Flow (CONFIRMED)

```
┌─────────────────────────────────────────────────────────────┐
│                    PRIMARY CURRENCY: TOURS                   │
└─────────────────────────────────────────────────────────────┘

USER ACTIONS:
├─ Mint Passport → 0.01 MON (native token payment)
├─ Buy Music License → TOURS (90% artist, 10% platform)
├─ Join Tanda → TOURS (contributions)
├─ Stake Passport → TOURS (lock for yield)
├─ Purchase Event Ticket → TOURS (or MON via swap)
└─ Buy Local Experience → TOURS

PLATFORM EARNS:
├─ 10% music sales (TOURS)
├─ 2% Tanda contributions (TOURS → insurance)
├─ 5-10% venue commissions (TOURS)
├─ 1-2% staking yield spread (MON → TOURS)
└─ 20% local experience sales (TOURS)

YIELD GENERATION:
├─ MON staked in Kintsu → generates yield
├─ Yield swapped to TOURS via TokenSwap
├─ Distributed to stakers monthly
└─ APY: 5-15% depending on factors
```

**This is correct! ✅**

---

## Part 3: Integration Roadmap

### Phase 1: Fix Existing Contracts (Week 1)

#### Day 1-2: PassportNFTv2 Standardization
**Action**: Verify production uses Version A with country data
```bash
# Check deployed contract
cast call 0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8 \
  "getPassportData(uint256)" 1 \
  --rpc-url $MONAD_RPC

# Should return country metadata
# If not, redeploy Version A
```

#### Day 3-4: Deploy Core Yield Contracts
```bash
# 1. Deploy YieldStrategy
forge script script/DeployYieldStrategy.s.sol --broadcast

# 2. Deploy DragonRouter
forge script script/DeployDragonRouter.s.sol --broadcast

# 3. Update PassportNFTv2 to reference YieldStrategy
# (Already has yieldStrategy address)
```

#### Day 5: Test Staking Flow
```typescript
// Test: Stake passport with TOURS
1. User owns PassportNFT #5 (Mexico)
2. User stakes 100 TOURS against passport
3. System:
   - Swaps TOURS → MON via TokenSwap
   - Deposits MON into Kintsu
   - Records position with passport as collateral
4. User sees: "Staked: 100 TOURS, APY: 9.5%"
```

### Phase 2: Venue & Events System (Week 2-3)

#### Create Missing Contracts

**VenueNFT.sol** (NEW - Required)
```solidity
contract VenueNFT is ERC721URIStorage, Ownable {
    struct Venue {
        string venueName;
        string city;
        string country;
        uint256 capacity;
        address owner;
        uint256 commissionPercentage;  // 5-15%
        bool isVerified;
    }

    mapping(uint256 => Venue) public venues;

    function registerVenue(...) external returns (uint256 venueId);
    function updateCommission(uint256 venueId, uint256 newRate) external;
    function verifyVenue(uint256 venueId) external onlyOwner;
}
```

**EventEscrow.sol** (NEW - Required)
```solidity
contract EventEscrow is Ownable {
    enum Stage { BOOKING, EVENT_DAY, POST_EVENT, COMPLETED }

    struct Escrow {
        uint256 eventId;
        uint256 totalAmount;
        uint256 stage1Released;  // 30% on booking
        uint256 stage2Held;      // 40% on event day
        uint256 stage3Final;     // 30% after 24hrs
        Stage currentStage;
    }

    function releaseStage1(uint256 eventId) external;
    function releaseStage2(uint256 eventId) external;
    function releaseStage3(uint256 eventId) external;
    function refundAttendees(uint256 eventId) external;
}
```

**Update SmartEventManifest.sol**
```solidity
// Add VenueNFT integration
IVenueNFT public venueNFT;
IEventEscrow public escrow;

function manifestEventIfReady(
    uint256 venueId,  // ✅ Now validated
    ...
) external {
    // Validate venue exists
    require(venueNFT.ownerOf(venueId) != address(0), "Venue not registered");

    // Get venue details
    IVenueNFT.Venue memory venue = venueNFT.getVenue(venueId);
    require(ticketsAvailable <= venue.capacity, "Exceeds capacity");

    // Calculate venue commission
    uint256 venueCommission = (totalCost * venue.commissionPercentage) / 100;

    // Create escrow
    escrow.createEscrow(eventId, totalCost, venueCommission);

    // ... rest of logic
}
```

### Phase 3: Music Burning Feature (Week 3)

**Update MusicLicenseNFTv4 → v5**

Add burn function:
```solidity
function burnMusic(uint256 masterTokenId) external {
    require(masterTokens[masterTokenId].artist == msg.sender, "Not artist");
    require(masterTokens[masterTokenId].active, "Already burned");

    // Calculate 50% recovery
    uint256 totalRevenue = masterTokens[masterTokenId].totalSold *
                           masterTokens[masterTokenId].price;
    uint256 recovery = (totalRevenue * 50) / 100;

    // Transfer recovery to artist
    toursToken.transfer(msg.sender, recovery);

    // Burn all licenses
    _burnAllLicenses(masterTokenId);

    // Mark as burned
    masterTokens[masterTokenId].active = false;
    _burn(masterTokenId);

    emit MusicBurned(masterTokenId, msg.sender, recovery);
}
```

API Route:
```typescript
// POST /api/music/burn
export async function POST(req: Request) {
  const { musicId, userAddress } = await req.json();

  // Execute burn via delegation
  const txHash = await executeBatchedSafeTransaction([{
    to: MUSIC_NFT_V5,
    value: 0n,
    data: encodeFunctionData({
      abi: MUSIC_NFT_ABI,
      functionName: 'burnMusic',
      args: [musicId]
    })
  }]);

  return Response.json({ success: true, txHash });
}
```

### Phase 4: Itinerary/Local Experiences (Week 4-5)

**Deploy ItineraryNFT.sol** (from your detailed spec)
```solidity
contract ItineraryNFT is ERC721URIStorage {
    struct LocalExperience {
        string locationName;
        string city;
        string country;
        int256 latitude;
        int256 longitude;
        uint256 price;
        address creator;
        // ... rest from your spec
    }

    function createExperience(...) external returns (uint256);
    function purchaseExperience(uint256 itineraryId) external;
    function stampPassportAtLocation(uint256 passportId, uint256 itineraryId) external;
}
```

**Integration Points**:
1. PassportNFTv2 ← ItineraryNFT (stamps)
2. API routes for GPS verification
3. Frontend map view
4. Bot commands for discovery

### Phase 5: Mini-Games (Week 5-6)

**Recommended: Music Beat Match + Country Collector**

**MusicBeatMatch.sol**
```solidity
contract MusicBeatMatch {
    function playDailyChallenge(
        uint256 songIndex,
        string memory guess,
        bool isArtistGuess
    ) external returns (bool correct, uint256 earned);

    function getMonthlyLeaderboard() external view returns (...);
}
```

**CountryCollector.sol**
```solidity
contract CountryCollector {
    function getWeeklyCountry() external view returns (string memory);
    function collectCountryBadge(uint256 passportId, string memory country) external;
    function getUserCountryBadges(address user) external view returns (string[] memory);
}
```

---

## Part 4: Immediate Next Steps

### This Week (Priority Order):

1. **Fix PassportNFTv2 discrepancy** (Day 1)
   - Confirm production address has country metadata
   - If not, update contract address

2. **Deploy YieldStrategy + DragonRouter** (Day 2-3)
   ```bash
   forge script script/DeployYield.s.sol --broadcast
   ```

3. **Update environment variables** (Day 3)
   ```bash
   NEXT_PUBLIC_YIELD_STRATEGY=0x8D3d70a5F4eeaE446A70F6f38aBd2adf7c667866
   NEXT_PUBLIC_DRAGON_ROUTER=0x00EA77CfCD29d461250B85D3569D0E235d8Fbd1e
   NEXT_PUBLIC_DEMAND_SIGNAL_ENGINE=0xC2Eb75ddf31cd481765D550A91C5A63363B36817
   NEXT_PUBLIC_SMART_EVENT_MANIFEST=0x5cfe8379058cA460aA60ef15051Be57dab4A651C
   NEXT_PUBLIC_TANDA_YIELD_GROUP=0xE0983Cd98f5852AD6BF56648B4724979B75E9fC8
   NEXT_PUBLIC_CREDIT_SCORE_CALCULATOR=0x9598397899CCcf9d0CFbDB40dEf1EF34e550c0c5
   ```

4. **Create staking API routes** (Day 4-5)
   - POST /api/passport/stake
   - GET /api/passport/[id]/staking
   - POST /api/passport/unstake
   - GET /api/passport/yield

5. **Test staking flow end-to-end** (Day 5)

### Feature Flags Strategy

```typescript
// .env.production
NEXT_PUBLIC_FEATURE_PASSPORT_STAKING=false  // Initially off
NEXT_PUBLIC_FEATURE_VENUES=false
NEXT_PUBLIC_FEATURE_LOCAL_EXPERIENCES=false
NEXT_PUBLIC_FEATURE_MUSIC_BURNING=false
NEXT_PUBLIC_FEATURE_MINI_GAMES=false

// Rollout plan:
// Week 1: Deploy contracts, flags OFF
// Week 2: Test internally, flags ON for staging
// Week 3: Canary 1% of users
// Week 4: Rollout 25%
// Week 5: Rollout 100%
```

---

## Part 5: Critical Questions for You

Before proceeding, please clarify:

1. **PassportNFTv2**: Which version is deployed at `0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8`?
   - Version A (with country metadata) ✅
   - Version B (basic ERC721) ❌

2. **Kintsu Integration**: Is Kintsu deployed on Monad testnet?
   - If yes, what's the address?
   - If no, we need a mock for testing

3. **TokenSwap**: Do you have a TOURS ↔ MON swap contract deployed?
   - Current address: `0xe004F2eaCd0AD74E14085929337875b20975F0AA`
   - Does it work correctly?

4. **Priorities**: Which features do you want FIRST?
   - [ ] Passport staking (YieldStrategy)
   - [ ] Venue/Events system
   - [ ] Local experiences (ItineraryNFT)
   - [ ] Music burning
   - [ ] Mini-games

---

## Part 6: File Organization

```
contracts/
├── core/
│   ├── PassportNFTv2.sol ✅ (existing)
│   ├── MusicLicenseNFTv5.sol (NEW - add burn)
│   └── ToursToken.sol ✅ (existing)
├── defi/
│   ├── YieldStrategy.sol ✅ (your code)
│   ├── DragonRouter.sol ✅ (your code)
│   ├── TokenSwap.sol ✅ (existing)
│   └── CreditScoreCalculator.sol ✅ (your code)
├── tanda/
│   ├── TandaYieldGroup.sol ✅ (your code - needs approval fix)
│   └── TandaReputation.sol (OPTIONAL)
├── events/
│   ├── SmartEventManifest.sol ✅ (your code - needs VenueNFT integration)
│   ├── DemandSignalEngine.sol ✅ (your code)
│   ├── VenueNFT.sol ❌ (MISSING - need to create)
│   └── EventEscrow.sol ❌ (MISSING - need to create)
├── experiences/
│   └── ItineraryNFT.sol ❌ (from your spec - need to create)
└── gamification/
    ├── MusicBeatMatch.sol ❌ (from your spec)
    └── CountryCollector.sol ❌ (optional)
```

---

## Summary & Recommendation

Your vision is **excellent** and well-thought-out. Here's what to do:

### Immediate (This Week):
1. ✅ Verify PassportNFTv2 has country metadata
2. ✅ Deploy YieldStrategy + DragonRouter
3. ✅ Create staking API routes
4. ✅ Test passport staking flow

### Week 2-3: Venues & Events
1. Create VenueNFT contract
2. Create EventEscrow contract
3. Update SmartEventManifest
4. Create venue registration UI

### Week 4-5: Experiences
1. Deploy ItineraryNFT
2. Create local experiences UI
3. GPS verification API
4. Passport stamps integration

### Week 6+: Polish
1. Music burning feature
2. Mini-games (Music Beat Match)
3. Gamification dashboard

**Start with staking** - it's the most valuable feature and your contracts are already 90% ready!
