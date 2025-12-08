# Deployment Checklist

## 📋 Contracts Ready for Deployment

### 1. Game Contracts V2 ✅ (Ready to Deploy)

**MusicBeatMatchV2** & **CountryCollectorV2**
- ✅ Beneficiary pattern for delegation
- ✅ Farcaster username support
- ✅ Backwards compatible
- ✅ Deployment scripts ready

**Deploy Command:**
```bash
cd contracts

# Deploy MusicBeatMatchV2
forge create contracts/MusicBeatMatchV2.sol:MusicBeatMatchV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20" \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz

# Deploy CountryCollectorV2
forge create contracts/CountryCollectorV2.sol:CountryCollectorV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20" \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz
```

**After Deployment:**
- [ ] Save deployed addresses
- [ ] Fund contracts with TOURS (100k+ each)
- [ ] Update `.env.local` with V2 addresses
- [ ] Update Railway env vars
- [ ] Test delegation flow
- [ ] Update cron job to use V2

---

### 2. Service Marketplace ✅ (Ready to Deploy)

**ServiceMarketplace** - Food Delivery & Ride Sharing
- ✅ Escrow payment system
- ✅ Real-time location tracking (IPFS hashes)
- ✅ Beneficiary pattern for delegation
- ✅ Rating system
- ✅ Dispute resolution

**Deploy Command:**
```bash
cd contracts

# Using Foundry script (recommended)
forge script script/DeployServiceMarketplace.s.sol:DeployServiceMarketplace \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz

# OR manual deployment
forge create contracts/ServiceMarketplace.sol:ServiceMarketplace \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20" \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz
```

**After Deployment:**
- [ ] Save deployed address
- [ ] Update `.env.local` with SERVICE_MARKETPLACE address
- [ ] Update Railway env vars
- [ ] Add delegation cases to API
- [ ] Build food ordering frontend
- [ ] Build ride booking frontend
- [ ] Implement location tracking

---

## 🎯 Recommended Deployment Order

### Option 1: Deploy Games First (Get Games Working ASAP)
```
1. Deploy MusicBeatMatchV2
2. Deploy CountryCollectorV2
3. Fund both with TOURS
4. Update env vars
5. Test gameplay with delegation
6. Games fully working! ✅

Then later:
7. Deploy ServiceMarketplace
8. Build food/ride frontends
```

### Option 2: Deploy Everything at Once
```
1. Deploy all 3 contracts in parallel
2. Update all env vars
3. Test games first (simpler)
4. Build service marketplace features
```

**Recommendation**: Deploy games V2 first to get that feature complete, then deploy ServiceMarketplace.

---

## 🔧 Environment Variables Needed

### After Game V2 Deployment
```env
# .env.local AND Railway
NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=0xNEW_ADDRESS
NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=0xNEW_ADDRESS
```

### After ServiceMarketplace Deployment
```env
# .env.local AND Railway
NEXT_PUBLIC_SERVICE_MARKETPLACE=0xNEW_ADDRESS
```

---

## ✅ Pre-Deployment Checklist

### Prerequisites
- [ ] `DEPLOYER_PRIVATE_KEY` set in `.env`
- [ ] Deployer wallet has MON for gas
- [ ] Foundry installed (`forge --version`)
- [ ] RPC URL accessible (`https://testnet-rpc.monad.xyz`)
- [ ] Sourcify verifier URL (`https://sourcify.monad.xyz`)

### Verification
- [ ] MonadScan account (to view verified contracts)
- [ ] Sourcify should auto-verify during deployment
- [ ] Manual verification command ready if needed

---

## 📝 Post-Deployment Tasks

### Game Contracts V2
1. Transfer TOURS tokens to contracts
2. Update keeper to use V2 addresses
3. Verify delegation API works
4. Test frontend flows
5. Monitor first challenge creation via cron

### ServiceMarketplace
1. Register test food provider
2. Add test menu items
3. Register test ride provider
4. Create test order (via delegation)
5. Test status updates
6. Test payment completion
7. Verify escrow and fees work correctly

---

## 🚀 Quick Deploy All Script

