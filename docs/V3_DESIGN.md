# EmpowerToursNFT V3 — Design Notes

Status: **design only, nothing built.** Records the audit findings, architecture, and
product decisions for the next contract generation.

## Compatibility guarantee

V3 is a **new deployment**, not an upgrade. `EmpowerToursNFTV2`
(`0xB9B3acf33439360B55d12429301E946f34f3B73F`) is immutable and stays live. The app keeps
talking to V2 until it is explicitly repointed, so **building V3 cannot break anything**.
Breakage is only possible at cutover, and the exact call sites that must change are listed
at the end of this document.

---

## Audit findings V3 must fix

Found 2026-08-09 by reading the Monadscan-verified V2 source and confirming on-chain.

| id | severity | issue |
|---|---|---|
| C1 | **critical** | `executeSaleFor` has no caller authorisation. Any address can force a sale between any two parties at a price it chooses, bounded only by the victim's outstanding WMON allowance. Confirmed by simulation from an unrelated address against mainnet. |
| H1 | high | `hasValidLicense` reads `userLicenses`, which is only pushed at mint. After a resale the seller still passes and the buyer fails. |
| H2 | high | `burnExpiredLicense` has no caller authorisation. Every licence carries a 30-day expiry, so every licence becomes destroyable by any stranger 30 days after purchase. |
| H3 | high | `burnExpiredLicense` deletes `stakingInfo` without decrementing `totalStaked` or cleaning `userStakedTokens` / `stakedTokenIndex`. `_update` permits burns of staked tokens. |
| M1 | medium | Staking reward truncation. `daysStaked = elapsed / 1 day` then `lastClaimAt = now` — claiming at 1.9 days pays 1 and forfeits 0.9. |
| M2 | medium | CEI violation in `_purchaseLicenseFor`: `_safeMint` (external callback) fires before licence state is written; `collectorsMinted++` happens after the internal call returns. Guarded by `nonReentrant` today, fragile to refactor. |
| M3 | medium | Unbounded loop in `hasValidLicense`. Safe as a view, dangerous once called from a state-changing function. |
| M4 | medium | Secondary royalty is immutable at 50% (5000 bps). No setter exists; the value comes from `MUSIC_ROYALTY`/`ART_ROYALTY` constants at master mint and is copied to each licence. |

**Interim mitigation shipped** (`cf20662`): the buy batch now approves the exact on-chain
price and clears the allowance in the same atomic batch, reducing C1 exposure from an
indefinite 100 WMON standing approval to one licence price for a single transaction. This
also fixed a latent bug — the old flat 100 WMON approval could not buy master token 1 at
300 WMON, so that purchase reverted every time.

---

## Architecture

**Principle: the only thing that must never change is who owns what. Everything else is
policy.** Every finding above except H1 is a policy error, and policy should be swappable.

### Core — `LicenseRegistry`, deployed once

Facts only:

```solidity
struct License {
    uint256 masterTokenId;
    uint64  mintedAt;
    uint64  termSeconds;      // snapshotted at mint — see governance rules
    bool    isCollector;
    bool    legacyPerpetual;
}

struct Master {
    address artist;
    uint256 artistFid;
    uint64  createdAt;
    uint32  maxCollectorEditions;   // scarcity is a promise, not a knob
    uint32  collectorsMinted;
    address referrer;               // set once at mint, immutable
    uint96  royaltyShareBps;        // set once when an offering exists, immutable
    address royaltyShareSink;       // set once, immutable
}
```

Deliberately absent: no `expiry` field (derive from `mintedAt + termSeconds`), no `active`
flag (derived), no `licensee` duplicate (`ownerOf` is the truth), and **no `userLicenses`
array** — that duplicate index is the direct cause of H1.

Core enforces invariants no module can override: collector supply caps, masters soulbound,
one token per mint, burns only by owner or approved.

### Swappable modules

- **`PricingPolicy`** — `priceOf(masterId, isCollector)`, `renewalPriceOf(licenseId)`
- **`AccessPolicy`** — `isValid(licenseId)`; collector → always valid, regular →
  `mintedAt + termSeconds > now`, `legacyPerpetual` → always valid
- **`RoyaltyPolicy`** — `royaltyBps(licenseId)`, differentiated by tier (fixes M4)
- **`SalesController`** — purchase, renew, resale; all authorisation lives here (fixes C1, H2)
- **`ReferralModule`** — accrual and claims for artist and subscriber referrals

### Critical API change

Replace `hasValidLicense(user, masterId)` with `isValid(licenseId)` + `ownerOf(licenseId)`.
Deletes H1 and M3 by removing on-chain enumeration entirely. The app already knows which
licence it is checking — it has the indexer.

---

## Governance

`EmpowerToursGovernor`, `EmpowerToursTimelock`, `VotingTOURS` and `DAOContractFactory`
exist in source but are **not deployed and not wired** — `daoTimelock()` on the deployed V2
returns the zero address. `ToursTokenV2` and `ToursRewardManager` already use the
`onlyOwnerOrDAO` pattern; V3 follows it.

