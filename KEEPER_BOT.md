# Keeper Bot Architecture & Requirements

## Overview

The Keeper Bot is an automated service that:
- Creates daily Music Beat Match challenges
- Creates weekly Country Collector challenges
- Finalizes expired challenges
- Selects music/artists from your platform
- Manages IPFS uploads for audio content

---

## Architecture

```
┌─────────────────────────────────────────────────┐
│              KEEPER BOT SERVICE                 │
│                                                 │
│  ┌──────────────┐      ┌──────────────┐       │
│  │  Scheduler   │      │ Data Fetcher │       │
│  │  (Cron)      │──────│  (Envio)     │       │
│  └──────────────┘      └──────────────┘       │
│         │                      │                │
│         ↓                      ↓                │
│  ┌──────────────┐      ┌──────────────┐       │
│  │  Challenge   │      │    IPFS      │       │
│  │  Creator     │──────│   Uploader   │       │
│  └──────────────┘      └──────────────┘       │
│         │                                       │
│         ↓                                       │
│  ┌──────────────┐                              │
│  │ Transaction  │                              │
│  │  Executor    │                              │
│  └──────────────┘                              │
│         │                                       │
└─────────┼───────────────────────────────────────┘
          │
          ↓
    ┌─────────────────┐
    │  Blockchain     │
    │  (via Platform  │
    │   Safe)         │
    └─────────────────┘
```

---

## Core Requirements

### 1. Infrastructure

**Runtime Environment:**
- Node.js 18+ (or Bun/Deno)
- TypeScript for type safety
- Running 24/7 (via PM2, systemd, or Docker)

**Deployment Options:**
- VPS (DigitalOcean, AWS EC2, Linode)
- Serverless (AWS Lambda with EventBridge)
- Docker container
- Railway/Render/Fly.io

**Database (optional but recommended):**
- PostgreSQL or MongoDB to track:
  - Created challenges
  - Challenge history
  - Error logs
  - Performance metrics

### 2. Dependencies

```json
{
  "dependencies": {
    "viem": "^2.x",                    // Blockchain interactions
    "node-cron": "^3.x",               // Task scheduling
    "axios": "^1.x",                   // HTTP requests
    "dotenv": "^16.x",                 // Environment config
    "@pinata/sdk": "^2.x",             // IPFS uploads
    "pino": "^8.x",                    // Logging
    "pg": "^8.x",                      // PostgreSQL (optional)
    "@sentry/node": "^7.x"             // Error tracking (optional)
  }
}
```

### 3. Environment Variables

```env
# Network
RPC_URL=https://testnet-rpc.monad.xyz
CHAIN_ID=10143

# Contracts
MUSIC_BEAT_MATCH=0xee83AC7E916f4feBDb7297363B47eE370FE2EC87
COUNTRY_COLLECTOR=0xb7F929B78F2A88d97CdC9Ef0235b113dd8351200

# Authentication
PLATFORM_SAFE_KEY=your_platform_safe_private_key
# OR use delegation:
DELEGATION_API_URL=https://yourapp.com/api/execute-delegated

# Data Sources
ENVIO_ENDPOINT=https://indexer.bigdevenergy.link/5e18e81/v1/graphql
PINATA_API_KEY=your_pinata_api_key
PINATA_SECRET_KEY=your_pinata_secret

# Scheduling
BEAT_MATCH_CRON="0 0 * * *"      # Daily at midnight UTC
COLLECTOR_CRON="0 0 * * 0"        # Weekly on Sunday midnight UTC

# Monitoring (optional)
SENTRY_DSN=your_sentry_dsn
ALERT_WEBHOOK=your_discord_or_slack_webhook

# Database (optional)
DATABASE_URL=postgresql://user:pass@host:5432/keeperbot
```

---

## Implementation Guide

### Project Structure

```
keeper-bot/
├── src/
│   ├── index.ts                  # Main entry point
│   ├── scheduler.ts              # Cron job setup
│   ├── services/
│   │   ├── musicDataService.ts   # Fetch music from Envio
│   │   ├── ipfsService.ts        # Upload to Pinata
│   │   ├── blockchainService.ts  # Contract interactions
│   │   └── challengeService.ts   # Challenge logic
│   ├── utils/
│   │   ├── logger.ts             # Pino logger setup
│   │   └── monitoring.ts         # Health checks
│   └── types/
│       └── index.ts              # TypeScript types
├── scripts/
│   └── manual-trigger.ts         # Manual challenge creation
├── .env
├── package.json
├── tsconfig.json
└── README.md
```

