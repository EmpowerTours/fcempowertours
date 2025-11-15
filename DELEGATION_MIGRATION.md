# Delegation Permission Migration Guide

## Background

Recent updates to the staking system require splitting the approve and stake operations into separate transactions to prevent the bundler from dropping UserOperations. This requires a new permission: `approve_yield_strategy`.

### What Changed

**Before**:
- Staking included both approve and stake in a single UserOp
- Problem: Bundler would drop the UserOp because approve simulation doesn't actually set allowance

**After**:
1. **First time only**: Call `approve_yield_strategy` action (grants unlimited approval)
2. **Anytime**: Call `stake_tours` action (uses existing approval)

### The Issue

Delegations created before commit `ab3c2db` don't have the `approve_yield_strategy` permission, causing staking to fail with:

```
❌ No permission for action: approve_yield_strategy
⚠️ Insufficient allowance, including approve call in transaction
```

## Solutions

### Option 1: Run Migration Endpoint (Recommended)

Automatically adds the missing permission to all existing delegations:

```bash
curl -X POST https://your-app.com/api/migrate-delegations \
  -H "Content-Type: application/json" \
  -d '{}'
```

Response:
```json
{
  "success": true,
  "migration": {
    "total": 10,
    "updated": 8,
    "skipped": 2,
    "errors": 0,
    "message": "Migration complete! Updated 8 delegation(s) with approve_yield_strategy permission."
  }
}
```

### Option 2: Update Individual Delegation

Add permissions to a specific user's delegation:

```bash
curl -X PATCH https://your-app.com/api/create-delegation \
  -H "Content-Type: application/json" \
  -d '{
    "userAddress": "0x1234...",
    "addPermissions": ["approve_yield_strategy"]
  }'
```

Response:
```json
{
  "success": true,
  "delegation": {
    "user": "0x1234...",
    "permissions": [
      "mint_passport",
      "stake_tours",
      "approve_yield_strategy"
    ],
    "addedPermissions": ["approve_yield_strategy"],
    "hoursLeft": 23,
    "transactionsLeft": 95,
    "message": "✅ Delegation permissions updated successfully!"
  }
}
```

### Option 3: Recreate Delegation

If you want to start fresh, revoke and recreate:

```bash
# 1. Check current delegation
curl "https://your-app.com/api/create-delegation?address=0x1234..."

# 2. User would need to revoke and create new delegation
# (This resets transaction count, so not recommended)
```

## New Staking Flow

### 1. Setup (One-time)

User calls `approve_yield_strategy` once to grant unlimited approval:

```javascript
POST /api/execute-delegated
{
  "userAddress": "0x1234...",
  "action": "approve_yield_strategy"
}
```

### 2. Stake (Anytime)

After approval is set, user can stake without needing to approve again:

```javascript
POST /api/execute-delegated
{
  "userAddress": "0x1234...",
  "action": "stake_tours",
  "params": {
    "amount": "20"
  }
}
```

## Default Permissions (New Delegations)

All new delegations created after the fix include:

- `mint_passport`
- `mint_music`
- `buy_music`
- `swap_mon_for_tours`
- `buy_itinerary`
- `send_tours`
- **`approve_yield_strategy`** ✨ (New)
- `stake_tours`
- `unstake_tours`
- `claim_rewards`
- `create_tanda_group`
- `join_tanda_group`
- `contribute_tanda`
- `claim_tanda_payout`
- `purchase_event_ticket`
- `submit_demand_signal`
- `withdraw_demand_signal`

## API Reference

### PATCH /api/create-delegation

Update permissions for an existing delegation.

**Request:**
```json
{
  "userAddress": "0x...",
  "addPermissions": ["permission1", "permission2"]
}
```

**Response:**
```json
{
  "success": true,
  "delegation": {
    "user": "0x...",
    "permissions": ["...all permissions..."],
    "addedPermissions": ["permission1", "permission2"],
    "hoursLeft": 24,
    "transactionsLeft": 100,
    "message": "✅ Delegation permissions updated successfully!"
  }
}
```

### POST /api/migrate-delegations

Run migration to add `approve_yield_strategy` to all existing delegations.

**Request:**
```json
{}
```

**Response:**
```json
{
  "success": true,
  "migration": {
    "total": 10,
    "updated": 8,
    "skipped": 2,
    "errors": 0,
    "message": "Migration complete! Updated 8 delegation(s)."
  }
}
```

## Troubleshooting

### Error: "No permission for action: approve_yield_strategy"

**Cause**: Delegation was created before the permission was added.

**Solution**: Run migration endpoint or update individual delegation (see above).

### Error: "Insufficient allowance for YieldStrategy"

**Cause**: User needs to call `approve_yield_strategy` first.

**Solution**:
1. Ensure delegation has `approve_yield_strategy` permission
2. Call `approve_yield_strategy` action once
3. Then call `stake_tours`

### Staking fails even after approval

**Possible causes**:
- NFT ownership: User must own a passport NFT
- Insufficient TOURS: Safe must have enough TOURS tokens
- YieldStrategy not deployed: Contract must be deployed on the network

**Debug steps**:
1. Check delegation permissions: `GET /api/create-delegation?address=0x...`
2. Verify NFT ownership via indexer
3. Check TOURS balance in Safe
4. Verify YieldStrategy contract deployment

## Related Commits

- `ab3c2db` - Add approve_yield_strategy to default delegation permissions
- `3175d35` - Fix: Prevent UserOp from being dropped by splitting approve from stake
- `898d580` - Skip bundler gas estimation for approve + spend patterns
