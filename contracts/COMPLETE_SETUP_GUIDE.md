# ✅ Complete Setup Guide: Railway + Frontend Integration

## 📦 What You Have Now

**5 Deployed & Verified Contracts on Monad Testnet:**
- ✅ ActionBasedDemandSignal: `0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E`
- ✅ ItineraryNFT: `0x5B61286AC88688fe8930711fAa5b1155e98daFe8`
- ✅ MusicBeatMatch: `0xee83AC7E916f4feBDb7297363B47eE370FE2EC87`
- ✅ CountryCollector: `0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200`
- ✅ TandaPool: `0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B`

---

## 🚂 PART 1: Railway Configuration (3 minutes)

### Step 1A: Add Variables via Railway Dashboard

1. Go to **https://railway.app/project/your-project**
2. Click your service
3. Go to **"Variables"** tab
4. Click **"New Variable"** and paste each line:

```bash
NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E
NEXT_PUBLIC_ITINERARY_NFT=0x5B61286AC88688fe8930711fAa5b1155e98daFe8
NEXT_PUBLIC_MUSIC_BEAT_MATCH=0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
NEXT_PUBLIC_COUNTRY_COLLECTOR=0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200
NEXT_PUBLIC_TANDA_POOL=0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B
```

Railway will auto-deploy. Wait 2-3 minutes.

### Step 1B: Verify Variables

After deployment, check logs or visit this test endpoint (create it):

```typescript
// pages/api/config.ts
export default function handler(req, res) {
  res.json({
    musicBeatMatch: process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH,
    tandaPool: process.env.NEXT_PUBLIC_TANDA_POOL,
    // ... etc
  });
}
```

---

## 💻 PART 2: Frontend Code Updates (15 minutes)

### Step 2A: Extract ABIs

```bash
cd contracts

# Create ABI directory
mkdir -p ../your-frontend-directory/src/abis

# Extract ABIs
forge inspect ActionBasedDemandSignal abi > ../your-frontend-directory/src/abis/ActionBasedDemandSignal.json
forge inspect ItineraryNFT abi > ../your-frontend-directory/src/abis/ItineraryNFT.json
forge inspect MusicBeatMatch abi > ../your-frontend-directory/src/abis/MusicBeatMatch.json
forge inspect CountryCollector abi > ../your-frontend-directory/src/abis/CountryCollector.json
forge inspect TandaPool abi > ../your-frontend-directory/src/abis/TandaPool.json

# Create index file
echo "export { default as ActionBasedDemandSignalABI } from './ActionBasedDemandSignal.json';
export { default as ItineraryNFTABI } from './ItineraryNFT.json';
export { default as MusicBeatMatchABI } from './MusicBeatMatch.json';
export { default as CountryCollectorABI } from './CountryCollector.json';
export { default as TandaPoolABI } from './TandaPool.json';" > ../your-frontend-directory/src/abis/index.ts
```

### Step 2B: Update Contract Config

**File:** `src/config/contracts.ts`

```typescript
// Contract addresses
export const CONTRACTS = {
  // NEW Mini-App Contracts
  musicBeatMatch: process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH as `0x${string}`,
  countryCollector: process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR as `0x${string}`,
  tandaPool: process.env.NEXT_PUBLIC_TANDA_POOL as `0x${string}`,
  itineraryNFT: process.env.NEXT_PUBLIC_ITINERARY_NFT as `0x${string}`,
  demandSignal: process.env.NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL as `0x${string}`,

  // Existing
  tours: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7' as `0x${string}`,
  passport: '0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163' as `0x${string}`,
};

// Verify all addresses loaded
export function checkContractsLoaded() {
  const missing = Object.entries(CONTRACTS)
    .filter(([_, addr]) => !addr || addr === 'undefined')
    .map(([name]) => name);

  if (missing.length > 0) {
    console.error('❌ Missing contracts:', missing);
    return false;
  }

  console.log('✅ All contracts loaded');
  return true;
}
```

### Step 2C: Create Wagmi/Viem Hook Example

