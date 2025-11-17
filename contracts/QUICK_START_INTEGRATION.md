# 🚀 Quick Start: Integrating Deployed Contracts

## Step-by-Step Integration Guide for EmpowerTours Farcaster Mini App

---

## ✅ STEP 1: Add to Railway (2 minutes)

### Via Railway Dashboard:

1. Go to **https://railway.app**
2. Select your **empowertours** project
3. Click on your service (backend/frontend)
4. Go to **"Variables"** tab
5. Click **"New Variable"** and add each of these:

```
NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E
NEXT_PUBLIC_ITINERARY_NFT=0x5B61286AC88688fe8930711fAa5b1155e98daFe8
NEXT_PUBLIC_MUSIC_BEAT_MATCH=0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
NEXT_PUBLIC_COUNTRY_COLLECTOR=0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200
NEXT_PUBLIC_TANDA_POOL=0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B
```

6. Railway will automatically redeploy (wait 2-3 min)

---

## ✅ STEP 2: Extract Contract ABIs (1 minute)

From your contracts directory, run:

```bash
cd /home/empowertours/projects/fcempowertours/contracts

# Create ABI directory in your frontend
mkdir -p ../frontend/src/abis

# Extract ABIs
forge inspect ActionBasedDemandSignal abi > ../frontend/src/abis/ActionBasedDemandSignal.json
forge inspect ItineraryNFT abi > ../frontend/src/abis/ItineraryNFT.json
forge inspect MusicBeatMatch abi > ../frontend/src/abis/MusicBeatMatch.json
forge inspect CountryCollector abi > ../frontend/src/abis/CountryCollector.json
forge inspect TandaPool abi > ../frontend/src/abis/TandaPool.json
```

---

## ✅ STEP 3: Update Frontend Config (2 minutes)

### File: `src/config/contracts.ts`

```typescript
export const CONTRACT_ADDRESSES = {
  // Mini-App Contracts
  actionBasedDemandSignal: process.env.NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL!,
  itineraryNFT: process.env.NEXT_PUBLIC_ITINERARY_NFT!,
  musicBeatMatch: process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH!,
  countryCollector: process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR!,
  tandaPool: process.env.NEXT_PUBLIC_TANDA_POOL!,

  // Existing
  toursToken: '0xa123600c82E69cB311B0e068B06Bfa9F787699B7',
  passportNFT: '0x820A9cc395D4349e19dB18BAc5Be7b3C71ac5163',
};
```

---

## ✅ STEP 4: Fund Reward Contracts (3 minutes)

From the contracts directory:

```bash
cd /home/empowertours/projects/fcempowertours/contracts

# Create the addresses file
source deployed_addresses.txt

# Run funding script
./script/FundContracts.sh
```

Or manually:

```bash
# Fund ItineraryNFT
cast send 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  "transfer(address,uint256)" \
  0x5B61286AC88688fe8930711fAa5b1155e98daFe8 \
  10000000000000000000000 \
  --private-key 0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6 \
  --rpc-url https://testnet-rpc.monad.xyz

# Fund MusicBeatMatch
cast send 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  "transfer(address,uint256)" \
  0xee83AC7E916f4feBDb7297363B47eE370FE2EC87 \
  10000000000000000000000 \
  --private-key 0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6 \
  --rpc-url https://testnet-rpc.monad.xyz

# Fund CountryCollector
cast send 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
  "transfer(address,uint256)" \
  0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200 \
  10000000000000000000000 \
  --private-key 0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6 \
  --rpc-url https://testnet-rpc.monad.xyz
```

---

## ✅ STEP 5: Create React Hook Example (5 minutes)

### File: `src/hooks/useMusicBeatMatch.ts`