**Build the seam, not the machinery.** Do not deploy the Governor for V3.

```solidity
modifier onlyGovernance() { require(msg.sender == governance, "Not governance"); _; }
```

`governance` starts as a multisig and later becomes the Timelock via a single
`setGovernance(...)` call. No contract change needed to hand over to a DAO.

### Rules

1. **Two-step handoff.** `setGovernance` proposes, the new address accepts — same as
   `Ownable2Step`. A one-step transfer to a wrong address permanently bricks every parameter.
2. **Hard bounds as constants.** Governance is the party they constrain, exactly as
   `MAX_RULES` constrains the owner in `APassComplianceValidator`.
3. **48-hour timelock on parameter changes from day one**, while governance is still the
   multisig. Users see changes coming; behaviour is familiar when the DAO arrives.
4. **No `renounceGovernance`.** An ungoverned contract with no way to set parameters is
   permanently frozen.

```solidity
uint96 public constant MAX_REFERRER_BPS            = 5000;  // never more than half the fee
uint96 public constant HARD_MAX_ROYALTY_SHARE_BPS  = 3000;
uint64 public constant MIN_LICENSE_PERIOD          = 7 days;
```

### The test for any parameter

> **Did someone pay money in reliance on this value?**
> Yes → immutable, per-instance, no governance.
> No → governable, bounded by a constant.

| parameter | governable? | why |
|---|---|---|
| `referrerBps`, `subReferrerBps`, referral duration | yes | platform policy, nobody purchased against it |
| per-tier `royaltyBps` for **new** mints | yes | applies forward only |
| `maxRoyaltyShareBps`, `offeringsPaused` | yes | bounds and pause for **new** offerings |
| **`royaltyShareBps` on an existing master** | **no** | investors priced their purchase on it; a vote could otherwise expropriate shareholders |
| **`royaltyShareSink`** | **no** | repointing it redirects shareholder money |
| **`termSeconds` on an existing licence** | **no** | buyer paid for that term |

**Consequence:** `licensePeriod` must be **snapshotted onto each licence at mint**
(`termSeconds`), never read live from a global. Otherwise a governance vote retroactively
shortens access that people already paid for.

---

## Product decisions

### Expiry by tier

V2 sets `expiry = block.timestamp + licensePeriod` unconditionally at line 304, for regular
**and** collector licences alike — there is no `isCollector` branch. V3 splits them:

- **Regular** — 30 days, renewable, unlimited supply. This is the recurring stream.
- **Collector** — perpetual, capped supply, resellable. Scarcity plus permanence.

### Royalty by tier

- **Regular** — high. With unlimited supply, secondary can never exceed primary, so a high
  royalty functions as an affiliate split rather than a tax on speculation.
- **Collector** — 5–10%. Capped supply means a real secondary market can exist, and 50%
  would suppress it.

### Artist referrals

`referrer` recorded on the master at mint, immutable, `require(referrer != artist)`.
Commission comes out of the platform's 10% — **never the artist's 90%**, or artists start
avoiding referral links.

```
treasuryAmount = price * treasuryFee / 100
referrerAmount = treasuryAmount * referrerBps / 10000
platformAmount = treasuryAmount - referrerAmount
```

**Pull, never push.** Accrue to `referrerBalance[addr]` and let them claim. Transferring
inside `buy()` lets a referrer contract that reverts on receive brick every purchase of that
artist's music.

**Single level only.** Earnings come from an artist's real sales, never from recruiting
other referrers — that distinction is what separates an affiliate program from a pyramid.

**Scope broad, duration capped.** Attribution attaches to the *artist*, so a referrer earns
across everything that artist mints, for **12 months from the artist's first sale**. Per-master
scope would under-reward whoever onboarded a prolific artist; uncapped duration means paying
forever for one introduction.

**Sybil resistance is structural.** Commission accrues only on real sales, so a fake artist
with no buyers earns nothing. Self-dealing loses money: buying your own 35 WMON track returns
31.5 as artist plus ~1 as referrer against 35 paid — a net loss of ~2.45 per fake sale. This
is why a flat signup bounty is avoided: it pays out before any sale exists.

**At current volume this is symbolic** — 3% of a 10% fee on one 35 WMON sale is about two
cents. Build the attribution now because it cannot be reconstructed later; leave
`referrerBps` at zero until volume justifies it.

### Non-monetary compensation for scouts

Because referrers are community members rather than yield-seekers, and because the cash is
negligible at current volume:

- **Shares in the artist's Clearwave royalty offering**, granted free at onboarding. Costs
  nothing today, uncapped upside, aligns scouts with artist *quality* rather than count.
- **Soulbound scout tier** on the passport, levelling with artists onboarded and their
  cumulative sales. Provable earliness is the actual currency in this community.
- **Early access** to their artists' collector editions before public release.

Caveat: granting shares in a royalty offering for an introduction has a different regulatory
shape than paying a commission. Worth an opinion before it is meaningful.

### Subscriber referrals — the one with real money in it

