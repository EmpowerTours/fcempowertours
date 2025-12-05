# Mainnet Deployment Guide - Platform Safe & Pimlico

## Overview
Your current architecture uses **ERC-4337 Account Abstraction** with:
- **Safe Smart Account** (0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 on testnet)
- **Pimlico Bundler** for UserOperation submission
- **EntryPoint v0.7** (0x0000000071727De22E5E9d8BAf0edAc6f37da032)

## Safe Account Deterministic Deployment

**IMPORTANT**: Your Safe uses deterministic deployment, which means:
- Same `SAFE_OWNER_PRIVATE_KEY` + same `saltNonce` (0n) = **same Safe address** on all chains!
- If you use the same owner key on mainnet, you'll get a **NEW Safe address** (different from testnet)
- The Safe deploys automatically on **first use** (no manual deployment needed)

## Mainnet Deployment Checklist

### 1. Get Monad Mainnet Details

```bash
# You'll need these from Monad team:
- Mainnet Chain ID (e.g., 10141 or different from testnet 10143)
- Mainnet RPC URL (e.g., https://rpc.monad.xyz)
- Mainnet Block Explorer URL
```

### 2. Create New Mainnet Environment Variables

Create `.env.mainnet`:

```bash
# Monad Mainnet RPC
NEXT_PUBLIC_MONAD_RPC="https://rpc.monad.xyz"  # Update with actual mainnet RPC
NEXT_PUBLIC_CHAIN_ID="10141"  # Update with actual mainnet chain ID

# Pimlico (check if chain ID changes in URL)
NEXT_PUBLIC_PIMLICO_API_KEY="pim_H5mQxH2vk7s2J83BhPJnt8"  # Same API key works
NEXT_PUBLIC_PIMLICO_BUNDLER_URL="https://api.pimlico.io/v2/{MAINNET_CHAIN_ID}/rpc?apikey=pim_H5mQxH2vk7s2J83BhPJnt8"

# EntryPoint v0.7 (same address on all chains)
NEXT_PUBLIC_ENTRYPOINT_ADDRESS="0x0000000071727De22E5E9d8BAf0edAc6f37da032"

# Safe Account - This will be DIFFERENT on mainnet!
# Leave blank initially - we'll compute it with the script
NEXT_PUBLIC_SAFE_ACCOUNT=""

# Safe Owner (OPTION 1: Use same key = different Safe address)
# OPTION 2: Generate new key for mainnet = different Safe address
SAFE_OWNER_PRIVATE_KEY="0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2"  # Or new key
```

### 3. Compute Mainnet Safe Address

**Before deploying**, you need to know what your Safe address will be:

```typescript
// Script: scripts/compute-mainnet-safe.ts
import { privateKeyToAccount } from 'viem/accounts';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPublicClient, http } from 'viem';

const SAFE_OWNER_PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY as `0x${string}`;
const MAINNET_RPC = process.env.NEXT_PUBLIC_MONAD_RPC!;
const MAINNET_CHAIN_ID = parseInt(process.env.NEXT_PUBLIC_CHAIN_ID!);
const ENTRYPOINT = "0x0000000071727De22E5E9d8BAf0edAc6f37da032";

const monadMainnet = {
  id: MAINNET_CHAIN_ID,
  name: 'Monad Mainnet',
  nativeCurrency: { decimals: 18, name: 'MON', symbol: 'MON' },
  rpcUrls: { default: { http: [MAINNET_RPC] } },
  testnet: false,
};

const publicClient = createPublicClient({
  chain: monadMainnet,
  transport: http(MAINNET_RPC),
});

const ownerAccount = privateKeyToAccount(SAFE_OWNER_PRIVATE_KEY);

// Compute deterministic Safe address
const safeAccount = await toSafeSmartAccount({
  client: publicClient,
  owners: [ownerAccount],
  entryPoint: {
    address: ENTRYPOINT,
    version: '0.7',
  },
  version: '1.4.1',
  saltNonce: 0n,  // Same as testnet
});

console.log('\n========================================');
console.log('   MAINNET SAFE ADDRESS');
console.log('========================================');
console.log('Owner (EOA):', ownerAccount.address);
console.log('Safe (Smart Account):', safeAccount.address);
console.log('\n⚠️  IMPORTANT: Fund this Safe with MON before deploying contracts!');
console.log('Minimum: 100 MON (recommended: 500+ MON for reliable operation)\n');
```

### 4. Fund Your Mainnet Safe

**CRITICAL**: Before any operations, you MUST fund the Safe with mainnet MON:

```bash
# Send MON to the Safe address from step 3
# Minimum: 100 MON
# Recommended: 500+ MON for gas reserves

# The Safe will deploy automatically on first UserOperation
# No manual deployment script needed!
```

### 5. Deploy All Contracts to Mainnet

Run your contract deployment scripts with mainnet RPC:

```bash
cd contracts

# 1. Deploy DailyPassLotteryV2
forge create --broadcast \
  --rpc-url $NEXT_PUBLIC_MONAD_RPC \
  --private-key $DEPLOYER_PRIVATE_KEY \
  contracts/DailyPassLotteryV2.sol:DailyPassLotteryV2 \
  --constructor-args \
    {MAINNET_SAFE_ADDRESS} \
    {PLATFORM_WALLET_ADDRESS} \
    {SHMON_TOKEN_ADDRESS}

# 2. Deploy NFT contracts
# 3. Deploy other contracts...

# Save all deployed addresses!
```

### 6. Update Environment Variables

Update `.env.mainnet` with all deployed contract addresses:

```bash
NEXT_PUBLIC_LOTTERY_ADDRESS="0x..."  # New mainnet lottery
NEXT_PUBLIC_NFT_ADDRESS="0x..."      # New mainnet NFT
NEXT_PUBLIC_SAFE_ACCOUNT="0x..."     # From step 3
# ... all other contracts
```

### 7. Update Envio Indexer for Mainnet

```yaml
# empowertours-envio/config.yaml
networks:
  - id: {MAINNET_CHAIN_ID}  # Update chain ID
    start_block: 0  # Start from genesis or recent block
    contracts:
      - name: DailyPassLottery
        address:
          - "{MAINNET_LOTTERY_ADDRESS}"
        # ... rest of config
```

### 8. Test Mainnet Safe Delegation

Run a test script to verify the Safe works:

```typescript
// scripts/test-mainnet-safe.ts
import { createSafeSmartAccountClient } from '@/lib/pimlico-safe-aa';

const smartAccountClient = await createSafeSmartAccountClient();
const safeBalance = await publicClient.getBalance({
  address: smartAccountClient.account.address
});

console.log('Safe Address:', smartAccountClient.account.address);
console.log('Safe Balance:', formatEther(safeBalance), 'MON');
console.log('EntryPoint:', smartAccountClient.account.entryPoint.address);

// Test a simple transaction (send 0 MON to yourself - just to test)
const txHash = await sendSafeTransaction([{
  to: smartAccountClient.account.address,
  value: 0n,
  data: '0x',
}]);

console.log('Test transaction:', txHash);
```

## Key Differences: Testnet vs Mainnet

| Item | Testnet | Mainnet |
|------|---------|---------|
| Chain ID | 10143 | TBD (from Monad) |
| RPC URL | https://testnet-rpc.monad.xyz | TBD (from Monad) |
| Safe Address | 0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20 | **Different** (computed) |
| EntryPoint v0.7 | 0x0000000071727De22E5E9d8BAf0edAc6f37da032 | Same (canonical) |
| Pimlico URL | /v2/10143/rpc | /v2/{MAINNET_ID}/rpc |
| Safe Balance | 6 MON (testnet) | 100-500 MON (mainnet) |
| All Contracts | Testnet addresses | **New** mainnet addresses |

## Common Gotchas

### 1. Safe Address Will Be Different
- ❌ **WRONG**: Assuming same Safe address on mainnet
- ✅ **RIGHT**: Compute new address with script before deploying

### 2. Need to Fund Safe First
- ❌ **WRONG**: Deploy contracts first, then fund Safe
- ✅ **RIGHT**: Fund Safe BEFORE first UserOperation (Safe auto-deploys on first use)

### 3. All Contract Addresses Change
- ❌ **WRONG**: Reuse testnet contract addresses
- ✅ **RIGHT**: Deploy fresh and update ALL env vars + Envio config

### 4. Pimlico Bundler URL
- ❌ **WRONG**: Keep testnet chain ID in URL
- ✅ **RIGHT**: Update to mainnet chain ID (e.g., /v2/10141/rpc)

## Estimated Costs

- **Safe deployment** (first UserOperation): ~0.5 MON
- **Contract deployments**: ~10-50 MON total (depends on contract sizes)
- **Safe gas reserve**: 100-500 MON (for delegated transactions)
- **Total budget**: ~200-600 MON for safe mainnet launch

## Post-Deployment Checklist

- [ ] Verify all contracts on Monadscan
- [ ] Update Envio indexer and restart
- [ ] Test delegation flow end-to-end
- [ ] Test lottery entry with real user
- [ ] Monitor Safe balance (set up alerts for low balance)
- [ ] Update frontend to point to mainnet
- [ ] Test fee distribution (5% Safe + 5% Wallet)

## Emergency Contacts

If Safe runs out of gas:
1. Send more MON to Safe address
2. Safe automatically uses new balance for next transaction
3. No need to redeploy or reconfigure

If Safe is compromised:
1. Generate new SAFE_OWNER_PRIVATE_KEY
2. Deploy new Safe (will have different address)
3. Redeploy contracts with new Safe address
4. Update all environment variables