### Core Components

#### 1. Scheduler (`scheduler.ts`)

```typescript
import cron from 'node-cron';
import { createBeatMatchChallenge } from './services/challengeService';
import { createCollectorChallenge } from './services/challengeService';
import logger from './utils/logger';

export function setupScheduler() {
  // Daily Music Beat Match challenge (midnight UTC)
  cron.schedule('0 0 * * *', async () => {
    logger.info('Starting daily Music Beat Match challenge creation');
    try {
      await createBeatMatchChallenge();
      logger.info('Beat Match challenge created successfully');
    } catch (error) {
      logger.error('Failed to create Beat Match challenge', error);
      // Send alert via Discord/Slack webhook
    }
  });

  // Weekly Country Collector challenge (Sunday midnight UTC)
  cron.schedule('0 0 * * 0', async () => {
    logger.info('Starting weekly Country Collector challenge creation');
    try {
      await createCollectorChallenge();
      logger.info('Collector challenge created successfully');
    } catch (error) {
      logger.error('Failed to create Collector challenge', error);
    }
  });

  // Hourly: Finalize expired challenges
  cron.schedule('0 * * * *', async () => {
    logger.info('Checking for expired challenges');
    try {
      await finalizeExpiredChallenges();
    } catch (error) {
      logger.error('Failed to finalize challenges', error);
    }
  });

  logger.info('Scheduler initialized');
}
```

#### 2. Music Data Service (`musicDataService.ts`)

```typescript
import axios from 'axios';
import logger from '../utils/logger';

const ENVIO_ENDPOINT = process.env.ENVIO_ENDPOINT!;

interface MusicNFT {
  tokenId: string;
  name: string;
  artist: string;
  imageUrl: string;
  previewAudioUrl: string;
  fullAudioUrl: string;
}

export async function fetchRandomMusicForChallenge(): Promise<MusicNFT> {
  const query = `
    query GetRandomMusic {
      MusicNFT(
        where: {
          isBurned: {_eq: false},
          isArt: {_eq: false},
          previewAudioUrl: {_neq: ""}
        },
        limit: 50,
        order_by: {mintedAt: desc}
      ) {
        tokenId
        name
        artist
        imageUrl
        previewAudioUrl
        fullAudioUrl
      }
    }
  `;

  try {
    const response = await axios.post(ENVIO_ENDPOINT, { query });
    const musicNFTs = response.data?.data?.MusicNFT || [];

    if (musicNFTs.length === 0) {
      throw new Error('No music NFTs found in indexer');
    }

    // Pick random song
    const randomIndex = Math.floor(Math.random() * musicNFTs.length);
    const selected = musicNFTs[randomIndex];

    logger.info(`Selected music: "${selected.name}" by ${selected.artist}`);

    return selected;
  } catch (error) {
    logger.error('Failed to fetch music from Envio', error);
    throw error;
  }
}

export async function fetchArtistsForCountry(countryCode: string): Promise<string[]> {
  const query = `
    query GetCountryArtists($countryCode: String!) {
      PassportNFT(where: {countryCode: {_eq: $countryCode}}, limit: 20) {
        owner
      }
    }
  `;

  try {
    const response = await axios.post(ENVIO_ENDPOINT, {
      query,
      variables: { countryCode }
    });

    const passports = response.data?.data?.PassportNFT || [];
    const artistAddresses = [...new Set(passports.map((p: any) => p.owner))];

    // Now get their music NFTs
    const musicQuery = `
      query GetArtistMusic($artists: [String!]!) {
        MusicNFT(
          where: {
            artist: {_in: $artists},
            isBurned: {_eq: false},
            isArt: {_eq: false}
          },
          limit: 3
        ) {
          tokenId
          artist
        }
      }
    `;

    const musicResponse = await axios.post(ENVIO_ENDPOINT, {
      query: musicQuery,
      variables: { artists: artistAddresses }
    });

    const musicNFTs = musicResponse.data?.data?.MusicNFT || [];
    const artistIds = musicNFTs.slice(0, 3).map((m: any) => m.tokenId);

    if (artistIds.length < 3) {
      throw new Error(`Not enough artists for ${countryCode}`);
    }

    return artistIds;
  } catch (error) {
    logger.error(`Failed to fetch artists for ${countryCode}`, error);
    throw error;
  }
}
```