```bash
#!/bin/bash

echo "🚀 Deploying all contracts..."

cd contracts

# Set your deployer key
export DEPLOYER_PRIVATE_KEY="your_key_here"

# Deploy Game V2 Contracts
echo "1️⃣ Deploying MusicBeatMatchV2..."
BEAT_MATCH_V2=$(forge create contracts/MusicBeatMatchV2.sol:MusicBeatMatchV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20" \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz \
  --json | jq -r '.deployedTo')

echo "✅ MusicBeatMatchV2: $BEAT_MATCH_V2"

echo "2️⃣ Deploying CountryCollectorV2..."
COLLECTOR_V2=$(forge create contracts/CountryCollectorV2.sol:CountryCollectorV2 \
  --rpc-url https://testnet-rpc.monad.xyz \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --constructor-args \
    "0xa123600c82E69cB311B0e068B06Bfa9F787699B7" \
    "0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20" \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz \
  --json | jq -r '.deployedTo')

echo "✅ CountryCollectorV2: $COLLECTOR_V2"

echo "3️⃣ Deploying ServiceMarketplace..."
forge script script/DeployServiceMarketplace.s.sol:DeployServiceMarketplace \
  --rpc-url https://testnet-rpc.monad.xyz \
  --broadcast \
  --verify \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz

echo ""
echo "=== 🎉 All Deployments Complete! ==="
echo ""
echo "Add these to .env.local:"
echo "NEXT_PUBLIC_MUSIC_BEAT_MATCH_V2=$BEAT_MATCH_V2"
echo "NEXT_PUBLIC_COUNTRY_COLLECTOR_V2=$COLLECTOR_V2"
echo "NEXT_PUBLIC_SERVICE_MARKETPLACE=<check logs above>"
echo ""
echo "Next steps:"
echo "1. Fund game contracts with TOURS"
echo "2. Update Railway env vars"
echo "3. Test delegation flows"
echo "4. Build service marketplace frontend"
```

---

## 🔍 Verification Commands

If auto-verification fails:

### MusicBeatMatchV2
```bash
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  MusicBeatMatchV2 \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz \
  --constructor-args $(cast abi-encode "constructor(address,address)" \
    0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
    0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20)
```

### CountryCollectorV2
```bash
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  CountryCollectorV2 \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz \
  --constructor-args $(cast abi-encode "constructor(address,address)" \
    0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
    0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20)
```

### ServiceMarketplace
```bash
forge verify-contract \
  <DEPLOYED_ADDRESS> \
  ServiceMarketplace \
  --verifier sourcify \
  --verifier-url https://sourcify.monad.xyz \
  --constructor-args $(cast abi-encode "constructor(address,address)" \
    0xa123600c82E69cB311B0e068B06Bfa9F787699B7 \
    0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20)
```

---

## 📊 Expected Costs

### Gas Estimates (Monad Testnet)
- MusicBeatMatchV2: ~3-4M gas
- CountryCollectorV2: ~2-3M gas
- ServiceMarketplace: ~4-5M gas
- **Total**: ~9-12M gas

### Funding Requirements
- Game Contracts: 100,000 TOURS each
- ServiceMarketplace: No initial funding needed (escrow-based)

---

## 🎯 Success Criteria

### Game Contracts V2
- ✅ Deployed and verified on MonadScan
- ✅ Funded with 100k+ TOURS
- ✅ Keeper creates daily/weekly challenges
- ✅ Users can submit guesses via delegation
- ✅ Users can guess by @username
- ✅ Rewards go to correct user (not Platform Safe)

### ServiceMarketplace
- ✅ Deployed and verified on MonadScan
- ✅ Food provider can register and add menu
- ✅ Ride provider can register with vehicle
- ✅ Users can order food via delegation
- ✅ Users can request rides via delegation
- ✅ Escrow holds funds correctly
- ✅ Status updates with location hashes work
- ✅ Payment release works (provider gets 95%, platform gets 5%)

---

## 📞 Support

If deployment fails:
1. Check deployer has enough MON for gas
2. Verify RPC URL is accessible
3. Check constructor args are correct
4. Try manual deployment instead of script
5. Check Foundry version: `forge --version` (should be latest)

Ready to deploy! 🚀
