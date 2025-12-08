# FastLane Integration Q&A

## Question 1: Do we need a new wallet address for FastLane bundler?

### Answer: NO - Same Wallet, Same EntryPoint ✅

**You do NOT need a new wallet address!** Here's why:

```typescript
// Pimlico and FastLane use the SAME ERC-4337 standard
const ENTRYPOINT_ADDRESS = '0x0000000071727De22E5E9d8BAf0edAc6f37da032'; // v0.7

// Your existing Safe Smart Account works with BOTH bundlers
const safeAccount = '0x...your_existing_safe...';

// Only difference: bundler RPC endpoint
const pimlicoUrl = 'https://api.pimlico.io/v2/monad-testnet/rpc?apikey={key}';
const fastlaneUrl = 'https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz';

// SAME wallet, SAME EntryPoint, different bundler backend
```

### Why They're Compatible

1. **ERC-4337 Standard** - Both implement the same standard
2. **Same EntryPoint Contract** - Both use EntryPoint v0.7 at the same address
3. **Same UserOperation Format** - Both accept identical UserOps
4. **Your Safe Works with Both** - No wallet changes needed

### What You Actually Need

**Environment Variables (Railway):**

```bash
# Pimlico (Current - Keep)
NEXT_PUBLIC_PIMLICO_API_KEY=your_pimlico_api_key
NEXT_PUBLIC_PIMLICO_BUNDLER_URL=https://api.pimlico.io/v2/monad-testnet/rpc

# FastLane (New - Add for Testing)
NEXT_PUBLIC_FASTLANE_BUNDLER_URL=https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz
NEXT_PUBLIC_FASTLANE_ENABLED=false  # Set to 'true' when ready to test

# Shared (Same for Both)
NEXT_PUBLIC_ENTRYPOINT_ADDRESS=0x0000000071727De22E5E9d8BAf0edAc6f37da032
NEXT_PUBLIC_SAFE_ACCOUNT=your_existing_safe_address  # NO CHANGE!
```

### FastLane Does NOT Require:
- ❌ New wallet address
- ❌ New Safe deployment
- ❌ New EntryPoint
- ❌ Wallet migration
- ❌ API key (public endpoint)

### FastLane Only Needs:
- ✅ Enable feature flag: `NEXT_PUBLIC_FASTLANE_ENABLED=true`
- ✅ Bundler URL already has default value in `lib/env.ts`

---

## Question 2: Pimlico for NFT burning - is it still there?

### Answer: YES - 100% Intact ✅

**All existing Pimlico infrastructure remains untouched!** The hybrid approach ADDS FastLane alongside Pimlico, it doesn't replace anything.

### Verified: NFT Burning Still Uses Pimlico

**File: `app/api/burn-music/route.ts`**

```typescript
// Line 4: Still imports from pimlico-safe-aa
import { sendSafeTransaction, publicClient } from '@/lib/pimlico-safe-aa';

// Line 87: Still uses Pimlico's sendSafeTransaction
const txHash = await sendSafeTransaction([
  {
    to: MUSIC_NFT_ADDRESS,
    value: BigInt(0),
    data: burnData as Hex,
  },
]);
```

### All Pimlico Files Remain Active

```
✅ lib/pimlico-safe-aa.ts          - 850+ lines, UNCHANGED
✅ lib/pimlico/config.ts           - UNCHANGED
✅ lib/pimlico/smartAccount.ts     - UNCHANGED
✅ app/api/burn-music/route.ts     - UNCHANGED (uses Pimlico)
✅ app/api/stake-music/route.ts    - UNCHANGED (uses Pimlico)
✅ app/api/unstake-music/route.ts  - UNCHANGED (uses Pimlico)
✅ app/api/claim-rewards/route.ts  - UNCHANGED (uses Pimlico)
✅ + 18 more files...               - ALL UNCHANGED
```

### How Hybrid Works

**By Default: Everything uses Pimlico (Current Behavior)**

```typescript
// lib/bundler-config.ts
export function selectBundlerProvider(userAddress?: Address): BundlerProvider {
  // Feature flag disabled by default
  if (!env.FASTLANE_ENABLED) {
    return 'pimlico'; // ✅ ALL traffic goes to Pimlico
  }

  // Only when enabled: 10% A/B test
  if (shouldUseFastLane(userAddress)) {
    return 'fastlane';
  }

  return 'pimlico'; // Still 90% Pimlico
}
```

**NFT Burning Flow (Unchanged):**

