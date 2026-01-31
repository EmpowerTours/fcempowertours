# EmpowerTours - Farcaster Mini App

> **Travel Passports, Music Streaming, Live Radio, Rock Climbing, DAO Governance, and Social Experiences on Monad**

[![Monad](https://img.shields.io/badge/Monad-Mainnet-purple)](https://monad.xyz)
[![Farcaster](https://img.shields.io/badge/Farcaster-Mini%20App-blue)](https://docs.farcaster.xyz)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

**Live App:** [https://fcempowertours-production-6551.up.railway.app](https://fcempowertours-production-6551.up.railway.app)
**Farcaster:** [https://farcaster.xyz/miniapps/83hgtZau7TNB/empowertours](https://farcaster.xyz/miniapps/83hgtZau7TNB/empowertours)

---

## What is EmpowerTours?

EmpowerTours is a comprehensive Web3 platform built as a **Farcaster Mini App** on Monad. It combines travel passport NFTs, music streaming with NFT-based licensing, live community radio, rock climbing adventures, DAO governance, event sponsorship, AI-powered interactions, and fully gasless transactions through Account Abstraction.

---

## Features

### Travel Passport NFTs (195 Countries)

Mint digital passports with automatic geolocation detection. One per country per wallet, fully gasless.

1. User opens app and connects wallet
2. Geolocation detects country automatically
3. Mint creates on-chain SVG passport NFT (gasless via Safe + Pimlico)
4. Cast automatically posts to Farcaster with country flag

### Music NFT Licensing

Artists mint master NFTs they own forever. Fans buy renewable time-limited licenses to access full tracks.

**Artist Flow:** Upload preview (30s) + full track + cover art, set license price in WMON, mint Master NFT (gasless), earn TOURS rewards from streaming plays.

**Fan Flow:** Browse and preview tracks, buy license with WMON, stream full tracks with on-chain play tracking.

### Music Streaming & Play Tracking

On-chain play recording with artist royalty distribution via PlayOracleV2 contract. Streaming plays earn TOURS rewards for both artists and listeners.

### Live Radio

Community radio station with on-chain listener tracking via LiveRadio contract.

- **Queue Songs** - Pay WMON to add licensed tracks to the live radio queue
- **Voice Shoutouts** - Record and broadcast 3-5 second voice notes (WMON)
- **Skip to Random** - On-chain random song skip powered by Pyth Entropy (1 MON)
- **Listener Rewards** - Earn TOURS tokens for tuning in

### Rock Climbing Adventures (ClimbingLocationsV2)

Web3-powered rock climbing community with dual NFT system.

- **Create Locations** - Build climbing routes with GPS coordinates, photos, and descriptions (35 WMON)
- **Purchase Access Badges** - Buy access to climbing locations at creator-set WMON prices (AccessBadge NFT)
- **Journal Climbs** - Log ascents with photos and earn 1-10 TOURS rewards (ClimbProof NFT via Pyth Entropy)
- **Cross-Platform** - Works in both Farcaster Mini App and Telegram Bot

### DAO Governance

Decentralized governance for platform decisions and content moderation.

- **TOURS to vTOURS** - Wrap TOURS tokens into voting-enabled vTOURS
- **Delegation** - Delegate voting power to yourself or other community members
- **Proposals** - Create and vote on governance proposals (100 vTOURS threshold)
- **Content Moderation** - DAO members vote to burn stolen/infringing NFTs
- **Parameters** - 1 day voting delay, 1 week voting period, 4% quorum, 2 day timelock

### Event Sponsorship

Create and sponsor community events with on-chain accountability.

- **Create Events** - Host events with check-in codes and invite links
- **Sponsorship** - Brands sponsor events with WMON escrow
- **Verification Voting** - Checked-in attendees vote on whether sponsor was mentioned
- **Auto-Settlement** - Funds released to host or refunded to sponsor based on vote outcome

### Experiences & Itineraries

- **Experiences** - Create and purchase location-based experiences as NFTs
- **Itinerary NFTs** - AI-generated travel itineraries minted on-chain
- **Itinerary Market** - Browse and purchase community itineraries

### AI Oracle

Natural language interface powered by Google Gemini for blockchain interactions. Chat with the oracle to mint passports, check balances, explore music, and interact with all platform features.

### MirrorMate

Social matching system for tour guide discovery and community connections.

### Daily Lottery

On-chain lottery with automated daily drawings and winner announcements.

### Delegation System (Gasless Transactions)

User-grants-permission model allowing gasless transactions for 24 hours (max 100 transactions) via Safe Smart Accounts + Pimlico bundler. All platform actions are gasless for delegated users.

---

## Token Economy

**WMON (Wrapped Monad):** Used for all payments - music licenses, radio queue, location creation, experience purchases, event sponsorship.

**TOURS Token:** Reward token earned from streaming plays, journal entries, listener rewards, and platform engagement. Wrappable to vTOURS for governance voting.

**MON:** Native Monad token used for Pyth Entropy randomness (Skip to Random, journal rewards).

---

## Architecture

### Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 18, TypeScript, TailwindCSS |
| Platform | Farcaster Mini App SDK, Telegram Bot (Python) |
| Smart Contracts | Solidity, Foundry, OpenZeppelin (ERC-721, ERC-20, Governor) |
| Account Abstraction | Safe Protocol, Pimlico (ERC-4337 UserOp bundler) |
| Backend | Next.js API Routes (68 endpoints), Viem |
| Indexing | Envio (GraphQL event indexing) |
| Storage | IPFS (Pinata), Upstash Redis |
| AI | Google Gemini |
| Randomness | Pyth Entropy |
| APIs | Neynar (Farcaster), IPInfo (Geolocation), Google Maps |

### Smart Contracts (Monad - Chain ID 143)

| Contract | Address | Purpose |
|----------|---------|---------|
| ToursToken | `0xf61F2b014e38FfEf66a3A0a8104D36365404f74f` | ERC-20 platform reward token |
| WMON | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` | Wrapped Monad (payment token) |
| PassportNFT | `0xbd3F487D511c0d3772d14d6D4dE7e6584843dfc4` | Travel passport NFTs (195 countries) |
| EmpowerToursNFTV2 | `0xB9B3acf33439360B55d12429301E946f34f3B73F` | Music master NFTs |
| ItineraryNFT | `0x59414599d8e6B6E453c814f55e42Fd5aa3038949` | AI-generated travel itinerary NFTs |
| MusicSubscriptionV3 | `0x796eF7281A85D3ddf17eB96a7ED62B22BD2764fB` | Music subscription & licensing |
| PlayOracleV2 | `0x424b2a28EDd73cb8994390a33Fe00b3b6E09AEd8` | On-chain play recording & royalties |
| LiveRadio | `0x72Ddd7DBbD2af4DBfa4331D885Cfe68a82317B21` | Live radio streaming & queue |
| ClimbingLocationsV2 | `0x23e45acc278B5c9D1ECc374b39b7d313E781CBc3` | Rock climbing locations, badges & proofs |
| Platform Safe | `0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA` | Treasury & platform operations |

### Companion Services

| Service | Purpose |
|---------|---------|
| [EmpowerTours Bot](https://t.me/AI_RobotExpert_bot) | Telegram bot for rock climbing & TOURS rewards |
| [Envio Indexer](./empowertours-envio/) | GraphQL event indexing for all contracts |
| [Cron Service](./cron-service/) | Scheduled tasks (lottery, cleanup) |

---

## Project Structure

```
fcempowertours/
├── app/
│   ├── api/                    # 68 API route directories (210 route files)
│   │   ├── execute-delegated/  # Gasless delegated transactions (core)
│   │   ├── oracle/             # AI Oracle (Gemini)
│   │   ├── live-radio/         # Radio streaming
│   │   ├── climbing/           # Rock climbing locations
│   │   ├── events/             # Event management
│   │   ├── sponsorship/        # Event sponsorship
│   │   ├── lottery/            # Daily lottery
│   │   ├── music/              # Music catalog
│   │   ├── mint-passport/      # Passport minting
│   │   ├── mint-music/         # Music NFT minting
│   │   ├── record-play/        # Play tracking
│   │   └── ...
│   ├── components/
│   │   └── oracle/             # 19 UI components
│   │       ├── LiveRadioModal.tsx
│   │       ├── DAOModal.tsx
│   │       ├── RockClimbingModal.tsx
│   │       ├── MusicPlaylist.tsx
│   │       ├── MusicSubscriptionModal.tsx
│   │       ├── PassportMintModal.tsx
│   │       ├── EventOracle.tsx
│   │       ├── MirrorMate.tsx
│   │       └── ...
│   ├── experiences/            # Experience pages
│   ├── oracle/                 # AI Oracle page
│   ├── dashboard/              # User dashboard
│   └── ...                     # 25+ page routes
├── contracts/                  # Solidity smart contracts
├── empowertours-envio/         # Envio indexer config
├── cron-service/               # Scheduled tasks
├── lib/                        # Shared utilities & ABIs
└── public/                     # Static assets
```

---

## Getting Started

### Prerequisites
- Node.js 18+
- npm
- Foundry (for smart contracts)

### Installation

```bash
git clone https://github.com/empowertours/fcempowertours.git
cd fcempowertours
npm install
```

### Environment Variables

Create a `.env.local` file with the required environment variables. See `.env.example` or contact the team.

### Development

```bash
npm run dev
```

Access the app at http://localhost:3000

### Build

```bash
npm run build
```

### Smart Contract Development

```bash
forge build
forge test
```

---

## Deployment

Deployed on **Railway** with automatic builds from GitHub.

```bash
railway login
railway link
railway up
```

---

## Roadmap

See [empowertours-dev-studio](https://github.com/EmpowerTours/empowertours-dev-studio) for upcoming DAO governance, smart contract factory, and AI-assisted development tools.

---

## Links

- **Live App:** [fcempowertours-production-6551.up.railway.app](https://fcempowertours-production-6551.up.railway.app)
- **Farcaster Mini App:** [farcaster.xyz/miniapps/83hgtZau7TNB/empowertours](https://farcaster.xyz/miniapps/83hgtZau7TNB/empowertours)
- **Telegram Bot:** [t.me/AI_RobotExpert_bot](https://t.me/AI_RobotExpert_bot)
- **Portfolio:** [empowertours.xyz](https://empowertours.xyz)
- **X:** [@EmpowerTours](https://x.com/EmpowerTours)

---

**Built on Monad for the Farcaster Community**
