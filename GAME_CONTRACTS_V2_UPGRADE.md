# Game Contracts V2 Upgrade Guide

## 🎯 Why V2 is Needed

### The Problem with V1
Both current game contracts use `msg.sender` internally, which breaks delegation:

```solidity
// V1 - When Platform Safe calls this, msg.sender = Platform Safe
function submitGuess(...) external {
    require(!hasPlayed[msg.sender][challengeId], "Already played");
    //                  ^^^^^^^^^^
    // This records Platform Safe as player, not the actual user!
}
```

**Result**: Platform Safe becomes the player, not the user. Stats, rewards, and streaks all go to wrong address.

### The Solution: V2 with Beneficiary Support

```solidity
// V2 - Caller specifies WHO is playing
function submitGuessFor(
    address beneficiary,  // ← The actual user!
    ...
) external {
    require(!hasPlayed[beneficiary][challengeId], "Already played");
    //                  ^^^^^^^^^^^
    // Now tracks the correct user!
}
```

---

## ✨ What's New in V2

### MusicBeatMatchV2

**New Features**:
1. ✅ **Delegation Support**: `submitGuessFor(beneficiary, ...)`
2. ✅ **Farcaster Username**: Can guess using @username instead of artist ID
3. ✅ **Backwards Compatible**: Old `submitGuess()` still works
4. ✅ **Dual Answer Checking**: Accepts either artist ID OR username

**New Functions**:
```solidity
// Primary (gasless via Platform Safe)
function submitGuessFor(
    address beneficiary,
    uint256 challengeId,
    uint256 guessedArtistId,
    string memory guessedSongTitle,
    string memory guessedUsername  // NEW!
) external nonReentrant;

// Legacy (users pay own gas)
function submitGuess(...) external;

// Updated challenge creation
function createDailyChallenge(
    uint256 artistId,
    string memory songTitle,
    string memory artistUsername,  // NEW!
    string memory ipfsAudioHash
) external;
```

### CountryCollectorV2

**New Features**:
1. ✅ **Delegation Support**: `completeArtistFor(beneficiary, ...)`
2. ✅ **Backwards Compatible**: Old `completeArtist()` still works

**New Functions**:
```solidity
// Primary (gasless via Platform Safe)
function completeArtistFor(
    address beneficiary,
    uint256 weekId,
    uint256 artistIndex,
    uint256 artistId
) external nonReentrant;

// Legacy (users pay own gas)
function completeArtist(...) external;
```

---

## 📦 Deployment Steps

### Step 1: Deploy V2 Contracts

```bash
cd contracts

# Deploy MusicBeatMatchV2
forge create contracts/MusicBeatMatchV2.sol:MusicBeatMatchV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \  # TOURS token
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"    # Platform Safe (keeper)

# Deploy CountryCollectorV2
forge create contracts/CountryCollectorV2.sol:CountryCollectorV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \  # TOURS token
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"    # Platform Safe (keeper)
```

**Save the deployed addresses!**

### Step 2: Fund New Contracts

```bash
# Transfer TOURS from old contracts to new ones (or fund fresh)

# Option A: Fund with new TOURS
# Transfer 100,000 TOURS to each contract

# Option B: Move from V1 to V2
# 1. Withdraw from V1 contracts
# 2. Transfer to V2 contracts
```

### Step 3: Update Environment Variables

```env
# .env.local
NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=0xNEW_ADDRESS_HERE
NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=0xNEW_ADDRESS_HERE

# Keep V1 addresses for reference
NEXT_PUBLIC_MUSIC_BEAT_MATCH=0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
NEXT_PUBLIC_COUNTRY_COLLECTOR=0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200
```

### Step 4: Update Gemini Keeper

The keeper needs to:
1. Fetch Farcaster username for artist
2. Pass username when creating challenges

**File**: `app/api/keeper/create-challenge/route.ts`

```typescript
// Add Neynar client to fetch usernames
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

const neynar = new NeynarAPIClient({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!
});

// In createBeatMatchChallengeWithGemini():
async function createBeatMatchChallengeWithGemini() {
  // ... fetch music ...

  const selectedMusic = musicNFTs[selection.index];

  // ✨ NEW: Get artist's Farcaster username
  const artistUsername = await getArtistUsername(selectedMusic.artist);

  // Create challenge with username
  const { request } = await publicClient.simulateContract({
    address: MUSIC_BEAT_MATCH_V2,
    abi: MusicBeatMatchV2ABI,
    functionName: 'createDailyChallenge',
    args: [
      artistId,
      songTitle,
      artistUsername,  // ✨ NEW!
      ipfsHash
    ],
  });
}

// Helper to get Farcaster username
async function getArtistUsername(artistAddress: string): Promise<string> {
  try {
    const users = await neynar.fetchBulkUsersByEthereumAddress([artistAddress]);
    if (users?.users?.length > 0) {
      return users.users[0].username;
    }
  } catch (error) {
    console.warn('Could not fetch username for', artistAddress);
  }
  // Fallback to truncated address
  return `${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}`;
}
```

