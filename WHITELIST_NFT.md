# Whitelist Passport NFT in V2 Staking Contract

## Problem
The V2 YieldStrategy contract (`0xe1895d0A166cf750E5e8620A63445661C67112d5`) is rejecting staking attempts with the error:
```
Invalid NFT address
```

This means the Passport NFT contract address is not whitelisted in the staking contract.

## Solution

**You don't need to redeploy!** Just whitelist the Passport NFT address using the contract owner account.

### Contract Addresses
- **YieldStrategy V2:** `0xe1895d0A166cf750E5e8620A63445661C67112d5`
- **Passport NFT:** `0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8` (from `.env`)

### Method 1: Using Cast (Foundry)

```bash
# First, check the contract owner
cast call 0xe1895d0A166cf750E5e8620A63445661C67112d5 "owner()(address)" --rpc-url <MONAD_RPC_URL>

# Then whitelist the Passport NFT (as contract owner)
cast send 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "addAcceptedNFT(address)" \
  0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8 \
  --rpc-url <MONAD_RPC_URL> \
  --private-key <OWNER_PRIVATE_KEY>
```

### Method 2: Using Ethers.js Script

```typescript
import { ethers } from 'ethers';

const YIELD_STRATEGY = '0xe1895d0A166cf750E5e8620A63445661C67112d5';
const PASSPORT_NFT = '0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8';

const provider = new ethers.JsonRpcProvider('<MONAD_RPC_URL>');
const wallet = new ethers.Wallet('<OWNER_PRIVATE_KEY>', provider);

const yieldStrategy = new ethers.Contract(
  YIELD_STRATEGY,
  ['function addAcceptedNFT(address nftAddress) external'],
  wallet
);

const tx = await yieldStrategy.addAcceptedNFT(PASSPORT_NFT);
await tx.wait();

console.log('✅ Passport NFT whitelisted!', tx.hash);
```

### Method 3: Using Viem

```typescript
import { createWalletClient, http, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from './app/chains';

const account = privateKeyToAccount('<OWNER_PRIVATE_KEY>');

const client = createWalletClient({
  account,
  chain: monadTestnet,
  transport: http(),
});

const hash = await client.writeContract({
  address: '0xe1895d0A166cf750E5e8620A63445661C67112d5',
  abi: parseAbi(['function addAcceptedNFT(address nftAddress) external']),
  functionName: 'addAcceptedNFT',
  args: ['0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8'],
});

console.log('✅ Passport NFT whitelisted!', hash);
```

## Common Function Names

The whitelist function might have one of these names (try in order):
1. `addAcceptedNFT(address nftAddress)`
2. `setAcceptedNFT(address nftAddress, bool accepted)`
3. `addWhitelistedNFT(address nftAddress)`
4. `setWhitelisted(address nftAddress, bool whitelisted)`

## Verify Whitelist

After whitelisting, verify it worked:

```bash
# Check if NFT is whitelisted
cast call 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "acceptedNFTs(address)(bool)" \
  0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8 \
  --rpc-url <MONAD_RPC_URL>

# Should return: true
```

## After Whitelisting

Once the Passport NFT is whitelisted, staking will work immediately - no code changes needed!

The error handling has been updated to show a clear message when this issue occurs:
```
The Passport NFT contract (0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8) is not whitelisted
in the V2 staking contract. Please contact the team to whitelist this NFT address,
or use the owner account to call addAcceptedNFT(0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8)
on the YieldStrategy contract.
```
