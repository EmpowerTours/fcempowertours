# Railway Environment Variables Setup

## 🚂 Adding Contract Addresses to Railway

### Option A: Via Railway Dashboard (Recommended)

1. **Go to Railway Dashboard**
   - Navigate to: https://railway.app
   - Select your `empowertours` project
   - Click on your backend service

2. **Add Environment Variables**
   - Click on the "Variables" tab
   - Click "New Variable" for each contract address below

3. **Add These Variables:**

```bash
# Mini-App Contract Addresses
NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E
NEXT_PUBLIC_ITINERARY_NFT=0x5B61286AC88688fe8930711fAa5b1155e98daFe8
NEXT_PUBLIC_MUSIC_BEAT_MATCH=0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
NEXT_PUBLIC_COUNTRY_COLLECTOR=0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200
NEXT_PUBLIC_TANDA_POOL=0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B

# Backend Recording Wallet (already set, but verify)
MONAD_AUTHORIZED_WALLET_PRIVATE_KEY=0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2
```

4. **Deploy Changes**
   - Railway will automatically redeploy when you save the variables
   - Wait for deployment to complete (~2-3 minutes)

### Option B: Via Railway CLI

```bash
# Install Railway CLI if not already installed
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Add variables
railway variables set NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E
railway variables set NEXT_PUBLIC_ITINERARY_NFT=0x5B61286AC88688fe8930711fAa5b1155e98daFe8
railway variables set NEXT_PUBLIC_MUSIC_BEAT_MATCH=0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
railway variables set NEXT_PUBLIC_COUNTRY_COLLECTOR=0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200
railway variables set NEXT_PUBLIC_TANDA_POOL=0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B
```

### Option C: Environment Variable File (for local testing)

Create `.env.local` in your Next.js project root:

```bash
# Copy this to your frontend project root as .env.local
NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL=0xabE750F9de36d69D41AaF8f20Da097fB67f7e15E
NEXT_PUBLIC_ITINERARY_NFT=0x5B61286AC88688fe8930711fAa5b1155e98daFe8
NEXT_PUBLIC_MUSIC_BEAT_MATCH=0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
NEXT_PUBLIC_COUNTRY_COLLECTOR=0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200
NEXT_PUBLIC_TANDA_POOL=0x3Ba6f8d6e873c9E7b06451FCB28C0a10bb3DBa8B
```

---

## ✅ Verification

After adding variables, verify they're set correctly:

### Via Railway Dashboard:
1. Go to Variables tab
2. Verify all 5 `NEXT_PUBLIC_*` variables are listed
3. Check deployment logs for successful build

### Via CLI:
```bash
railway variables
```

### In Your App:
Add this test page to verify (create `pages/api/test-contracts.ts`):

```typescript
import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  res.status(200).json({
    contracts: {
      actionBasedDemandSignal: process.env.NEXT_PUBLIC_ACTION_BASED_DEMAND_SIGNAL,
      itineraryNFT: process.env.NEXT_PUBLIC_ITINERARY_NFT,
      musicBeatMatch: process.env.NEXT_PUBLIC_MUSIC_BEAT_MATCH,
      countryCollector: process.env.NEXT_PUBLIC_COUNTRY_COLLECTOR,
      tandaPool: process.env.NEXT_PUBLIC_TANDA_POOL,
    }
  });
}
```

Then visit: `https://your-app.railway.app/api/test-contracts`

---

## 🔄 Redeployment

Railway automatically redeploys when environment variables change. Monitor the deployment:

1. Go to "Deployments" tab in Railway
2. Watch the build logs
3. Verify deployment succeeds
4. Check the app is accessible

**Expected deployment time: 2-3 minutes**

---

## 🐛 Troubleshooting

### Variables not appearing in app:
- Ensure variables start with `NEXT_PUBLIC_` for client-side access
- Restart your local dev server if testing locally
- Clear Next.js cache: `rm -rf .next`

### Deployment fails:
- Check Railway build logs for errors
- Verify variable names are correct (case-sensitive)
- Ensure no typos in contract addresses

### Old addresses cached:
```bash
# Clear Railway cache and force rebuild
railway run --command "rm -rf .next && npm run build"
```

---

## 📱 Next: Frontend Integration

After Railway variables are set, proceed to update your frontend code.
See: `FRONTEND_INTEGRATION.md`
