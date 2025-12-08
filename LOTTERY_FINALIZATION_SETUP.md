# Lottery Finalization Setup

## Problem Solved

DailyPassLotteryV2 uses **lazy finalization** - it only finalizes when someone enters the next day's lottery. If no one enters for 24+ hours, winners don't get selected.

## Solution: Two-Layer System

### Layer 1: User-Driven (Free for You!)
Users can earn 0.01 MON by finalizing the lottery themselves via a UI button.

### Layer 2: Backup Cron (Runs Every 6 Hours)
If no users finalize, Railway cron automatically does it.

---

## Setup Instructions

### 1. Add UI Button to Lottery Page

Add the finalization button to your lottery page:

```tsx
// app/lottery/page.tsx (or wherever your lottery UI is)

import FinalizeLotteryButton from '@/components/lottery/FinalizeLotteryButton';

export default function LotteryPage() {
  return (
    <div>
      {/* Add this at the top of your lottery page */}
      <FinalizeLotteryButton />

      {/* Rest of your lottery UI */}
    </div>
  );
}
```

The button automatically:
- Checks for pending rounds every 30 seconds
- Shows only when finalization is needed
- Displays step (commit or reveal)
- Rewards user with 0.01 MON

---

### 2. Setup Railway Cron (Backup)

#### Option A: Railway Cron (Recommended)

Add to Railway environment variables:
```
KEEPER_SECRET=your_secret_key_here
```

Add to `railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  },
  "cron": [
    {
      "schedule": "0 */6 * * *",
      "command": "curl https://your-app.railway.app/api/cron/finalize-lottery?key=$KEEPER_SECRET"
    }
  ]
}
```

This runs every 6 hours (at 12am, 6am, 12pm, 6pm UTC).

#### Option B: External Cron (Alternative)

Use cron-job.org or EasyCron:

1. Create account on https://cron-job.org
2. Add job:
   - **URL:** `https://your-app.railway.app/api/cron/finalize-lottery?key=YOUR_KEEPER_SECRET`
   - **Schedule:** Every 6 hours
   - **Method:** GET

---

### 3. Test It

#### Test UI Button

1. Wait for a round to end (after 24 hours)
2. Visit lottery page
3. You should see: **"🎰 Earn 0.01 MON Reward!"**
4. Click "Commit Randomness" → Get 0.01 MON
5. Wait 10 blocks (~30 seconds)
6. Click "Reveal Winner" → Get another 0.01 MON

#### Test Cron (Manual)

```bash
curl "https://your-app.railway.app/api/cron/finalize-lottery?key=YOUR_KEEPER_SECRET"
```

Should return:
```json
{
  "success": true,
  "message": "Finalized 2 action(s)",
  "actions": [
    "Committed round 42: 0x...",
    "Revealed round 42: 0x..."
  ]
}
```

---

## How It Works

### User Flow (UI Button)

1. User visits lottery page
2. Button checks if previous round needs finalization
3. If yes, shows button with reward incentive
4. User clicks → Calls `commitRandomness()` → Earns 0.01 MON
5. 10 blocks later → User clicks reveal → Earns another 0.01 MON
6. Winner selected ✅

### Backup Flow (Cron)

1. Cron runs every 6 hours
2. Checks last 3 rounds for pending finalization
3. If found:
   - Calls `commitRandomness()` from Platform Safe wallet
   - Waits for confirmation
   - Calls `revealWinner()`
   - Posts winner to Farcaster (TODO)
4. Platform Safe wallet earns the 0.01 MON rewards

---

## Cost Analysis

**User-Driven (Layer 1):**
- Cost to you: $0
- Users earn: 0.02 MON per day (commit + reveal)
- Users pay gas: ~$0.01 USD

**Backup Cron (Layer 2):**
- Runs: 4 times per day (every 6 hours)
- Only acts if needed (usually 0-1 times per day)
- Gas cost: ~$0.01 USD per finalization
- Revenue: 0.02 MON reward (covers gas cost)
- Net cost: $0

---

## Monitoring

### Check Pending Rounds

Visit: `https://your-app.railway.app/api/lottery/status`

Returns:
```json
{
  "currentRound": 42,
  "pendingRounds": [41],
  "canCommit": true,
  "canReveal": false
}
```

### Check Cron Logs

Railway Dashboard → Deployments → Logs

Look for:
```
[KEEPER] Checking lottery finalization...
[KEEPER] Current round: 42
[KEEPER] Committing round 41...
[KEEPER] Winner: 0x...
```

---

## Farcaster Announcements (TODO)

To announce winners on Farcaster, create:

**File:** `app/api/lottery/announce-winner/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient } from '@neynar/nodejs-sdk';

export async function POST(req: NextRequest) {
  const { roundId, winner, prizePoolMon } = await req.json();

  const neynar = new NeynarAPIClient(process.env.NEYNAR_API_KEY!);

  const text = `🎰 Lottery Round ${roundId} Winner!

🏆 ${winner.slice(0, 6)}...${winner.slice(-4)}
💰 Prize: ${(Number(prizePoolMon) / 1e18).toFixed(2)} MON

Congratulations! Claim at empowertours.xyz`;

  await neynar.publishCast({
    signerUuid: process.env.BOT_SIGNER_UUID!,
    text,
  });

  return NextResponse.json({ success: true });
}
```

---

## Troubleshooting

### Button Doesn't Show

- Check lottery contract address in `.env.local`
- Check if round has actually ended (24 hours passed)
- Check if participants exist (need at least 1)
- Open browser console for errors

### Cron Doesn't Run

- Verify `KEEPER_SECRET` in Railway env vars
- Check Railway cron logs
- Test manually with curl
- Verify `SAFE_OWNER_PRIVATE_KEY` has enough MON for gas

### Winner Not Revealed

- Need to wait 10 blocks after commit (~30 seconds)
- Check `canReveal(roundId)` returns true
- Check enough MON in contract for rewards

---

## Summary

✅ **Layer 1:** Users earn 0.01 MON by finalizing (gamification!)
✅ **Layer 2:** Backup cron every 6 hours (safety net)
✅ **Cost:** $0 (rewards cover gas)
✅ **Reliability:** Winner selected within 6 hours max

**Next Steps:**
1. Add UI button to lottery page
2. Setup Railway cron
3. Test both flows
4. Add Farcaster announcement
5. Monitor for first week

---

**Created:** 2025-01-07
**Status:** Ready to Deploy
