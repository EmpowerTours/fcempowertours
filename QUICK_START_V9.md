# YieldStrategy V9 - Quick Start

## 🚀 Deploy in 5 Minutes

### 1. Setup Environment
```bash
export DEPLOYER_PRIVATE_KEY=0x...
```

### 2. Deploy Contract
```bash
forge script contracts/script/DeployV9.s.sol:DeployV9 \
  --rpc-url monad_testnet \
  --broadcast \
  --verify \
  -vvvv
```

### 3. Whitelist NFT
```bash
cast send <DEPLOYED_ADDRESS> \
  "whitelistNFT(address,bool)" \
  0x54e935c5f1ec987bb87f36fc046cf13fb393acc8 \
  true \
  --private-key $DEPLOYER_PRIVATE_KEY \
  --rpc-url https://testnet-rpc.monad.xyz
```

### 4. Update .env.local
```bash
echo "NEXT_PUBLIC_YIELD_STRATEGY=<DEPLOYED_ADDRESS>" >> .env.local
```

---

## 📝 Key Differences from V8

| Feature | V8 | V9 |
|---------|----|----|
| Unstake | ❌ Broken | ✅ Works |
| Steps | 1 (fails) | 2 (request → finalize) |
| Cooldown | None | ~7 days |

---

## 💡 Usage

### Staking (Same as V8)
```typescript
await stakeWithDeposit(nftAddress, nftTokenId, beneficiary, monAmount);
```

### Unstaking (NEW - Two Steps)
```typescript
// Step 1: Request
await requestUnstake(positionId);
// Position state: PendingWithdrawal

// ⏳ Wait ~7 days

// Step 2: Finalize
await finalizeUnstake(positionId);
// Position state: Closed
// MON returned to wallet
```

### Cancel (Before Batch Submission)
```typescript
await cancelUnstake(positionId);
// Position state: Active (restored)
```

---

## 📁 Files Created

- ✅ `contracts/contracts/EmpowerToursYieldStrategyV9.sol` - Main contract
- ✅ `contracts/script/DeployV9.s.sol` - Foundry deployment script
- ✅ `src/hooks/useYieldStrategyV9.ts` - Frontend hooks
- ✅ `DEPLOYMENT_V9.md` - Full deployment guide
- ✅ `UNSTAKING_GUIDE.md` - Unstaking mechanism explained
- ✅ `V9_SUMMARY.md` - Complete summary
- ✅ `MIGRATION_V8_TO_V9.md` - Migration guide
- ✅ `QUICK_START_V9.md` - This file

---

## 🔗 Contract Addresses

| Contract | Address |
|----------|---------|
| Kintsu V2 | `0xe1d2439b75fb9746E7Bc6cB777Ae10AA7f7ef9c5` |
| TOURS Token | `0xa123600c82E69cB311B0e068B06Bfa9F787699B7` |
| Passport NFT | `0x54e935c5f1ec987bb87f36fc046cf13fb393acc8` |
| YieldStrategy V9 | `<DEPLOY_ME>` |

---

## ✅ Checklist

- [ ] Deploy V9 contract
- [ ] Verify on MonadScan
- [ ] Whitelist Passport NFT
- [ ] Update .env.local
- [ ] Update frontend imports to `useYieldStrategyV9`
- [ ] Test staking
- [ ] Test unstaking (request → finalize)
- [ ] Test cancellation

---

## 🆘 Need Help?

- **Deployment:** See `DEPLOYMENT_V9.md`
- **Unstaking:** See `UNSTAKING_GUIDE.md`
- **Migration from V8:** See `MIGRATION_V8_TO_V9.md`
- **Full details:** See `V9_SUMMARY.md`

---

**Ready to deploy?** Run the commands above! 🚀
