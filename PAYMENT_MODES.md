# Payment Modes for Delegated Actions

## Current Architecture Issue

Users have MON in their wallets but Platform Safe uses its own MON for delegated actions.
This creates:
1. User confusion ("Why can't I use my 7 MON?")
2. Platform Safe depletion (6 MON gets drained)
3. Wasted user funds (7 MON sits unused)

## Solution: Hybrid Payment System

### Mode 1: Platform-Sponsored (Free Tier)
**For users with little/no MON**

```typescript
if (userMonBalance < actionCost) {
  // Use Platform Safe's MON
  mode = 'platform-sponsored';
  safeToUse = PLATFORM_SAFE;

  // Show user: "🎁 FREE - We're paying for you!"
}
```

### Mode 2: User-Funded (Self-Service)
**For users with sufficient MON**

```typescript
if (userSafeMonBalance >= actionCost) {
  // Use User's Safe MON
  mode = 'user-funded';
  safeToUse = USER_SAFE;

  // Show user: "💰 Using your Safe balance"
}
```

## Implementation Steps

### 1. Update Profile Page Balance Display

```tsx
// Show both Platform Safe and User Safe status

<div className="balance-cards">
  {/* Wallet Balance (always visible) */}
  <BalanceCard
    title="Wallet MON"
    amount={walletMon}
    description="Transfer to Safe to use for gasless swaps"
    action={
      <button onClick={transferToUserSafe}>
        Move to Safe →
      </button>
    }
  />

  {/* User Safe Balance (if exists) */}
  {userSafe && (
    <BalanceCard
      title="Your Safe MON"
      amount={userSafeMon}
      description="Ready for gasless swaps & lottery"
      status="✅ Active"
    />
  )}

  {/* Platform Sponsorship Status */}
  <BalanceCard
    title="Platform Sponsorship"
    amount={platformSafeAvailable ? "Available" : "Limited"}
    description={
      platformSafeAvailable
        ? "🎁 We'll pay if your Safe is empty"
        : "⚠️ Move MON to your Safe to continue"
    }
  />
</div>
```

### 2. Smart Payment Selection in execute-delegated

```typescript
async function selectPaymentMethod(userAddress: Address, requiredMon: bigint) {
  // Check user's Safe balance
  const userSafe = await getUserSafeAddress(userAddress);
  const userSafeBalance = await publicClient.getBalance({ address: userSafe });

  // Check Platform Safe balance
  const platformBalance = await publicClient.getBalance({ address: PLATFORM_SAFE });
  const RESERVE_THRESHOLD = parseEther('2'); // Keep 2 MON reserve

  if (userSafeBalance >= requiredMon) {
    // User has funds - use their Safe
    return {
      mode: 'user-funded',
      safe: userSafe,
      message: '💰 Using your Safe balance'
    };
  } else if (platformBalance > RESERVE_THRESHOLD + requiredMon) {
    // Platform can sponsor
    return {
      mode: 'platform-sponsored',
      safe: PLATFORM_SAFE,
      message: '🎁 FREE - We\'re paying for you!'
    };
  } else {
    // Both insufficient
    throw new Error(
      `Insufficient balance. Please move ${formatEther(requiredMon)} MON to your Safe. ` +
      `Platform sponsorship is currently limited.`
    );
  }
}
```

### 3. Add "Move to Safe" Flow

```typescript
// New API route: /api/move-mon-to-safe
export async function POST(req: NextRequest) {
  const { userAddress, amount } = await req.json();

  // Get or create user's Safe
  const userSafe = await getUserSafeAddress(userAddress);

  return NextResponse.json({
    userSafe,
    amount,
    instructions: [
      "1. Send MON from your wallet to your Safe",
      "2. Once confirmed, your Safe can be used for gasless actions",
      "3. Platform Safe will cover gas fees - you only pay for the action itself"
    ],
    message: `Send ${amount} MON to ${userSafe} to enable self-funded gasless transactions`
  });
}
```

## User Experience Flow

### Scenario 1: User Has No MON
```
User clicks "Enter Lottery"
  ↓
System checks: User Safe = 0 MON, Platform Safe = 6 MON
  ↓
Shows: "🎁 FREE - Platform is sponsoring your entry!"
  ↓
Platform Safe pays 1 MON for lottery
  ↓
User enters lottery (cost them nothing)
```

### Scenario 2: User Has MON in Wallet
```
User clicks "Enter Lottery"
  ↓
System checks: Wallet = 7 MON, User Safe = 0 MON
  ↓
Shows: "💡 Move MON to your Safe to pay with your own funds"
  ↓
User clicks "Move 5 MON to Safe"
  ↓
User Safe = 5 MON
  ↓
Next lottery entry: "💰 Using your Safe balance (you pay 1 MON, we pay gas)"
```

### Scenario 3: User Has MON in Safe
```
User clicks "Enter Lottery"
  ↓
System checks: User Safe = 5 MON
  ↓
Shows: "💰 Using your Safe balance"
  ↓
User Safe pays 1 MON for lottery entry
  ↓
Gas is still free (Platform Safe pays gas via AA bundler)
```

## Benefits

✅ **Clear**: Users understand where funds come from
✅ **Flexible**: Use your own MON or get sponsored
✅ **Sustainable**: Platform Safe doesn't get drained
✅ **Fair**: Users with MON use it, users without get sponsored
✅ **Transparent**: Balance display shows all funding sources

## Migration Plan

1. **Phase 1** (Current): Platform-funded only
   - Keep `USE_USER_SAFES="false"`
   - Monitor Platform Safe depletion rate
   - Add warning when Platform Safe < 2 MON

2. **Phase 2**: Add opt-in User Safes
   - Add "Move to Safe" button on profile
   - Enable `USE_USER_SAFES="true"` for users who opt in
   - Show both modes side-by-side

3. **Phase 3**: Smart auto-selection
   - Implement payment method selection logic
   - Automatically use best available funding source
   - Show clear messages about which mode is active

## Configuration

```env
# .env.local

# Platform Safe (sponsors users with no funds)
NEXT_PUBLIC_SAFE_ACCOUNT="0x2217D0BD793fC38dc9f9D9bC46cEC91191ee4F20"

# Enable hybrid mode (auto-select payment method)
PAYMENT_MODE="hybrid"  # Options: platform-only, user-only, hybrid

# Platform Safe reserve (don't go below this)
PLATFORM_SAFE_RESERVE="2.0"  # Keep 2 MON minimum

# Auto-create user Safes
AUTO_CREATE_USER_SAFES="true"
```

## UI Updates Needed

### Profile Page
- Add "Your Safe" section showing Safe address and balance
- Add "Move MON to Safe" button if wallet has MON
- Show "Platform Sponsorship Status" indicator

### Swap/Lottery Pages
- Show payment method before action: "💰 Using your Safe" or "🎁 Platform sponsored"
- Add tooltip explaining the funding source
- Show balance checks before submitting

### Transaction Confirmations
- Clearly state: "You paid: X MON, Gas paid by Platform Safe: FREE"
- Show remaining Safe balance after action
