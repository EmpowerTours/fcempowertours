# Keeper Bot - Complete Guide & Starter Template

## What Was Created

### 📚 Documentation
1. **`KEEPER_BOT.md`** - Complete architecture guide with all requirements
2. **`GAME_SETUP.md`** - Game infrastructure setup guide
3. **`keeper-bot/README.md`** - Quick start guide for the bot

### 🤖 Starter Template (`keeper-bot/`)
Complete, production-ready keeper bot with:
- Scheduled challenge creation (cron jobs)
- Music data fetching from Envio
- Blockchain transaction execution
- Logging and error handling
- Manual trigger scripts for testing

---

## Quick Start (5 Minutes)

### 1. Navigate to keeper bot directory
```bash
cd keeper-bot
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment
```bash
cp .env.example .env
```

Edit `.env` and set these **required** variables:
```env
PLATFORM_SAFE_KEY=your_private_key_here      # Platform Safe key
ENVIO_ENDPOINT=your_envio_endpoint           # Already set
```

### 4. Test it manually
```bash
# Create a test Beat Match challenge
npm run manual-trigger beat-match

# Or create a Collector challenge
npm run manual-trigger collector
```

### 5. Run in development mode
```bash
npm run dev
```

The bot will now:
- ✅ Run continuously
- ✅ Create Beat Match challenges daily at midnight UTC
- ✅ Create Collector challenges weekly on Sunday
- ✅ Finalize expired challenges hourly

---

## Architecture Overview

```
Keeper Bot
    │
    ├─ Scheduler (node-cron)
    │   ├─ Daily: Music Beat Match (midnight UTC)
    │   ├─ Weekly: Country Collector (Sunday midnight)
    │   └─ Hourly: Finalize expired challenges
    │
    ├─ Music Data Service
    │   ├─ Fetch random music from Envio indexer
    │   └─ Find artists by country
    │
    ├─ Challenge Service
    │   ├─ Create blockchain transactions
    │   ├─ Execute via Platform Safe
    │   └─ Wait for confirmation
    │
    └─ Logger (pino)
        └─ Pretty console logs with timestamps
```

---

## Requirements Breakdown

### Infrastructure
- **Runtime**: Node.js 18+ (already have ✅)
- **Deployment**: VPS, Docker, or serverless
- **Cost**: ~$5-10/month

### Dependencies (All Included)
```json
{
  "viem": "Blockchain interactions",
  "node-cron": "Task scheduling",
  "axios": "HTTP requests to Envio",
  "pino": "Logging",
  "@pinata/sdk": "IPFS uploads (future)"
}
```

### Environment Variables
```env
# Authentication
PLATFORM_SAFE_KEY              # ⚠️ Required - Keeper account private key

# Network
RPC_URL                        # ✅ Already set
CHAIN_ID=10143                 # ✅ Already set

# Contracts
MUSIC_BEAT_MATCH              # ✅ Already deployed
COUNTRY_COLLECTOR             # ✅ Already deployed

# Data
ENVIO_ENDPOINT                # ✅ Already set

# Optional (for production)
PINATA_API_KEY                # For audio processing
ALERT_WEBHOOK                 # Discord/Slack alerts
```

---

## What the Bot Does

### Music Beat Match (Daily)
1. **Fetch** random music NFT from your platform
2. **Create** challenge with:
   - Artist ID (token ID)
   - Song title
   - IPFS hash (placeholder for now)
3. **Execute** `createDailyChallenge()` on contract
4. **Log** success + transaction hash

### Country Collector (Weekly)
1. **Select** country from rotation
2. **Find** 3 artists from that country
3. **Create** challenge with country + artist IDs
4. **Execute** `createWeeklyChallenge()` on contract
5. **Log** success + transaction hash

### Finalization (Hourly)
1. **Check** if challenges expired (>24h or >7d)
2. **Call** `finalizeChallenge()` if needed
3. **Distribute** rewards to winners

---

## Deployment Options

### Option 1: Simple VPS (Recommended for Testing)

```bash
# On your VPS (DigitalOcean, AWS, etc.)
cd keeper-bot
npm install
npm run build

# Install PM2 for process management
npm install -g pm2

# Start keeper bot
pm2 start dist/index.js --name keeper-bot

# Configure to restart on reboot
pm2 startup
pm2 save

# Monitor
pm2 logs keeper-bot
pm2 monit
```

**Cost**: $5-7/month for basic VPS

### Option 2: Docker (Recommended for Production)

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
CMD ["node", "dist/index.js"]
```

```bash
docker build -t keeper-bot .
docker run -d --name keeper-bot --env-file .env keeper-bot
docker logs -f keeper-bot
```

**Cost**: Same as VPS, easier to manage

### Option 3: Serverless (AWS Lambda + EventBridge)

- Most cost-effective ($0-1/month)
- Requires more setup
- Best for production at scale

---

## Current Implementation Status

### ✅ Implemented
- [x] Scheduled task execution (cron)
- [x] Music data fetching from Envio
- [x] Country/artist selection
- [x] Blockchain transaction execution
- [x] Logging and error handling
- [x] Manual trigger scripts
- [x] Environment configuration

### ⏳ TODO (Nice to Have)
- [ ] Audio processing (3-second snippets)
- [ ] IPFS uploads via Pinata
- [ ] Discord/Slack alerts on failure
- [ ] Database for challenge history
- [ ] Admin dashboard
- [ ] Health check endpoint

