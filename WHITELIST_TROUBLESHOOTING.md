# Whitelist NFT Troubleshooting

## The Problem

Your `cast send` is reverting with `0x` (empty revert data), which means:
1. Function doesn't exist with that signature
2. You're not the owner
3. There's a modifier preventing execution

## Step 1: Check Contract Owner

```bash
cast call 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "owner()(address)" \
  --rpc-url https://testnet-rpc.monad.xyz
```

Compare with your address:
```bash
cast wallet address --private-key 0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2
```

## Step 2: Try Different Function Names

The function might have a different name. Try these:

### Option 1: `addAcceptedNFT(address)`
```bash
cast send 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "addAcceptedNFT(address)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key 0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2
```

### Option 2: `setAcceptedNFT(address,bool)`
```bash
cast send 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "setAcceptedNFT(address,bool)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  true \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key 0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2
```

### Option 3: `addWhitelistedNFT(address)`
```bash
cast send 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "addWhitelistedNFT(address)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key 0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2
```

### Option 4: `setWhitelisted(address,bool)`
```bash
cast send 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "setWhitelisted(address,bool)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  true \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key 0xc65948a8029bf615d2ec716435dbedc5187ac2ba91e248e65e0ed33ecd3175e2
```

## Step 3: Inspect Contract Source

If none of the above work, get the contract ABI to see what functions exist:

```bash
# Get contract code
cast code 0xe1895d0A166cf750E5e8620A63445661C67112d5 --rpc-url https://testnet-rpc.monad.xyz
```

## Step 4: Check Existing Whitelist

Try to read the whitelist status:

```bash
# Try acceptedNFTs(address)
cast call 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "acceptedNFTs(address)(bool)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  --rpc-url https://testnet-rpc.monad.xyz

# Try isAcceptedNFT(address)
cast call 0xe1895d0A166cf750E5e8620A63445661C67112d5 \
  "isAcceptedNFT(address)(bool)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  --rpc-url https://testnet-rpc.monad.xyz
```

## Addresses to Whitelist

You have TWO Passport NFT contracts:

1. **Old Contract (from indexer):** `0x54e935c5f1ec987bb87f36fc046cf13fb393acc8`
   - Users already have NFTs from this contract
   - **MUST whitelist this one!**

2. **New Contract (from .env.local):** `0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08`
   - Current contract for new mints
   - Should also whitelist this one

## If Nothing Works

The contract might not have whitelist functionality at all. Check the contract constructor or initialization:

```bash
# Get transaction that deployed the contract
cast receipt <DEPLOYMENT_TX_HASH> --rpc-url https://testnet-rpc.monad.xyz
```

If the contract doesn't have whitelist functions, you'll need to **redeploy** with:
- `mapping(address => bool) public acceptedNFTs`
- `function addAcceptedNFT(address nft) external onlyOwner`
- Or make it accept any ERC721 token

## Quick Test: Does Contract Accept All NFTs?

The contract might not have a whitelist at all. The "Invalid NFT address" error could be from:
- NFT not being ERC721 compliant
- NFT not existing at that address
- Different validation logic

Try checking if the NFT contract exists:
```bash
cast code 0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 --rpc-url https://testnet-rpc.monad.xyz
```
