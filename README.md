# 🌍 EmpowerTours - Farcaster Mini App

> **Travel Passport NFTs, Music NFT Licensing, and Social Experiences on Monad Testnet**

[![Monad](https://img.shields.io/badge/Monad-Testnet-purple)](https://testnet.monad.xyz)
[![Farcaster](https://img.shields.io/badge/Farcaster-Mini%20App-blue)](https://docs.farcaster.xyz)
[![Envio](https://img.shields.io/badge/Envio-HyperIndex-green)](https://envio.dev)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

**Live App:** [https://fcempowertours-production-6551.up.railway.app](https://fcempowertours-production-6551.up.railway.app)

---

## 🎯 What is EmpowerTours?

EmpowerTours is a comprehensive Web3 platform built as a **Farcaster Mini App** combining travel passport NFTs, music NFT licensing, social experiences, and gasless transactions powered by Monad Testnet and Account Abstraction.

**Core Features:**
- 🎫 Travel Passport NFTs for 195 countries with automatic geolocation
- 🎵 Music NFT Licensing with artist master ownership + time-limited fan licenses
- 🛒 Marketplace for trading itineraries and music with TOURS tokens
- 🤖 AI Bot for executing gasless transactions via natural language commands
- 📊 Live analytics dashboard powered by Envio HyperIndex
- 📢 Automatic Farcaster casting for all NFT operations
- ⚡ Gasless transactions through Safe Smart Accounts + Pimlico

---

## ✨ Key Features

### 🎫 Travel Passport NFTs (195 Countries)

Mint digital passports with automatic geolocation detection. One per country per wallet, fully gasless.

**Technical Details:**
- Contract: `PassportNFTv2` (0x04a8983587B79cd0a4927AE71040caf3baA613f1)
- Cost: 10 TOURS tokens (minting is gasless)
- Metadata: Stored on IPFS via Pinata
- Indexing: Real-time via Envio GraphQL
- Geolocation: Auto-detects via GPS or IP
- Casting: Automatic posts to Farcaster after mint ✅

**How It Works:**
1. User opens app and connects wallet
2. Geolocation detects country automatically
3. Mint button creates NFT (gasless via Safe + Pimlico)
4. SVG-based passport artwork generated on-chain
5. Cast automatically posts to Farcaster with country flag

### 🎵 Music NFT Licensing System

Artists mint master NFTs they own forever, while fans buy renewable time-limited licenses to access tracks.

**Artist Flow:**
1. Upload preview (30s, max 600KB) + full track (max 15MB) + cover art
2. Set license price in TOURS tokens (e.g., 0.01 TOURS)
3. Mint Master NFT (gasless) - artist keeps ownership forever
4. Automatic cast posts to your Farcaster profile 📢
5. Earn 90% of sales + 10% royalties on resales

**Fan Flow:**
1. Browse music by artist or use search
2. Listen to 30-second preview
3. Buy license via bot command or UI (2-step approval)
4. Automatic cast posts to your profile upon purchase 📢
5. Access full track immediately
6. License renews annually

**Technical Details:**
- Contract: `MusicLicenseNFTv4` (0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6)
- Payment: TOURS tokens (NOT ETH/MON)
- Storage: IPFS via Pinata
- Purchase: 2-step (Approve TOURS → Buy) or 1-step via bot command
- Casting: Both mints and purchases post casts automatically ✅

### 📢 Farcaster Casting (NEW!)

All NFT operations automatically post casts to Farcaster for social proof and user engagement.

**What Gets Cast:**
- ✅ Passport mints (with country flag + token ID)
- ✅ Music NFT mints (with song title + license price)
- ✅ Music license purchases (with track name)

**Implementation Details:**
- Non-blocking casting (mint succeeds even if cast fails)
- Uses Neynar SDK for reliable Farcaster posting
- Includes interactive embeds linking to passport/music pages
- Casts include Monad explorer transaction links

**See:** `app/api/cast-nft/route.ts` for implementation details

### 💰 Token Economy (TOURS Token)

Platform currency for all transactions and token swaps.

- **Platform Token:** TOURS (ERC-20) - 0xa123600c82E69cB311B0e068B06Bfa9F787699B7
- **Exchange Rate:** 1 MON = 100 TOURS
- **Use Cases:** Mint passports (10 TOURS), buy music licenses, purchase itineraries, send to other users
- **TokenSwap Contract:** 0xe004F2eaCd0AD74E14085929337875b20975F0AA (MON ↔ TOURS exchange)

### 🤖 AI Bot Commands

Execute gasless blockchain transactions via natural language. All delegation-based commands use Safe + Pimlico for gasless execution.

**Passport Commands:**
- `mint passport` - Mints for your detected location (gasless, auto-casts)

**Music Commands:**
- `buy song [song name]` - Find and purchase music by title (gasless, auto-casts) ⭐
- `buy music [token ID]` - Purchase by token ID (gasless, auto-casts)
- `mint music [price]` - After uploading files (gasless, auto-casts)
- `list songs` - Show all available music tracks

**Token Commands:**
- `send [amount] tours to @username` or address (gasless via delegation)
- `swap [amount] mon` - Direct server swap (we pay gas)
- `check balance` - View TOURS balance

**Navigation Commands:**
- `go to passport`, `go to music`, `go to profile`, `go to market`, `go to dashboard`

**Info Commands:**
- `help` - Show all commands
- `status` - Check wallet connection
- `about` - Learn about EmpowerTours

### 🔐 Delegation System (Gasless Transactions)

User-grants-permission model allowing the bot to execute safe transactions on their behalf for 24 hours (max 100 transactions).

**How It Works:**
1. User requests delegated action (e.g., "mint passport")
2. Bot checks Redis for active delegation
3. If expired/missing, bot creates new delegation with required permissions
4. Bot executes Safe UserOperation via Pimlico bundler
5. Transaction succeeds with zero gas cost

**Delegatable Permissions:**
- `mint_passport` - Mint travel passports
- `mint_music` - Create music master NFTs
- `send_tours` - Transfer tokens to other users
- `buy_music` - Purchase music licenses

**Duration:** 24 hours per delegation | **Limit:** 100 transactions per delegation

**Storage:** Upstash Redis (delegation state) | **Infrastructure:** Pimlico (UserOperation bundler) + Safe (smart account)

### 📊 Live Dashboard

Real-time blockchain analytics powered by Envio HyperIndex (local GraphQL or production endpoint).

**Metrics:**
- Total Music NFTs minted
- Total Passports minted by country
- Total Itineraries created
- Active users
- Recent activity feed (updated every 3s)

### 🎨 Artist Profiles

Dedicated profile pages for each music artist showing all their music, profile picture from Farcaster, and purchase history.

- **URL:** `/artist/[walletAddress]`
- **Features:** Farcaster username resolution, profile stats, all tracks with audio previews
- **Share:** Copy link and share with fans on Farcaster

---

## 🏗️ Architecture

### Tech Stack

**Frontend:** Next.js 15 (App Router), React 18, TypeScript, TailwindCSS, Farcaster MiniApp SDK

**Smart Contracts:** Solidity, Foundry, OpenZeppelin (ERC-721, ERC-20), Safe Protocol (Account Abstraction)

**Backend:** Next.js API Routes, Ethers.js v6, Viem (blockchain interactions), Pimlico (UserOperation bundler)

**Indexing:** Envio HyperIndex (GraphQL), Real-time event processing, PostgreSQL backend

**Casting:** Neynar SDK (Farcaster API), Non-blocking async posting

**Storage:** IPFS (Pinata), Upstash Redis (delegation state), Railway PostgreSQL (Envio data)

**APIs:** Neynar API (Farcaster), IPInfo (Geolocation)

### Smart Contracts (Monad Testnet)

| Contract | Address | Purpose |
|----------|---------|---------|
| PassportNFTv2 | `0x04a8983587B79cd0a4927AE71040caf3baA613f1` | Travel passport NFTs (CURRENT) |
| MusicLicenseNFTv4 | `0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6` | Music master + license NFTs (current) |
| TOURS Token | `0xa123600c82E69cB311B0e068B06Bfa9F787699B7` | ERC-20 platform token |
| TokenSwap | `0xe004F2eaCd0AD74E14085929337875b20975F0AA` | MON ↔ TOURS exchange |
| ItineraryMarket | `0x48a4B5b9F97682a4723eBFd0086C47C70B96478C` | Marketplace contract |
| ItineraryNFT | `0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934` | Itinerary NFTs |
| Safe Account | `0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20` | Main gasless wallet |
| Bot Safe Account | `0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5` | Bot transaction executor |
| Vault | `0xDd57B4eae4f7285DB943edCe8777f082b2f02f79` | Treasury vault |

### Project Structure

```
fcempowertours/
├── app/
│   ├── api/
│   │   ├── bot-command/              # Bot command processor
│   │   ├── cast-nft/                 # NEW: Unified casting endpoint
│   │   ├── execute-delegated/        # Delegation transactions
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
- Foundry (for smart contracts)
- Railway CLI or Vercel (for deployment)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/fcempowertours.git
cd fcempowertours

# Install dependencies
pnpm install
pnpm add @neynar/nodejs-sdk

# Set up environment variables
cp .env.example .env.local
```

### Environment Variables

**Critical Production Variables (Set in Railway):**

```bash
# Blockchain & RPC
NEXT_PUBLIC_MONAD_RPC=https://testnet-rpc.monad.xyz
NEXT_PUBLIC_CHAIN_ID=10143
DEPLOYER_PRIVATE_KEY=055ae358d49f1e1c81da5af936978b5fcb6bf48b37a29a7abc433c731b6b2da3
SAFE_OWNER_PRIVATE_KEY=0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2

# Smart Contracts (Monad Testnet)
NEXT_PUBLIC_PASSPORT=0x04a8983587B79cd0a4927AE71040caf3baA613f1
NEXT_PUBLIC_MUSICNFT_ADDRESS=0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6
NEXT_PUBLIC_TOURS_TOKEN=0xa123600c82E69cB311B0e068B06Bfa9F787699B7
TOKEN_SWAP_ADDRESS=0xe004F2eaCd0AD74E14085929337875b20975F0AA
NEXT_PUBLIC_MARKET=0x48a4B5b9F97682a4723eBFd0086C47C70B96478C
NEXT_PUBLIC_VAULT=0xDd57B4eae4f7285DB943edCe8777f082b2f02f79
TREASURY_ADDRESS=0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3

# Account Abstraction (Safe + Pimlico)
NEXT_PUBLIC_SAFE_ACCOUNT=0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
BOT_SMART_ACCOUNT_ADDRESS=0x9c751Ba8D48f9Fa49Af0ef0A8227D0189aEd84f5
NEXT_PUBLIC_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
NEXT_PUBLIC_PIMLICO_API_KEY=pim_H5mQxH2vk7s2J83BhPJnt8
NEXT_PUBLIC_PIMLICO_BUNDLER_URL=https://api.pimlico.io/v2/10143/rpc?apikey=pim_H5mQxH2vk7s2J83BhPJnt8

# Farcaster & Casting
NEXT_PUBLIC_NEYNAR_API_KEY=8F698A8D-C272-4647-A642-2275FA1C3F89
BOT_FID=1368808
BOT_SIGNER_UUID=b214915d-f94b-4c83-b411-5a9c9b293610
BOT_USERNAME=empowertoursbot
NEYNAR_WALLET_ID=0x2d5dd9aa1dc42949d203d1946d599ba47f0b6d1c

# IPFS/Pinata
PINATA_JWT=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiJmNmQzMjYzYS0yZWJjLTQ5MzQtODdiZS04N2NkNjkyN2U4OGQiLCJlbWFpbCI6ImVtcG93ZXJ0b3Vyc0BnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiMDA1YmM5OTc5ZWM4Zjc1MjliMGQiLCJzY29wZWRLZXlTZWNyZXQiOiJhY2I2MDNlMjY0YjI4MWMwZGQ4NTAyMTZhYjhjMmJjOTMwNjBhNGI5NjA4NjBkMzEyMTAwZTY4YjM1MmY5NGZmIiwiZXhwIjoxNzkxMzYzNTAzfQ.iL2yf6Rr3cSI0bkhxuyzDCcOrIkNmlOKwnZIcJeIkxk
PINATA_API_KEY=005bc9979ec8f7529b0d
PINATA_API_SECRET=acb603e264b281c0dd850216ab8c2bc93060a4b960860d312100e68b352f94ff
PINATA_GATEWAY=harlequin-used-hare-224.mypinata.cloud

# Redis (Upstash) - Delegation State
UPSTASH_REDIS_REST_URL=https://upward-trout-13418.upstash.io
UPSTASH_REDIS_REST_TOKEN=ATRqAAIncDJiN2E1MjY2MTE5ZmM0OGExYmEwNjIyOWQxZWQ5MmNmZXAyMTM0MTg

# Envio Indexer
NEXT_PUBLIC_ENVIO_ENDPOINT=https://indexer.dev.hyperindex.xyz/4057a48/v1/graphql

# Geolocation
IPINFO_TOKEN=998203daac62bd

# AI Features
USE_GEMINI=true
GEMINI_API_KEY=AIzaSyAHXFOe6MvhJi_svCU1sWuAYb9p4iWBbSc
DEEPAI_API_KEY=d963cd8d-822e-4cc5-a68f-57be49a2f571

# Wallet & Authentication
NEXT_PUBLIC_PRIVY_APP_ID=cmaoduqox005ole0nmj1s4qck
NEXT_PUBLIC_WALLET_CONNECT_PROJECT_ID=fe37abeb05d3c8173d119bf79ff6f8b0
WEB3AUTH_CLIENT_ID=01792c40db0949bfbb5199f7bbab504c

# App
NEXT_PUBLIC_URL=https://fcempowertours-production-6551.up.railway.app
```

**Local Development Override:**
For local development, override key endpoints:
```bash
NEXT_PUBLIC_ENVIO_ENDPOINT=http://localhost:8080/v1/graphql
NEXT_PUBLIC_URL=http://localhost:3000
```

### Development

```bash
# Run Next.js development server
pnpm dev

# In another terminal, run Envio indexer
cd envio && pnpm dev

# Deploy smart contracts (optional)
cd contracts && forge script script/Deploy.s.sol --rpc-url $MONAD_RPC --broadcast
```

**Access:**
- Frontend: http://localhost:3000
- Envio GraphQL: http://localhost:8080/v1/graphql

### Testing in Farcaster

1. Deploy to Railway/Vercel
2. Update `app/.well-known/farcaster.json/route.ts` with your domain
3. Test in Warpcast mobile app
4. Use bot commands: `help`, `swap 0.1 mon`, `mint passport`, `buy song [name]`

---

## 🎮 Usage Guide

### For Users

**Connect Wallet:** Opens automatically via Farcaster custody or manual MetaMask/Rainbow connection

**Get TOURS Tokens:** Use bot command `swap 0.5 mon` (we pay gas) or marketplace swap widget

**Mint Passport:**
- Via bot: `mint passport` (detects location, gasless, auto-casts)
- Via UI: Navigate to Passport page, select country, mint (FREE)

**Upload Music:**
1. Go to Music page
2. Upload preview (30s), full track (max 15MB), cover art
3. Set song title and license price in TOURS
4. Mint (FREE, automatic cast posts to profile 📢)

**Buy Music License (2 Methods):**
- **Bot (Fastest):** `buy song [song name]` - Single command, gasless, auto-casts 🚀
- **UI (Manual):** Browse Discover or artist profile → Click "Buy License" → 2-step approval flow

**Discover Music:** Use `list songs` bot command or browse Discover page with search

### For Artists

**Set Up Profile:** Mint one music NFT, profile auto-creates at `/artist/[your-wallet]`

**Manage Music:** All tracks appear on artist profile. Set competitive prices (0.01-10 TOURS), earn 90% of sales + 10% royalties

**Best Practices:**
- Use high-quality cover art (1:1 ratio)
- Keep previews engaging (30s max)
- Price competitively (most licenses: 0.01-0.1 TOURS)
- Share artist link on Farcaster
- Use descriptive song titles (searchable)

---

## 🔧 API Reference

### Bot Commands API

**Endpoint:** `POST /api/bot-command`

All responses include `success`, `action` (navigate/transaction/info/query), and `message` fields. Transaction responses include `txHash`.

**Command Categories:**
- **Passport:** `mint passport`
- **Music:** `buy song [name]`, `buy music [id]`, `mint music [price]`, `list songs`
- **Tokens:** `send X tours to [user]`, `swap X mon`, `check balance`
- **Navigation:** `go to [page]`
- **Info:** `help`, `status`, `about`

### Delegation API

**Check Status:** `GET /api/delegation-status?address=0x...`

**Create:** `POST /api/create-delegation`

Payload: `userAddress`, `durationHours` (default: 24), `maxTransactions` (default: 100), `permissions` array

### Envio GraphQL Queries

See `lib/envio-queries.ts` for examples:

```graphql
# Get user NFTs
query GetUserData($address: String!) {
  PassportNFT(where: {owner: {_eq: $address}}) { tokenId, countryCode, mintedAt }
  MusicNFT(where: {owner: {_eq: $address}}) { tokenId, artist, title, price }
}

# Search songs by name
query SearchSongs($title: String!) {
  MusicNFT(where: {title: {_ilike: $title}}) { tokenId, title, artist, price }
}

# Get all songs for listing
query GetAllSongs {
  MusicNFT { tokenId, title, artist, price, owner }
}
```

---

## 🐛 Troubleshooting

### Common Issues

**"Wallet not connected"**
- Open in Warpcast or click "Connect Wallet"
- Check that Farcaster context loads properly

**"Insufficient TOURS tokens"**
- Use `swap 0.5 mon` to get TOURS
- Check balance in profile page

**"Transaction failed"**
- Check delegation status (may be expired)
- Bot auto-creates new delegation if needed

**"Duplicate passport detected"**
- Each wallet can mint 1 passport per country
- Choose a different country or use a different wallet

**"Song not found" (bot command)**
- Use `list songs` to see available titles
- Verify exact spelling (case-insensitive)
- Ensure Envio indexer is running and synced

**"Casts aren't posting"**
- Verify `BOT_SIGNER_UUID` in environment variables
- Check `NEXT_PUBLIC_NEYNAR_API_KEY` validity
- Note: Casting is non-blocking - mints succeed even if cast fails
- Check logs for "✅ Cast posted successfully"

**Artist name shows as address instead of username**
- Neynar API lookup failed (temporary)
- Refresh page to retry
- Falls back to truncated address

### Debug Mode

Enable detailed logging in development:
```bash
# Check .env.local for DEBUG=true
DEBUG=true pnpm dev

# Monitor bot commands
console.log('🎵 Bot command:', command, fid);

# Watch casting
console.log('📢 Posting cast:', castData);
console.log('✅ Cast posted:', castHash);
```

---

## 📊 Performance & Limits

### Rate Limits
- Neynar API: 1000 requests/hour (free tier)
- IPInfo: 50,000 requests/month
- Delegation: 100 transactions per 24h per user
- Envio GraphQL: Unlimited (self-hosted)

### File Size Limits
- Preview audio: 600KB (~30 seconds MP3)
- Full track: 15MB (~10-15 minutes WAV/MP3)
- Cover art: 3MB (JPEG/PNG)

### Blockchain
- Block time: ~1s (Monad)
- Confirmation: 1 block recommended
- Gas cost: Zero (we pay it!)

---

## 🚢 Deployment

### Railway (Recommended)

```bash
railway login
railway link
railway up
railway variables set KEY=value
railway variables set NEXT_PUBLIC_ENVIO_ENDPOINT=https://your-endpoint/v1/graphql
```

### Vercel

```bash
vercel --prod
vercel env add PRODUCTION
vercel env add NEXT_PUBLIC_ENVIO_ENDPOINT
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

**Guidelines:** Use TypeScript, follow existing code style, test on Monad testnet, update docs

---

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

---

## 🙏 Acknowledgments

**Monad** • **Farcaster** • **Envio** • **Pimlico** • **Neynar** • **Safe Protocol** • **OpenZeppelin**

---

## 📞 Support

- **Twitter:** [@empowertours](https://twitter.com/empowertours)
- **Farcaster:** @empowertours
- **Email:** admin@empowertours.xyz

---

## 🗺️ Roadmap

### Q1 2025
- ✅ Monad testnet launch
- ✅ Farcaster Mini App integration
- ✅ Music NFT licensing system
- ✅ Gasless transactions via delegation
- ✅ Bot song name purchasing
- ✅ Farcaster casting for NFT operations
- ⏳ Mobile optimization

### Q2 2025
- 🔄 Mainnet deployment
- 🔄 Cross-chain passport bridging
- 🔄 AI-powered music recommendations
- 🔄 Social features (playlists, follows)

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
- **Token Standards:** ERC-721 (NFTs), ERC-20 (TOURS)
- **Indexer:** Envio HyperIndex
- **Storage:** IPFS (Pinata)
- **Gasless Transactions:** ✅ Via Pimlico + Safe
- **Farcaster Casting:** ✅ Via Neynar SDK
- **Bot Commands:** 15+ with automatic Farcaster casting

---

**Built with ❤️ for Monad Dev Cook-Off & Farcaster Community**

[⭐ Star on GitHub](https://github.com/empowertours/fcempowertours) | [🐛 Report Bug](https://github.com/empowertours/fcempowertours/issues) | [💡 Request Feature](https://github.com/empowertours/fcempowertours/issues)
