# Keeper Bot

Automated service for creating and managing game challenges on Empower Tours platform.

## Features

- **Music Beat Match**: Creates daily challenges automatically
- **Country Collector**: Creates weekly challenges automatically
- **Challenge Finalization**: Automatically finalizes expired challenges
- **Smart Music Selection**: Pulls from Envio indexer
- **Logging**: Comprehensive logs with Pino

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your configuration
```

**Required variables:**
- `PLATFORM_SAFE_KEY` - Private key for Platform Safe (keeper account)
- `ENVIO_ENDPOINT` - Your Envio GraphQL endpoint
- `RPC_URL` - Monad testnet RPC

### 3. Test Manually

```bash
# Create a Beat Match challenge
npm run manual-trigger beat-match

# Create a Collector challenge
npm run manual-trigger collector
```

### 4. Run in Development

```bash
npm run dev
```

### 5. Run in Production

```bash
# Build
npm run build

# Start (keeps running)
npm start
```

## Deployment

### Option 1: PM2 (Recommended for VPS)

```bash
# Install PM2
npm install -g pm2

# Start
pm2 start dist/index.js --name keeper-bot

# Save configuration
pm2 save
pm2 startup

# Monitor
pm2 logs keeper-bot
pm2 monit
```

### Option 2: Docker

```bash
# Build
docker build -t keeper-bot .

# Run
docker run -d --name keeper-bot --env-file .env keeper-bot

# View logs
docker logs -f keeper-bot
```

### Option 3: systemd (Linux Service)

```ini
# /etc/systemd/system/keeper-bot.service
[Unit]
Description=Keeper Bot for Empower Tours
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/keeper-bot
ExecStart=/usr/bin/node dist/index.js
Restart=always
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable keeper-bot
sudo systemctl start keeper-bot
sudo journalctl -u keeper-bot -f
```

## Schedule Configuration

Edit `.env` to customize when challenges are created:

```env
# Daily at midnight UTC
BEAT_MATCH_CRON="0 0 * * *"

# Weekly on Sunday at midnight UTC
COLLECTOR_CRON="0 0 * * 0"

# Hourly finalization check
FINALIZE_CRON="0 * * * *"
```

Cron format: `minute hour day month weekday`

Examples:
- `0 0 * * *` - Daily at midnight
- `0 12 * * *` - Daily at noon
- `0 0 * * 1` - Every Monday at midnight
- `*/30 * * * *` - Every 30 minutes

## Monitoring

### Health Check

The bot exposes a health check endpoint (if configured):

```bash
curl http://localhost:3001/health
```

### Logs

Logs are written to console with timestamps. To save to file:

```bash
# Development
npm run dev 2>&1 | tee logs/keeper-bot.log

# Production with PM2
pm2 logs keeper-bot --lines 100
```

### Alerts

Set `ALERT_WEBHOOK` in `.env` to receive Discord/Slack notifications when challenges fail to create.

## Troubleshooting

### "No music NFTs found"
- Check that music has been minted on your platform
- Verify ENVIO_ENDPOINT is correct
- Check indexer is synced

### "Transaction failed"
- Verify PLATFORM_SAFE_KEY has funds for gas
- Check keeper is authorized on contracts
- View transaction on MonadScan for details

### "Not enough artists for [country]"
- Not all countries have artists yet
- Bot will try multiple countries
- Add more countries to rotation

### Challenges not creating on schedule
- Check cron syntax in .env
- Verify bot is running (`pm2 status`)
- Check logs for errors

## Cost Estimates

- **Hosting**: $5-10/month (basic VPS)
- **Transactions**: ~10-15/week (gas covered by Platform Safe)
- **Total**: $5-10/month

## Development

### Add New Features

```typescript
// src/services/challengeService.ts
export async function myNewFeature() {
  // Your code here
}
```

### Add to Schedule

```typescript
// src/scheduler.ts
cron.schedule('0 6 * * *', async () => {
  await myNewFeature();
});
```

## Security

- **Never commit `.env` file**
- Keep `PLATFORM_SAFE_KEY` secure
- Use environment variables for all secrets
- Rotate keys regularly
- Monitor for unusual activity

## Support

See `../KEEPER_BOT.md` for detailed architecture and requirements.

For issues:
1. Check logs: `pm2 logs keeper-bot` or `docker logs keeper-bot`
2. Verify environment variables
3. Test manually: `npm run manual-trigger`
4. Check contract balances: `npx tsx ../scripts/check-game-contracts.ts`
