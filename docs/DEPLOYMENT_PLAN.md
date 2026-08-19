# Deployment plan — v3 + wallet-only parity

Working plan for the next contract generation. Created 2026-08-17.

**Governing rule:** nothing deploys until its interface is verified against every live contract it
must interoperate with, in both directions. The section below exists because we already found one
break the hard way.

---

**Full matrix: [`INTEGRATION_MATRIX.md`](INTEGRATION_MATRIX.md)** — every cross-contract call verified
by selector probe against deployed bytecode. It found three breaks, one of them live today.

## The integration constraint that shapes everything

`MusicSubscriptionV5` (live, immutable, `0x5372aD0291a69c1EBc0BE2dc6DE9dab224045f19`) calls three
functions on the NFT contract. **v3's `LicenseRegistry` implements none of them:**

| V5 requires | v3 `LicenseRegistry` provides | Breaks |
|---|---|---|
| `masterTokens(id)` → 13-field tuple | `getMaster(id)` → 8-field `Master` struct | `recordPlay:409` cannot resolve the artist |
| `getMasterType(id)` → `NFTType` | *nothing* | `recordPlay` MUSIC check reverts |
| `artistMasterCount(addr)` | *nothing* | `isArtistEligible` reverts |

Consequence: **any master minted into v3 can never be played or paid under V5** — the one chain in
this system that verifiably works end to end. So v3 and V6 are a single deployment, not two.

Everything else in the ecosystem is looser than it looks:

- **Artist payouts are address-keyed, not FID-keyed.** `artistMonthlyPlays[monthId][artist]`,
  `artistLifetimePlays[artist]`, and `claimArtistPayout` (`msg.sender`) never touch a FID. The FID
  in `recordPlay` gates the *listener's* subscription.
- **`PlayOracleV3.setMusicSubscription(address)` is `onlyOwner`** — repointing the oracle at V6 is
  one transaction, not a redeploy.
- **v3 already removed the FID from the buyer path.** `SalesController.purchase()` has no FID
  parameter; `artistFid` at mint is the only one left.

## Where the Farcaster requirement actually binds

| Actor | FID required | Where | Immutable |
|---|---|---|---|
| Subscriber / listener | **hard** | `MusicSubscriptionV5.subscribe`/`subscribeFor` (286, 317) | yes → needs V6 |
| Artist minting | nominal, unverifiable | v3 `LicenseRegistry:193` | no — not deployed |
| Artist getting paid | **none** | — | — |

The gate binds *listeners*, not artists. `docs/V3_DESIGN.md` analyses the artist side and its
Identity table is wrong on this point — see task #2.

## Identity — decided 2026-08-18, do not re-litigate

**The address is the identity. The FID is a secondary index, never a key.**

A shared FID value — `0` for wallet-only users, or a placeholder like `1` — collides anywhere a
FID is used as a mapping key. There are exactly three such places, and only two matter:

| Location | Key? | Effect of a shared FID |
|---|---|---|
| `MusicSubscriptionV5.fidToAddress[userFid]` (300, 332) | yes | every wallet-only user overwrites `fidToAddress[0]` |
| `PassportNFTV3.fidPassports[fid][country]` (282, 309) | yes | first wallet-only user blocks all others, per country |
| `LiveRadioV3.queuedByFid` (417) | no — struct field | harmless |

Everything that carries value is already address-keyed: `subscriptions[user]`,
`artistMonthlyPlays[monthId][artist]`, `artistLifetimePlays[artist]`, and `claimArtistPayout` via
`msg.sender`.

**Fix: guard the index write, don't invent identifiers.**

```solidity
if (userFid != 0) fidToAddress[userFid] = user;
```

A wallet-only user then has no FID lookup, which is correct — they have no FID.

**Synthetic FIDs were considered and rejected.** Minting our own FID numbers to sit alongside
Farcaster's would create fake Farcaster identities (the Go API resolves `artistFid` → Warpcast
display name and would resolve to nothing, or to someone else); require our own allocator and
collision registry, rebuilding what the address already provides; force every downstream consumer
to distinguish two classes of FID — the "half-open is worse than closed" complexity relocated
rather than removed; and bet against Farcaster's sequential FID growth (~2.66M as of Feb 2026).
The address is already a globally unique identifier; a second one earns complexity without
capability.

If a single uniform identifier is ever genuinely needed, the honest shape is our own namespace
that never claims to be Farcaster's — `struct Identity { uint8 source; uint256 id; }` with
`source ∈ {FARCASTER, WALLET}` — not a number squatting in Farcaster's space.

