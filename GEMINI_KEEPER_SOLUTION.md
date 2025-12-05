# Gemini AI Keeper Solution (No VPS Needed!)

## 🎉 Much Simpler & Cheaper Solution

Instead of running a separate keeper bot service, we leverage your **existing Gemini AI integration** and use **free external cron services**!

### What Changed
- ❌ **Before**: Build separate Node.js service, deploy to VPS ($5-10/month), manage PM2
- ✅ **After**: Single API endpoint + free external scheduler = **$0/month**

---

## How It Works

```
Free Cron Service (cron-job.org)
         │
         ↓ POST request daily
    Your API Endpoint
    /api/keeper/create-challenge
         │
         ↓ Asks Gemini AI
    "Which music should we feature today?"
         │
         ↓ Gemini picks best option
    Fetches data from Envio
         │
         ↓ Creates transaction
    Blockchain (via Platform Safe)
         │
         ↓ Challenge created!
    Users can play the game
```

---

## What I Created

### 1. Smart API Endpoint (`/api/keeper/create-challenge`)

Uses **Gemini AI** to:
- 🎵 **Music Beat Match**: Pick the most engaging song for today
- 🌍 **Country Collector**: Select interesting country for the week
- 🧠 **Smart selection**: Considers variety, appeal, cultural diversity

**File**: `app/api/keeper/create-challenge/route.ts`

---

## Setup (5 Minutes)

### Step 1: Set Environment Variables

Add to `.env.local`:

```env
# Already have ✅
GEMINI_API_KEY=AIzaSyAHXFOe6MvhJi_svCU1sWuAYb9p4iWBbSc
USE_GEMINI=true

# Add these
KEEPER_SECRET=your-secret-key-change-this-to-something-random
PLATFORM_SAFE_KEY=your_platform_safe_private_key
```

### Step 2: Test Locally

```bash
# Test Beat Match challenge creation
curl -X POST http://localhost:3000/api/keeper/create-challenge \
  -H "Content-Type: application/json" \
  -d '{"type": "beat-match", "secret": "your-secret-key"}'

# Test Collector challenge creation
curl -X POST http://localhost:3000/api/keeper/create-challenge \
  -H "Content-Type: application/json" \
  -d '{"type": "collector", "secret": "your-secret-key"}'
```

**Expected response:**
```json
{
  "success": true,
  "type": "beat-match",
  "txHash": "0x...",
  "challenge": {
    "artistId": "1",
    "songTitle": "Cool Song",
    "reason": "Upbeat tempo perfect for midweek engagement"
  },
  "monadScan": "https://testnet.monadscan.com/tx/0x..."
}
```

### Step 3: Set Up Free Cron Jobs

#### Option A: cron-job.org (Recommended - Free Forever)

1. Go to https://cron-job.org/en/
2. Sign up (free account)
3. Create two jobs:

**Job 1: Daily Beat Match**
- URL: `https://yourapp.com/api/keeper/create-challenge`
- Method: POST
- Headers: `Content-Type: application/json`
- Body: `{"type": "beat-match", "secret": "your-secret-key"}`
- Schedule: Every day at 00:00 UTC

**Job 2: Weekly Collector**
- URL: `https://yourapp.com/api/keeper/create-challenge`
- Method: POST
- Headers: `Content-Type: application/json`
- Body: `{"type": "collector", "secret": "your-secret-key"}`
- Schedule: Every Sunday at 00:00 UTC

#### Option B: GitHub Actions (Free for Public Repos)

Create `.github/workflows/keeper.yml`:

```yaml
name: Game Challenges Keeper

on:
  schedule:
    # Daily at midnight UTC
    - cron: '0 0 * * *'
    # Weekly on Sunday
    - cron: '0 0 * * 0'
  workflow_dispatch: # Allow manual trigger

jobs:
  create-challenge:
    runs-on: ubuntu-latest
    steps:
      - name: Create Daily Challenge
        if: github.event.schedule == '0 0 * * *'
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/keeper/create-challenge \
            -H "Content-Type: application/json" \
            -d '{"type": "beat-match", "secret": "${{ secrets.KEEPER_SECRET }}"}'

      - name: Create Weekly Challenge
        if: github.event.schedule == '0 0 * * 0'
        run: |
          curl -X POST ${{ secrets.APP_URL }}/api/keeper/create-challenge \
            -H "Content-Type: application/json" \
            -d '{"type": "collector", "secret": "${{ secrets.KEEPER_SECRET }}"}'
```

