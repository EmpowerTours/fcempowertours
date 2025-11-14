# 🚨 URGENT: Production Environment Update Required

## Critical Issue Identified ✅

The UserOperation failures were caused by using the **wrong Passport contract address**.

### Wrong Address (in production)
```
0x04a8983587B79cd0a4927AE71040caf3baA613f1
```

### Correct Address (PassportNFTv2)
```
0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8
```

## Required Action 🔧

**Update your production environment variable immediately:**

### For Railway:
1. Go to your Railway project dashboard
2. Navigate to Variables tab
3. Update:
   ```
   NEXT_PUBLIC_PASSPORT=0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8
   ```
4. Redeploy the application

### For other hosting platforms:
Update the `NEXT_PUBLIC_PASSPORT` environment variable to:
```bash
NEXT_PUBLIC_PASSPORT=0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8
```

## Verification ✅

After updating and redeploying:

1. **Check the logs** for contract validation:
   ```
   ✅ Passport NFT is deployed
   ```

2. **Test passport minting** - it should now work without the `0x` revert error

3. **Verify the address** being used by checking the transaction details in logs

## Why This Fixes It 💡

The old address was either:
- Not deployed
- A different contract version
- Missing the payable mint function

The new address (`0x54e935c5f1ec987BB87F36fC046cf13fb393aCc8`) is the correct PassportNFTv2 contract that:
- ✅ Has the payable `mint()` function
- ✅ Accepts 0.01 MON payment
- ✅ Has all the required validation logic
- ✅ Is already indexed by Envio

## Files Updated 📝

- ✅ `README.md` - Updated with correct address
- ✅ `empowertours-envio/config.yaml` - Already had correct address (no change needed)

## NO Code Changes Needed 🎉

The application code itself is correct! It reads from the environment variable:
```typescript
const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as Address;
```

Once the environment variable is updated in production, passport minting will work immediately.
