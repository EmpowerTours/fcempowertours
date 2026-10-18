# EmpowerTours: music and art on Monad, as a Farcaster Mini App

> Artists mint their music and art as NFTs and keep **90% of every licence sale**, paid straight to their wallet in the same transaction. Listeners subscribe, stream and tune into a live community radio. Plays are recorded on chain, and a monthly pool pays artists by play count. A DigitalPassport NFT records the countries you have been to and the artists you discovered. Gas is sponsored.

[![Monad](https://img.shields.io/badge/Monad-Mainnet%20(143)-purple)](https://monad.xyz)
[![Farcaster](https://img.shields.io/badge/Farcaster-Mini%20App-blue)](https://docs.farcaster.xyz)
[![Next.js](https://img.shields.io/badge/Next.js-15-black)](https://nextjs.org)

**Live app:** [art.empowertours.xyz](https://art.empowertours.xyz) (canonical domain)
**Farcaster:** [farcaster.xyz/miniapps/83hgtZau7TNB/empowertours](https://farcaster.xyz/miniapps/83hgtZau7TNB/empowertours)
**Railway URL:** [fcempowertours-production-6551.up.railway.app](https://fcempowertours-production-6551.up.railway.app)

---

## Status

Last verified against Monad mainnet, the running deployment, and this code on **2026-10-18**.
Every figure below was read from the chain or the live site. When something is off, this README says so.

| | |
|---|---|
| **Live** | Music and art minting (standard and collector editions) · licence sales with a 90/10 split · licence resale by signed link · subscriptions and monthly artist payouts · on-chain play tracking · listener WMON rewards · Live Radio (queue, skip, voice notes, tips) · artist names and avatars (ProfileRegistry) · electronic press kits (EPK) · DigitalPassport NFTs and discovery stamps · passkey, Farcaster and browser wallets · gas sponsorship through per-user Safes |
| **Built, not used yet** | EPK booking deposits (0 bookings) · subscription referrals (funded with 10 WMON, nothing owed) · venue player for businesses (off-chain, key-gated) |
| **Sunset** | **TOURS rewards for listeners and artists.** No TOURS is earned or paid anywhere in the app (see [TOURS](#tours-sunset)) |
| **Not wired** | vTOURS and DAO governance · VenueRegistry contract · TOURS swap and send handlers (server code only, no UI) |
| **Not built** | Self-recorded and attested show stamps · rotating show QR · PassportNFTV5 · moving contract governance to the 2-of-3 Safe |
| **Removed** | Event sponsorship, itineraries and experiences, rock-climbing UI, Dev Studio, AI vaults, coinflip and lottery, music staking |

---

## What works now, and how to use it

### For artists

**Mint a work** (`/nft`, or **Create NFT** on the home screen). There are four types:

| Type | What you upload | Extras |
|---|---|---|
| Music NFT | Cover art, 30 s preview, full track | none |
| Collector Edition Music NFT | Cover art, audio | AI-enhanced collector cover (Gemini), 1–1,000 editions, 5 WMON creation fee |
| Art NFT | Cover art | none |
| Collector Edition Art NFT | Your art | 1-of-1 up to 1,000 editions, no AI, no extra fee |

You set the licence price in WMON (prices under 1 WMON are allowed) and, for collector editions, a collector price. Minting is gasless. Masters are held on `LicenseRegistry` with you as the artist.

**Get paid.** Each licence sale pays you **90%** in the same transaction; 10% goes to the platform treasury (`SalesController.treasuryFeeBps = 1000`, read on chain). Monthly subscription payouts are claimed from **Unclaimed Payouts** in your profile (gas-sponsored).

**Set your name.** Wallet-only artists (no Farcaster account) register a display name and avatar on `ProfileRegistry`. Names are unique, at most 32 bytes, and the avatar can be changed once every 30 days. Farcaster artists are named from Farcaster.

**Publish a press kit** from your profile. It gets a public page at `/epk/{slug}` (for example [`/epk/earvin-gallardo`](https://art.empowertours.xyz/epk/earvin-gallardo)) with live streaming stats, a PDF download and a **Book Now** form. "Generate Press Kit" (5 WMON) drafts the bio, genres and riders with Gemini, using your Farcaster profile and on-chain stats, for you to review. The kit is pinned to IPFS and registered on `EPKRegistryV2`; you sign it with your own wallet.

**Your public page:** `/artist/{address}` lists your catalogue with buy buttons.

### For listeners and fans

- **Discover and buy** (`/discover`, home screen): preview any track, buy a 30-day licence in WMON, then stream the full track.
- **Resell a licence by link:** set a price and sign an order off chain (free). Whoever opens the link and pays gets the licence. There is no marketplace board. The artist's royalty comes off the resale price automatically: **50%** on a standard licence, **7.5%** on a limited edition (`SalesController`, read on chain). Orders expire after 30 days, and the only way to cancel one is to spend its nonce.
- **Subscribe:** Daily 15 · Weekly 75 · Monthly 300 · Yearly 3,000 WMON (`MusicSubscriptionV6`). Only plays by subscribers count toward artist payouts.
- **Live Radio:** queue a track (1 WMON; free for licence holders), skip to a random track (1 WMON), send a voice shoutout (0.5 WMON) or tip an artist (100% to the artist). Queue fees split 70% artist, 15% platform Safe, 15% platform wallet (`LiveRadioV3`).
- **Listener rewards are paid in WMON**, not TOURS: 20% of subscription revenue goes into a reserve that the hourly keeper distributes to subscribed listeners by listening points.
- **Referrals:** share a link. When someone subscribes through it, you earn 30% of the platform's 10% fee on each of their payments for 365 days (`SubscriptionReferrals`). This is paid from the platform's cut, never the artist's, and claimed by you. Commission accrues only while the referral pool is funded.

### DigitalPassport

- **Mint a passport** for the country you are in (`/passport`). There are 195 countries, one per country per wallet. The mint costs **150 WMON** and the gas is sponsored (`PassportNFTV4`). The artwork is an on-chain-generated engraved document, stored on IPFS over `https://`.
- **Discovery stamps:** the first time you hear an artist, the play oracle stamps your passport with that artist. That's one stamp per listener per artist, ever.
- **Climb stamps** come from the separate EmpowerTours Telegram dapp through `/api/climb-stamp`.

### Wallets and gas

| Where you open it | Wallet |
|---|---|
| Inside a Farcaster client | Farcaster embedded wallet (`@farcaster/miniapp-wagmi-connector`) |
| Any browser | **EmpowerTours passkey wallet** (Mera): Face ID or fingerprint, no seed phrase or extension. The relying party is `empowertours.xyz` with a fixed ecosystem salt, so the same passkey gives the same address on every EmpowerTours app. `/wallet/backup` shows the standard 24-word phrase, which imports into any wallet. |
| Any browser | Other wallets through RainbowKit |

User actions run from a **per-user Safe**, and gas is paid by the platform through Pimlico (ERC-4337). You grant a delegation once (24 h, up to 100 transactions), and the platform then submits the transactions for you. Actions that move value require proof that you own the address: a Farcaster Quick Auth token or a wallet signature.

### Other pages

- `/dashboard`: live chain dashboard (NFTs, passports, purchases).
- `/oracle`: AI assistant (Gemini) for browsing and actions.
- `/monad-sync`: Farcaster-only signature mini app (open in a Farcaster client).
- `/venue/{id}`: background-music player for businesses. It needs a venue API key and an active subscription, and it records plays through the oracle. Venues are kept in the app's database, not on chain.

---

## TOURS (sunset)

**TOURS rewards are sunset. Listening, voice notes, streaks and artist activity earn no TOURS, and the app has no TOURS balance, claim or swap UI.** Everything users earn or spend settles in **WMON**.

Facts, read on chain on 2026-10-18:

- `ToursTokenV2` (`0x45b76a127167fD7FC7Ed264ad490144300eCfcBF`) remains deployed: "EmpowerTours Token V2", symbol TOURS, 100B supply, a standard transferable ERC-20.
- `ToursRewardManagerV2` (`0x056452a44d81AB502e24510b2e4FB1789C6faf85`) holds 1,000,000 TOURS and has **distributed 0**.
- `MusicSubscriptionV6` is **not** an authorised distributor.
- Known gap: `LiveRadioV3` and `VenueRegistry` are still authorised distributors and the manager is not paused. Closing it fully on chain takes an owner transaction (`setDistributor(…, false)` or `pause()`).

vTOURS and DAO governance were never wired: `VotingTOURS.totalSupply() = 0`, `MusicSubscriptionV6.daoTimelock() = 0x0`, and there is no voting UI.

---

## Contracts (Monad mainnet, chain 143)

### In use by the app

| Contract | Address | Purpose |
|---|---|---|
| LicenseRegistry | [`0x42EbcD44C2295702130f0A641633c691bA5f9480`](https://monadscan.com/address/0x42EbcD44C2295702130f0A641633c691bA5f9480) | V3 masters and licences (ERC-721, ERC-2981) |
| SalesController | [`0xf824D444AAf251EB2197836FFb218d48927F8cB1`](https://monadscan.com/address/0xf824D444AAf251EB2197836FFb218d48927F8cB1) | Minting authorisation, pricing, the 90/10 split, signed resale |
| MusicSubscriptionV6 | [`0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B`](https://monadscan.com/address/0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B) | Subscriptions, 70/20/10 monthly split, artist payouts |
| SubscriptionReferrals | [`0x5A1c34124eF5b4eC09Bdf0da5b2cbaEE5BE409B3`](https://monadscan.com/address/0x5A1c34124eF5b4eC09Bdf0da5b2cbaEE5BE409B3) | Referral commission from the platform fee |
| ListenerRewardPool | [`0x98c07c35Cc99F0f78b60f001157B5aeC5e2051A7`](https://monadscan.com/address/0x98c07c35Cc99F0f78b60f001157B5aeC5e2051A7) | Monthly WMON rewards for listeners |
| PlayOracleV3 | [`0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf`](https://monadscan.com/address/0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf) | On-chain play recording, anti-spam, passport stamping |
| LiveRadioV3 | [`0x042EDF80713e6822a891e4e8a0800c332B8200fd`](https://monadscan.com/address/0x042EDF80713e6822a891e4e8a0800c332B8200fd) | Radio queue, skips, voice notes, tips |
| ProfileRegistry | [`0xf4C27308f2183E7Cb07c32FAF449a259831E16EC`](https://monadscan.com/address/0xf4C27308f2183E7Cb07c32FAF449a259831E16EC) | Display names, avatars and bios for wallet-only artists |
| EPKRegistryV2 | [`0x232D2fF45459e9890ABA3a95e5E0c73Fe85D621D`](https://monadscan.com/address/0x232D2fF45459e9890ABA3a95e5E0c73Fe85D621D) | Press kits and WMON booking escrow |
| PassportNFTV4 | [`0x4D5533e29Cf190131885Dc7Dbef22e31F4252410`](https://monadscan.com/address/0x4D5533e29Cf190131885Dc7Dbef22e31F4252410) | DigitalPassport NFTs and stamps |
| WMON | [`0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`](https://monadscan.com/address/0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A) | Payment token |
| Platform Safe | [`0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA`](https://monadscan.com/address/0xf3b9D123E7Ac8C36FC9B5AB32135c665956725bA) | Treasury and gas sponsorship (2-of-3 Safe) |

### Deployed, not used (sunset or never wired)

| Contract | Address | State |
|---|---|---|
| ToursTokenV2 (TOURS) | [`0x45b76a127167fD7FC7Ed264ad490144300eCfcBF`](https://monadscan.com/address/0x45b76a127167fD7FC7Ed264ad490144300eCfcBF) | Sunset; see above |
| ToursRewardManagerV2 | [`0x056452a44d81AB502e24510b2e4FB1789C6faf85`](https://monadscan.com/address/0x056452a44d81AB502e24510b2e4FB1789C6faf85) | Sunset; 0 distributed |
| VenueRegistry | [`0x73264a3570e35dAed1Adc2ec83A502E2517a43B5`](https://monadscan.com/address/0x73264a3570e35dAed1Adc2ec83A502E2517a43B5) | Not wired; no venues registered |
| VotingTOURS (vTOURS) | [`0xe5377b1f90b9a70dd7b0f6ea34f9c3d287b3c44c`](https://monadscan.com/address/0xe5377b1f90b9a70dd7b0f6ea34f9c3d287b3c44c) | Not wired; supply 0 |
| EmpowerToursGovernor | [`0x4d05fb8c2d090769a084aa0138ccf7a549452fa3`](https://monadscan.com/address/0x4d05fb8c2d090769a084aa0138ccf7a549452fa3) | Not wired |
| EmpowerToursTimelock | [`0x4f7f9111215f2270a92bd64e4c1e9d7de516bd79`](https://monadscan.com/address/0x4f7f9111215f2270a92bd64e4c1e9d7de516bd79) | Not wired |

### Deprecated (superseded or feature removed)

| Contract | Address | Replaced by / reason |
|---|---|---|
| EmpowerToursNFTV2 | [`0xB9B3acf33439360B55d12429301E946f34f3B73F`](https://monadscan.com/address/0xB9B3acf33439360B55d12429301E946f34f3B73F) | LicenseRegistry + SalesController (V3) |
| MusicSubscriptionV5 | [`0x5372aD0291a69c1EBc0BE2dc6DE9dab224045f19`](https://monadscan.com/address/0x5372aD0291a69c1EBc0BE2dc6DE9dab224045f19) | MusicSubscriptionV6 |
| EmpowerTours Passport V3 | [`0x93126e59004692B01961BE505aa04F55d5bd1851`](https://monadscan.com/address/0x93126e59004692B01961BE505aa04F55d5bd1851) | PassportNFTV4 (legacy passports migrate) |
| PassportNFTV4 (first deploy) | `0x86312a8332a457EbcD3475820AE8AFbcFE032900` | Redeployed the same day; do not use |
| ItineraryNFTV2 | [`0x97529316356A5bcAd81D85E9a0eF941958c4b020`](https://monadscan.com/address/0x97529316356A5bcAd81D85E9a0eF941958c4b020) | Itineraries removed |
| ClimbingLocationsV2 | [`0x23e45acc278B5c9D1ECc374b39b7d313E781CBc3`](https://monadscan.com/address/0x23e45acc278B5c9D1ECc374b39b7d313E781CBc3) | Climbing UI removed |
| DAOContractFactory | [`0x627a2c457e5Eb3E9C4B6632Ac69f8c39228D7968`](https://monadscan.com/address/0x627a2c457e5Eb3E9C4B6632Ac69f8c39228D7968) | Dev Studio removed |
| DeploymentNFT | [`0xfA002C7538B6e28Dd7dDd00F1d3A46Ea0731A586`](https://monadscan.com/address/0xfA002C7538B6e28Dd7dDd00F1d3A46Ea0731A586) | Dev Studio removed |
| EmpowerToursDevStudio | [`0xEC27aD035c39DE7217A3F4DAe64a7a67a477d880`](https://monadscan.com/address/0xEC27aD035c39DE7217A3F4DAe64a7a67a477d880) | Dev Studio removed |
| TOURS V1 | `0xf61F2b01…f74f` | Superseded by ToursTokenV2 |

**Governance:** all live contracts except EPKRegistryV2 are owned or governed by a single EOA (`0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1`), which also signs the keepers. Moving governance to the 2-of-3 Platform Safe is planned and not done. Four of the V3 contracts use a two-step transfer (`setGovernance` then `acceptGovernance`).

---

## How the money flows

**Licence sale:** `price` → treasury `price × 10%` → the artist receives the rest (90%) in the same transaction. Example: a 35 WMON licence pays the artist 31.5 WMON and the treasury 3.5 WMON. Splits are read from the contract, never hardcoded (`lib/artist-cut.ts`, `tools/verify-payout-splits-come-from-chain.ts`).

**Subscription month:** revenue accrues per 30-day period (`block.timestamp / 30 days`, not calendar months). At finalization it splits **70% artist pool / 20% reserve / 10% treasury**. Each artist's payout is `(artist plays / total plays) × artist pool`, claimed by the artist (pull). A month with revenue but **zero plays can never be finalized**; the finalize keeper warns while that is still fixable.

**Plays:** a play counts only if the listener holds an active subscription. The path is `/api/live-radio` → `PlayOracleV3.recordPlay` → `MusicSubscriptionV6`. Anti-spam rules: at least 30 s per play, a 5-minute replay cooldown, at most 500 plays per user per day, at most 100 per song per user per day. The radio shuffle never repeats the previous track, because a repeat inside the cooldown would record no play.

**EPK booking:** an organizer deposits WMON into escrow. The deposit moves Pending → Confirmed → Completed (released to the artist), or is Refunded or Cancelled before confirmation.

### Automated keepers

These run hourly from `.github/workflows/keeper.yml` (GitHub Actions, not Railway cron), in sequence, all protected by `KEEPER_SECRET`:

| Route | Does |
|---|---|
| `/api/cron/top-up-safe` | Unwraps WMON to MON when the platform Safe drops below 10 MON, topping up to 25 |
| `/api/cron/finalize-month` | Finalizes ended months that are ready; reports stranded ones |
| `/api/cron/distribute-listener-rewards` | Moves the 20% reserve into the ListenerRewardPool and sets listener points |

The first two accept `?dry=1`. The radio has no server timer: listening clients call `/api/live-radio/tick` every 15 s, and a Redis lock prevents double-advancing.

---

## Known issues

- `/discover` shows "Invalid Date" for track dates, and `/dashboard` shows passport mint dates as 1970.
- `/artist/{address}` shows the address instead of the Farcaster name for some artists, and its "+10% Royalties" label does not match the actual splits (90% primary; 50% / 7.5% resale).
- `/tweaks` (EmpowerTweaks) renders placeholder data; no contract is deployed. `/block-party` renders blank.
- `/api/sponsorship/*` routes remain from the removed sponsorship feature and return errors.
- `cron-service/` still references the removed coinflip route and an old default URL.
- Quick Auth is verified but not enforced (`ENFORCE_QUICK_AUTH` is not `true`). Value-moving actions are separately gated on proof of address ownership.

## Planned, not built

- **Show stamps:** self-recorded stamps (the deployed passport already allows the holder to stamp), then attested stamps signed by the artist, with a rotating QR at the door and per-artist pre-paid gas. See `TODO.md`.
- **PassportNFTV5:** signature-verified stamps paid by the holder, refusal of empty tokenURIs, and cheaper stamps. The source is in `contracts/`; it is not deployed.
- **Governance:** move ownership of all live contracts to the 2-of-3 Platform Safe.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 18.3, TypeScript (strict), TailwindCSS |
| Platform | Farcaster Mini App SDK, RainbowKit + wagmi, Mera passkeys |
| Contracts | Solidity, Foundry, OpenZeppelin |
| Account abstraction | Safe Protocol, Pimlico (ERC-4337) |
| Backend | Next.js API routes (111 route files), viem |
| Data | Chain reads (the Envio indexer has been retired), Upstash Redis, IPFS (Pinata) |
| AI | Google Gemini (Oracle, collector art, EPK drafts) |
| Randomness | Pyth Entropy (radio) |
| APIs | Neynar (Farcaster), IPInfo (geolocation) |

## Project structure

```
fcempowertours/
├── app/                 # routes (27 pages) and API handlers (app/api, 111 route files)
│   ├── api/execute-delegated/   # gasless delegated actions (core)
│   ├── api/live-radio/          # radio state, tick, scheduler, plays
│   ├── api/epk/                 # press kits: create, generate, lookup, booking, PDF
│   ├── api/cron/                # keeper endpoints
│   ├── epk/[identifier]/        # public press kit pages
│   ├── artist/[address]/        # public artist pages
│   ├── licence/[token]/         # resale offer links
│   └── passport/ profile/ discover/ nft/ dashboard/ wallet/ venue/
├── lib/                 # shared logic, ABIs, passkey wallet (lib/passkey)
├── contracts/           # Solidity (v3/ holds LicenseRegistry, SalesController, ProfileRegistry, SubscriptionReferrals)
├── tools/               # repo invariants (tools/verify-*.ts) and browser checks (tools/e2e)
├── cron-service/        # legacy scheduler service
├── docs/                # design notes; GitHub Pages site (docs/index.html)
└── public/              # static assets
```

---

## Getting started

### Prerequisites
- Node.js 20+ and npm 10+
- Foundry (for contracts)

### Installation

```bash
git clone https://github.com/EmpowerTours/fcempowertours.git
cd fcempowertours
npm install
```

### Environment variables

Create a `.env.local` with the required variables (contract addresses as `NEXT_PUBLIC_*`, RPC, Neynar, Pinata, Upstash, Pimlico, Gemini, keeper secrets). Contact the team for values. Contract addresses are listed above.

### Development

```bash
npm run dev          # next dev on 0.0.0.0, http://localhost:3000
npm run typecheck    # tsc --noEmit
npm run lint
```

### Build

```bash
npm run build        # next build, then copies static/ and public/ into .next/standalone (both steps are required)
npm start            # standalone server on PORT (default 8080)
```

### Checks

```bash
.claude/verify.sh                                     # the gate: forge tests, typecheck, lint, invariants
VERIFY_SKIP_BUILD=0 VERIFY_SKIP_E2E=0 .claude/verify.sh   # full run incl. build and browser checks
npm run test:e2e                                      # browser checks only
```

### Smart contract development

```bash
forge build
forge test
```

---

## Deployment

Deployed on **Railway** with automatic builds from GitHub: every push to `main` redeploys the app. Scheduled jobs run from GitHub Actions (`.github/workflows/keeper.yml`). The GitHub Pages site deploys only when `docs/` changes.

```bash
railway login
railway link
railway up
```

### Contracts

The deploy scripts take their signer **from the command line**, never from a key
in the environment. `vm.startBroadcast()` is called with no argument, so forge
supplies it:

```bash
# encrypted keystore, passphrase typed at the prompt
forge script script/DeployV3.s.sol --account <name> --rpc-url monad --broadcast

# or a hardware wallet, where the key never leaves the device
forge script script/DeployV3.s.sol --ledger --rpc-url monad --broadcast
```

Nothing reads a private key from `.env`. `tools/verify-deploy-signer-from-cli.ts`
fails the build if a script goes back to reading one.

The deployer ADDRESS is still needed before broadcasting, for governance
defaults and logging, and comes from `vm.envOr("DEPLOYER_ADDRESS", msg.sender)`
(a public address is safe in `.env`).

Contract verification needs `ETHERSCAN_API_KEY` in the environment, or set
directly in `contracts/foundry.toml`, which is gitignored. It is used only by
`--verify` and cannot sign anything. `contracts/verify.sh` wraps verification for Monad.

---

## Links

- **Live app:** [art.empowertours.xyz](https://art.empowertours.xyz)
- **Farcaster Mini App:** [farcaster.xyz/miniapps/83hgtZau7TNB/empowertours](https://farcaster.xyz/miniapps/83hgtZau7TNB/empowertours)
- **Telegram dapp (climb stamps):** [t.me/AI_RobotExpert_bot](https://t.me/AI_RobotExpert_bot)
- **Portfolio:** [empowertours.xyz](https://empowertours.xyz)
- **X:** [@EmpowerTours](https://x.com/EmpowerTours)

## License

Proprietary. See [`LICENSE`](./LICENSE).

---

**Built on Monad | Farcaster Mini App**
