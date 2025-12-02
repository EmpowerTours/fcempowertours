# FC Empower Tours Discord Bot

A Discord bot for the $TOURS token community on Monad blockchain with tipping, balance checking, Farcaster verification, and token-gated roles.

## Features

- `/tip @user amount` - Send TOURS tokens to another user
- `/balance` - Check your TOURS token balance and tier status
- `/verify-farcaster` - Link your Farcaster account via Neynar
- `/link-wallet 0x...` - Link your Monad wallet to Discord
- `/claim` - Claim pending tips and check airdrop eligibility

### Token-Gated Roles

Automatic role assignment based on TOURS holdings:
- **Bronze**: 1,000+ TOURS
- **Silver**: 10,000+ TOURS
- **Gold**: 100,000+ TOURS

## Tech Stack

- **discord.js v14** - Discord API interaction with slash commands
- **viem** - Blockchain reads and contract interactions
- **ioredis** - Redis for user data storage
- **TypeScript** - Type-safe development

## Network Configuration

| Network | Chain ID | RPC URL |
|---------|----------|---------|
| Monad Testnet | 10143 | https://testnet-rpc.monad.xyz |
| Monad Mainnet | 143 | https://rpc.monad.xyz |

**WMON Mainnet Address**: `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A`

## Setup

### Prerequisites

- Node.js 18+
- Redis instance
- Discord Bot Token
- Neynar API Key (for Farcaster verification)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

Copy the example environment file and fill in your values:

```bash
cp .env.example .env
```

Required environment variables:

```env
# Discord
DISCORD_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_GUILD_ID=your_server_id

# Blockchain
NETWORK=testnet
TOURS_TOKEN_ADDRESS=0x...
TIP_POOL_PRIVATE_KEY=0x...

# Redis
REDIS_URL=redis://localhost:6379

# Farcaster
NEYNAR_API_KEY=your_api_key

# Role IDs (create roles in Discord first)
ROLE_BRONZE_ID=...
ROLE_SILVER_ID=...
ROLE_GOLD_ID=...
```

### 3. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Create a new application
3. Go to "Bot" and create a bot
4. Copy the token to `DISCORD_TOKEN`
5. Copy the Application ID to `DISCORD_CLIENT_ID`
6. Enable these Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent (optional)

### 4. Deploy Slash Commands

```bash
npm run deploy-commands
```

### 5. Start the Bot

Development:
```bash
npm run dev
```

Production:
```bash
npm run build
npm start
```

## Railway Deployment

This bot is configured to deploy as a separate Railway service from the main Next.js app.

### Setup on Railway

1. Create a new service in your Railway project
2. Connect to this repository
3. Set the root directory to `discord-bot`
4. Add environment variables in Railway dashboard
5. Add a Redis service and link it

The `railway.json` file configures:
- Nixpacks builder for Node.js
- Build command: `npm install && npm run build`
- Start command: `npm run start`
- Auto-restart on failure

### Environment Variables in Railway

Add all variables from `.env.example` in the Railway dashboard. For Redis, use the Railway-provided connection URL.

## Project Structure

```
discord-bot/
├── src/
│   ├── index.ts              # Main entry point, Discord client setup
│   ├── deploy-commands.ts    # Register slash commands with Discord
│   ├── config.ts             # Environment variables and chain config
│   ├── commands/
│   │   ├── tip.ts            # /tip command
│   │   ├── balance.ts        # /balance command
│   │   ├── verify-farcaster.ts # /verify-farcaster command
│   │   ├── link-wallet.ts    # /link-wallet command
│   │   └── claim.ts          # /claim command
│   └── services/
│       ├── blockchain.ts     # Viem client, TOURS contract interactions
│       ├── database.ts       # Redis for user-wallet mappings
│       └── roles.ts          # Token-gated role management
├── package.json
├── tsconfig.json
├── .env.example
├── railway.json
└── README.md
```

## Commands Reference

### /tip

Send TOURS tokens to another Discord user.

```
/tip user:@username amount:100 message:"Thanks for helping!"
```

- Requires linked wallet with sufficient balance
- If recipient doesn't have a linked wallet, tip is stored as "pending"
- Pending tips can be claimed after recipient links their wallet

### /balance

Check TOURS balance and tier status.

```
/balance [user:@username]
```

- Shows TOURS and MON balances
- Displays current tier and progress to next tier
- Shows tip statistics and pending tips

### /link-wallet

Link a Monad wallet to your Discord account.

```
/link-wallet address:0x...
```

- One wallet per Discord account
- One Discord account per wallet
- Automatically updates tier roles

### /verify-farcaster

Link your Farcaster account via Neynar.

```
/verify-farcaster username:yourname
```

- Verifies Farcaster account ownership
- Displays Farcaster info in balance checks

### /claim

Claim pending tips or check airdrop eligibility.

```
/claim
```

- Claims pending tips to linked wallet
- Shows airdrop status if claim contract is configured

## Security Considerations

- **Tip Pool Wallet**: Use a dedicated wallet for the tip pool. Never use a wallet with significant holdings.
- **Private Key**: Store `TIP_POOL_PRIVATE_KEY` securely. Use Railway's encrypted environment variables.
- **Redis**: Use password-protected Redis in production.
- **Rate Limiting**: Discord.js handles rate limiting automatically.

## License

MIT
