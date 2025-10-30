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
- 📢 **Farcaster Casting** - Automatic cast posting for all NFT operations

All powered by **Monad Testnet** with **gasless transactions** through Account Abstraction!

---

## ✨ Key Features

### 🎫 Travel Passport NFTs (195 Countries)
- **Geolocation Detection** - Auto-detect your location via GPS or IP
- **SVG-Based Passports** - Dynamic, on-chain passport artwork
- **One Per Country** - Each wallet can mint one passport per country
- **Free Minting** - We pay the gas fees!
- **Duplicate Prevention** - Envio indexer prevents double-minting
- **📢 Cast Posting** - Automatic cast to Farcaster with country flag emoji

**Technical Details:**
- Contract: `PassportNFTv2` (0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08)
- Metadata: Stored on IPFS via Pinata
- Cost: 10 TOURS tokens (but minting is gasless)
- Indexing: Real-time via Envio GraphQL
- Casting: Posts to Farcaster immediately after successful mint

### 🎵 Music NFT Licensing System
- **Master NFT Ownership** - Artists retain master NFT with full rights
- **Time-Limited Licenses** - Fans buy renewable access licenses (not ownership)
- **Royalty System** - 10% royalties on all resales
- **Preview + Full Track** - 30s preview public, full track for license holders
- **Artist Profiles** - Dedicated pages for each artist with all their music
- **Music Discovery** - Browse and search all music by artist or title
- **Easy Bot Purchasing** - Buy licenses via natural language bot commands
- **📢 Cast Posting** - Automatic casts for both minting and purchasing

**How It Works:**
1. Artist uploads preview (30s, max 600KB) + full track (max 15MB) + cover art
2. Sets license price in TOURS tokens (e.g., 0.01 TOURS)
3. Mints Master NFT (gasless) - artist keeps ownership forever
4. Cast automatically posts to Farcaster with song details
5. Fans buy licenses to access full track
6. Purchase casts automatically post to buyer's profile
7. Artist receives 90% of sale + 10% royalties on resales

**Technical Details:**
- Contract: `MusicLicenseNFTv3` (0x33c3Cae53e6E5a0D5a7f7257f2eFC4Ca9c3dFEAc)
- Payment: TOURS tokens (NOT ETH/MON)
- Storage: IPFS via Pinata
- Purchase Flow: 2-step (Approve TOURS → Buy License) or 1-step via bot
- Casting: Posts music mint and purchase casts automatically

### 📢 Farcaster Casting Integration (NEW!)

All NFT operations automatically post casts to Farcaster:

#### Passport Mint Cast
```
🎫 New EmpowerTours Passport Minted!

🇺🇸 United States

Token #42

View: https://testnet.monadscan.com/tx/0xabc...

@empowertours
```
**Embed:** Interactive link to `/passport?tokenId=42`

#### Music Mint Cast
```
🎵 New Music Master NFT Minted!

"My First Song" - Token #123
💰 License Price: 1 TOURS

⚡ Gasless minting powered by @empowertours
🎶 Purchase license to stream full track

View: https://testnet.monadscan.com/tx/0xdef...

@empowertours
```
**Embed:** Interactive link to `/music?tokenId=123`

#### Music Purchase Cast
```
🎶 Just Purchased a Music License on @empowertours!

Now I can stream "My First Song" 🎵

TX: https://testnet.monadscan.com/tx/0xghi...

Gasless - they paid the gas! 🚀

@empowertours
```

**How Casting Works:**
- ✅ **Non-blocking** - Cast failures don't affect mints
- ✅ **Automatic** - Posts immediately after successful transaction
- ✅ **Farcaster-native** - Uses Neynar SDK for reliable posting
- ✅ **User-visible** - Casts appear on user's Farcaster profile
- ✅ **Works everywhere** - Passport mints, music mints, music purchases all have casts

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

**Casting:**
- Neynar SDK (Farcaster API)
- Non-blocking async posting
- Unified casting endpoint

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
│   │   ├── bot-command/              # Bot command processor (UPDATED - with FID extraction)
│   │   ├── cast-nft/                 # NEW: Unified casting endpoint
│   │   ├── execute-delegated/        # Delegation transactions (UPDATED - with casting)
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

# Install Neynar SDK for casting
pnpm add @neynar/nodejs-sdk

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

## 📢 Casting Implementation (NEW!)

### What's New in This Update

We've added **automatic Farcaster casting** for all NFT operations:

1. **`app/api/cast-nft/route.ts`** (NEW)
   - Unified casting endpoint
   - Handles passport, music mint, and music purchase casts
   - Uses Neynar SDK for reliable posting

2. **`app/api/execute-delegated/route.ts`** (UPDATED)
   - Now posts casts after successful operations
   - Non-blocking casting (failures don't affect transactions)
   - Calls `/api/cast-nft` for each operation

3. **`app/api/bot-command/route.ts`** (UPDATED)
   - Extracts FID from Farcaster context
   - Passes FID to delegated operations
   - All commands now support casting

### Implementation Steps

#### Quick Start (5 minutes)

```bash
# 1. Install Neynar SDK (if not already done)
pnpm add @neynar/nodejs-sdk

# 2. Copy the new casting endpoint
# File: app/api/cast-nft/route.ts
# (See code section below)

# 3. Update bot-command to extract FID
# File: app/api/bot-command/route.ts
# (See code section below)

# 4. Update execute-delegated to call cast endpoint
# File: app/api/execute-delegated/route.ts
# (See code section below)

# 5. Build and test
pnpm build
pnpm dev

# 6. Deploy
git add .
git commit -m "feat: add farcaster casting for NFT operations"
git push origin main
```

### Code Implementation

#### 1. New Casting Endpoint: `app/api/cast-nft/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID || '';

export async function POST(req: NextRequest) {
  try {
    const {
      type,           // 'passport' | 'music_mint' | 'music_purchase'
      fid,            // Farcaster ID
      tokenId,        // NFT token ID
      txHash,         // Transaction hash
      countryCode,    // For passport
      countryName,    // For passport
      songTitle,      // For music
      price,          // For music
      artist,         // For music purchase
    } = await req.json();

    console.log('🎵 [CAST] Posting cast:', { type, fid, tokenId, countryCode, songTitle });

    if (!fid) {
      console.log('ℹ️ No FID provided, skipping cast');
      return NextResponse.json({ success: true, message: 'No FID provided' });
    }

    if (!BOT_SIGNER_UUID || !NEYNAR_API_KEY) {
      console.error('❌ Missing BOT_SIGNER_UUID or NEYNAR_API_KEY');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const client = new NeynarAPIClient({
      apiKey: NEYNAR_API_KEY,
    });

    let castText = '';
    let embeds: Array<{ url: string }> = [];

    // ==================== PASSPORT CAST ====================
    if (type === 'passport') {
      const castUrl = `${APP_URL}/passport?tokenId=${tokenId}`;
      castText = `🎫 New EmpowerTours Passport Minted!

${countryCode} ${countryName}

Token #${tokenId}

View: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: castUrl }];
      console.log('📢 Passport cast text:', castText);
    }

    // ==================== MUSIC MINT CAST ====================
    else if (type === 'music_mint') {
      const musicUrl = `${APP_URL}/music?tokenId=${tokenId}`;
      castText = `🎵 New Music Master NFT Minted!

"${songTitle || 'Untitled'}" - Token #${tokenId}
💰 License Price: ${price || '1'} TOURS

⚡ Gasless minting powered by @empowertours
🎶 Purchase license to stream full track

View: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: musicUrl }];
      console.log('📢 Music mint cast text:', castText);
    }

    // ==================== MUSIC PURCHASE CAST ====================
    else if (type === 'music_purchase') {
      castText = `🎶 Just Purchased a Music License on @empowertours!

Now I can stream "${songTitle || 'Untitled'}" 🎵

TX: https://testnet.monadscan.com/tx/${txHash}

Gasless - they paid the gas! 🚀

@empowertours`;

      console.log('📢 Music purchase cast text:', castText);
    }

    if (!castText) {
      return NextResponse.json(
        { success: false, error: `Unknown cast type: ${type}` },
        { status: 400 }
      );
    }

    // ==================== POST TO FARCASTER ====================
    console.log('📤 Publishing cast with Neynar SDK...');
    const result = await client.publishCast({
      signerUuid: BOT_SIGNER_UUID,
      text: castText,
      embeds: embeds.length > 0 ? embeds : undefined,
    });

    console.log('✅ Cast posted successfully:', {
      hash: result.cast?.hash,
      type,
      tokenId,
    });

    return NextResponse.json({
      success: true,
      castHash: result.cast?.hash,
      type,
      tokenId,
    });

  } catch (error: any) {
    console.error('❌ [CAST] Error:', error.message);
    // Don't return error status - casting failures shouldn't block mints
    return NextResponse.json({
      success: false,
      error: error.message,
      message: 'Cast posting failed but mint succeeded'
    }, { status: 200 }); // Return 200 so client doesn't treat it as a failure
  }
}
```

#### 2. Updated Bot Command: `app/api/bot-command/route.ts`

Key changes to add FID extraction and passing:

```typescript
// ✅ NEW: Helper to extract FID from Farcaster context
function extractFidFromRequest(req: NextRequest): string | null {
  const farcasterContext = req.headers.get('x-farcaster-context');
  if (farcasterContext) {
    try {
      const context = JSON.parse(farcasterContext);
      return context.user?.fid?.toString() || null;
    } catch (e) {
      // Ignore parsing errors
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { command, userAddress, location } = await req.json();
    
    // ✅ NEW: Extract FID from context
    const fid = extractFidFromRequest(req);
    
    console.log('Bot command received:', { command, userAddress, fid });

    // ... rest of bot command handler ...

    // ==================== MINT PASSPORT COMMAND (WITH CAST) ====================
    if (lowerCommand.includes('mint passport')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        console.log('[BOT] Minting passport for:', userAddress);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }

        let countryCode = 'US';
        let countryName = 'United States';
        try {
          const geoRes = await fetch(`${APP_URL}/api/geo`, {
            headers: {
              'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
              'x-real-ip': req.headers.get('x-real-ip') || '',
              'cf-connecting-ip': req.headers.get('cf-connecting-ip') || '',
            }
          });
          const geoData = await geoRes.json();
          countryCode = geoData.country || 'US';            
          countryName = geoData.country_name || 'United States';
        } catch (geoErr) {
          console.warn('Location detection failed, using default');
        }

        const mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'mint_passport',
            params: {
              countryCode,
              countryName,
              fid // ✅ PASS FID FOR CASTING
            }
          })
        });

        const mintData = await mintRes.json();
        if (!mintData.success) {
          throw new Error(mintData.error || 'Mint failed');
        }
        
        console.log('[BOT] Passport minted:', mintData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintData.txHash,
          action: 'transaction',
          message: `Passport Minted (FREE)!
${countryCode} ${countryName}
TX: ${mintData.txHash?.slice(0, 10)}...
Gasless transaction - we paid the gas!
View: https://testnet.monadscan.com/tx/${mintData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Passport mint error:', error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`
        });
      }
    }

    // ==================== BUY MUSIC COMMAND (GASLESS VIA DELEGATION + CAST) ====================
    if (lowerCommand.includes('buy music') || lowerCommand.includes('buy song')) {
      console.log('Action: buy_music');
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      
      const tokenIdMatch = lowerCommand.match(/buy (?:music|song) (\d+)/);
      let tokenId = tokenIdMatch ? parseInt(tokenIdMatch[1]) : null;
      let songTitle = null;
      
      if (!tokenId) {
        const songNameMatch = originalCommand.match(/buy song (.+)/i);
        if (songNameMatch) {
          const searchSongName = songNameMatch[1].trim();
          console.log(`[BOT] Searching for song: "${searchSongName}"`);
          
          try {
            const searchQuery = `
              query SearchMusicByName($name: String!) {
                MusicNFT(
                  where: {name: {_ilike: $name}}
                  limit: 1
                  order_by: {mintedAt: desc}
                ) {
                  id
                  tokenId
                  name
                  price
                  artist
                }
              }
            `;
            
            const searchRes = await fetch(ENVIO_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: searchQuery,
                variables: { name: `%${searchSongName}%` }
              })
            });
            
            if (!searchRes.ok) {
              throw new Error(`GraphQL query failed with status ${searchRes.status}`);
            }
            
            const searchData = await searchRes.json();
            const musicNFT = searchData.data?.MusicNFT?.[0];
            
            if (!musicNFT) {
              return NextResponse.json({
                success: false,
                message: `Song "${searchSongName}" not found. Try: "buy music <tokenId>" or browse on /discover`
              });
            }
            
            tokenId = parseInt(musicNFT.tokenId);
            songTitle = musicNFT.name;
            console.log(`[BOT] Found song "${songTitle}" with tokenId: ${tokenId}`);
          } catch (searchErr: any) {
            console.error('[BOT] Song search error:', searchErr);
            return NextResponse.json({
              success: false,
              message: `Failed to search for song: ${searchErr.message}`
            });
          }
        }
      }
      
      if (!tokenId) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "buy music <tokenId>" or "buy song <Song Name>"'
        });
      }
      
      try {
        console.log(`[BOT] Buying music license for token ${tokenId}`);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        const hasValidDelegation = delegationData.success &&
                                  delegationData.delegation &&
                                  Array.isArray(delegationData.delegation.permissions) &&
                                  delegationData.delegation.permissions.includes('buy_music');
        if (!hasValidDelegation) {
          console.warn('[BOT] No delegation with buy_music permission - creating one...');
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['buy_music', 'swap_mon_for_tours', 'send_tours', 'mint_passport', 'mint_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }
        
        const buyRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'buy_music',
            params: {
              tokenId: tokenId.toString(),
              songTitle: songTitle,
              fid // ✅ PASS FID FOR CASTING
            }
          })
        });
        
        const buyData = await buyRes.json();
        if (!buyData.success) {
          throw new Error(buyData.error || 'Purchase failed');
        }
        
        console.log('Music purchased:', buyData.txHash);
        return NextResponse.json({
          success: true,
          txHash: buyData.txHash,
          action: 'buy_music',
          message: `Music License Purchased (FREE)!
Track #${tokenId} is now yours!
TX: ${buyData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${buyData.txHash}`
        });
      } catch (error: any) {
        console.error('Buy music failed:', error);
        return NextResponse.json({
          success: false,
          message: `Purchase failed: ${error.message}`
        });
      }
    }

    // ==================== MINT MUSIC COMMAND (WITH CAST) ====================
    if (lowerCommand.includes('mint music')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        const regex = /mint[_ ]music\s+(.+?)\s+(ipfs:\/\/[a-zA-Z0-9]{46,})\s+([\d.]+)/i;
        const match = originalCommand.match(regex);
        
        if (!match) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `Music NFT Minting
To mint music, use:
"mint music <Song Name> <ipfs://metadata> <price>"
Example:
"mint music My First Song ipfs://QmXXX... 1"
Or go to the Music page to upload files.`
          });
        }
        
        const songTitle = match[1].trim();
        const tokenURI = match[2];
        const price = parseFloat(match[3]);

        const cid = tokenURI.replace('ipfs://', '');
        if (!cid.startsWith('Qm') && !cid.startsWith('bafy')) {
          return NextResponse.json({
            success: false,
            message: `Invalid IPFS CID format: ${cid}. Must start with Qm or bafy`
          });
        }

        if (price <= 0 || price > 10) {
          return NextResponse.json({
            success: false,
            message: 'Invalid price. Use: 0.001 - 10 TOURS'
          });
        }

        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['mint_music', 'mint_passport', 'swap_mon_for_tours', 'send_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }
        
        const mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'mint_music',
            params: {
              songTitle,
              tokenURI,
              price: price.toString(),
              fid // ✅ PASS FID FOR CASTING
            }
          })
        });

        const mintData = await mintRes.json();
        if (!mintData.success) {
          throw new Error(mintData.error || 'Mint failed');
        }

        console.log('[BOT] Music NFT minted:', mintData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintData.txHash,
          action: 'transaction',
          message: `Music NFT Minted (FREE)!
Song: ${songTitle}
Price: ${price} TOURS per license
TX: ${mintData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${mintData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Music mint error:', error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`
        });
      }
    }

    // ... rest of bot command handler ...
  } catch (error: any) {
    console.error('Bot command error:', error);
    return NextResponse.json({
      success: false,
      message: 'Error processing command. Please try again.'
    }, { status: 500 });
  }
}
```

#### 3. Updated Execute-Delegated: `app/api/execute-delegated/route.ts`

Key changes to post casts after operations:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { encodeFunctionData, parseEther, parseUnits, Address, Hex, parseAbi } from 'viem';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

// ✅ NEW: Helper function to post casts
async function postCast(castData: any) {
  try {
    console.log('📢 Posting cast:', castData.type);
    const castRes = await fetch(`${APP_URL}/api/cast-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(castData)
    });

    if (!castRes.ok) {
      const error = await castRes.text();
      console.warn('⚠️ Cast posting failed:', error);
      return;
    }

    const castData_ = await castRes.json();
    console.log('✅ Cast posted:', castData_.castHash);
  } catch (err: any) {
    console.warn('⚠️ Cast error (non-blocking):', err.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userAddress, action, params } = await req.json();
    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or action' },
        { status: 400 }
      );
    }

    console.log('🎫 [DELEGATED] Checking delegation for:', userAddress);
    const delegation = await getDelegation(userAddress);
    if (!delegation || delegation.expiresAt < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'No active delegation' },
        { status: 403 }
      );
    }

    if (!(await hasPermission(userAddress, action))) {
      return NextResponse.json(
        { success: false, error: `No permission for ${action}` },
        { status: 403 }
      );
    }

    if (delegation.transactionsExecuted >= delegation.config.maxTransactions) {
      return NextResponse.json(
        { success: false, error: 'Transaction limit reached' },
        { status: 403 }
      );
    }

    console.log('✅ Delegation valid, transactions left:',
      delegation.config.maxTransactions - delegation.transactionsExecuted);

    const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
    const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as Address;
    const MUSIC_NFT_V4 = '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6' as Address;
    const TOKEN_SWAP = process.env.TOKEN_SWAP_ADDRESS as Address;
    const MINT_PRICE = parseEther('10');

    switch (action) {
      // ==================== MINT PASSPORT (WITH CAST) ====================
      case 'mint_passport':
        console.log('🎫 Action: mint_passport (batched approve + mint)');
        const mintCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [PASSPORT_NFT, MINT_PRICE],
            }) as Hex,
          },
          {
            to: PASSPORT_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function mint(address to, string countryCode, string countryName, string region, string continent, string uri) external returns (uint256)'
              ]),
              functionName: 'mint',
              args: [
                userAddress as Address,
                params?.countryCode || 'US',
                params?.countryName || 'United States',
                params?.region || 'Americas',
                params?.continent || 'North America',
                params?.uri || '',
              ],
            }) as Hex,
          },
        ];

        console.log('💳 Executing batched mint transaction...');
        const mintTxHash = await sendSafeTransaction(mintCalls);
        console.log('✅ Mint successful, TX:', mintTxHash);

        // ✅ NEW: Post cast after successful mint
        if (params?.fid) {
          await postCast({
            type: 'passport',
            fid: params.fid,
            tokenId: params.tokenId || 0,
            txHash: mintTxHash,
            countryCode: params.countryCode || 'US',
            countryName: params.countryName || 'United States',
          });
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: mintTxHash,
          action,
          userAddress,
          message: `Passport minted successfully`,
        });

      // ==================== MINT MUSIC (WITH CAST) ====================
      case 'mint_music':
        console.log('🎵 Action: mint_music');
        if (!params?.tokenURI || !params?.price) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenURI or price for music mint' },
            { status: 400 }
          );
        }

        const musicPrice = parseEther(params.price.toString());
        const musicCalls = [
          {
            to: MUSIC_NFT_V4,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function mintMaster(address artist, string tokenURI, string songTitle, uint256 price) external returns (uint256)'
              ]),
              functionName: 'mintMaster',
              args: [
                userAddress as Address,
                params.tokenURI,
                params.songTitle || 'Untitled',
                musicPrice,
              ],
            }) as Hex,
          },
        ];

        console.log('💳 Executing music mint transaction...');
        const musicTxHash = await sendSafeTransaction(musicCalls);
        console.log('✅ Music mint successful, TX:', musicTxHash);

        // ✅ NEW: Post cast after successful mint
        if (params?.fid) {
          await postCast({
            type: 'music_mint',
            fid: params.fid,
            tokenId: params.tokenId || 0,
            txHash: musicTxHash,
            songTitle: params.songTitle || 'Untitled',
            price: params.price,
          });
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: musicTxHash,
          action,
          userAddress,
          songTitle: params.songTitle || 'Untitled',
          price: params.price,
          message: `Music NFT minted successfully: ${params.songTitle || 'Untitled'} at ${params.price} TOURS`,
        });

      // ==================== BUY MUSIC (WITH CAST) ====================
      case 'buy_music':
        console.log('🎵 Action: buy_music (batched approve + purchaseLicenseFor)');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for buy_music' },
            { status: 400 }
          );
        }

        const tokenId = BigInt(params.tokenId);
        const buyCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [MUSIC_NFT_V4, parseEther('1000')],
            }) as Hex,
          },
          {
            to: MUSIC_NFT_V4,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function purchaseLicenseFor(uint256 masterTokenId, address licensee) external'
              ]),
              functionName: 'purchaseLicenseFor',
              args: [tokenId, userAddress as Address],
            }) as Hex,
          },
        ];

        console.log('💳 Executing batched music purchase transaction...');
        const buyTxHash = await sendSafeTransaction(buyCalls);
        console.log('✅ Music purchase successful, TX:', buyTxHash);

        // ✅ NEW: Post cast after successful purchase
        if (params?.fid) {
          await postCast({
            type: 'music_purchase',
            fid: params.fid,
            tokenId: tokenId.toString(),
            txHash: buyTxHash,
            songTitle: params.songTitle || 'Track',
          });
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: buyTxHash,
          action,
          userAddress,
          tokenId: tokenId.toString(),
          message: `Music license purchased for ${userAddress}`,
        });

      // ==================== SEND TOURS ====================
      case 'send_tours':
        console.log('💸 Action: send_tours');
        if (!params?.recipient || !params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing recipient or amount for send_tours' },
            { status: 400 }
          );
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(params.recipient)) {
          return NextResponse.json(
            { success: false, error: 'Invalid recipient address' },
            { status: 400 }
          );
        }

        const sendAmount = parseEther(params.amount.toString());
        const sendCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [params.recipient as Address, sendAmount],
            }) as Hex,
          },
        ];

        console.log('💳 Executing TOURS transfer transaction...');
        const sendTxHash = await sendSafeTransaction(sendCalls);
        console.log('✅ TOURS sent successfully, TX:', sendTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: sendTxHash,
          action,
          userAddress,
          recipient: params.recipient,
          amount: params.amount,
          message: `Sent ${params.amount} TOURS successfully`,
        });

      // ==================== SWAP MON FOR TOURS ====================
      case 'swap_mon_for_tours':
        console.log('💱 Action: swap_mon_for_tours');
        const monAmount = params?.amount ? parseEther(params.amount) : parseEther('0.1');
        const swapCalls = [
          {
            to: TOKEN_SWAP,
            value: monAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function swap() external payable']),
              functionName: 'swap',
              args: [],
            }) as Hex,
          },
        ];

        console.log('💳 Executing swap transaction...');
        const swapTxHash = await sendSafeTransaction(swapCalls);
        console.log('✅ Swap successful, TX:', swapTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: swapTxHash,
          action,
          userAddress,
          monAmount: monAmount.toString(),
          message: `Swapped ${params?.amount || '0.1'} MON for TOURS successfully`,
        });

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('❌ [DELEGATED] Execution error:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to execute action',
        action: 'execute_delegated',
      },
      { status: 500 }
    );
  }
}
```

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
5. **Cast automatically posts to your profile!** 📢

#### 5. Buy Music License (Multiple Methods)

**Method 1: Via Bot Command (Easiest - Gasless + Cast)**
```bash
# By song name (natural language)
buy song Money making machine

