# MON vs WMON: Strategic Token Usage Guide

## Token Differentiation & Optimal Use Cases

### Overview

You're absolutely right to distinguish between MON and WMON - they serve **fundamentally different purposes** and we should leverage each one's strengths.

---

## Token Characteristics

### MON (Native Token)

**What it is:**
- Monad's native blockchain token (like ETH on Ethereum)
- Used for gas fees
- Can be sent as native value transfers
- Required for all blockchain interactions

**Technical Properties:**
- Not an ERC-20 token (it's the native asset)
- Can't be used in standard ERC-20 contract functions
- Must be "wrapped" to interact with DeFi protocols
- Sent via `value` field in transactions

**Best Used For:**
- ✅ Gas fees (obviously)
- ✅ User wallet balances (simplest for users to understand)
- ✅ Peer-to-peer payments
- ✅ Staking (shMONAD liquid staking)
- ✅ Direct service payments where gas is involved
- ✅ Primary display currency in UI

---

### WMON (Wrapped MON)

**What it is:**
- ERC-20 tokenized version of MON
- 1:1 pegged to MON
- Can be "wrapped" (MON → WMON) or "unwrapped" (WMON → MON)
- Standard ERC-20 with `transfer`, `approve`, `transferFrom`

**Technical Properties:**
- Fully compatible with all DeFi protocols
- Can be used in AMM pools
- Supports token approvals and delegated transfers
- Required for any ERC-20 contract interaction

**Best Used For:**
- ✅ AMM trading (TOURS ⇄ WMON swaps)
- ✅ Liquidity pool provision
- ✅ DeFi integrations (lending, borrowing)
- ✅ Smart contract escrow (easier than native MON)
- ✅ ERC-20 token swaps
- ✅ Backend contract interactions

---

## Strategic Usage in EmpowerTours

### User-Facing Layer (What Users See)

**Primary Currency: MON**

```typescript
// User's perspective
interface UserBalance {
  mon: number;           // "1000 MON" - Main balance
  staked: number;        // "500 shMON" - Staked for yield
  wmon?: number;         // Hidden from most users (advanced only)
}

// Display to users
"Balance: 1,000 MON"
"Staked: 500 shMON (earning 5% APY)"
```

**Why MON for users:**
- ✅ Simpler mental model (one main currency)
- ✅ Native token feels more "real" to users
- ✅ No need to explain wrapping/unwrapping
- ✅ Direct association with blockchain value

---

### Backend/Contract Layer (What Contracts Use)

**Flexible Multi-Token Strategy:**

```
┌─────────────────────────────────────────────────────────┐
│                USER ACTIONS (Simple)                     │
├─────────────────────────────────────────────────────────┤
│  "Pay 20 MON for food order"                            │
│  "Stake 100 MON"                                        │
│  "Book ride for 15 MON"                                 │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│           DELEGATION LAYER (Auto-Convert)                │
├─────────────────────────────────────────────────────────┤
│  1. Wrap MON → WMON (if needed for contract)           │
│  2. Swap WMON → TOURS (if needed for games)            │
│  3. Execute contract call                               │
│  4. Unwrap back to MON (if user wants native)          │
└─────────────────────────────────────────────────────────┘
                        ↓
┌─────────────────────────────────────────────────────────┐
│              CONTRACT LAYER (Use Best Token)             │
├─────────────────────────────────────────────────────────┤
│  ServiceMarketplace: WMON (easier escrow)               │
│  GameContracts: TOURS (internal rewards)                │
│  LiquidityPools: WMON + TOURS (AMM trading)            │
│  Staking: MON → shMON (native staking)                 │
└─────────────────────────────────────────────────────────┘
```

---

## Optimal Token Assignment by Feature

### 1. Service Marketplace (Food & Rides)

**Use: WMON** ✅

**Why:**
- Easier escrow mechanics (ERC-20 approve → transferFrom)
- Standard token transfers
- No special handling for native value
- Better for contract-to-contract interactions

**Flow:**
```typescript
// User wants to order food (sees 25 MON)
// Backend handles conversion

1. User has 1000 MON in wallet
2. Delegation bot wraps 25 MON → 25 WMON
3. Create food order with 25 WMON
4. Escrow holds WMON
5. Upon completion: Transfer WMON to restaurant/driver
6. (Optional) Recipients unwrap to MON
```

**Contract:**
```solidity
// ServiceMarketplace.sol
IERC20 public wmonToken;  // Use WMON instead of TOURS

function createFoodOrderFor(
    address beneficiary,
    address provider,
    uint256[] memory menuItemIds,
    uint256[] memory quantities,
    string memory deliveryAddress,
    uint256 deliveryFee
) external nonReentrant returns (uint256) {
    // ... calculate foodPrice ...

    uint256 totalAmount = foodPrice + deliveryFee;

    // Transfer WMON to escrow (easier than native MON)
    require(
        wmonToken.transferFrom(beneficiary, address(this), totalAmount),
        "Transfer failed"
    );

    // ... rest of function ...
}
```

**Benefits:**
- ✅ Standard ERC-20 escrow pattern
- ✅ No payable functions needed
- ✅ Clean approve/transfer flow
- ✅ Compatible with all wallets

---

### 2. Game Rewards (MusicBeatMatch, CountryCollector)

**Use: TOURS** ✅ (Hidden from users)

**Why:**
- Already implemented
- Separate reward economy
- Can be used for governance later
- Prevents game reward dumping on main token

**Flow:**
```typescript
// User plays game (sees "Win 10 MON")
// Backend handles TOURS → MON conversion

1. User wins game: Contract sends 10 TOURS to Safe
2. Delegation bot: Swap 10 TOURS → 10 WMON (AMM)
3. Unwrap 10 WMON → 10 MON
4. User sees: "+10 MON" balance increase
```

**Why this works:**
- ✅ TOURS isolated from main economy
- ✅ Users never see complexity
- ✅ Game contracts unchanged
- ✅ Future governance utility preserved

---

### 3. Staking (shMONAD Liquid Staking)

**Use: Native MON** ✅

**Why:**
- Native staking should use native token
- More "real" feeling for users
- Direct blockchain value
- Liquid staking derivative (shMON) represents staked MON

**Flow:**
```typescript
// User stakes 100 MON → receives shMON

1. User has 100 MON
2. Deposit 100 MON to staking contract
3. Receive ~100 shMON (represents staked position)
4. shMON earns yield over time
5. Redeem shMON → MON (1:1 + yield)
```

**Contract:**
```solidity
// shMONAD.sol (already implemented)
function deposit() external payable returns (uint256 shares) {
    require(msg.value > 0, "Must send MON");

    // Native MON sent via msg.value
    shares = convertToShares(msg.value);
    _mint(msg.sender, shares);

    totalAssets += msg.value;
}
```

**Benefits:**
- ✅ Native staking is standard pattern
- ✅ Users understand MON → shMON
- ✅ No wrapping/unwrapping needed
- ✅ Gas-efficient

---

### 4. Experience NFTs (Future Feature)

**Use: WMON** ✅

**Why:**
- Standard NFT payment pattern
- Works with all marketplaces
- Easy refund mechanics if needed
- Clean contract interactions

**Flow:**
```typescript
// User mints Experience NFT for 50 MON

1. User wants to mint Experience NFT
2. Delegation bot wraps 50 MON → 50 WMON
3. Approve WMON to NFT contract
4. Mint NFT, transfer WMON to creator
5. GPS coordinates revealed
```

---

### 5. Group Travel (Future Feature)

**Use: WMON** ✅

**Why:**
- Smart contract escrow (not actual wallet!)
- ERC-20 makes multi-sig/voting easier
- Standard token transfers
- Better for shared fund management

**Flow:**
```typescript
// Group pools funds for shared trip

1. Creator creates group, deposits 100 MON
   → Wrapped to 100 WMON → Held in contract

2. Friend joins, deposits 100 MON
   → Wrapped to 100 WMON → Added to pool

3. Contract holds 200 WMON in escrow
4. Creator books experience: Contract sends WMON
5. Settlement: Remaining WMON unwrapped → MON → Refunded
```

**CRITICAL: No shared private keys! Contract holds funds!**

---

### 6. Savings Goals (Future Feature)

**Use: WMON** ✅

**Why:**
- Can stake WMON for yield
- Auto-deposits easier with ERC-20
- Standard token accounting
- Compatible with yield strategies

**Flow:**
```typescript
// User saves for trip goal

1. User creates goal: "Save 1000 MON for Ghana"
2. Game reward earned: 10 TOURS
3. Auto-convert: 10 TOURS → 10 WMON
4. Deposit 10% (1 WMON) to savings contract
5. Savings contract stakes WMON for yield
6. Goal reached: Unwrap WMON → MON → User
```

---

### 7. Artist Booking (Future Feature)

**Use: WMON** ✅

**Why:**
- Ticket sales require escrow
- Revenue splits easier with ERC-20
- Standard marketplace pattern
- Multi-party payouts cleaner

**Flow:**
```typescript
// Fan buys concert ticket

1. Ticket costs 20 MON
2. Wrap 20 MON → 20 WMON
3. Transfer to event escrow
4. After concert:
   - 70% (14 WMON) → Artist
   - 25% (5 WMON) → Venue
   - 5% (1 WMON) → Platform
5. Recipients can unwrap to MON
```

---

## Token Conversion Matrix

| User Action | User Sees | Backend Uses | Auto-Convert |
|-------------|-----------|--------------|--------------|
| Check balance | "1000 MON" | MON (native) | No |
| Play game → win | "+10 MON" | TOURS | TOURS→WMON→MON |
| Order food | "Pay 25 MON" | WMON | MON→WMON |
| Book ride | "Pay 15 MON" | WMON | MON→WMON |
| Stake tokens | "Stake 100 MON" | MON (native) | No |
| Mint NFT | "50 MON" | WMON | MON→WMON |
| Join group | "Contribute 100 MON" | WMON | MON→WMON |
| Save for trip | "Auto-save 10 MON" | WMON | MON→WMON |
| Buy ticket | "20 MON" | WMON | MON→WMON |

---

## Frontend Display Logic

### Simple User View

```typescript
// components/WalletBalance.tsx

export function WalletBalance() {
  const { address } = useAccount();

  // Fetch all balances
  const { data: nativeMON } = useBalance({ address });
  const { data: wmonBalance } = useWMONBalance(address);
  const { data: toursBalance } = useTOURSBalance(address);
  const { data: shMonBalance } = useShMONBalance(address);

  // Convert everything to MON equivalent for display
  const totalMON =
    parseFloat(formatEther(nativeMON?.value || 0)) +
    parseFloat(formatEther(wmonBalance || 0)) +
    parseFloat(formatEther(toursBalance || 0)); // TOURS hidden but counted

  return (
    <div className="wallet-card">
      {/* Primary balance - only show MON */}
      <div className="main-balance">
        <h2>{totalMON.toFixed(2)} MON</h2>
        <p className="text-sm text-gray-400">Available Balance</p>
      </div>

      {/* Staked separately */}
      <div className="staked-balance">
        <p>{formatEther(shMonBalance || 0)} shMON</p>
        <p className="text-sm text-gray-400">Staked (Earning 5% APY)</p>
      </div>

      {/* Advanced users can toggle to see breakdown */}
      {showAdvanced && (
        <div className="balance-breakdown text-xs">
          <p>Native MON: {formatEther(nativeMON?.value || 0)}</p>
          <p>Wrapped MON: {formatEther(wmonBalance || 0)}</p>
          <p>TOURS (auto-convert): {formatEther(toursBalance || 0)}</p>
        </div>
      )}
    </div>
  );
}
```

---

## Delegation Bot Logic

The delegation bot automatically handles conversions based on what the contract needs:

```typescript
// api/execute-delegated.ts

async function handleDelegatedAction(action: string, params: any) {
  switch (action) {
    case 'create_food_order':
      // ServiceMarketplace needs WMON
      await ensureWMON(user, params.totalAmount);
      return await marketplace.createFoodOrderFor(user, ...params);

    case 'submit_music_guess':
      // Game contract sends TOURS, auto-convert after
      const result = await musicGame.submitGuessFor(user, ...params);
      if (result.rewardEarned > 0) {
        await autoConvertTOURStoMON(user, result.rewardEarned);
      }
      return result;

    case 'stake_mon':
      // Staking uses native MON, no conversion
      return await stakingContract.deposit({ value: params.amount });

    case 'join_group':
      // Group travel needs WMON
      await ensureWMON(user, params.contribution);
      return await groupTravel.joinGroup(params.groupId, params.contribution);
  }
}

async function ensureWMON(user: address, amount: bigint) {
  const wmonBalance = await wmonContract.balanceOf(user);

  if (wmonBalance < amount) {
    const deficit = amount - wmonBalance;
    // Wrap native MON to cover deficit
    await wmonContract.deposit({ value: deficit });
  }
}

async function autoConvertTOURStoMON(user: address, toursAmount: bigint) {
  // 1. Swap TOURS → WMON (AMM)
  await ammContract.swapToursForWMON(toursAmount);

  // 2. Unwrap WMON → MON
  await wmonContract.withdraw(toursAmount);

  // User now has MON in wallet (what they see)
}
```

---

## Strategic Advantages

### For Users:
- ✅ **Simple**: Only think in MON (one currency)
- ✅ **Familiar**: Native token feels "real"
- ✅ **Unified**: All prices in MON
- ✅ **Optional Complexity**: Advanced users can see breakdown

### For Platform:
- ✅ **Flexible**: Use best token for each use case
- ✅ **Efficient**: WMON better for contracts, MON better for users
- ✅ **Scalable**: TOURS as hidden utility token
- ✅ **Future-Proof**: Can add governance with TOURS later

### For Developers:
- ✅ **Clean Contracts**: Each contract uses optimal token
- ✅ **Standard Patterns**: WMON = standard ERC-20 patterns
- ✅ **Native Benefits**: MON for staking, gas, direct value
- ✅ **DeFi Ready**: WMON compatible with all protocols

---

## Migration Path (Testnet → Mainnet)

### Testnet (Current):
```
Users interact with: MON (display only)
Contracts use: WMON, TOURS (mixed)
Delegation bot: Auto-converts everything
```

### Mainnet (After Launch):
```
Same UX: Users only see MON
Adjusted pricing: Based on MON market price
Same backend: WMON, TOURS still used internally
Governance: TOURS voting revealed to advanced users
```

---

## Summary: Best Practices

### ✅ DO:
- Show MON to users everywhere
- Use WMON for smart contracts (escrow, payments, NFTs)
- Use native MON for staking
- Keep TOURS hidden (game rewards only)
- Auto-convert via delegation bot

### ❌ DON'T:
- Show WMON to regular users (confusing)
- Show TOURS to users (too complex)
- Ask users to manually wrap/unwrap (do it for them)
- Use native MON in contract escrow (WMON is easier)
- Mix tokens in UI (one display currency: MON)

---

## Token Flow Diagram

```
           ┌──────────────────────────────────┐
           │    USER MENTAL MODEL (Simple)    │
           │                                   │
           │         "I have MON"              │
           │     "I pay with MON"              │
           │     "I earn MON"                  │
           └──────────────────────────────────┘
                         ↓
           ┌──────────────────────────────────┐
           │  DELEGATION LAYER (Auto-Magic)   │
           │                                   │
           │  MON ⇄ WMON (wrap/unwrap)        │
           │  TOURS → WMON → MON (rewards)    │
           │  Context-aware conversions        │
           └──────────────────────────────────┘
                         ↓
    ┌────────────────────┬────────────────────┬────────────────────┐
    │                    │                    │                    │
    ▼                    ▼                    ▼                    ▼
┌────────┐         ┌──────────┐         ┌────────┐         ┌────────┐
│Staking │         │ Service  │         │ Games  │         │  AMM   │
│(MON)   │         │Contracts │         │(TOURS) │         │(WMON+  │
│        │         │(WMON)    │         │        │         │ TOURS) │
└────────┘         └──────────┘         └────────┘         └────────┘
   ↓                    ↓                    ↓                    ↓
 shMON            Restaurant/Driver      Hidden from        Liquidity
Rewards           Get WMON paid           Users             Providers
```

---

## Conclusion

**MON** = User-facing, native value, staking
**WMON** = Contract-facing, escrow, DeFi, NFTs
**TOURS** = Hidden rewards, future governance

Users only see MON. Delegation bot handles everything else automatically. Each token used for what it's best at.

**Perfect balance of simplicity (user) and flexibility (developer)!**

---

**Last Updated:** December 2025
**Status:** Strategic Framework for Implementation