```
User clicks "Burn NFT"
  ↓
POST /api/burn-music
  ↓
sendSafeTransaction() [Pimlico]
  ↓
Platform Safe executes burnNFTFor()
  ↓
Pimlico bundler processes UserOp
  ↓
Transaction confirmed ✅
```

### When FastLane Gets Used (Optional)

**Only when you explicitly enable it:**

```typescript
// Set in Railway:
NEXT_PUBLIC_FASTLANE_ENABLED=true

// Then ONLY NEW code that uses bundler-config.ts will A/B test
// All existing code (burn-music, stake-music, etc.) stays on Pimlico
```

### Migration Path (Your Choice)

**Option 1: Never migrate** - Keep 100% Pimlico forever ✅
**Option 2: Test then migrate** - Gradually move to FastLane if better ✅
**Option 3: Hybrid forever** - Use both strategically ✅

**Current Status: Option 1 (100% Pimlico)**

---

## Question 3: How exactly does A/B testing work?

### Answer: Hash-Based User Bucketing (Deterministic)

**A/B Test Strategy:**

```typescript
// lib/bundler-config.ts

export function shouldUseFastLane(userAddress?: Address): boolean {
  // Step 1: Check feature flag
  if (!env.FASTLANE_ENABLED) {
    return false; // ❌ FastLane disabled globally
  }

  // Step 2: No user address? Default to Pimlico
  if (!userAddress) {
    return false;
  }

  // Step 3: Hash user address (deterministic)
  const hash = hashMessage(userAddress);
  // Example: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
  // → hash: 0x1234...89ab
  //         ^^^^^^^^ last 2 hex digits = "ab" = 171 (decimal)

  // Step 4: Use last byte for bucketing (0-255)
  const lastByte = parseInt(hash.slice(-2), 16);

  // Step 5: If < 26 (~10%), use FastLane
  return lastByte < 26; // ~10% get FastLane
}
```

### How It Works in Practice

**User Address Bucketing:**

```
Address: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb1
Hash: 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
                                                              ^^^^^^^^ = "ef"
Last Byte: parseInt("ef", 16) = 239

239 < 26? NO → Use Pimlico ✅
```

```
Address: 0x1234567890abcdef1234567890abcdef12345678
Hash: 0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef123456780a
                                                              ^^^^^^^^ = "0a"
Last Byte: parseInt("0a", 16) = 10

10 < 26? YES → Use FastLane ✅
```

### Benefits of This Approach

1. **Deterministic** - Same user always gets same bundler (consistent UX)
2. **Stateless** - No database needed for bucketing
3. **Even Distribution** - Hashing ensures random-looking distribution
4. **Adjustable** - Change threshold to control percentage:
   ```typescript
   lastByte < 26  // ~10%
   lastByte < 51  // ~20%
   lastByte < 128 // ~50%
   ```

### A/B Test Flow

```
User initiates transaction
  ↓
selectBundlerProvider(userAddress)
  ↓
Is FASTLANE_ENABLED=true?
  ├─ NO → Use Pimlico (current behavior)
  │
  └─ YES → Hash user address
            ↓
            Last byte < 26?
              ├─ YES (~10%) → Use FastLane
              └─ NO (~90%)  → Use Pimlico
```

### Monitoring Metrics

```typescript
// Track which bundler was used
interface BundlerMetrics {
  provider: 'pimlico' | 'fastlane';
  userAddress: Address;
  txHash: string;
  confirmationTime: number; // ms
  gasUsed: bigint;
  success: boolean;
}

// Compare after 1000 transactions each
Pimlico: avg 3.2s, 99.5% success, 0.012 MON gas
FastLane: avg 1.8s, 99.8% success, 0.011 MON gas
→ FastLane is 1.8x faster! ✅ Migrate
```

### Controlling the Rollout

**Phase 1: Disabled (Default)**
```bash
NEXT_PUBLIC_FASTLANE_ENABLED=false
# Result: 100% Pimlico, 0% FastLane
```

**Phase 2: 10% Test**
```bash
NEXT_PUBLIC_FASTLANE_ENABLED=true
# Result: ~90% Pimlico, ~10% FastLane (hash-based)
```

**Phase 3: 50% Rollout (Change threshold)**
```typescript
// lib/bundler-config.ts
return lastByte < 128; // ~50%
```

**Phase 4: 100% FastLane (Flip default)**
```typescript
// lib/bundler-config.ts
export function selectBundlerProvider(): BundlerProvider {
  return 'fastlane'; // Default to FastLane
}
```