**File:** `src/hooks/useMusicBeatMatch.ts`

```typescript
import { useContractRead, useContractWrite, useWaitForTransaction } from 'wagmi';
import { CONTRACTS } from '@/config/contracts';
import { MusicBeatMatchABI } from '@/abis';

export function useMusicBeatMatch(userAddress?: `0x${string}`) {
  // Read current challenge
  const { data: challenge, refetch } = useContractRead({
    address: CONTRACTS.musicBeatMatch,
    abi: MusicBeatMatchABI,
    functionName: 'getCurrentChallenge',
    watch: true,
  });

  // Get user stats
  const { data: stats } = useContractRead({
    address: CONTRACTS.musicBeatMatch,
    abi: MusicBeatMatchABI,
    functionName: 'getPlayerStats',
    args: [userAddress!],
    enabled: !!userAddress,
  });

  // Submit guess
  const {
    data: submitData,
    write: submitGuess,
    isLoading: isSubmitting
  } = useContractWrite({
    address: CONTRACTS.musicBeatMatch,
    abi: MusicBeatMatchABI,
    functionName: 'submitGuess',
  });

  // Wait for transaction
  const { isSuccess } = useWaitForTransaction({
    hash: submitData?.hash,
  });

  return {
    challenge,
    stats,
    submitGuess: (challengeId: bigint, artistId: bigint, song: string) => {
      submitGuess?.({ args: [challengeId, artistId, song] });
    },
    isSubmitting,
    isSuccess,
    refetch,
  };
}
```

### Step 2D: Create UI Component

**File:** `src/components/MusicBeatMatch.tsx`

```tsx
'use client';

import { useState } from 'react';
import { useAccount } from 'wagmi';
import { useMusicBeatMatch } from '@/hooks/useMusicBeatMatch';

export function MusicBeatMatch() {
  const { address } = useAccount();
  const { challenge, stats, submitGuess, isSubmitting, isSuccess } = useMusicBeatMatch(address);

  const [artistId, setArtistId] = useState('');
  const [songTitle, setSongTitle] = useState('');

  const handleSubmit = () => {
    if (!challenge) return;
    submitGuess(
      challenge.challengeId,
      BigInt(artistId),
      songTitle
    );
  };

  return (
    <div className="max-w-md mx-auto p-6 bg-white rounded-lg shadow-lg">
      <h2 className="text-2xl font-bold mb-4">🎵 Music Beat Match</h2>

      {/* Player Stats */}
      {stats && (
        <div className="mb-6 p-4 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded">
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold">{stats.level}</div>
              <div className="text-sm">Level</div>
            </div>
            <div>
              <div className="text-2xl font-bold">{stats.currentStreak} 🔥</div>
              <div className="text-sm">Streak</div>
            </div>
            <div>
              <div className="text-2xl font-bold">
                {((Number(stats.correctGuesses) / Number(stats.totalGuesses)) * 100).toFixed(0)}%
              </div>
              <div className="text-sm">Accuracy</div>
            </div>
          </div>
        </div>
      )}

      {/* Challenge */}
      {challenge && challenge.active && (
        <div className="space-y-4">
          <div className="text-center">
            <p className="text-gray-600 mb-2">Listen to the 3-second clip:</p>
            <audio
              controls
              src={`https://ipfs.io/ipfs/${challenge.ipfsAudioHash}`}
              className="w-full"
            />
          </div>

          <input
            type="number"
            placeholder="Artist ID"
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          />

          <input
            type="text"
            placeholder="Song Title"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
          />

          <button
            onClick={handleSubmit}
            disabled={isSubmitting || !artistId || !songTitle}
            className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 text-white rounded-lg font-semibold hover:opacity-90 disabled:opacity-50"
          >
            {isSubmitting ? 'Submitting...' : 'Submit Guess'}
          </button>

          {isSuccess && (
            <div className="p-3 bg-green-100 text-green-800 rounded">
              ✓ Guess submitted! Check your stats above.
            </div>
          )}
        </div>
      )}

      {(!challenge || !challenge.active) && (
        <div className="text-center text-gray-500 py-8">
          No active challenge. Check back tomorrow!
        </div>
      )}
    </div>
  );
}
```

---

## 💰 PART 3: Fund Reward Contracts (5 minutes)

You need TOURS tokens in the reward contracts. From your contracts directory:

```bash
cd contracts
source .env

