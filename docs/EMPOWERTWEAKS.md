# EmpowerTweaks - Decentralized Jailbreak Marketplace

## Overview

EmpowerTweaks is a Web3-native alternative to Cydia/Sileo - traditional jailbreak package managers. Built on Monad with IPFS storage, it offers:

- **Decentralized Storage**: Tweaks stored on IPFS, can't be taken down
- **True Ownership**: NFT-based licenses you actually own
- **Instant Payouts**: Developers paid immediately, no delays
- **On-Chain Reviews**: Ratings can't be censored
- **Resale Allowed**: Transfer your license to others

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    EMPOWERTWEAKS STACK                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   FRONTEND (Next.js)                                        │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ /tweaks              - Browse marketplace            │  │
│   │ /tweaks/[id]         - Tweak details + purchase     │  │
│   │ /tweaks/upload       - Developer upload portal      │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   API ROUTES                                                │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ GET  /api/tweaks          - List/search tweaks      │  │
│   │ POST /api/tweaks          - Create tweak metadata   │  │
│   │ POST /api/tweaks/upload   - Upload to IPFS          │  │
│   │ POST /api/tweaks/purchase - Execute purchase        │  │
│   │ GET  /api/tweaks/download - Download .deb file      │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   SMART CONTRACT (Monad)                                    │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ EmpowerTweaks.sol                                   │  │
│   │ - ERC721 for license NFTs                          │  │
│   │ - Tweak registry with IPFS hashes                  │  │
│   │ - Multi-token payments (TOURS, WMON, native MON)   │  │
│   │ - On-chain reviews and ratings                     │  │
│   │ - Version management                               │  │
│   │ - 2.5% platform fee                                │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
│   STORAGE (IPFS via Pinata)                                 │
│   ┌─────────────────────────────────────────────────────┐  │
│   │ .deb packages                                       │  │
│   │ Icon/cover images                                  │  │
│   │ Metadata JSON (NFT standard)                       │  │
│   │ Screenshots                                        │  │
│   └─────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Files Created

### Smart Contracts
- `contracts/src/EmpowerTweaks.sol` - Main contract (ERC721 + marketplace)
- `contracts/script/DeployEmpowerTweaks.s.sol` - Deployment script
- `lib/abi/EmpowerTweaks.json` - Contract ABI

### Frontend
- `app/tweaks/page.tsx` - Main marketplace page
- `app/tweaks/[id]/page.tsx` - Tweak detail page

### API Routes
- `app/api/tweaks/route.ts` - List and create tweaks
- `app/api/tweaks/upload/route.ts` - Upload to IPFS
- `app/api/tweaks/purchase/route.ts` - Execute purchases
- `app/api/tweaks/download/route.ts` - Download verification

## Smart Contract Features

### For Developers
```solidity
// Create a new tweak listing
function createTweak(
    string name,
    string description,
    string ipfsHash,        // .deb file on IPFS
    string metadataHash,    // Full metadata JSON
    string iconHash,        // Cover image
    uint256 priceInTours,   // Price in TOURS (18 decimals)
    uint256 priceInMon,     // Alternative MON price
    string[] compatibleVersions,
    string category
) returns (uint256 tweakId)

// Push an update
function updateTweak(
    uint256 tweakId,
    string newVersion,
    string newIpfsHash,
    string changelog,
    string[] newCompatibleVersions
)
```

### For Users
```solidity
// Purchase with TOURS token
function purchaseWithTours(uint256 tweakId)

// Purchase with WMON token
function purchaseWithMon(uint256 tweakId)

// Purchase with native MON
function purchaseWithNativeMon(uint256 tweakId) payable

// Submit a review (must own the tweak)
function submitReview(
    uint256 tweakId,
    uint8 rating,       // 1-5 stars
    string comment,
    string ipfsHash     // Optional detailed review
)
```

## Deployment

### 1. Deploy Contract

```bash
cd contracts

# Set environment
export MONAD_RPC="https://mainnet.monad.xyz"
export DEPLOYER_PRIVATE_KEY="0x..."

# Deploy
forge script script/DeployEmpowerTweaks.s.sol:DeployEmpowerTweaks \
  --rpc-url $MONAD_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --broadcast
```

### 2. Update Environment

Add to `.env`:
```
NEXT_PUBLIC_EMPOWERTWEAKS_CONTRACT=0x...deployed_address...
PINATA_JWT=your_pinata_jwt_token
PINATA_GATEWAY=https://gateway.pinata.cloud
```

### 3. Test Locally

```bash
npm run dev
# Visit http://localhost:3000/tweaks
```

## Categories

| Category | Icon | Description |
|----------|------|-------------|
| tweaks | ⚙️ | System modifications |
| themes | 🎨 | Visual customization |
| utilities | 🔧 | Tools and managers |
| apps | 📱 | Standalone applications |
| widgets | 📊 | Home screen widgets |
| lockscreen | 🔒 | Lock screen mods |
| statusbar | 📶 | Status bar tweaks |
| keyboard | ⌨️ | Keyboard mods |

## Token Economics

| Token | Address | Use |
|-------|---------|-----|
| TOURS | 0x45b76a127167fD7FC7Ed264ad490144300eCfcBF | Primary payment |
| WMON | 0x760AfE86e5de5fa0Ee542fc7B7B713e1c5425701 | Alternative payment |
| MON | Native | Direct payment (payable) |

### Fee Structure
- Platform Fee: 2.5% (250 basis points)
- Developer receives: 97.5%
- Instant settlement on purchase

## Comparison: EmpowerTweaks vs Cydia

| Feature | Cydia/Sileo | EmpowerTweaks |
|---------|-------------|---------------|
| Payments | PayPal (centralized) | TOURS/MON (crypto) |
| Hosting | Single server | IPFS (decentralized) |
| Ownership | License tied to account | NFT you own |
| Revenue | 30% platform cut + delays | 2.5% fee, instant payout |
| Reviews | Can be deleted | On-chain (permanent) |
| Resale | Not allowed | NFT transfer possible |
| Takedowns | Possible | Decentralized = resistant |

## Future Enhancements

1. **iOS App**: Native app for jailbroken devices
2. **Repository Sync**: Import from traditional repos
3. **Bundled Purchases**: Buy multiple tweaks at discount
4. **Subscription Tweaks**: Monthly payment models
5. **Developer Verification**: KYC for verified badge
6. **Dispute Resolution**: DAO-governed refunds

## Integration with EmpowerTours

EmpowerTweaks integrates with the broader EmpowerTours ecosystem:

- **TOURS Token**: Same token used across all EmpowerTours products
- **Agent World**: Agents can recommend and purchase tweaks
- **Oracle**: AI-powered tweak recommendations
- **DAO Governance**: vTOURS holders vote on platform policies

## Support

- Website: https://fcempowertours-production-6551.up.railway.app/tweaks
- Discord: [EmpowerTours Discord]
- Farcaster: @empowertours