```typescript
import { useContractRead, useContractWrite } from 'wagmi';
import { CONTRACT_ADDRESSES } from '@/config/contracts';
import MusicBeatMatchABI from '@/abis/MusicBeatMatch.json';

export function useMusicBeatMatch() {
  // Read current challenge
  const { data: currentChallenge } = useContractRead({
    address: CONTRACT_ADDRESSES.musicBeatMatch,
    abi: MusicBeatMatchABI,
    functionName: 'getCurrentChallenge',
  });

  // Submit guess
  const { write: submitGuess, isLoading } = useContractWrite({
    address: CONTRACT_ADDRESSES.musicBeatMatch,
    abi: MusicBeatMatchABI,
    functionName: 'submitGuess',
  });

  return {
    currentChallenge,
    submitGuess: (challengeId: bigint, artistId: bigint, songTitle: string) => {
      submitGuess({ args: [challengeId, artistId, songTitle] });
    },
    isLoading,
  };
}
```

---

## ✅ STEP 6: Add to Your Mini-App UI (10 minutes)

### Example Component:

```tsx
// src/app/mini-apps/music/page.tsx
'use client';

import { useMusicBeatMatch } from '@/hooks/useMusicBeatMatch';
import { useState } from 'react';

export default function MusicBeatMatchPage() {
  const { currentChallenge, submitGuess, isLoading } = useMusicBeatMatch();
  const [artistId, setArtistId] = useState('');
  const [songTitle, setSongTitle] = useState('');

  const handleSubmit = () => {
    if (!currentChallenge) return;
    submitGuess(
      currentChallenge.challengeId,
      BigInt(artistId),
      songTitle
    );
  };

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">🎵 Music Beat Match</h1>

      {currentChallenge && (
        <div className="space-y-4">
          <audio controls src={`ipfs://${currentChallenge.ipfsAudioHash}`} />

          <input
            type="number"
            placeholder="Artist ID"
            value={artistId}
            onChange={(e) => setArtistId(e.target.value)}
            className="w-full p-2 border rounded"
          />

          <input
            type="text"
            placeholder="Song Title"
            value={songTitle}
            onChange={(e) => setSongTitle(e.target.value)}
            className="w-full p-2 border rounded"
          />

          <button
            onClick={handleSubmit}
            disabled={isLoading}
            className="w-full py-2 bg-blue-500 text-white rounded"
          >
            {isLoading ? 'Submitting...' : 'Submit Guess'}
          </button>
        </div>
      )}
    </div>
  );
}
```

---

## ✅ STEP 7: Test Everything (5 minutes)

1. **Verify contracts loaded:**
   Visit: `/api/test-contracts` or add console.log in your app:
   ```typescript
   console.log('Contracts:', CONTRACT_ADDRESSES);
   ```

2. **Test transaction:**
   - Go to your mini-app page
   - Try interacting with a contract
   - Check transaction on MonadScan

3. **Verify funding:**
   ```bash
   cast call 0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
     "balanceOf(address)" \
     0xee83AC7E916f4feBDb7297363B47eE370FE2EC87 \
     --rpc-url https://testnet-rpc.monad.xyz
   ```

---

## 🎯 Summary Checklist

- [ ] Railway variables added (5 environment variables)
- [ ] ABIs extracted to frontend
- [ ] `contracts.ts` updated with new addresses
- [ ] Reward contracts funded with TOURS
- [ ] React hooks created
- [ ] UI components built
- [ ] Everything tested locally
- [ ] Deployed to Railway
- [ ] Tested live deployment

---

## 🔗 Quick Links

- **MonadScan Explorer:** https://testnet.monadscan.com
- **Contract Addresses:** See `deployed_addresses.txt`
- **Full Docs:** See `DEPLOYMENT_SUCCESS.md`

---

## 🆘 Troubleshooting

**Variables not loading?**
- Check Railway logs for deployment errors
- Verify variable names match exactly
- Try restarting Railway service

**Transactions failing?**
- Ensure you have MON for gas
- Check contract is funded with TOURS
- Verify wallet is connected to Monad Testnet

**Need help?**
- Check deployment logs: `deployment_log.txt`
- View contract on MonadScan
- Test with cast commands first

---

**Total Setup Time: ~30 minutes** ⚡