### Important: Existing Code NOT Affected

**A/B test ONLY applies to new code using `bundler-config.ts`:**

```typescript
// NEW code (uses abstraction layer)
import { selectBundlerProvider, createBundlerClient } from '@/lib/bundler-config';

const provider = selectBundlerProvider(userAddress); // ✅ A/B tested
const bundler = createBundlerClient(provider);
```

```typescript
// EXISTING code (still uses Pimlico directly)
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';

await sendSafeTransaction([...]); // ✅ Always Pimlico, no A/B test
```

**All 26+ existing Pimlico files continue using Pimlico directly!**

---

## Question 4: Passport NFTs are SVGs - can they be hex on-chain?

### Answer: Currently SVG → Base64 → TokenURI (Off-Chain)

### Current Implementation

**File: `lib/passport/generatePassportSVG.ts`**

```typescript
// Step 1: Generate SVG dynamically (in memory)
const svg = `<svg width="400" height="600"...>
  <text>EMPOWER TOURS</text>
  <text>${flag}</text>
  <text>${countryName}</text>
</svg>`;

// Step 2: Convert to Base64
const base64 = Buffer.from(svg).toString('base64');

// Step 3: Embed in data URI
const dataURI = `data:image/svg+xml;base64,${base64}`;

// Step 4: Return in NFT metadata
return {
  name: `EmpowerTours Passport - ${countryName}`,
  image: dataURI, // ← Base64-encoded SVG
  attributes: [...]
};
```

**File: `contracts/contracts/PassportNFTv3.sol`**

```solidity
// Line 114: TokenURI stored off-chain (string)
_setTokenURI(tokenId, uri);

// Line 387: Returns stored URI
function tokenURI(uint256 tokenId) public view returns (string memory) {
    return super.tokenURI(tokenId);
}
```

### Current Architecture

```
User mints Passport
  ↓
Frontend generates SVG (client-side)
  ↓
SVG → Base64 → Data URI
  ↓
Upload to IPFS or server
  ↓
Get URI (ipfs://... or https://...)
  ↓
Call mint(tokenId, uri)
  ↓
Contract stores URI string (32+ bytes)
  ↓
Wallets fetch tokenURI() → retrieve SVG
```

### Can SVG Be Stored as Hex On-Chain?

**YES - But requires contract changes and higher gas costs.**

### Option 1: Store SVG Bytes On-Chain (High Gas)

```solidity
// NEW: Store raw SVG bytes
mapping(uint256 => bytes) public passportSVG;

function mint(..., bytes memory svgData) external payable {
    _safeMint(to, tokenId);
    passportSVG[tokenId] = svgData; // ⚠️ EXPENSIVE! ~100KB = huge gas
}

function tokenURI(uint256 tokenId) public view returns (string memory) {
    bytes memory svg = passportSVG[tokenId];
    string memory base64 = Base64.encode(svg);
    return string(abi.encodePacked('data:image/svg+xml;base64,', base64));
}
```

**Pros:**
- ✅ Fully on-chain (immutable, no IPFS dependency)
- ✅ Can modify SVG in contract (dynamic updates)

**Cons:**
- ❌ VERY expensive gas (SVG ~3-5KB = ~100,000 gas per mint)
- ❌ Larger contract storage footprint
- ❌ Limited SVG size (block gas limit)

### Option 2: Store Compact Hex Representation (Medium Gas)

```solidity
// Store only essential data, generate SVG on-chain
struct PassportData {
    string countryCode;  // "US"
    string countryName;  // "United States"
    string flagEmoji;    // "🇺🇸" (hex: 0xF09F87BAF09F87B8)
    uint256 mintedAt;
}

function tokenURI(uint256 tokenId) public view returns (string memory) {
    PassportData memory data = passportData[tokenId];

    // Generate SVG on-chain (expensive!)
    string memory svg = string(abi.encodePacked(
        '<svg width="400" height="600">',
        '<text>', data.countryName, '</text>',
        '<text>', data.flagEmoji, '</text>',
        '</svg>'
    ));

    return svgToDataURI(svg);
}
```

**Pros:**
- ✅ Cheaper than storing full SVG
- ✅ Dynamic generation per read

**Cons:**
- ❌ Still expensive (~30,000 gas per mint)
- ❌ Complex SVG generation on-chain
- ❌ Limited emoji support (hex encoding tricky)

### Option 3: Current Approach (Best for Now)