# By token ID
buy music 1
```
✅ **Casts automatically post!**

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
- **Casts automatically notify your achievements!** 📢

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
- `buy song [song name]` - Finds song by name, initiates purchase (with cast!)
- `buy music [token ID]` - Purchases music license by token ID (with cast!)
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
    version: "1",
    name: "EmpowerTours",
    iconUrl: "/images/icon.png",
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
- **Alternative:** Use bot command `buy song [name]` for single-step purchase + automatic cast!

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

#### 9. Casts aren't posting
- **Check:** `BOT_SIGNER_UUID` is set in Railway
- **Check:** `NEXT_PUBLIC_NEYNAR_API_KEY` is valid
- **Solution:** Casting is non-blocking - mint still succeeds even if cast fails
- **Debug:** Check logs for "✅ Cast posted successfully"

### Debug Mode

Enable detailed logging:
```typescript
// In useFarcasterContext.tsx
console.log('🔄 SDK Context:', context);
console.log('💰 Wallet Address:', walletAddress);

// In bot command handler
console.log('🎵 Song search results:', searchResults);
console.log('📦 GraphQL Query:', query);

// Check casting in logs
console.log('📢 Posting cast:', castData);
console.log('✅ Cast posted:', castData_.castHash);
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
- ✅ Bot song name purchasing
- ✅ **Farcaster casting for all NFT operations** (NEW!)
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
- **Farcaster Casting:** ✅ Via Neynar SDK
- **Bot Commands:** 15+ (including song name purchases + automatic casts)

---

**Built with ❤️ for Monad Dev Cook-Off & Farcaster Community**

[⭐ Star on GitHub](https://github.com/empowertours/fcempowertours) | [🐛 Report Bug](https://github.com/empowertours/fcempowertours/issues) | [💡 Request Feature](https://github.com/empowertours/fcempowertours/issues)