**Consumer note:** `getSubscriptionByFid` / `fidToAddress` have **zero** consumers in `app/`,
`lib/` or `components/` — consider dropping the reverse index entirely in V6. But
`getPassportByFid` **is** live (`app/api/mirror-mate/register-guide/route.ts:20,120`) and needs an
address-based sibling before the FID lookup stops being universal.

---

## Moderation — decided 2026-08-18

Two levels, split by reversibility. **Content** moderation lives in `LicenseRegistry` (built);
**account** moderation lives in V6 (task #3).

| Action | Reversible | Who | Speed |
|---|---|---|---|
| `setMasterSuspended` | yes | moderator *or* governance | instant |
| `purgeMaster` | **never** | governance only | after review |
| `flagAccount` (V6) | yes | owner/DAO | instant |

**Suspend first, purge second.** A moderator takes content dark in seconds; governance makes it
permanent afterwards. That is why the irreversible step can afford a high bar and a timelock —
nothing is still live while you deliberate. When `governance` becomes the Timelock, `purgeMaster`
inherits the delay for free.

**A ban never takes property.** Not on suspend, not on purge. Licence holders keep their tokens,
keep passing `hasValidLicense`, and can still resell. The artist's conduct is not the buyer's
fault, and a moderation tool that can reach property will eventually be used that way.

**A flag never blocks a payout.** It stops future accrual; it cannot touch money already earned.
Fraud recovery, if ever needed, is a separate and explicitly-logged governance action — never a
side effect of a moderator flag.

**`voteToFlag` is dropped**, not ported to V6. Community-voted banning is unreachable at current
scale and abusable at any scale.

**What a purge cannot do:** erase the file. IPFS is content-addressed. `purgeMaster` stops the
registry serving the pointer (`tokenURI` returns empty for the master and every licence of it);
**unpinning is a separate off-chain step and is mandatory** — task #13.

## Order of work

```
#1 integration matrix ──┐
#2 v3 artistFid optional┴─→ #3 MusicSubscriptionV6 ─┐
                             #4 ProfileRegistry     ├─→ #7 deploy + cutover ──→ #9 Envio
                             #6 PassportNFT redeploy┘
```

| # | Task | State |
|---|---|---|
| 1 | Contract integration matrix | do first — gates everything |
| 2 | v3 `artistFid` optional + correct `V3_DESIGN` errors | free; v3 isn't deployed |
| 3 | `MusicSubscriptionV6` against the v3 interface | blocked by 1, 2 |
| 4 | `ProfileRegistry` for non-Farcaster display names | ready |
| 5 | Delete the OpenClaw Discord agent | ready — see caution below |
| 6 | `PassportNFT` redeploy, address-keyed dedup | ready |
| 7 | v3 deploy script, `migrateLegacy`, app cutover | blocked by 3, 4, 6 |
| 8 | TOURS decision | parked — product call, not engineering |
| 9 | Envio lottery cleanup | deliberately last, with the new addresses |
| 10 | Standalone radio bot: deploy or retire | ready |

## Carried into V6

- Economics unchanged: 70/20/10, tiers at 15/75/300/3000 WMON, play limits, pull-based pro-rata.
- Drop `require(userFid > 0)`.
- Read masters via v3's `getMaster()`.
- **Fix the fund-stranding bug:** `finalizeMonthlyDistribution` requires `totalPlays > 0`, so months
  with revenue but no plays can never be finalized. This permanently stranded 120 WMON across
  months 682 and 683.
- Consider moving the split from `constant` to governable-with-hard-bounds, per v3's own principle
  that policy should be swappable and governance should be the party the constants constrain.

## `/api/bot-command` stays

It is the natural-language command backend, not a Discord artifact. `app/hooks/useBotCommand.ts`
calls it from four live UI components — `nft/page.tsx`, `nft/[tokenId]`, `artist/[address]`,
`CreateNFTModal` — for `mint_music`, `mint_collector` and `buy music`. The "openclaw" name only ever
existed in three doc files (now deleted); it never appeared in the route.

Four branches are Discord-only, each guarded by `if (!discordId)`: `my safe`, `fund safe`,
`my balance`/`discord balance`, `withdraw` — plus `app/api/discord/balance/` and `app/link-discord/`.
Unreachable without a Discord bot. Keep-or-cut is task #5.

## Done

- **Lottery fully removed** (2026-08-17): 1,854 deletions across 14 files, including
  `DailyLottery.sol` and `DeployLottery.s.sol`. `tsc`, `next build` and `forge build` all clean.
  The Envio indexer still carries it — task #9.