```solidity
// Store only URI pointer (cheapest)
_setTokenURI(tokenId, "ipfs://QmXyz..."); // ~20,000 gas

// SVG stored off-chain (IPFS or server)
// Contract just points to location
```

**Pros:**
- ✅ Cheapest gas cost (~20k vs 100k)
- ✅ Unlimited SVG complexity
- ✅ Easy to update metadata standards
- ✅ Works with all wallets/marketplaces

**Cons:**
- ⚠️ Depends on IPFS/server availability
- ⚠️ Not truly "on-chain"

### Recommendation: Hybrid Approach

**Store essential data on-chain, render SVG off-chain:**

```solidity
// On-chain: Core data only
struct PassportMetadata {
    string countryCode;   // "US"
    string countryName;   // "United States"
    string region;        // "Americas"
    string continent;     // "North America"
    uint256 mintedAt;     // Timestamp
}
mapping(uint256 => PassportMetadata) public passportData; // ✅ Already exists!

// Off-chain: Dynamic SVG generation
// GET /api/passport/{tokenId}/svg
// → Reads passportData from contract
// → Generates SVG on-demand
// → Returns data URI

function tokenURI(uint256 tokenId) public view returns (string memory) {
    return string(abi.encodePacked(
        'https://fcempowertours.app/api/passport/',
        Strings.toString(tokenId),
        '/metadata.json'
    ));
}
```

**Benefits:**
- ✅ On-chain data (country, stamps) = verifiable
- ✅ Off-chain rendering = flexible, dynamic
- ✅ Best of both worlds: security + UX

### Flag Emojis as Hex

**Emojis ARE already hex (Unicode):**

```typescript
// Flag emoji (Unicode)
const flag = '🇺🇸'; // United States flag

// Hex representation
const hex = '0xF09F87BAF09F87B8';

// In Solidity (string storage)
string public flag = '🇺🇸'; // Stored as bytes internally
```

**Already works in your current PassportNFTv3:**

```solidity
// Line 36-42: Country data stored as strings (already hex internally)
struct PassportMetadata {
    string countryCode;   // "US" → stored as hex
    string countryName;   // "United States" → stored as hex
    string region;        // "Americas" → stored as hex
    string continent;     // "North America" → stored as hex
    uint256 mintedAt;     // Unix timestamp
}
```

### What You Have Now (Perfect!)

```
Mint: Store country metadata on-chain ✅
  ↓
Generate: Create SVG off-chain with on-chain data ✅
  ↓
Upload: IPFS for permanence ✅
  ↓
Store: TokenURI pointer on-chain ✅
  ↓
Render: Wallets fetch and display ✅
```

**No changes needed - your current approach is gas-efficient and standard-compliant!**

---

## Summary

### Question 1: New Wallet for FastLane?
**Answer: NO** - Use existing Safe, same EntryPoint, just add bundler URL

### Question 2: Pimlico for NFT Burning?
**Answer: YES** - 100% intact, all 26+ files unchanged, hybrid approach ADDS FastLane

### Question 3: How does A/B testing work?
**Answer: Hash-based bucketing** - Deterministic 10% rollout, adjustable, stateless

### Question 4: SVG as hex on-chain?
**Answer: Already hex internally** - Current approach (metadata on-chain, SVG off-chain via IPFS) is optimal for gas costs

---

## Railway Environment Variables to Add

```bash
# FastLane Testing (Add these)
NEXT_PUBLIC_FASTLANE_BUNDLER_URL=https://monad-testnet.4337-shbundler-fra.fastlane-labs.xyz
NEXT_PUBLIC_FASTLANE_ENABLED=false  # Set to 'true' when ready to test

# shMON Liquid Staking (Already deployed!)
NEXT_PUBLIC_SHMON_ADDRESS=0x3a98250F98Dd388C211206983453837C8365BDc1

# Keep all existing variables (unchanged)
NEXT_PUBLIC_PIMLICO_API_KEY=...existing...
NEXT_PUBLIC_PIMLICO_BUNDLER_URL=...existing...
NEXT_PUBLIC_SAFE_ACCOUNT=...existing...
NEXT_PUBLIC_ENTRYPOINT_ADDRESS=...existing...
```

**shMONAD is already deployed and integrated in:**
- ✅ Daily Lottery V2 (users can enter with shMON)
- ✅ src/hooks/useShMon.ts (React hooks ready)
- ✅ contracts/script/DeployLotteryV2.s.sol (address hardcoded)

**That's it! No wallet changes, no code migration, just add 3 env vars when ready to test.**
