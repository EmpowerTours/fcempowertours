# MON Rescue Service - Mainnet Front-Runner

Monitors compromised wallet `0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9` on Monad Mainnet and automatically front-runs the hacker by sweeping any incoming MON to a safe wallet.

## Strategy

1. **Detect**: Poll wallet balance every 100ms using Alchemy premium RPC
2. **React**: When MON arrives, immediately send rescue transaction
3. **Outbid**: Use 15x gas multiplier to beat hacker's transaction in mempool
4. **Save**: Transfer MON to safe wallet before drainer can steal it

## Deployment to Railway

1. **Create new project** on Railway.app
2. **Connect this GitHub repo** (or deploy from CLI)
3. **Set environment variables**:
   ```
   COMPROMISED_PRIVATE_KEY=0x054c4eb995fd41652d23d042cc3b0e7143a67c8b7f4804b09df450ca863f44d6
   SAFE_DESTINATION_ADDRESS=0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1
   ALCHEMY_RPC=https://monad-mainnet.g.alchemy.com/v2/5RjiLS2xutF4TeoZg_saz
   ```
4. **Set start command**: `npm start`
5. **Deploy** and monitor logs

## Configuration

- **Network**: Monad Mainnet (Chain ID: 143)
- **RPC Provider**: Alchemy (Free Tier)
- **Poll Interval**: 100ms (10 checks/second)
- **Gas Multiplier**: 15x (aggressive front-running)
- **Compromised Wallet**: `0xe67e13D545C76C2b4e28DFE27Ad827E1FC18e8D9`
- **Safe Wallet**: `0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1`

## Monitoring

Watch Railway logs for:
- `💰💰💰 BALANCE DETECTED` - MON arrived!
- `✅✅✅ RESCUE TX SENT` - Successfully front-ran hacker
- `🎉🎉🎉 RESCUE SUCCESSFUL` - MON saved!

## Why It Might Still Fail

- Hacker has paid RPC with better latency
- Hacker is running locally on Monad validator node (0ms latency)
- Hacker has priority mempool access

If this fails again, upgrade to:
- **dRPC Premium** ($10/mo) - Better performance
- **QuickNode** ($49/mo) - Best latency
- **Direct validator RPC** - Ultimate speed

Generated with [Claude Code](https://claude.ai/code)
via [Happy](https://happy.engineering)

Co-Authored-By: Claude <noreply@anthropic.com>
Co-Authored-By: Happy <yesreply@happy.engineering>
