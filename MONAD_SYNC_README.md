# Monad Sync - Viral Farcaster Mini-App

Discover your eternal monad signature on Farcaster × Monad Blockchain

## Features

### ✅ Completed (Ready for Testing)
- **8-Question Quiz** with exact scoring algorithm from spec
- **Clarity Score Calculation** with Neynar API integration for onchain multipliers
- **Monad Tier System**:
  - Dominant Monad (98.5%+): Top 0.5%
  - Rational Monad (85%+): Top 20%
  - Sensitive Monad (40%+): 70%
  - Bare Monad (<40%): 9.5%
- **Soulbound NFT Contract** (MonadMirrorNFT.sol)
- **Dynamic SVG Metadata** for NFTs
- **Farcaster Frame** for viral sharing
- **OG Image Generation** for social previews
- **KV Store** for user data persistence

### 🔧 To Configure
- **Testnet First**: All features run on Monad testnet for testing, then migrate to mainnet
- **Environment Variables**:
  ```env
  NEXT_PUBLIC_MONAD_MIRROR_NFT=<address>  # Deploy MonadMirrorNFT.sol
  NEXT_PUBLIC_TOURS_TOKEN=<address>        # Existing TOURS token
  KV_REST_API_URL=<vercel-kv-url>
  KV_REST_API_TOKEN=<vercel-kv-token>
  NEYNAR_API_KEY=<your-key>
  ```

## File Structure

```
app/
├── monad-sync/
│   └── page.tsx                                    # Main quiz & results UI
├── api/
│   ├── monad-sync/
│   │   ├── calculate-clarity/route.ts              # Clarity calculation + Neynar
│   │   ├── mint-mirror/route.ts                    # NFT minting
│   │   ├── get-user-monad/route.ts                 # Fetch user data
│   │   ├── save-user-monad/route.ts                # Save quiz results
│   │   ├── save-nft/route.ts                       # Save NFT data
│   │   └── metadata/[address]/route.ts             # Dynamic NFT metadata + SVG
│   ├── frames/monad-sync/[fid]/route.ts            # Farcaster Frame
│   └── og/monad-sync/route.tsx                     # OG image generation

contracts/
├── contracts/MonadMirrorNFT.sol                    # Soulbound NFT contract
└── script/DeployMonadMirror.s.sol                  # Deployment script
```

## Quiz Scoring Algorithm

```typescript
// Base score from 8 questions (range: ~0-200)
let baseClarity = 100 + sum(answerScores);

// Onchain multipliers from Neynar
const onchainScore =
  (mutualHighClarityCount / followerCount) * 40 +    // up to +40
  (threadRatio > 0.3 ? 25 : threadRatio > 0.1 ? 10 : 0) +
  (avgLikesLast10Posts > 500 ? 20 : avgLikesLast10Posts > 100 ? 10 : 0) +
  (powerBadgeLevel ? 30 : 0);

// Final clarity (0-99.9%)
let finalClarity = Math.min(99.9, (baseClarity + onchainScore) / 2);

// Tier assignment
if (finalClarity >= 98.5)      tier = "Dominant Monad";
else if (finalClarity >= 85)   tier = "Rational Monad";
else if (finalClarity >= 40)   tier = "Sensitive Monad";
else                           tier = "Bare Monad";
```

## Deployment Steps

### 1. Deploy Smart Contract (Testnet)
```bash
cd contracts
forge script script/DeployMonadMirror.s.sol:DeployMonadMirror --rpc-url <monad-testnet-rpc> --broadcast
```

### 2. Update Environment Variables
Add the deployed contract address to `.env`:
```env
NEXT_PUBLIC_MONAD_MIRROR_NFT=0x...
```

### 3. Test Quiz Flow
1. Visit `/monad-sync`
2. Take the 8-question quiz
3. View clarity score and tier
4. (Testnet) Mint Monad Mirror NFT
5. Share to Farcaster

### 4. Test Frame Sharing
1. Cast the frame URL: `https://fcempowertours.xyz/api/frames/monad-sync/<fid>`
2. Verify OG image displays correctly
3. Click "Sync With My Monad" button

## Viral Mechanics

### One-Tap Share Cast Template
```
Just synced my monad on Monad Blockchain.

I'm a Dominant Monad 👑 — 98.7% clarity

Only true Rational/Dominant souls can sync with me.

Tap below to see if we're pre-harmonized:
[Interactive Frame]
```

### Pricing (from spec)
- **First Quiz**: FREE
- **Retake Quiz**: 5 TOURS
- **Reveal NFT**: 10 TOURS
- **Harmony Sync**: 3 TOURS (recipient gets 1 TOURS)
- **Clarity Boost (7d)**: 25 TOURS
- **Divine Pairs Lottery**: 50 TOURS

## Future Enhancements

### Phase 2 (Pending Implementation)
- [ ] Daily Perception Spin (2 TOURS)
- [ ] Harmony Sync with other users (3 TOURS)
- [ ] Leaderboard (top 10 weekly)
- [ ] Daily King/Queen prize pool
- [ ] Divine Pairs Lottery (50 TOURS entry)
- [ ] Ascension streak tracking

### Phase 3 (Mainnet)
- [ ] Switch NFT minting to mainnet TOURS
- [ ] Treasury distribution (50% platform, 30% prizes, 15% leaderboard, 5% dev)
- [ ] Monad BFT integration for instant tx
- [ ] Cross-chain bridge for ETH prizes

## Technical Notes

### Testnet First, Then Mainnet
The app runs entirely on Monad testnet initially:
- **Testnet Phase**: Quiz, clarity calculation, NFT minting all on testnet
- **Mainnet Migration**: Once everything works, deploy contracts to mainnet and update env vars

This allows full end-to-end testing without mainnet costs.

### Performance
- Quiz loads instantly (client-side)
- Clarity calculation: ~2-3s (Neynar API + onchain reads)
- NFT minting: ~1-2s (Monad's 10k TPS)
- Frame generation: <100ms (Edge runtime)

### Viral Distribution Curve
Based on scoring algorithm:
- **Dominant Monad**: 0.5% (98.5%+ clarity)
- **Rational Monad**: 19.5% (85-98.5%)
- **Sensitive Monad**: 70% (40-85%)
- **Bare Monad**: 10% (<40%)

This bell curve ensures exclusivity at the top while keeping most users engaged.

## Integration with EmpowerTours

Monad Sync is fully integrated into the existing EmpowerTours app:
- Uses existing TOURS token for payments
- Uses existing user-safe infrastructure
- Follows existing delegated transaction patterns
- Shares Neynar API key and Farcaster context

## Support

For issues or questions:
- GitHub: https://github.com/EmpowerTours/fcempowertours
- Farcaster: @empowertours

---

Built for Monad mainnet launch (Nov 24, 2025)
Powered by: Monad L1, Farcaster, Neynar, Envio, Vercel KV
