# ConsensusNFT Contract Deployment & Verification

## Prerequisites

1. **Foundry installed**
   ```bash
   curl -L https://foundry.paradigm.xyz | bash
   foundryup
   ```

2. **Environment variables set**
   ```bash
   export PRIVATE_KEY=0x...  # Deployer private key
   export MONADSCAN_API_KEY=...  # From monadscan.com/apis
   ```

## Step 1: Compile the Contract

```bash
cd /path/to/fcempowertours
forge build --via-ir
```

## Step 2: Deploy to Monad Mainnet

```bash
forge create contracts/ConsensusNFT.sol:ConsensusNFT \
  --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  --chain 10143 \
  --broadcast
```

**Output:** Will show contract address (e.g., `0x...`)

## Step 3: Verify on Monadscan

### Option A: Automatic Verification (Recommended)

Deploy with verification in one command:

```bash
forge create contracts/ConsensusNFT.sol:ConsensusNFT \
  --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY \
  --chain 143 \
  --broadcast \
  --verify \
  --verifier etherscan \
  --etherscan-api-key $MONADSCAN_API_KEY \
  --verifier-url "https://api.monadscan.com/api"
```

### Option B: Verify Existing Contract

If contract is already deployed without verification:

```bash
forge verify-contract \
  0xYOUR_CONTRACT_ADDRESS \
  contracts/ConsensusNFT.sol:ConsensusNFT \
  --rpc-url https://rpc.monad.xyz \
  --chain 10143 \
  --verifier etherscan \
  --etherscan-api-key $MONADSCAN_API_KEY \
  --verifier-url "https://api.monadscan.com/api" \
  --watch
```

## Step 4: Configure Railway Environment

Add to Railway environment variables:

```
NEXT_PUBLIC_CONSENSUS_NFT=0x...  (contract address from Step 2)
NEXT_PUBLIC_CONSENSUS_TREASURY=0x...  (treasury wallet address)
```

## Step 5: Authorize Backend Minter

Call the `authorizeMinter` function with backend API address:

```bash
cast send 0xYOUR_CONTRACT_ADDRESS \
  "authorizeMinter(address)" 0xBACKEND_ADDRESS \
  --rpc-url https://rpc.monad.xyz \
  --private-key $PRIVATE_KEY
```

## Verification Check

View contract on Monadscan:
```
https://monadscan.com/address/0xYOUR_CONTRACT_ADDRESS
```

Should show:
- ✅ Contract code verified
- ✅ Read Contract functions available
- ✅ Write Contract functions available

## Troubleshooting

### Verification fails with "Already Verified"
- This is normal - contract is already verified
- Check Monadscan to confirm

### "Chain not supported" error
- Use custom `--verifier-url` for Monad:
  ```
  --verifier-url "https://api.monadscan.com/api"
  ```

### Verification pending too long
- Add `--watch` flag to check status repeatedly
- Wait 5-10 minutes for Monadscan to index

## Security Notes

⚠️ **Never commit private keys to git**
- Use environment variables only
- Use different keys for testnet vs mainnet
- Rotate keys regularly

## After Deployment

1. Set `NEXT_PUBLIC_CONSENSUS_NFT` in Railway
2. Set `NEXT_PUBLIC_CONSENSUS_TREASURY` in Railway  
3. Call `authorizeMinter()` for backend API
4. Test minting flow end-to-end
5. Monitor gas costs and success rates
