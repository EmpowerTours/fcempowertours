# EmpowerTours - Farcaster Mini App

> **Travel Passport NFTs, Music Streaming & Licensing, and Social Experiences on Monad Mainnet**

[![Monad](https://img.shields.io/badge/Monad-Mainnet-purple)](https://monad.xyz)
[![Farcaster](https://img.shields.io/badge/Farcaster-Mini%20App-blue)](https://docs.farcaster.xyz)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

**Live App:** [https://fcempowertours-production-6551.up.railway.app](https://fcempowertours-production-6551.up.railway.app)

---

## What is EmpowerTours?

EmpowerTours is a Web3 platform built as a **Farcaster Mini App** combining travel passport NFTs, music streaming with NFT-based licensing, social experiences, and gasless transactions powered by Monad and Account Abstraction.

**Core Features:**
- Travel Passport NFTs for 195 countries with automatic geolocation
- Music NFT Licensing with artist master ownership + time-limited fan licenses
- Music streaming with play tracking and artist royalties
- Live radio streaming with real-time listener tracking
- AI-powered oracle for natural language blockchain interactions
- Gasless transactions through Safe Smart Accounts + Pimlico

---

## Key Features

### Travel Passport NFTs (195 Countries)

Mint digital passports with automatic geolocation detection. One per country per wallet, fully gasless.

**How It Works:**
1. User opens app and connects wallet
2. Geolocation detects country automatically
3. Mint button creates NFT (gasless via Safe + Pimlico)
4. SVG-based passport artwork generated on-chain
5. Cast automatically posts to Farcaster with country flag

### Music NFT Licensing System

Artists mint master NFTs they own forever, while fans buy renewable time-limited licenses to access tracks.

**Artist Flow:**
1. Upload preview (30s) + full track + cover art
2. Set license price in WMON
3. Mint Master NFT (gasless) - artist keeps ownership forever
4. Earn TOURS token rewards from streaming plays

**Fan Flow:**
1. Browse music by artist or search
2. Listen to 30-second preview
3. Buy license with WMON
4. Access full track immediately
5. Streaming plays are tracked on-chain, earn TOURS rewards

### Music Streaming & Play Tracking

On-chain play recording with artist royalty distribution via PlayOracleV2 contract.

### Live Radio

Real-time radio streaming with on-chain listener tracking via LiveRadio contract.

### Token Economy

**WMON (Wrapped Monad):** Used for all transactions - buying music licenses, subscriptions, marketplace purchases.

**TOURS Token:** Reward token earned from streaming plays, platform engagement, and artist royalties. Not used for purchases.

### AI Oracle

Natural language interface for blockchain interactions powered by Google Gemini.

### Delegation System (Gasless Transactions)

User-grants-permission model allowing gasless transactions for 24 hours (max 100 transactions) via Safe + Pimlico.

---

## Architecture

### Tech Stack

**Frontend:** Next.js 15 (App Router), React 18, TypeScript, TailwindCSS, Farcaster MiniApp SDK

**Smart Contracts:** Solidity, Foundry, OpenZeppelin (ERC-721, ERC-20), Safe Protocol

**Backend:** Next.js API Routes, Viem, Pimlico (UserOperation bundler)

**Storage:** IPFS (Pinata), Upstash Redis (delegation state)

**APIs:** Neynar (Farcaster), IPInfo (Geolocation), Google Gemini (AI)

### Smart Contracts (Monad Mainnet - Chain ID 143)

| Contract | Address | Purpose |
|----------|---------|---------|
| ToursToken | `0xf61F2b014e38FfEf66a3A0a8104D36365404f74f` | ERC-20 platform token |
| WMON | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` | Wrapped Monad |
| PassportNFT | `0xbd3F487D511c0d3772d14d6D4dE7e6584843dfc4` | Travel passport NFTs |
| EmpowerToursNFTV2 | `0xB9B3acf33439360B55d12429301E946f34f3B73F` | Music master NFTs |
| ItineraryNFT | `0x59414599d8e6B6E453c814f55e42Fd5aa3038949` | Travel itinerary NFTs |
| MusicSubscriptionV3 | `0x796eF7281A85D3ddf17eB96a7ED62B22BD2764fB` | Music subscription & licensing |
| PlayOracleV2 | `0x424b2a28EDd73cb8994390a33Fe00b3b6E09AEd8` | On-chain play recording |
| LiveRadio | `0x72Ddd7DBbD2af4DBfa4331D885Cfe68a82317B21` | Live radio streaming |
| Platform Safe | `0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA` | Treasury & platform operations |

---

## Getting Started

### Prerequisites
- Node.js 18+
- pnpm (or npm/yarn)
- Foundry (for smart contracts)

### Installation

```bash
git clone https://github.com/empowertours/fcempowertours.git
cd fcempowertours
pnpm install
```

### Environment Variables

Create a `.env.local` file with the required environment variables. Contact the team for the template.

### Development

```bash
pnpm dev
```

Access the app at http://localhost:3000

---

## Deployment

### Railway (Recommended)

```bash
railway login
railway link
railway up
```

---

## License

MIT License

---

## Support

- **Twitter:** [@empowertours](https://twitter.com/empowertours)
- **Farcaster:** @empowertours

---

**Built for Monad & Farcaster Community**