### 🔧 Current Limitations
1. **IPFS placeholder**: Uses `placeholder-${timestamp}` instead of real audio
   - Games will work but no actual audio playback
   - To fix: Implement audio processing + Pinata upload

2. **Country rotation**: Hardcoded list of countries
   - To fix: Make dynamic based on passport data

3. **No monitoring**: Logs only to console
   - To fix: Add Sentry or Discord webhooks

---

## Testing the Bot

### Step 1: Manual Test
```bash
cd keeper-bot
npm install
cp .env.example .env
# Edit .env with PLATFORM_SAFE_KEY

# Test creating a challenge
npm run manual-trigger beat-match
```

**Expected output:**
```
🎵 Creating new Music Beat Match challenge...
Fetching music NFTs from Envio indexer...
Selected music: "Song Name" by 0xArtist... (Token #1)
⚠️  Using placeholder IPFS hash
Creating challenge: "Song Name" (Artist ID: 1)
Transaction submitted: 0x...
✅ Beat Match challenge created successfully!
View on MonadScan: https://testnet.monadscan.com/tx/0x...
```

### Step 2: Verify on Blockchain
```bash
# Check if challenge was created
npx tsx scripts/check-game-contracts.ts
```

Should now show:
```
Current Challenge:
  ID: 0
  Song: "Song Name"
  Active: ✅ YES
  End Time: [24 hours from now]
```

### Step 3: Test in UI
1. Visit `https://yourapp.com/beat-match`
2. Should see the challenge
3. Try submitting a guess

---

## Next Steps

### Immediate (Get Games Working)
1. ✅ Bot template created
2. ⏳ **Configure `.env` with PLATFORM_SAFE_KEY**
3. ⏳ **Run manual trigger to create first challenge**
4. ⏳ **Test games in UI**

### Short-term (Production Ready)
1. Deploy bot to VPS with PM2
2. Add Discord alerts for failures
3. Implement audio processing + IPFS
4. Set up monitoring

### Long-term (Scale)
1. Build admin dashboard
2. Add database for analytics
3. Implement smart artist selection
4. Multi-region deployment

---

## Cost Breakdown

### Current Setup (Testnet)
- **Contracts**: Deployed ✅ (free)
- **Contracts Funded**: 100k TOURS each ✅ (lasts months)
- **Keeper Bot**: Not running ❌ (needs deployment)

### Estimated Monthly Costs
| Item | Cost | Notes |
|------|------|-------|
| VPS (DigitalOcean) | $6 | 1GB RAM, enough for bot |
| IPFS (Pinata Free) | $0 | 1GB storage included |
| Gas Fees | $0 | Testnet is free |
| **Total** | **$6/month** | Very affordable! |

For production mainnet:
- Gas fees: ~$1-5/month (depends on chain)
- Total: ~$10-15/month

---

## Troubleshooting

### Bot won't start
```bash
# Check Node version
node --version  # Should be 18+

# Check environment variables
cat .env | grep PLATFORM_SAFE_KEY

# Check for errors
npm run dev
```

### "No music NFTs found"
- Music hasn't been minted yet
- Or Envio indexer not synced
- Check: Visit `/music` page and mint test music

### "Transaction failed"
- Platform Safe out of gas (unlikely on testnet)
- Keeper not authorized (check contract)
- Run diagnostic: `npx tsx ../scripts/check-game-contracts.ts`

### Challenges not appearing in games
- Challenge created but frontend not fetching
- Check browser console for errors
- Verify contract addresses in frontend env

---

## Files Created

```
keeper-bot/
├── package.json              # Dependencies & scripts
├── tsconfig.json            # TypeScript config
├── .env.example             # Environment template
├── README.md                # Quick start guide
├── src/
│   ├── index.ts             # Main entry point
│   ├── scheduler.ts         # Cron job setup
│   ├── services/
│   │   ├── challengeService.ts    # Blockchain logic
│   │   └── musicDataService.ts    # Envio queries
│   └── utils/
│       └── logger.ts        # Pino logger
└── scripts/
    └── manual-trigger.ts    # Manual testing

../KEEPER_BOT.md             # Full architecture guide
../GAME_SETUP.md             # Game setup guide
../scripts/check-game-contracts.ts  # Diagnostic tool
```

---

## Summary

### What You Have Now
✅ Contracts deployed & funded
✅ Complete keeper bot template
✅ Documentation & guides
✅ Testing scripts

### What You Need to Do
1. **Configure** `.env` in `keeper-bot/` with `PLATFORM_SAFE_KEY`
2. **Test** manually: `npm run manual-trigger beat-match`
3. **Deploy** bot to VPS or run locally
4. **Monitor** logs and verify challenges created

### Once Bot is Running
- Games will have daily/weekly challenges
- Users can play and earn TOURS
- Challenges automatically rotate
- All gasless via Platform Safe

---

## Ready to Start?

```bash
cd keeper-bot
npm install
cp .env.example .env
# Add your PLATFORM_SAFE_KEY to .env
npm run manual-trigger beat-match
```

Then visit `/beat-match` on your app and you should see the challenge! 🎉

Questions? Check:
- `keeper-bot/README.md` - Quick start
- `KEEPER_BOT.md` - Full architecture
- `GAME_SETUP.md` - Infrastructure guide