# Fund ItineraryNFT (10,000 TOURS)
cast send 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  "transfer(address,uint256)" \
  0x5B61286AC88688fe8930711fAa5b1155e98daFe8 \
  10000000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url monad_testnet

# Fund MusicBeatMatch (10,000 TOURS)
cast send 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  "transfer(address,uint256)" \
  0xee83AC7E916f4feBDb7297363B47eE370FE2EC87 \
  10000000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url monad_testnet

# Fund CountryCollector (10,000 TOURS)
cast send 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  "transfer(address,uint256)" \
  0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200 \
  10000000000000000000000 \
  --private-key $PRIVATE_KEY \
  --rpc-url monad_testnet
```

### Verify Funding:

```bash
# Check ItineraryNFT balance
cast call 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  "balanceOf(address)" \
  0x5B61286AC88688fe8930711fAa5b1155e98daFe8 \
  --rpc-url monad_testnet
```

Should return: `10000000000000000000000` (10,000 TOURS)

---

## 🧪 PART 4: Test Everything (10 minutes)

### Test 1: Verify Variables Loaded

Add to your app:

```typescript
// In any component
useEffect(() => {
  console.log('Contract addresses:', {
    musicBeatMatch: process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH,
    tandaPool: process.env.NEXT_PUBLIC_TANDA_POOL,
  });
}, []);
```

### Test 2: Read Contract Data

```typescript
// Try reading current challenge
const { data } = useContractRead({
  address: CONTRACTS.musicBeatMatch,
  abi: MusicBeatMatchABI,
  functionName: 'getCurrentChallenge',
});

console.log('Current challenge:', data);
```

### Test 3: Send Test Transaction

Use cast to create a test challenge:

```bash
# Create a daily challenge (keeper must be your address or safe)
cast send 0xee83AC7E916f4feBDb7297363B47eE370FE2EC87 \
  "createDailyChallenge(uint256,string,string)" \
  1 "Despacito" "QmTest123" \
  --private-key $PRIVATE_KEY \
  --rpc-url monad_testnet
```

Then try submitting a guess from your UI!

---

## 🚀 PART 5: Deploy & Go Live (5 minutes)

### Option A: Deploy via Git Push

```bash
cd your-frontend-directory

git add .
git commit -m "feat: integrate mini-app contracts"
git push origin main
```

Railway will auto-deploy.

### Option B: Manual Redeploy

Go to Railway → Your Service → Click "Deploy"

---

## ✅ Final Checklist

- [ ] Railway variables added (5 variables)
- [ ] ABIs extracted to `src/abis/`
- [ ] `contracts.ts` updated
- [ ] Hooks created (at least one for testing)
- [ ] UI component created
- [ ] Reward contracts funded with TOURS
- [ ] Tested reading contract data
- [ ] Tested submitting transaction
- [ ] Deployed to Railway
- [ ] Tested live deployment

---

## 🔗 Quick Reference

**MonadScan Links:**
- MusicBeatMatch: https://testnet.monadscan.com/address/0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
- TandaPool: https://testnet.monadscan.com/address/0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B
- CountryCollector: https://testnet.monadscan.com/address/0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200

**All Contract Addresses:**
See `deployed_addresses.txt`

---

## 🆘 Common Issues

**"Contract address not found"**
- Check Railway variables are set
- Verify no typos in addresses
- Restart development server

**"Insufficient funds" error**
- Ensure reward contracts are funded
- Check user has MON for gas

**Transaction reverts**
- Verify contract has TOURS balance
- Check user hasn't already played today (MusicBeatMatch)
- Verify user meets contract requirements

---

**Setup Time: ~30 minutes total** ⚡

You're all set! Your mini-apps are now live on Monad Testnet 🎉
