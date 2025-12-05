# Game Infrastructure Setup Guide

## Status Report

**Contracts Deployed & Funded ✅**
- Music Beat Match: `0xee83AC7E916f4feBDb7297363B47eE370FE2EC87` (100,002 TOURS)
- Country Collector: `0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200` (100,002 TOURS)

**Issue:** ❌ No Active Challenges

Both games require **active challenges** to be playable. Currently, there are none.

## Quick Diagnosis

Run this script to check current game status:
```bash
npx tsx scripts/check-game-contracts.ts
```

---

## 🎵 Music Beat Match Setup

### How It Works
- Daily challenge where users guess artist/song from audio snippet
- 24-hour window to submit guesses
- Rewards in TOURS tokens based on correct guesses

### Challenge Requirements

To create a new challenge, you need:

1. **Artist ID** (uint256) - Any music NFT token ID from your platform
2. **Song Title** (string) - Name of the song
3. **IPFS Audio Hash** (string) - 3-second audio clip on IPFS

### Creating a Challenge

#### Option 1: Using Deployer/Owner Account

```bash
# Set your deployer private key
export DEPLOYER_KEY="your_private_key_here"

# Run the challenge creation script
npx tsx scripts/create-beat-match-challenge.ts
```

**Customize the challenge in the script:**
```typescript
const artistId = 1n; // Use actual music NFT token ID
const songTitle = "Mystery Track of the Day";
const ipfsAudioHash = "QmYourIPFSHash"; // 3-second audio snippet
```

#### Option 2: Using Platform Safe (Keeper)

The keeper address is already set to Platform Safe: `0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20`

You can use the delegation system to call `createDailyChallenge` through Platform Safe.

### Challenge Lifecycle

1. **Create** - Keeper calls `createDailyChallenge(artistId, songTitle, ipfsHash)`
2. **Active** - 24 hours for users to play
3. **Finalize** - Keeper calls `finalizeChallenge(challengeId)` after 24h
4. **Repeat** - Create next day's challenge

### Automation Recommendation

Set up a daily cron job or keeper bot to:
- Create new challenge at midnight UTC
- Finalize previous challenge after 24 hours

---

## 🌍 Country Collector Setup

### How It Works
- Weekly challenge to collect artists from featured country
- Users complete all 3 featured artists to earn country badge
- 7-day window per challenge

### Challenge Requirements

To create a new weekly challenge:

1. **Country Name** (string) - Full country name like "Japan"
2. **Country Code** (string) - 2-letter ISO code like "JP"
3. **Artist IDs** ([3]uint256) - Array of exactly 3 artist token IDs

### Creating a Challenge

```typescript
// Example challenge data
const country = "Japan";
const countryCode = "JP";
const artistIds = [1, 2, 3]; // 3 music NFT token IDs from Japanese artists

// Call createWeeklyChallenge via keeper/owner
```

### Challenge Lifecycle

1. **Create** - Keeper calls `createWeeklyChallenge(country, countryCode, artistIds)`
2. **Active** - 7 days for users to complete artists
3. **Finalize** - Keeper calls `finalizeChallenge(challengeId)` after 7 days
4. **Repeat** - Create next week's challenge

---

## Contract Permissions

Both contracts use the **onlyKeeper** modifier for challenge creation:

**Authorized Addresses:**
- Owner: `0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9`
- Keeper: `0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20` (Platform Safe)

---

## Recommended Setup Steps

### Immediate (Manual Testing)

1. **Find Real Music NFTs**
   - Query your Envio indexer for actual minted music NFTs
   - Get token IDs, artist addresses, names

2. **Upload Audio Snippets**
   - Create 3-second audio clips
   - Upload to IPFS via Pinata
   - Get IPFS hashes

3. **Create Test Challenge**
   ```bash
   # Edit scripts/create-beat-match-challenge.ts with real data
   npx tsx scripts/create-beat-match-challenge.ts
   ```

4. **Test the Game**
   - Visit `/beat-match` page
   - Verify challenge displays
   - Submit test guesses

### Long-term (Production)

1. **Build Keeper Bot**
   - Automated service that creates daily/weekly challenges
   - Uses Platform Safe via delegation for gas-free ops
   - Pulls music data from your indexer

2. **Content Pipeline**
   - System to select featured music/artists
   - Audio processing for 3-second clips
   - IPFS upload automation

3. **Monitoring**
   - Track contract balances (need 1000 TOURS/day minimum)
   - Alert when challenges expire without replacement
   - Monitor player participation

---

## Adding Delegation Support

To make the games use gasless transactions for users:

### 1. Add to `execute-delegated` route

```typescript
// In app/api/execute-delegated/route.ts

case 'beat_match_submit_guess':
  // User submits guess using Platform Safe
  const { challengeId, artistId, songTitle } = params;

  calls = [{
    to: MUSIC_BEAT_MATCH_ADDRESS,
    value: 0n,
    data: encodeFunctionData({
      abi: MusicBeatMatchABI,
      functionName: 'submitGuess',
      args: [BigInt(challengeId), BigInt(artistId), songTitle],
    }),
  }];
  break;

case 'country_collector_complete':
  // User completes artist using Platform Safe
  const { weekId, artistId, passportId } = params;

  calls = [{
    to: COUNTRY_COLLECTOR_ADDRESS,
    value: 0n,
    data: encodeFunctionData({
      abi: CountryCollectorABI,
      functionName: 'completeArtist',
      args: [BigInt(weekId), BigInt(artistId), BigInt(passportId)],
    }),
  }];
  break;
```

### 2. Update Frontend

Replace direct contract writes with delegation API calls:

```typescript
// In app/beat-match/page.tsx
const handleSubmitGuess = async () => {
  const response = await fetch('/api/execute-delegated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userAddress: effectiveAddress,
      action: 'beat_match_submit_guess',
      params: { challengeId, artistId, songTitle }
    })
  });
};
```

---

## Funding & Economics

### Current Funding
- **Music Beat Match**: 100,002 TOURS
- **Country Collector**: 100,002 TOURS

### Daily Burn Rate
- Beat Match: ~1,000 TOURS/day (DAILY_POOL)
  - 10 TOURS base per correct guess
  - +5 TOURS speed bonus
  - +Level bonuses

- Country Collector: Varies by badge rewards

### Monitoring Balance

```bash
npx tsx scripts/check-game-contracts.ts
```

Watch for contracts dropping below 10,000 TOURS and refund as needed.

---

## Troubleshooting

### "No active challenge found"
- No challenges have been created yet
- Previous challenge expired (>24h for Beat Match, >7d for Collector)
- **Solution**: Create a new challenge

### "Not keeper or owner" error
- Your account is not authorized
- Use deployer key or Platform Safe
- **Solution**: Check DEPLOYER_KEY in .env.local

### "Challenge not active"
- Challenge ended (past endTime)
- Challenge was finalized
- **Solution**: Create new challenge

### Games display but can't submit
- Missing delegation support in execute-delegated
- Missing challenge data
- **Solution**: Check console logs, verify challenge is active

---

## Next Steps

1. ✅ Contracts deployed and funded
2. ❌ **Create initial challenges** (required for games to work)
3. ⏳ Add delegation support for gasless gameplay
4. ⏳ Build automated keeper bot
5. ⏳ Set up content pipeline for challenges

**Start here:** Create a test challenge with real music NFT data to verify everything works!
