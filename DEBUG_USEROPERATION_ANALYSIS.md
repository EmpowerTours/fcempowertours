# UserOperation Gas Estimation Failure Analysis

## Current Status
**Problem**: UserOperations reverting during simulation with empty reason (`0x`)
**Affected Operation**: Passport minting with new PassportNFTv2 contract

## What We Know ✅

1. **UserOperations WERE working successfully**
   - Nov 9-10, 2025: Multiple successful `eth_estimateUserOperationGas` and `eth_sendUserOperation` calls
   - Nov 13, 2025: Recent successful `pimlico_getUserOperationGasPrice` call
   - This confirms the AA setup with Safe + Pimlico bundler WAS functional

2. **Infrastructure is correctly configured**
   - ✅ Safe account deployed (code length: 344)
   - ✅ EntryPoint v0.7 deployed (0x0000000071727De22E5E9d8BAf0edAc6f37da032)
   - ✅ Passport NFT deployed (0x04a8983587B79cd0a4927AE71040caf3baA613f1)
   - ✅ Safe has sufficient MON: 2.9870 MON (need only 0.011 MON)
   - ✅ Fallback handler set correctly (0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226)

3. **Recent changes**
   - Switch to new PassportNFTv2 contract address
   - New contract requires 0.01 MON payment (not TOURS tokens)
   - Commit da099c2 attempted to fix by adding value transfer
   - Code now sends `value: 0.01 MON` with mint call
   - Mint function marked as `payable` in ABI

## What We DON'T Know ❓

1. **Was the previous success for passport minting or other operations?**
   - The successful UserOps on Nov 9-10 might have been for music minting, not passports
   - Music minting doesn't require value transfer (value: 0n)
   - If previous success was only for non-value operations, the AA setup may not support value transfers

2. **Does Safe's 4337 module properly handle value transfers?**
   - The callData `0x541d63c8...` suggests it's calling Safe's execute function
   - We need to verify if the Safe 4337 Module (v0.3.0) properly forwards the value parameter
   - Possible issue: Module might not be passing `msg.value` through to the destination contract

3. **Is the Passport contract actually reverting?**
   - Empty revert reason (`0x`) makes debugging difficult
   - Could be a require statement with empty message
   - Could be out of gas during simulation
   - Could be an assert() failure

## Root Cause Hypotheses 🔍

### Hypothesis 1: Safe 4337 Module doesn't support value transfers (MOST LIKELY)
**Evidence**:
- Previous UserOps succeeded (possibly for non-value operations)
- Current failure started when we need to send MON value
- Empty revert could indicate module rejecting the operation

**Test**: Try minting music (no value transfer) to see if AA still works for non-value ops

### Hypothesis 2: Passport contract validation failing
**Evidence**:
- New contract, could have different validation logic
- Empty revert suggests silent failure

**Test**: Call passport mint directly (not through AA) to test the contract

### Hypothesis 3: Gas estimation is too low
**Evidence**:
- UserOperation shows gas limits of `0x1` (1 wei) - clearly placeholder values
- Value transfers require more gas than regular calls

**Test**: Manually set higher gas limits

### Hypothesis 4: Safe doesn't have approval to spend its own MON
**Evidence**:
- Weak - native token transfers shouldn't require approval
- But worth checking if there's some module-level permission needed

## Recommended Next Steps 🚀

### Step 1: Test Non-Value UserOperations
Try minting a music NFT (which doesn't require value transfer) to confirm AA still works:
```typescript
// Music mint doesn't send value
{
  to: MUSIC_NFT,
  value: 0n,  // No MON needed
  data: encodeMintData(...)
}
```

**If this works**: Confirms issue is specific to value transfers through AA

### Step 2: Test Direct Passport Mint (No AA)
Call the passport contract directly without going through AA/bundler:
```typescript
// Direct call from Safe owner
await walletClient.writeContract({
  address: PASSPORT_NFT,
  abi: passportABI,
  functionName: 'mint',
  args: [recipient, 'MX', 'Mexico', ...],
  value: parseEther('0.01')
})
```

**If this works**: Confirms Passport contract is fine, issue is in AA layer

### Step 3: Check Safe 4337 Module Documentation
Research if the Safe 4337 Module v0.3.0 supports value transfers in execute calls.

### Step 4: Try Alternative Approaches

#### Option A: Use MultiSend with value
Some Safe modules require using MultiSend for value transfers

#### Option B: Two-step process
1. Pre-fund the Passport contract with MON
2. Mint without sending value in the UserOp

#### Option C: Use direct Safe transactions (fallback)
The lib/safe-direct.ts implementation I created would work, but loses AA benefits

## Code State 📝

**Current branch**: `claude/debug-useroperation-gas-estimation-01HVJoAcU61D6MVBVz54G5mG`
**Current commit**: `da099c2` (CRITICAL FIX: Send 0.01 MON payment for passport minting)

**Status**: Reverted the complete architecture change. Code is now back to using:
- `lib/pimlico-safe-aa.ts` (AA approach)
- `sendSafeTransaction()` function
- Pimlico bundler for UserOperations

## Next Action for Developer 💡

The most efficient path forward:

1. **First**, try minting music to confirm AA still works for non-value operations
2. **If that works**, the issue is definitely value transfers through the 4337 module
3. **Then**, try direct Safe transaction as a workaround (using lib/safe-direct.ts)
4. **Meanwhile**, research Safe 4337 Module documentation for value transfer support

If value transfers through AA aren't supported by the current Safe 4337 Module, we have two options:
1. Use direct Safe transactions (lose gasless benefit, but functional)
2. Upgrade to a newer Safe version or different AA module that supports value transfers