#### 3. IPFS Service (`ipfsService.ts`)

```typescript
import pinataSDK from '@pinata/sdk';
import axios from 'axios';
import logger from '../utils/logger';
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execPromise = promisify(exec);

const pinata = new pinataSDK(
  process.env.PINATA_API_KEY!,
  process.env.PINATA_SECRET_KEY!
);

/**
 * Download audio file and extract 3-second snippet
 */
export async function createAudioSnippet(audioUrl: string): Promise<string> {
  const tempDir = '/tmp/audio-processing';
  const inputFile = path.join(tempDir, `input-${Date.now()}.mp3`);
  const outputFile = path.join(tempDir, `snippet-${Date.now()}.mp3`);

  try {
    // Create temp directory
    await fs.promises.mkdir(tempDir, { recursive: true });

    // Download audio file
    logger.info(`Downloading audio from ${audioUrl}`);
    const response = await axios.get(audioUrl, { responseType: 'stream' });
    const writer = fs.createWriteStream(inputFile);
    response.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    // Extract 3-second snippet using ffmpeg
    // Start at 30 seconds in (skip intro) and take 3 seconds
    logger.info('Creating 3-second snippet with ffmpeg');
    await execPromise(
      `ffmpeg -i ${inputFile} -ss 30 -t 3 -acodec copy ${outputFile}`
    );

    return outputFile;
  } catch (error) {
    logger.error('Failed to create audio snippet', error);
    throw error;
  }
}

/**
 * Upload audio snippet to IPFS via Pinata
 */
export async function uploadAudioToIPFS(filePath: string): Promise<string> {
  try {
    logger.info(`Uploading audio to IPFS: ${filePath}`);

    const readableStream = fs.createReadStream(filePath);
    const result = await pinata.pinFileToIPFS(readableStream, {
      pinataMetadata: {
        name: `beat-match-snippet-${Date.now()}`,
      },
    });

    const ipfsHash = result.IpfsHash;
    logger.info(`Audio uploaded to IPFS: ${ipfsHash}`);

    // Clean up temp file
    await fs.promises.unlink(filePath);

    return ipfsHash;
  } catch (error) {
    logger.error('Failed to upload to IPFS', error);
    throw error;
  }
}
```

#### 4. Challenge Service (`challengeService.ts`)

```typescript
import { createPublicClient, createWalletClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import MusicBeatMatchABI from '../abis/MusicBeatMatch.json';
import CountryCollectorABI from '../abis/CountryCollector.json';
import { fetchRandomMusicForChallenge, fetchArtistsForCountry } from './musicDataService';
import { createAudioSnippet, uploadAudioToIPFS } from './ipfsService';
import logger from '../utils/logger';

const monadTestnet = defineChain({
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: {
    default: { http: [process.env.RPC_URL!] },
    public: { http: [process.env.RPC_URL!] },
  },
  testnet: true,
});

const account = privateKeyToAccount(process.env.PLATFORM_SAFE_KEY as `0x${string}`);

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

export async function createBeatMatchChallenge() {
  logger.info('🎵 Creating new Music Beat Match challenge');

  try {
    // 1. Fetch random music
    const music = await fetchRandomMusicForChallenge();

    // 2. Process audio (download + extract 3-second snippet)
    const snippetPath = await createAudioSnippet(music.previewAudioUrl);

    // 3. Upload to IPFS
    const ipfsHash = await uploadAudioToIPFS(snippetPath);

    // 4. Create challenge on blockchain
    const artistId = BigInt(music.tokenId);
    const songTitle = music.name;
    const ipfsAudioHash = ipfsHash;

    logger.info(`Creating challenge: "${songTitle}" (Artist ID: ${artistId})`);

    const { request } = await publicClient.simulateContract({
      account: account.address,
      address: process.env.MUSIC_BEAT_MATCH as `0x${string}`,
      abi: MusicBeatMatchABI,
      functionName: 'createDailyChallenge',
      args: [artistId, songTitle, ipfsAudioHash],
    });

    const hash = await walletClient.writeContract(request);
    logger.info(`Transaction submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      logger.info('✅ Beat Match challenge created successfully');

      // Store in database (optional)
      // await db.challenges.create({
      //   type: 'beat_match',
      //   artistId: music.tokenId,
      //   songTitle: music.name,
      //   ipfsHash,
      //   txHash: hash,
      //   createdAt: new Date()
      // });

      return { success: true, txHash: hash, challengeId: artistId };
    } else {
      throw new Error('Transaction failed');
    }
  } catch (error) {
    logger.error('❌ Failed to create Beat Match challenge', error);
    throw error;
  }
}

