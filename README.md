# fcempowertours: Farcaster Mini App for EmpowerTours

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Next.js](https://img.shields.io/badge/Next.js-15.0.0-black.svg)](https://nextjs.org/)
[![Farcaster Mini App](https://img.shields.io/badge/Farcaster-Mini%20App-blue.svg)](https://miniapps.farcaster.xyz/)
[![Monad Testnet](https://img.shields.io/badge/Monad-Testnet-green.svg)](https://monad.xyz/)

## Overview

**fcempowertours** is a Farcaster Mini App developed for the Monad Dev Cook Off. It seamlessly integrates blockchain functionality with social features on the Farcaster protocol, enabling users to mint and manage Passport NFTs, Music NFTs, and purchase travel itineraries on the Monad Testnet (chainId: 10143). Built with Next.js, the app leverages Wagmi and Viem for wallet interactions, Envio for indexing blockchain data, and Pinata for IPFS storage.

This app empowers users to:
- View their profile with MON and TOURS token balances, Passport NFTs, Music NFTs, and purchased itineraries.
- Explore artist profiles, preview music tracks, and purchase licenses directly.
- Interact with the Monad Testnet using Warpcast's custody wallet (mobile) or MetaMask (desktop).

**Live Demo**: [fcempowertours-production-6551.up.railway.app](https://fcempowertours-production-6551.up.railway.app) (Open in Warpcast for the full Mini App experience)

**Repository**: [GitHub - EmpowerTours/fcempowertours](https://github.com/EmpowerTours/fcempowertours)

## Features

- **User Profile**: Displays MON and TOURS balances, Passport NFTs, Music NFTs, and itineraries with paginated views for large collections.
- **Artist Profile**: Browse an artist's music catalog, preview tracks (30s clips), and purchase licenses for 0.01 ETH each, with 10% royalties paid to the artist.
- **Wallet Integration**: Supports Warpcast's custody wallet on mobile and MetaMask on desktop, with automatic detection and user-friendly connection prompts.
- **Blockchain Interactions**: Mint NFTs, purchase licenses, and switch to the Monad Testnet using Wagmi and Viem.
- **Data Indexing**: Queries on-chain data (Passports, Music NFTs, Itineraries) via Envio's GraphQL API.
- **IPFS Storage**: Stores audio files and metadata on IPFS via Pinata Gateway.
- **Responsive Design**: Features gradient backgrounds, shadow effects, and touch-optimized buttons for a smooth experience in Warpcast.

## Tech Stack

- **Frontend**: Next.js 15.0.0, React 18.3.1
- **Blockchain**: Wagmi 2.18.1, Viem 2.38.3, Ethers 6.15.0
- **Farcaster Integration**: @farcaster/miniapp-sdk 0.2.1, @farcaster/miniapp-wagmi-connector 1.1.0
- **Styling**: Tailwind CSS 4.1.14, Lucide Icons, Radix UI components
- **Data**: Envio GraphQL, Pinata IPFS
- **Other**: Tanstack React Query for data fetching, Framer Motion for animations

## Prerequisites

Before running the app, ensure you have:
- **Node.js** 18+ and Yarn installed
- A Farcaster account (for testing in Warpcast)
- A Monad Testnet wallet with MON tokens (use a testnet faucet for gas fees)
- An Envio GraphQL endpoint for indexing (provided by the Monad team or self-hosted)
- Pinata API keys for IPFS uploads (optional, for new content)

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/EmpowerTours/fcempowertours.git
   cd fcempowertours