### Step 5: Update Delegation API

**File**: `app/api/execute-delegated/route.ts`

Add cases for both games:

```typescript
// ==================== MUSIC BEAT MATCH ====================
case 'beat_match_submit_guess':
  console.log('🎵 Action: beat_match_submit_guess');

  if (!params?.challengeId || !params?.songTitle) {
    return NextResponse.json(
      { success: false, error: 'Missing challenge params' },
      { status: 400 }
    );
  }

  const MUSIC_BEAT_MATCH_V2 = process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2 as Address;

  const calls = [
    {
      to: MUSIC_BEAT_MATCH_V2,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function submitGuessFor(address beneficiary, uint256 challengeId, uint256 guessedArtistId, string guessedSongTitle, string guessedUsername) external'
        ]),
        functionName: 'submitGuessFor',
        args: [
          userAddress as Address,              // beneficiary
          BigInt(params.challengeId),
          BigInt(params.artistId || 0),
          params.songTitle,
          params.username || ''                // NEW: username guess
        ],
      }) as Hex,
    },
  ];

  const txHash = await executeTransaction(calls, userAddress as Address, 0n);

  return NextResponse.json({
    success: true,
    txHash,
    message: 'Guess submitted successfully!'
  });

// ==================== COUNTRY COLLECTOR ====================
case 'country_collector_complete':
  console.log('🌍 Action: country_collector_complete');

  if (!params?.weekId || !params?.artistIndex || !params?.artistId) {
    return NextResponse.json(
      { success: false, error: 'Missing parameters' },
      { status: 400 }
    );
  }

  const COUNTRY_COLLECTOR_V2 = process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR_V2 as Address;

  const collectorCalls = [
    {
      to: COUNTRY_COLLECTOR_V2,
      value: 0n,
      data: encodeFunctionData({
        abi: parseAbi([
          'function completeArtistFor(address beneficiary, uint256 weekId, uint256 artistIndex, uint256 artistId) external'
        ]),
        functionName: 'completeArtistFor',
        args: [
          userAddress as Address,              // beneficiary
          BigInt(params.weekId),
          BigInt(params.artistIndex),
          BigInt(params.artistId)
        ],
      }) as Hex,
    },
  ];

  const collectorTxHash = await executeTransaction(collectorCalls, userAddress as Address, 0n);

  return NextResponse.json({
    success: true,
    txHash: collectorTxHash,
    message: 'Artist completed!'
  });
```

### Step 6: Update Game Frontends

**Music Beat Match** (`app/beat-match/page.tsx`):

```typescript
// Replace direct contract write with delegation
const handleSubmitGuess = async () => {
  if (!selectedArtist || !guessReason.trim()) {
    setWriteError('Please select artist and provide reasoning');
    return;
  }

  try {
    // Check/create delegation
    const delegationRes = await fetch(`/api/delegation-status?address=${effectiveAddress}`);
    const delegationData = await delegationRes.json();

    const hasValidDelegation = delegationData.success &&
      delegationData.delegation &&
      Array.isArray(delegationData.delegation.permissions) &&
      delegationData.delegation.permissions.includes('beat_match_submit_guess');

    if (!hasValidDelegation) {
      const createRes = await fetch('/api/create-delegation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: effectiveAddress,
          durationHours: 24,
          maxTransactions: 100,
          permissions: [
            'mint_passport', 'mint_music', 'swap_mon_for_tours',
            'beat_match_submit_guess',  // Add this!
            'country_collector_complete'
          ]
        })
      });

      const createData = await createRes.json();
      if (!createData.success) {
        throw new Error('Failed to create delegation');
      }
    }

    // Submit guess via delegation
    const response = await fetch('/api/execute-delegated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: effectiveAddress,
        action: 'beat_match_submit_guess',
        params: {
          challengeId: challenge.id,
          artistId: selectedArtist,
          songTitle: guessReason,
          username: guessUsername || ''  // NEW: allow username guessing
        }
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit guess');
    }

    const result = await response.json();
    setShowSubmitSuccess(true);
    console.log('Guess submitted!', result.txHash);

  } catch (err: any) {
    setWriteError(err.message || 'Submission failed');
  }
};
```