export async function createCollectorChallenge() {
  logger.info('🌍 Creating new Country Collector challenge');

  try {
    // List of countries to rotate through
    const countries = [
      { name: 'Japan', code: 'JP' },
      { name: 'Brazil', code: 'BR' },
      { name: 'United States', code: 'US' },
      { name: 'France', code: 'FR' },
      { name: 'Nigeria', code: 'NG' },
    ];

    // Pick random country
    const country = countries[Math.floor(Math.random() * countries.length)];

    logger.info(`Selected country: ${country.name} (${country.code})`);

    // Fetch artists from this country
    const artistIds = await fetchArtistsForCountry(country.code);

    if (artistIds.length < 3) {
      throw new Error(`Not enough artists for ${country.name}`);
    }

    // Create challenge on blockchain
    const { request } = await publicClient.simulateContract({
      account: account.address,
      address: process.env.COUNTRY_COLLECTOR as `0x${string}`,
      abi: CountryCollectorABI,
      functionName: 'createWeeklyChallenge',
      args: [country.name, country.code, artistIds.slice(0, 3)],
    });

    const hash = await walletClient.writeContract(request);
    logger.info(`Transaction submitted: ${hash}`);

    const receipt = await publicClient.waitForTransactionReceipt({ hash });

    if (receipt.status === 'success') {
      logger.info('✅ Country Collector challenge created successfully');
      return { success: true, txHash: hash, country: country.name };
    } else {
      throw new Error('Transaction failed');
    }
  } catch (error) {
    logger.error('❌ Failed to create Collector challenge', error);
    throw error;
  }
}

export async function finalizeExpiredChallenges() {
  logger.info('Checking for expired challenges...');

  // Check Music Beat Match
  try {
    const challenge = await publicClient.readContract({
      address: process.env.MUSIC_BEAT_MATCH as `0x${string}`,
      abi: MusicBeatMatchABI,
      functionName: 'getCurrentChallenge',
    }) as any;

    const now = Math.floor(Date.now() / 1000);

    if (challenge.active && Number(challenge.endTime) < now) {
      logger.info(`Finalizing expired Beat Match challenge ${challenge.challengeId}`);

      const { request } = await publicClient.simulateContract({
        account: account.address,
        address: process.env.MUSIC_BEAT_MATCH as `0x${string}`,
        abi: MusicBeatMatchABI,
        functionName: 'finalizeChallenge',
        args: [challenge.challengeId],
      });

      const hash = await walletClient.writeContract(request);
      await publicClient.waitForTransactionReceipt({ hash });

      logger.info('✅ Beat Match challenge finalized');
    }
  } catch (error) {
    logger.error('Error finalizing Beat Match challenge', error);
  }

  // Similar for Country Collector...
}
```

#### 5. Main Entry Point (`index.ts`)

```typescript
import { setupScheduler } from './scheduler';
import logger from './utils/logger';

async function main() {
  logger.info('🤖 Keeper Bot starting...');

  // Validate environment
  const requiredEnvVars = [
    'RPC_URL',
    'PLATFORM_SAFE_KEY',
    'MUSIC_BEAT_MATCH',
    'COUNTRY_COLLECTOR',
    'ENVIO_ENDPOINT',
    'PINATA_API_KEY',
    'PINATA_SECRET_KEY',
  ];

  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      logger.error(`Missing required environment variable: ${envVar}`);
      process.exit(1);
    }
  }

  // Setup scheduler
  setupScheduler();

  logger.info('✅ Keeper Bot is running');

  // Keep process alive
  process.on('SIGINT', () => {
    logger.info('Keeper Bot shutting down...');
    process.exit(0);
  });
}