Then add secrets in GitHub repo settings:
- `APP_URL` = `https://yourapp.com`
- `KEEPER_SECRET` = your secret key

#### Option C: Vercel Cron (If Using Vercel)

Create `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/keeper/create-challenge",
      "schedule": "0 0 * * *"
    }
  ]
}
```

---

## How Gemini Makes It Smart

### Beat Match Selection

**Old Way (Random)**:
```typescript
const randomIndex = Math.floor(Math.random() * musicNFTs.length);
return musicNFTs[randomIndex]; // Just picks any song
```

**New Way (Gemini AI)**:
```typescript
// Gemini considers:
// - Genre variety from previous challenges
// - Mood and energy level
// - Broad appeal to players
// - Time of week (upbeat mid-week, chill on weekends)

const prompt = `Select ONE song that would make an engaging daily challenge...`;
const selection = await genAI.generateContent(prompt);
// Returns: "Song X because it has upbeat tempo perfect for midweek"
```

### Country Collector Selection

**Old Way (Hardcoded List)**:
```typescript
const countries = ['Japan', 'Brazil', 'USA'];
return countries[random]; // Just rotates through list
```

**New Way (Gemini AI)**:
```typescript
// Gemini analyzes:
// - Geographic diversity
// - Cultural interest
// - Number of available artists
// - Recent selections to avoid repetition

const selection = await genAI.generateContent(prompt);
// Returns: "Japan because it offers cultural diversity and has active community"
```

---

## Cost Comparison

### Old Keeper Bot Solution
| Item | Cost |
|------|------|
| VPS (DigitalOcean) | $6/month |
| Maintenance | Your time |
| **Total** | **$6/month + time** |

### New Gemini Solution
| Item | Cost |
|------|------|
| Gemini API | FREE (generous limits) |
| cron-job.org | FREE (forever) |
| GitHub Actions | FREE (public repos) |
| **Total** | **$0/month** 🎉 |

---

## Gemini API Limits

Free tier:
- **15 requests/minute**
- **1500 requests/day**

Our usage:
- **2-3 requests/day** (1 daily, 1 weekly)
- **~90 requests/month**

✅ **Way under the free limit!**

---

## Benefits of This Approach

### vs. Keeper Bot Service

| Feature | Keeper Bot | Gemini API Solution |
|---------|-----------|---------------------|
| Cost | $6-10/month | **FREE** |
| Setup | Complex (VPS, PM2, etc.) | **Simple (API endpoint)** |
| Maintenance | Server management | **None** |
| Scalability | Need to scale VPS | **Automatic** |
| Intelligence | Rules-based | **AI-powered** |
| Reliability | Single point of failure | **External services** |

### AI Selection Advantages

1. **Smarter Picks**: Considers context, not just random
2. **Variety**: AI ensures good rotation
3. **Engagement**: Picks music/countries that resonate
4. **Adaptive**: Can adjust criteria over time
5. **Explanations**: Provides reasons for selections

---

## Example Gemini Selections

### Music Beat Match

```json
{
  "challenge": {
    "songTitle": "Summer Vibes",
    "artistId": "42",
    "reason": "Upbeat summer track perfect for Monday motivation. Genre diversity from weekend's jazz selection."
  }
}
```

### Country Collector

```json
{
  "challenge": {
    "country": "Japan",
    "countryCode": "JP",
    "reason": "Rich cultural heritage with active artist community. Provides geographic variety after last week's Brazil."
  }
}
```

---

## Testing

