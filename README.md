# 🌍 EmpowerTours - Farcaster Mini App

> **Travel Passport NFTs, Music NFT Licensing, and Social Experiences on Monad Testnet**

[![Monad](https://img.shields.io/badge/Monad-Testnet-purple)](https://testnet.monad.xyz)
[![Farcaster](https://img.shields.io/badge/Farcaster-Mini%20App-blue)](https://docs.farcaster.xyz)
[![Envio](https://img.shields.io/badge/Envio-HyperIndex-green)](https://envio.dev)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

**Live App:** [https://fcempowertours-production-6551.up.railway.app](https://fcempowertours-production-6551.up.railway.app)

---

## 🎯 What is EmpowerTours?

EmpowerTours is a comprehensive Web3 platform built as a **Farcaster Mini App** that combines:

- 🎫 **Travel Passport NFTs** - Mint digital passports for 195 countries
- 🎵 **Music NFT Licensing** - Create and license music with time-limited access
- 🛒 **Marketplace** - Trade itineraries and buy music licenses with TOURS tokens
- 🤖 **AI Bot** - Execute gasless transactions via natural language commands
- 📊 **Live Indexing** - Real-time blockchain data powered by Envio HyperIndex

All powered by **Monad Testnet** with **gasless transactions** through Account Abstraction!

---

## ✨ Key Features

### 🎫 Travel Passport NFTs (195 Countries)
- **Geolocation Detection** - Auto-detect your location via GPS or IP
- **SVG-Based Passports** - Dynamic, on-chain passport artwork
- **One Per Country** - Each wallet can mint one passport per country
- **Free Minting** - We pay the gas fees!
- **Duplicate Prevention** - Envio indexer prevents double-minting

**Technical Details:**
- Contract: `PassportNFTv2` (0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08)
- Metadata: Stored on IPFS via Pinata
- Cost: 10 TOURS tokens (but minting is gasless)
- Indexing: Real-time via Envio GraphQL

### 🎵 Music NFT Licensing System
- **Master NFT Ownership** - Artists retain master NFT with full rights
- **Time-Limited Licenses** - Fans buy renewable access licenses (not ownership)
- **Royalty System** - 10% royalties on all resales
- **Preview + Full Track** - 30s preview public, full track for license holders
- **Artist Profiles** - Dedicated pages for each artist with all their music
- **Music Discovery** - Browse and search all music by artist or title
- **Easy Bot Purchasing** - Buy licenses via natural language bot commands

**How It Works:**
1. Artist uploads preview (30s, max 600KB) + full track (max 15MB) + cover art
2. Sets license price in TOURS tokens (e.g., 0.01 TOURS)
3. Mints Master NFT (gasless) - artist keeps ownership forever
4. Fans buy licenses to access full track
5. Artist receives 90% of sale + 10% royalties on resales

**Technical Details:**
- Contract: `MusicLicenseNFTv3` (0x33c3Cae53e6E5a0D5a7f7257f2eFC4Ca9c3dFEAc)
- Payment: TOURS tokens (NOT ETH/MON)
- Storage: IPFS via Pinata
- Purchase Flow: 2-step (Approve TOURS → Buy License) or 1-step via bot

### 💰 Token Economy (TOURS Token)
- **Native Token:** MON (Monad's native gas token)
- **Platform Token:** TOURS (ERC-20) - 0xa123600c82E69cB311B0e068B06Bfa9F787699B7
- **Exchange Rate:** 1 MON = 100 TOURS
- **Token Swap:** Integrated TokenSwap contract (0xe004F2eaCd0AD74E14085929337875b20975F0AA)
- **Use Cases:**
  - Mint passports (10 TOURS)
  - Buy music licenses (artist-set price)
  - Purchase itineraries
  - Send to other users

### 🤖 AI Bot Commands (Natural Language)
Execute blockchain transactions via chat commands - **ALL GASLESS!**

#### Transaction Commands (Using Delegation):
```bash
# Mint passport for your detected location
mint passport

# Send TOURS to another user
send 10 tours to @username
send 5 tours to 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb

# Mint music (after uploading files)
mint music 0.05

# Buy music licenses by song name (NEW! - Natural language)
buy song Money making machine
buy song Ocean Waves Remix
buy song the name of any song

# Buy music licenses by token ID (alternative method)
buy music 1
buy music 42
```

#### Direct Server Commands (No Delegation):
```bash
# Swap MON for TOURS (we pay gas)
swap 0.5 mon
swap 0.1 mon for tours

# Check your balance
check balance

# List all available songs (NEW!)
list songs
```

#### Navigation Commands:
```bash
go to passport
go to music
go to profile
go to market
go to dashboard
```

#### Info Commands:
```bash
help          # Show all commands
status        # Check wallet connection
about         # Learn about EmpowerTours
```

### 🔐 Delegation System (Gasless Transactions)

**How it works:**
1. User grants bot permission via Redis-stored delegation
2. Bot can execute transactions on user's behalf for 24 hours
3. Max 100 transactions per delegation
4. Permissions: `mint_passport`, `mint_music`, `send_tours`, `buy_music`

**Commands that use delegation:**
- ✅ `mint passport` - Uses Pimlico + Safe AA
- ✅ `send X tours to @user` - Transfers from user's wallet
- ✅ `mint music` - Creates music master NFT
- ✅ `buy song [song name]` - Purchases music license by name
- ✅ `buy music [token ID]` - Purchases music license by ID
- ✅ `buy itinerary` - Purchases marketplace items

**Commands that DON'T use delegation:**
- ❌ `swap X mon` - Direct server execution (gift from deployer)
- ❌ Navigation/info commands - Client-side only
- ❌ `list songs` - Queries indexer, no transaction

**Technical Stack:**
- **Smart Contracts:** Safe Protocol (Account Abstraction)
- **Bundler:** Pimlico (handles UserOperations)
- **Storage:** Upstash Redis (delegation permissions)
- **Indexing:** Envio HyperIndex (song name lookups)
- **Duration:** 24 hours per delegation
- **Rate Limit:** 100 transactions per delegation

### 📊 Live Dashboard (Envio HyperIndex)
Real-time blockchain analytics:
- Total Music NFTs minted
- Total Passports minted (by country)
- Total Itineraries created
- Active users
- Recent activity feed (updated every 3s)

**GraphQL Endpoint:** `http://localhost:8080/v1/graphql` (local) or production endpoint

### 🎨 Artist Profiles
- Dedicated profile page for each music artist
- Display all music NFTs by artist
- Clickable audio previews
- Buy licenses directly on artist page
- Share artist link: `/artist/[walletAddress]`

**Features:**
- Farcaster username resolution via Neynar API
- Profile pictures from Farcaster
- Artist stats (total tracks, join date)
- Purchase history

---

## 🏗️ Architecture

### Tech Stack

**Frontend:**
- Next.js 15 (App Router)
- React 18
- TypeScript
- TailwindCSS
- Farcaster MiniApp SDK

**Smart Contracts:**
- Solidity
- Foundry (deployment)
- OpenZeppelin (ERC-721, ERC-20)
- Safe Protocol (Account Abstraction)

**Backend:**
- Next.js API Routes
- Ethers.js v6
- Viem (blockchain interactions)
- Pimlico (UserOperation bundler)

**Indexing:**
- Envio HyperIndex (GraphQL)
- Real-time event processing
- PostgreSQL backend
- Song name lookups via GraphQL

**Storage:**
- IPFS (Pinata) - Metadata & media
- Upstash Redis - Delegation state
- Railway PostgreSQL - Envio data

**APIs:**
- Neynar API (Farcaster data)
- IPInfo (Geolocation)
- OpenAI/Gemini (optional AI features)

### Smart Contracts (Monad Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| PassportNFTv2 | `0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08` | Travel passport NFTs |
| MusicLicenseNFTv3 | `0x33c3Cae53e6E5a0D5a7f7257f2eFC4Ca9c3dFEAc` | Music master + license NFTs |
| TOURS Token | `0xa123600c82E69cB311B0e068B06Bfa9F787699B7` | ERC-20 platform token |
| TokenSwap | `0xe004F2eaCd0AD74E14085929337875b20975F0AA` | MON ↔ TOURS exchange |
| ItineraryMarket | `0x48a4B5b9F97682a4723eBFd0086C47C70B96478C` | Marketplace contract |
| ItineraryNFT | `0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934` | Itinerary NFTs |

### Project Structure

```
fcempowertours/
├── app/
│   ├── api/                          # API Routes
│   │   ├── bot-command/              # Bot command processor (UPDATED)
│   │   ├── execute-delegated/        # Delegation-based transactions
│   │   ├── execute-swap/             # Direct MON→TOURS swap
│   │   ├── mint-passport/            # Passport minting
│   │   ├── mint-music/               # Music NFT minting
│   │   ├── delegation-status/        # Check delegation state
│   │   ├── create-delegation/        # Create new delegation
│   │   ├── upload/                   # IPFS file upload
│   │   └── geo/                      # Geolocation detection
│   ├── components/
│   │   ├── ClientNav.tsx             # Navigation bar
│   │   ├── SimpleBotBar.tsx          # AI bot interface
│   │   ├── DynamicCastFrame.tsx      # Farcaster feed
│   │   ├── EnvioDashboard.tsx        # Analytics dashboard
│   │   └── SDKProvider.tsx           # Farcaster SDK wrapper
│   ├── hooks/
│   │   └── useFarcasterContext.tsx   # Farcaster auth hook
│   ├── passport/                     # Passport minting page
│   ├── music/                        # Music upload/mint page
│   ├── profile/                      # User profile page
│   ├── artist/[address]/             # Artist profile pages
│   ├── discover/                     # Music discovery page
│   ├── market/                       # Marketplace
│   ├── dashboard/                    # Analytics dashboard
│   └── .well-known/farcaster.json/   # Farcaster Mini App config
├── lib/
│   ├── delegation-system.ts          # Delegation logic
│   ├── pimlico-safe-aa.ts           # Account Abstraction
│   ├── redis.ts                      # Redis client
│   ├── safe.ts                       # Safe protocol integration
│   ├── abis/                         # Contract ABIs
│   └── passport/
│       ├── countries.ts              # 195 country database
│       └── generatePassportSVG.tsx   # Dynamic SVG generation
├── envio/                            # Envio indexer config
│   ├── config.yaml                   # Event definitions
│   └── src/EventHandlers.ts          # Event processors
└── public/
    └── images/                       # App icons, splash, OG images
```

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- pnpm (or npm/yarn)
- Git
- Railway CLI (optional, for deployment)
- Foundry (for smart contracts)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/fcempowertours.git
cd fcempowertours

# Install dependencies
pnpm install

# Set up environment variables
cp .env.example .env.local
```

### Environment Variables

```bash
# Blockchain
NEXT_PUBLIC_MONAD_RPC=https://testnet-rpc.monad.xyz
DEPLOYER_PRIVATE_KEY=your_private_key_here
BOT_SIGNER_ADDRESS=your_bot_address

# Smart Contracts
NEXT_PUBLIC_PASSPORT=0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08
NEXT_PUBLIC_MUSICNFT_ADDRESS=0x33c3Cae53e6E5a0D5a7f7257f2eFC4Ca9c3dFEAc
NEXT_PUBLIC_TOURS_TOKEN=0xa123600c82E69cB311B0e068B06Bfa9F787699B7
TOKEN_SWAP_ADDRESS=0xe004F2eaCd0AD74E14085929337875b20975F0AA
NEXT_PUBLIC_MARKET=0x48a4B5b9F97682a4723eBFd0086C47C70B96478C

# Farcaster
NEXT_PUBLIC_NEYNAR_API_KEY=your_neynar_key
BOT_SIGNER_UUID=your_bot_signer_uuid
BOT_FID=your_bot_fid

# IPFS/Pinata
PINATA_JWT=your_pinata_jwt
PINATA_GATEWAY=https://harlequin-used-hare-224.mypinata.cloud/ipfs/

# Redis (Upstash)
UPSTASH_REDIS_REST_URL=your_redis_url
UPSTASH_REDIS_REST_TOKEN=your_redis_token

# Pimlico (Account Abstraction)
PIMLICO_API_KEY=your_pimlico_key

# Geolocation
IPINFO_TOKEN=your_ipinfo_token

# Envio
NEXT_PUBLIC_ENVIO_ENDPOINT=http://localhost:8080/v1/graphql

# App
NEXT_PUBLIC_URL=http://localhost:3000
```

### Development

```bash
# Run Next.js development server
pnpm dev

# Run Envio indexer (in separate terminal)
cd envio
pnpm dev

# Deploy smart contracts (Foundry)
cd contracts
forge script script/Deploy.s.sol --rpc-url $MONAD_RPC --broadcast
```

**Access the app:**
- Frontend: http://localhost:3000
- Envio GraphQL: http://localhost:8080/v1/graphql
- Envio Hasura Console: http://localhost:8080/console

### Testing in Farcaster

1. **Deploy to Railway/Vercel:**
   ```bash
   railway up  # or vercel deploy
   ```

2. **Configure Farcaster Mini App:**
   - Update `app/.well-known/farcaster.json/route.ts` with your domain
   - Test in Warpcast mobile app
   - Share frame link in Farcaster

3. **Test Bot Commands:**
   - Open app in Warpcast
   - Use the bot bar at bottom
   - Try: `help`, `swap 0.1 mon`, `mint passport`, `buy song Money making machine`

---

## 🎮 Usage Guide

### For Users

#### 1. Connect Wallet
- Open in Warpcast or Farcaster client
- Wallet connects automatically via Farcaster custody address
- Or use external wallet (MetaMask, Rainbow, etc.)

#### 2. Get TOURS Tokens
```bash
# Via bot command:
swap 0.5 mon

# Or use marketplace:
Navigate to Market → Swap Widget
```

#### 3. Mint Passport
```bash
# Via bot:
mint passport

# Or via UI:
Navigate to Passport → Select Country → Mint (FREE)
```

#### 4. Upload Music
1. Go to Music page
2. Upload files:
   - Preview audio (30s, max 600KB)
   - Full track (max 15MB)
   - Cover art (max 3MB)
3. Set song title and license price
4. Mint (FREE - we pay gas!)

#### 5. Buy Music License (Multiple Methods)

**Method 1: Via Bot Command (Easiest - Gasless)**
```bash
# By song name (natural language)
buy song Money making machine

# By token ID
buy music 1
```

**Method 2: Via UI**
1. Go to Discover or Artist Profile
2. Browse tracks and listen to previews
3. Click "Buy License"
4. Approve TOURS (step 1/2)
5. Confirm purchase (step 2/2)
6. Full track unlocked!

#### 6. Discover Music
```bash
# List all available songs via bot
list songs

# Or browse via UI:
Navigate to Discover → Browse by artist
Navigate to Discover → Search by title
```

### For Artists

#### Setting Up Artist Profile
1. Mint at least one music NFT
2. Your profile auto-creates at `/artist/[your-wallet]`
3. Share link with fans: Click "Copy Link" on your profile

#### Managing Music
- All your music appears on your artist profile
- Set competitive license prices (0.01-10 TOURS)
- Earn 90% of sales + 10% royalties
- Track plays and sales in profile

#### Best Practices
- Use high-quality cover art (1:1 aspect ratio)
- Keep preview clips engaging (30s max)
- Price competitively (most licenses: 0.01-0.1 TOURS)
- Share your artist link on Farcaster
- Tip: Song titles are searchable - use clear, descriptive names

---

## 🔧 API Reference

### Bot Commands API

**Endpoint:** `POST /api/bot-command`

```typescript
// Request
{
  command: string;          // Natural language command
  userAddress: string;      // User's wallet address
  location?: {              // Optional geolocation
    country: string;
    countryName: string;
    latitude: number;
    longitude: number;
  }
}

// Response
{
  success: boolean;
  action: 'navigate' | 'transaction' | 'info' | 'query';
  message: string;
  path?: string;            // For navigation
  txHash?: string;          // For transactions
  data?: any;               // For queries (e.g., song list)
}
```

#### Supported Commands (Updated)

**Music Purchase Commands:**
- `buy song [song name]` - Finds song by name, initiates purchase
- `buy music [token ID]` - Purchases music license by token ID
- `list songs` - Returns all available songs with artist info
- `list songs by [artist]` - Returns songs by specific artist

### Delegation API

**Check Status:** `GET /api/delegation-status?address=0x...`

```typescript
{
  success: boolean;
  delegation?: {
    user: string;
    bot: string;
    hoursLeft: number;
    transactionsLeft: number;
    permissions: string[];
    expiresAt: string;
  }
}
```

**Create:** `POST /api/create-delegation`

```typescript
{
  userAddress: string;
  durationHours: number;    // Default: 24
  maxTransactions: number;  // Default: 100
  permissions: string[];    // e.g., ['mint_passport', 'send_tours', 'buy_music']
}
```

### Envio GraphQL Queries

**Get User NFTs:**
```graphql
query GetUserData($address: String!) {
  PassportNFT(where: {owner: {_eq: $address}}) {
    tokenId
    countryCode
    mintedAt
  }
  MusicNFT(where: {owner: {_eq: $address}}) {
    tokenId
    artist
    tokenURI
    title
  }
}
```

**Get All Songs (for search/discovery):**
```graphql
query GetAllSongs {
  MusicNFT {
    tokenId
    title
    artist
    price
    owner
  }
}
```

**Search Songs by Name:**
```graphql
query SearchSongs($title: String!) {
  MusicNFT(where: {title: {_ilike: $title}}) {
    tokenId
    title
    artist
    price
    owner
  }
}
```

**Get Global Stats:**
```graphql
query GetStats {
  GlobalStats {
    totalMusicNFTs
    totalPassports
    totalUsers
  }
}
```

---

## 🎨 Farcaster Frame Configuration

Located in `app/.well-known/farcaster.json/route.ts`:

```typescript
{
  frame: {
    version: "1",                    // Must be "1"
    name: "EmpowerTours",
    iconUrl: "/images/icon.png",    // 200x200px
    homeUrl: "https://your-domain.com",
    splashImageUrl: "/images/splash.png",
    splashBackgroundColor: "#353B48",
    buttonTitle: "EmpowerTours",
    subtitle: "Travel Stamp Buy Experiences",
    tags: ["travel", "music", "nfts"]
  },
  accountAssociation: {
    header: "base64_encoded_header",
    payload: "base64_encoded_payload",
    signature: "signature_hash"
  }
}
```

---

## 🐛 Troubleshooting

### Common Issues

#### 1. "Wallet not connected"
- **Solution:** Click "Connect Wallet" or open in Warpcast
- **Check:** Farcaster context is loading properly
- **Verify:** `useFarcasterContext()` returns valid user

#### 2. "Insufficient TOURS tokens"
- **Solution:** Use bot command `swap 0.5 mon`
- **Check:** Balance in profile page
- **Note:** Need both TOURS (for purchases) + MON (for gas)

#### 3. "Transaction failed"
- **Check:** Delegation status (might be expired)
- **Solution:** Bot will auto-create new delegation
- **Verify:** Redis connection is working

#### 4. "Duplicate passport detected"
- **Reason:** Each wallet can mint 1 passport per country
- **Solution:** Choose a different country
- **Check:** Envio indexer is running

#### 5. "Music purchase stuck on 'Approving...'"
- **Issue:** Two-step transaction flow (UI method)
- **Solution:** Confirm BOTH transactions:
  1. Approve TOURS tokens
  2. Execute purchase
- **Note:** Each step requires wallet confirmation
- **Alternative:** Use bot command `buy song [name]` for single-step purchase

#### 6. Artist name shows as "0x..." instead of username
- **Reason:** Neynar API lookup failed
- **Solution:** Refresh page or check Neynar API key
- **Note:** Fallback to truncated address if user not on Farcaster

#### 7. "Song not found" when using bot command
- **Check:** Exact song title spelling
- **Solution:** Use `list songs` to see available titles
- **Tip:** Song search is case-insensitive and supports partial matches
- **Note:** Make sure Envio indexer is running and synced

#### 8. Bot commands aren't working
- **Verify:** Envio GraphQL endpoint is set in `.env.local`
- **Check:** `NEXT_PUBLIC_ENVIO_ENDPOINT` points to correct indexer
- **Solution:** Run `list songs` to test indexer connectivity
- **Debug:** Check browser console for GraphQL errors

### Debug Mode

Enable detailed logging:
```typescript
// In useFarcasterContext.tsx
console.log('🔄 SDK Context:', context);
console.log('💰 Wallet Address:', walletAddress);

// In bot command handler
console.log('🎵 Song search results:', searchResults);
console.log('📦 GraphQL Query:', query);
```

---

## 📊 Performance & Limits

### Rate Limits
- **Neynar API:** 1000 requests/hour (free tier)
- **IPInfo:** 50,000 requests/month
- **Pimlico:** Based on plan
- **Delegation:** 100 transactions per 24h per user
- **Envio GraphQL:** Unlimited (self-hosted)

### File Size Limits
- Preview audio: 600KB (~30 seconds MP3)
- Full track: 15MB (~10-15 minutes WAV/MP3)
- Cover art: 3MB (JPEG/PNG)
- Metadata: 200 characters per field

### Blockchain
- Block time: ~1s (Monad)
- Confirmation: 1 block recommended
- Gas price: Dynamic (we pay it!)

### Query Performance
- Song search: <100ms (indexed by Envio)
- Fuzzy matching: Real-time via GraphQL
- Pagination: Supports 100+ songs efficiently

---

## 🚢 Deployment

### Railway (Recommended)

```bash
# Install Railway CLI
npm install -g railway

# Login
railway login

# Link project
railway link

# Deploy
railway up

# Set environment variables
railway variables set KEY=value
railway variables set NEXT_PUBLIC_ENVIO_ENDPOINT=https://your-envio-endpoint/v1/graphql
```

### Vercel

```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod

# Set environment variables
vercel env add PRODUCTION
vercel env add NEXT_PUBLIC_ENVIO_ENDPOINT
```

### Docker (Optional)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]
```

---

## 🤝 Contributing

We welcome contributions! Here's how:

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

### Development Guidelines
- Use TypeScript for type safety
- Follow existing code style
- Add tests for new features
- Update documentation
- Test on Monad testnet before PR
- Test new bot commands with `list songs` before deployment

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

## 🙏 Acknowledgments

- **Monad** - High-performance EVM blockchain
- **Farcaster** - Decentralized social protocol
- **Envio** - Real-time blockchain indexing
- **Pimlico** - Account Abstraction infrastructure
- **Neynar** - Farcaster API services
- **Safe Protocol** - Smart wallet infrastructure

---

## 📞 Support

- **Twitter:** [@empowertours](https://twitter.com/empowertours)
- **Farcaster:** @empowertours
- **Discord:** [Join our server](https://discord.gg/AChwB4Jd)
- **Email:** admin@empowertours.xyz

---

## 🗺️ Roadmap

### Q1 2025
- ✅ Launch Monad testnet
- ✅ Farcaster Mini App integration
- ✅ Music NFT licensing system
- ✅ Gasless transactions via delegation
- ✅ Bot song name purchasing (NEW!)
- ⏳ Mobile optimization

### Q2 2025
- 🔄 Mainnet deployment
- 🔄 Cross-chain passport bridging
- 🔄 Advanced music discovery (AI recommendations)
- 🔄 Social features (playlist sharing, follows)

### Q3 2025
- 🔄 Artist verification system
- 🔄 Collaborative playlists
- 🔄 Travel community features
- 🔄 NFT staking rewards

### Q4 2025
- 🔄 Mobile native app
- 🔄 AR passport experiences
- 🔄 Concert ticket NFTs
- 🔄 DAO governance

---

## 📈 Stats

- **Supported Countries:** 195
- **Smart Contracts:** 6 deployed
- **Blockchain:** Monad Testnet (Chain ID: 10143)
- **Token Standard:** ERC-721 (NFTs), ERC-20 (TOURS)
- **Indexer:** Envio HyperIndex
- **Storage:** IPFS (Pinata)
- **Gasless Transactions:** ✅ Via Pimlico + Safe
- **Bot Commands:** 15+ (including song name purchases)

---

**Built with ❤️ for Monad Dev Cook-Off & Farcaster Community**

[⭐ Star on GitHub](https://github.com/empowertours/fcempowertours) | [🐛 Report Bug](https://github.com/empowertours/fcempowertours/issues) | [💡 Request Feature](https://github.com/empowertours/fcempowertours/issues)