**Country Collector** (`app/country-collector/page.tsx`):

```typescript
const handleCompleteArtist = async (artistIndex: number, artistId: number) => {
  try {
    // Similar delegation check...

    const response = await fetch('/api/execute-delegated', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: effectiveAddress,
        action: 'country_collector_complete',
        params: {
          weekId: challenge.id,
          artistIndex,
          artistId
        }
      })
    });

    const result = await response.json();
    console.log('Artist completed!', result.txHash);

  } catch (err: any) {
    console.error('Failed:', err);
  }
};
```

---

## 🧪 Testing

### Test V2 Contracts

```bash
# 1. Deploy to testnet
# 2. Fund with TOURS
# 3. Create test challenge via keeper

# 4. Test delegation
curl -X POST https://yourapp.com/api/execute-delegated \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0xUSER_ADDRESS",
    "action": "beat_match_submit_guess",
    "params": {
      "challengeId": 0,
      "artistId": 1,
      "songTitle": "Test Song",
      "username": "@artist"
    }
  }'

# 5. Verify on blockchain
# - Check user's stats updated
# - Check rewards sent to user
# - Check Platform Safe paid gas
```

---

## 📊 Migration Checklist

### Phase 1: Deploy V2 (No User Impact)
- [ ] Deploy MusicBeatMatchV2
- [ ] Deploy CountryCollectorV2
- [ ] Fund contracts with TOURS
- [ ] Update env variables
- [ ] Verify on MonadScan

### Phase 2: Update Backend
- [ ] Update Gemini keeper to fetch usernames
- [ ] Update keeper to use V2 contracts
- [ ] Add delegation cases to execute-delegated
- [ ] Test delegation API

### Phase 3: Update Frontend
- [ ] Update beat-match page to use delegation
- [ ] Update country-collector page to use delegation
- [ ] Update contract ABIs
- [ ] Test end-to-end gameplay

### Phase 4: Go Live
- [ ] Deploy to production
- [ ] Run keeper to create first V2 challenge
- [ ] Test with real users
- [ ] Monitor transactions

### Phase 5: Deprecate V1 (Optional)
- [ ] Withdraw remaining TOURS from V1
- [ ] Update docs to reference V2 only
- [ ] Archive V1 contracts

---

## 🎮 User Experience Comparison

### Before V2 (Broken)
```
User clicks "Submit Guess"
  ↓
Platform Safe submits to V1 contract
  ↓
Contract records Platform Safe as player ❌
  ↓
Platform Safe gets stats/rewards ❌
  ↓
User gets nothing ❌
```

### After V2 (Working!)
```
User clicks "Submit Guess"
  ↓
Platform Safe calls submitGuessFor(user, ...)
  ↓
Contract records USER as player ✅
  ↓
USER gets stats/rewards ✅
  ↓
Platform Safe only pays gas ✅
```

### Bonus: Farcaster Username Support
```
Before: "Guess Artist ID: 42" (confusing)
After:  "Guess Artist: @coolartist" (intuitive!)
```

---

## 🚀 Summary

### What V2 Adds
1. ✅ **Delegation support** - Platform Safe can act on behalf of users
2. ✅ **Farcaster usernames** - Better UX for guessing
3. ✅ **Backwards compatible** - Old functions still work
4. ✅ **Proper attribution** - Stats/rewards go to correct user

### Files Created
- `/contracts/contracts/MusicBeatMatchV2.sol`
- `/contracts/contracts/CountryCollectorV2.sol`
- `GAME_CONTRACTS_V2_UPGRADE.md` (this file)

### Next Steps
1. Deploy V2 contracts
2. Update .env variables
3. Update keeper for usernames
4. Add delegation to API
5. Update frontends
6. **Games fully working!** 🎉

---

## 💡 Quick Deploy Script

```bash
#!/bin/bash

# Quick deployment script
echo "🚀 Deploying Game Contracts V2..."

# Deploy contracts
BEAT_MATCH_V2=$(forge create contracts/MusicBeatMatchV2.sol:MusicBeatMatchV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20" \
  --json | jq -r '.deployedTo')

echo "✅ MusicBeatMatchV2: $BEAT_MATCH_V2"

COLLECTOR_V2=$(forge create contracts/CountryCollectorV2.sol:CountryCollectorV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20" \
  --json | jq -r '.deployedTo')

echo "✅ CountryCollectorV2: $COLLECTOR_V2"

# Update .env
echo "
NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=$BEAT_MATCH_V2
NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=$COLLECTOR_V2
" >> .env.local

echo "🎉 Deployment complete! Update your Railway/Vercel env vars."
```

Ready to deploy? 🚀