### Manual Test
```bash
# Test the endpoint
curl -X POST http://localhost:3000/api/keeper/create-challenge \
  -H "Content-Type: application/json" \
  -d '{"type": "beat-match", "secret": "your-secret"}'
```

### Check Results
```bash
# Verify challenge was created
npx tsx scripts/check-game-contracts.ts

# Should show:
# Current Challenge: Active ✅
# Song: "Selected by Gemini"
```

### View in UI
1. Visit `/beat-match`
2. Should see new challenge
3. Check Gemini's reasoning in logs

---

## Monitoring

### Check Cron Job Status

**cron-job.org**:
- Dashboard shows execution history
- Email alerts on failures
- Execution logs

**GitHub Actions**:
- Actions tab shows runs
- Email notifications
- Logs available for 90 days

### API Logs

Check your deployment logs (Vercel, Railway, etc.):
```bash
# You'll see:
🤖 Keeper: Creating beat-match challenge with Gemini AI...
🎵 Fetching music from Envio...
Found 15 music NFTs
✅ Gemini selected: "Cool Song" (Token #5)
   Reason: Upbeat tempo perfect for midweek engagement
📡 Creating challenge on blockchain...
✅ Challenge created successfully!
```

---

## Troubleshooting

### "Unauthorized" Error
- Check `KEEPER_SECRET` matches in both `.env.local` and cron job

### "No music NFTs available"
- Mint some test music first
- Check Envio indexer is synced

### "Gemini API error"
- Verify `GEMINI_API_KEY` is set
- Check API limits (unlikely with 2-3 calls/day)

### Challenge not appearing
- Check transaction succeeded on MonadScan
- Verify contract addresses in `.env.local`
- Frontend might need to refetch data

---

## Next Steps

1. ✅ API endpoint created (uses your Gemini)
2. ⏳ **Set `KEEPER_SECRET` in `.env.local`**
3. ⏳ **Test endpoint locally**
4. ⏳ **Deploy to production**
5. ⏳ **Set up cron-job.org** (2 minutes)
6. ⏳ **Done! Challenges auto-create forever**

---

## Advanced: Enhance Gemini Prompts

You can make selection even smarter by editing the prompts in `route.ts`:

### Add Player Preferences
```typescript
const prompt = `
Select music considering:
- Genre: Mix of pop, rock, electronic
- Mood: Match day of week (upbeat Mon-Fri, chill weekends)
- Difficulty: Moderate challenge level
- Previous: Avoid repeating artists from last 7 days
...
`;
```

### Add Trending Analysis
```typescript
const prompt = `
Based on these metrics:
- Most played songs: ${topSongs}
- Popular genres: ${genres}
- Player feedback: ${feedback}

Select the best song for today's challenge...
`;
```

---

## Summary

### What You Had
- ✅ Gemini AI already integrated
- ✅ Contracts deployed and funded
- ❌ Games not working (no challenges)

### What You Have Now
- ✅ Smart API endpoint using Gemini
- ✅ AI selects best music/countries
- ✅ Free external cron triggers it
- ✅ **$0/month cost (vs. $6+ for VPS)**
- ✅ **No server to manage**

### To Make It Work
1. Set `KEEPER_SECRET` in `.env.local`
2. Test locally
3. Deploy
4. Set up cron-job.org (free)
5. **Done!** Games work forever automatically

**The keeper bot template I created is still useful** if you want:
- More control
- Custom scheduling logic
- Local development/testing
- Complex automation

But for production, **this Gemini solution is simpler and free!** 🎉

---

## Files Created

```
app/api/keeper/create-challenge/route.ts   ← New smart endpoint
GEMINI_KEEPER_SOLUTION.md                  ← This guide
```

**Ready to test?**

```bash
# Add to .env.local:
KEEPER_SECRET=my-super-secret-key

# Test it:
curl -X POST http://localhost:3000/api/keeper/create-challenge \
  -H "Content-Type: application/json" \
  -d '{"type": "beat-match", "secret": "my-super-secret-key"}'
```

Then visit `/beat-match` and see the AI-selected challenge! 🚀