main().catch((error) => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
```

---

## Deployment

### Option 1: PM2 (Simple VPS)

```bash
# Install PM2
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

### Option 2: Docker

```dockerfile
FROM node:18-alpine

# Install ffmpeg for audio processing
RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

CMD ["node", "dist/index.js"]
```

```bash
# Build and run
docker build -t keeper-bot .
docker run -d --name keeper-bot --env-file .env keeper-bot
```

### Option 3: Serverless (AWS Lambda + EventBridge)

```typescript
// lambda/createChallenge.ts
import { Handler } from 'aws-lambda';
import { createBeatMatchChallenge } from '../src/services/challengeService';

export const handler: Handler = async (event) => {
  try {
    const result = await createBeatMatchChallenge();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
```

Set up EventBridge rule to trigger daily at midnight.

---

## Monitoring & Alerts

### Health Check Endpoint

```typescript
import express from 'express';

const app = express();

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

app.listen(3001);
```

### Discord/Slack Alerts

```typescript
import axios from 'axios';

export async function sendAlert(message: string) {
  if (!process.env.ALERT_WEBHOOK) return;

  try {
    await axios.post(process.env.ALERT_WEBHOOK, {
      content: `🤖 Keeper Bot Alert: ${message}`,
    });
  } catch (error) {
    logger.error('Failed to send alert', error);
  }
}
```

---

## Cost Estimates

### VPS Hosting
- **DigitalOcean Droplet**: $6/month (1GB RAM)
- **AWS EC2 t3.micro**: ~$7/month
- **Railway/Render**: $5-10/month

### IPFS Storage (Pinata)
- **Free tier**: 1GB storage, good for testing
- **Paid**: $0.15/GB/month

### Blockchain Costs
- **Gas fees**: Covered by Platform Safe
- **Transaction frequency**:
  - 1 daily (Beat Match)
  - 1 weekly (Collector)
  - ~1-2 finalizations per week
  - **Total**: ~10-15 transactions/week

**Total Monthly Cost**: ~$10-20

---

## Testing

### Manual Trigger Script

```typescript
// scripts/manual-trigger.ts
import { createBeatMatchChallenge } from '../src/services/challengeService';

async function main() {
  console.log('Manually creating Beat Match challenge...');
  const result = await createBeatMatchChallenge();
  console.log('Result:', result);
}

main();
```

```bash
npx tsx scripts/manual-trigger.ts
```

---

## Security Considerations

1. **Private Key Management**
   - Use environment variables
   - Encrypt keys at rest
   - Consider AWS Secrets Manager or HashiCorp Vault

2. **Rate Limiting**
   - Prevent accidental duplicate challenges
   - Implement cooldown periods

3. **Error Recovery**
   - Retry logic with exponential backoff
   - Dead letter queue for failed tasks

4. **Monitoring**
   - Track gas usage
   - Monitor contract balances
   - Alert on failures

---

## Next Steps

1. **MVP (Minimal Viable Product)**:
   - Simple cron job service
   - Manual music selection (hardcoded list)
   - Basic logging

2. **Phase 2**:
   - Automated music selection from Envio
   - IPFS integration
   - Discord alerts

3. **Phase 3**:
   - Database for challenge history
   - Admin dashboard
   - Analytics & metrics

4. **Production**:
   - Load balancing
   - Redundancy (multiple keeper instances)
   - Advanced monitoring

---

## Quick Start

```bash
# 1. Clone keeper bot template
git clone <keeper-bot-repo>
cd keeper-bot

# 2. Install dependencies
npm install

# 3. Configure environment
cp .env.example .env
# Edit .env with your keys

# 4. Build
npm run build

# 5. Test manually
npm run manual-trigger

# 6. Start service
npm start

# 7. Check logs
tail -f logs/keeper-bot.log
```

---

Would you like me to create a starter template with this architecture?