`MusicSubscriptionV5` splits revenue 70% artist pool / 20% reserve / 10% treasury. Tiers are
15 / 75 / 300 / 3000 WMON for daily / weekly / monthly / yearly.

**30% of subscription revenue never touches artists.** Take the referral from **treasury
only**, leaving the 20% reserve alone.

At 2000–3300 bps of treasury the referrer earns 2–3.3% of the subscription price — roughly
**10 WMON per month** on a monthly sub, or 60–100 WMON on a yearly one. That is 300× what an
artist referral pays today, from revenue that already exists.

**Recurring while subscribed**, capped at 12 months from first payment. Paying per-period
rather than per-signup aligns the referrer with *retention*, which does most of the quality
filtering. Accrue only on paid conversion — never on signup, free tier, or trial.

Sybil defence is again automatic: self-referring a monthly sub costs 300 WMON to earn back
10, a loss of 290 per fake account.

**If only one referral program ships in V3, make it this one.**

### Clearwave royalty feed — split at source, not by keeper

Per-master `royaltyShareBps` and `royaltyShareSink`. The artist's cut divides automatically
on every sale:

```
artistCut = price - treasury
toSink    = artistCut * royaltyShareBps / 10000
toArtist  = artistCut - toSink
```

The sink is a dumb accumulator. A keeper approach — watching `RoyaltyPaid` and transferring
monthly — makes shareholder payment depend on the artist choosing to fund it. Splitting at
the point of sale means they cannot skip it, and shareholders can verify entitlement on-chain
rather than trusting a transfer. Same thesis as the compliance gate: if it is not enforced in
the contract, it is not enforced.

The keeper then does only what cannot be on-chain: snapshot holder balances via Envio, build
the Merkle tree, publish to IPFS, call `createRound`.

### Grandfathering

One real outside buyer: FID 213442, licence 1000004 on master 3. The other three licences
belong to FID 868469, an internal test account.

One-time `migrateLegacy(to, masterId, mintedAt, isCollector)`, governance-only, permanently
disabled by `sealMigration()`. Every migrated licence carries `legacyPerpetual = true` —
those buyers were never told about a term, so they never get one.

### What to cut, and what not to

**Cut staking.** Source of H3 and M1, and the app has **zero call sites** for `stakeNFT`,
`unstakeNFT`, or `claimStakingRewards`. Nothing breaks.

**Keep burn.** `burnNFT`, `burnNFTFor` and `burnNFTForDelegated` all have live call sites in
the admin burn-stolen flow. Cut the burn *rewards* (the TOURS payout), keep the burn itself,
and add the missing authorisation and staking-cleanup guards.

---

## App compatibility at cutover

Verified 2026-08-09 by auditing every NFT-contract call site in `app/`, `lib/`, `components/`.

**Safe — no call sites, nothing to change:**

| removed / changed | app impact |
|---|---|
| `hasValidLicense` → `isValid(licenseId)` | none, never called |
| `stakeNFT` / `unstakeNFT` / `claimStakingRewards` / `calculatePendingRewards` | none, never called |
| `userLicenses` array removed | none, never called |

**Must be updated at cutover:**

| call site | change required |
|---|---|
| `app/api/upload/route.ts` — `mintMaster`, `mintCollectorMaster` | signature gains `referrer`; pass the resolved referrer address or `address(0)` |
| `app/api/execute-delegated/route.ts` — `purchaseLicenseFor` | unchanged signature, but re-verify the exact-price approval against V3 pricing |
| `executeSaleFor` call site | gains caller authorisation and buyer consent; the delegated path must supply a signature or route through `platformOperator` |
| `burnNFT` / `burnNFTFor` / `burnNFTForDelegated` | signatures unchanged; reward return value becomes 0 once burn rewards are cut |
| `masterTokens(...)` reads | struct gains `referrer`, `royaltyShareBps`, `royaltyShareSink` — field indices shift, so every positional decode must be updated |
| `licenses(...)` reads | struct changes: `expiry` → `mintedAt` + `termSeconds`, `active` removed, `licensee` removed |

**The `masterTokens` and `licenses` struct changes are the real cutover risk.** Both are
decoded positionally in app code (`masterTokens` has 3 call sites, `licenses` has 1). Field
indices shift, and a wrong index reads a plausible-but-wrong value rather than throwing —
exactly the class of bug that is hard to spot. Update those decodes deliberately, and prefer
named-field decoding over index access.

## Referral attribution mechanics

Store server-side keyed by **FID**, not in a cookie — the gap between clicking a referral link
and uploading a master can be weeks across devices.

```
on first authenticated arrival with a ref param:
  if (!referredBy[newFid]) referredBy[newFid] = referrerFid   // first touch, write-once
```

Three surfaces populate the same record: a link (`?ref=<fid>`), a QR code encoding that same
link for in-person use, and a Farcaster cast — the miniapp frame context carries the casting
FID, so a referrer who casts about the app gets attribution with no link param at all.

A **"referred by"** field on the upload form, prefilled but editable, is the backstop: it
catches artists who heard about the platform in person, and gives a last chance to correct
attribution before `mintMaster` writes it immutably.
