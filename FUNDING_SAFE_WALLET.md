# Funding the Safe Wallet for Pimlico Operations

## Overview

The fcempowertours application uses a **Safe Smart Wallet** combined with **Pimlico bundler** for ERC-4337 Account Abstraction. This enables gasless transactions for users, but requires the Safe wallet to maintain a sufficient MON balance to pay for gas.

## Safe Wallet Details

- **Address**: `0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20`
- **Network**: Monad Testnet
- **Chain ID**: 10143
- **RPC**: https://testnet-rpc.monad.xyz

## Required Balance Levels

The Pimlico bundler requires a reserve balance in MON to process UserOperations:

| Level | Amount | Status | Description |
|-------|--------|--------|-------------|
| **Critical** | < 3 MON | ❌ | All transactions will FAIL |
| **Minimum** | 3 MON | ⚠️ | Bare minimum - may fail under load |
| **Recommended** | 5 MON | ✅ | Safe for most operations |
| **Optimal** | 10+ MON | ✅ | Recommended for 24/7 autonomous operations |

### Why These Amounts?

- **Gas Price Volatility**: Bundler reserves vary with network gas prices
- **Operation Complexity**: Game management involves multiple contract calls
- **Bundler Requirements**: Pimlico checks reserve balance before processing
- **24/7 Operations**: Autonomous cron jobs (Beat Match, Country Collector) run hourly

## How to Fund the Safe Wallet

### Option 1: Monad Testnet Faucet (Recommended)

1. Visit the Monad testnet faucet:
   ```
   https://testnet.monad.xyz/faucet
   ```

2. Enter the Safe wallet address:
   ```
   0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
   ```

3. Request testnet MON tokens

4. Verify the funding:
   ```bash
   npm run check-safe
   ```

### Option 2: Manual Transfer from Another Wallet

If you have MON in another wallet on Monad Testnet:

1. Open your wallet (MetaMask, Rainbow, etc.)
2. Ensure you're connected to Monad Testnet
3. Send MON to: `0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20`
4. Recommended amount: **10 MON** or more

### Option 3: Programmatic Funding (Advanced)

If you have a funded wallet and want to script the funding:

```typescript
import { createWalletClient, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from './app/chains';

const account = privateKeyToAccount(process.env.FUNDER_PRIVATE_KEY as `0x${string}`);
const SAFE_ADDRESS = '0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20';

const walletClient = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

// Send 10 MON to Safe
const hash = await walletClient.sendTransaction({
  to: SAFE_ADDRESS,
  value: parseEther('10'),
});

console.log('Funded Safe wallet:', hash);
```

## Checking Safe Balance

### Using the Helper Script

```bash
npm run check-safe
```

This will show:
- Current MON balance
- Pimlico bundler status (Critical/Warning/Healthy)
- Deficit if below minimum
- Funding resources

### Manual Check via RPC

```bash
cast balance 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 \
  --rpc-url https://testnet-rpc.monad.xyz
```

### Via Block Explorer

View the Safe on Monad explorer:
```
https://testnet.monadexplorer.com/address/0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
```

## Troubleshooting

### Error: "Sender failed reserve balance check of 0 MON"

**Problem**: Safe wallet balance is insufficient for Pimlico bundler.

**Solution**:
1. Check current balance: `npm run check-safe`
2. Fund the Safe with at least 5 MON (10+ recommended)
3. Verify funding succeeded
4. Retry failed operations

### Error: "Insufficient MON balance for Pimlico bundler operations"

This is the **improved error message** added in `lib/pimlico-safe-aa.ts`. It means:

- Current balance is below 3 MON (critical threshold)
- Application is now **failing fast** before reaching bundler
- This prevents confusing bundler errors
- Follow funding instructions above

### Balance Draining Quickly

If the Safe balance depletes rapidly:

1. **Check gas prices**: High network activity increases costs
2. **Monitor cron frequency**: Hourly game management uses gas
3. **Review operations**: Check Railway logs for operation volume
4. **Increase buffer**: Fund with 20+ MON for longer autonomy

## Monitoring and Alerts

### Recommended Monitoring

Set up alerts when balance drops below thresholds:

```typescript
// Example monitoring in your app
const balance = await publicClient.getBalance({ address: SAFE_ACCOUNT });
const balanceMON = Number(balance) / 1e18;

if (balanceMON < 5) {
  await sendAlert('⚠️ Safe balance below 5 MON - fund soon!');
}

if (balanceMON < 3) {
  await sendCriticalAlert('❌ Safe balance critical - operations failing!');
}
```

### Automation Ideas

Consider automating refills:

1. **Scheduled funding**: Top up Safe weekly
2. **Threshold-based**: Auto-fund when below 5 MON
3. **Reserve pool**: Keep a separate funder wallet with MON reserves

## Alternative: Paymaster Integration

For production, consider implementing a **Paymaster** to sponsor transactions:

- Eliminates need for Safe balance
- Pimlico offers Paymaster services
- Can sponsor specific operations
- May have monthly costs

See: https://docs.pimlico.io/paymaster

## Related Files

- `/lib/pimlico-safe-aa.ts` - Safe + Pimlico integration with balance checking
- `/scripts/check-safe-balance.ts` - Balance checking helper script
- `/app/api/cron/manage-games/route.ts` - Autonomous game management (uses Safe)

## Support

If issues persist:

1. Check Railway logs for detailed error messages
2. Verify Safe wallet deployment: `npm run fund-safe` (displays Safe info)
3. Test Pimlico bundler status: https://dashboard.pimlico.io
4. Review Monad testnet status: https://testnet.monad.xyz

---

**Last Updated**: 2025-12-11
**Safe Address**: 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20
**Network**: Monad Testnet (Chain ID: 10143)
