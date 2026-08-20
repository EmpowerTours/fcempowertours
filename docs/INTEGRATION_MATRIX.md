# Contract integration matrix

Every cross-contract call in the ecosystem, in both directions, verified against what the
counterparty actually implements. Built 2026-08-18 for deployment-plan task #1.

**Rule this exists to enforce:** nothing deploys until every cell below is green.

## Method

1. Live addresses taken from the **running deployment** (`GET /api/config-check`), never from
   `.env` or a paste — see the lesson in `reference_fcempowertours_contracts`.
2. Every `interface I…` declaration in every contract extracted — these are the *expectations*.
3. Each expected function probed against the deployed counterparty by 4-byte selector against
   runtime bytecode, then **confirmed with a live `cast call`** where a probe said MISS.

   **Correction 2026-08-20: a HIT needs the same treatment.** A selector appears in runtime
   bytecode whenever the contract *calls* that function on someone else, not only when it
   *offers* it — the outbound call site embeds the same four bytes as a dispatch entry. Grep
   cannot tell them apart.

   Found the hard way: `hasValidLicense(address,uint256)` probes as present on `LiveRadioV3`,
   and a live call against it reverts today, on the live V2. The radio calls that function on
   the NFT; it does not expose one. Any conclusion of the form "contract X has function Y"
   below rests on a probe unless a live call is cited beside it.
4. For undeployed contracts (v3), checked against source.

## Live set (Monad mainnet, chain 143)

| Contract | Address |
|---|---|
| NFT V2 | `0xB9B3acf33439360B55d12429301E946f34f3B73F` |
| MusicSubscriptionV5 | `0x5372aD0291a69c1EBc0BE2dc6DE9dab224045f19` |
| PlayOracleV3 | `0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf` |
| LiveRadioV3 | `0x042EDF80713e6822a891e4e8a0800c332B8200fd` |
| ToursRewardManagerV2 | `0x056452a44d81AB502e24510b2e4FB1789C6faf85` |
| TOURS token V2 | `0x45b76a127167fD7FC7Ed264ad490144300eCfcBF` |
| WMON | `0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A` |
| ListenerRewardPool | `0x98c07c35Cc99F0f78b60f001157B5aeC5e2051A7` |

## Matrix — current live system

| Caller | Callee | Function | Status |
|---|---|---|---|
| PlayOracleV3 | MusicSubscriptionV5 | `recordPlay(address,uint256,uint256)` | ✅ |
| MusicSubscriptionV5 | NFT V2 | `getMasterType(uint256)` | ✅ |
| MusicSubscriptionV5 | NFT V2 | `masterTokens(uint256)` | ✅ |
| MusicSubscriptionV5 | NFT V2 | `artistMasterCount(address)` | ❌ **BREAK 1** |
| MusicSubscriptionV5 | RewardManagerV2 | `getCurrentReward(uint8)` | ✅ |
| MusicSubscriptionV5 | RewardManagerV2 | `distributeReward(address,uint8)` | ✅ |
| LiveRadioV3 | NFT V2 | `hasValidLicense(address,uint256)` | ✅ |
| LiveRadioV3 | NFT V2 | `masterTokens(uint256)` | ✅ |
| LiveRadioV3 | RewardManagerV2 | `getCurrentReward` / `distributeReward` / `distributeRewardWithMultiplier` | ✅ |
| LiveRadioV3 | WMON | `deposit()` / `withdraw(uint256)` | ✅ |

## Matrix — after a v3 cutover, as currently written

| Caller | Callee | Function | Status |
|---|---|---|---|
| MusicSubscriptionV5 | v3 `LicenseRegistry` | `masterTokens(uint256)` | ❌ **BREAK 2** |
| MusicSubscriptionV5 | v3 `LicenseRegistry` | `getMasterType(uint256)` | ❌ **BREAK 2** |
| MusicSubscriptionV5 | v3 `LicenseRegistry` | `artistMasterCount(address)` | ❌ **BREAK 2** |
| LiveRadioV3 | v3 `LicenseRegistry` | `hasValidLicense(address,uint256)` | ❌ **BREAK 3** |
| LiveRadioV3 | v3 `LicenseRegistry` | `masterTokens(uint256)` | ❌ **BREAK 3** |
| v3 `SubscriptionReferrals` | subscription | `subscribeFor` / `getTierPrice` / `TREASURY_PERCENTAGE` / `subscriptions` | ✅ vs V5 — see constraint C1 |

`LicenseRegistry` exposes only `getMaster`, `getLicense`, `masterExists`, `isLicense`,
`totalMasters`, `totalLicenses`.

---

## BREAK 1 — live today, not a cutover risk · **FIXED for v3**

`MusicSubscriptionV5.isArtistEligible()` calls `nftContract.artistMasterCount(artist)`. **The
deployed NFT V2 does not implement that function.** Confirmed by direct call — both
`artistMasterCount` on the NFT and `isArtistEligible` on the subscription revert with empty data.

So the artist TOURS reward path is dead at the *interface* level, not merely at its thresholds.
An earlier note in this repo attributed the failure to the 10-master / 100-play minimums; that is
wrong — the view can never return at all. `claimArtistToursReward` is unreachable by construction.

No impact on WMON payouts, which never touch this path. Moot if TOURS is retired (task #8).

## BREAK 2 — v3 masters are unplayable and unpayable · **FIXED by V6**

Covered in `DEPLOYMENT_PLAN.md`. V5 cannot read a v3 master, so `recordPlay` fails and no payout
can ever accrue. **v3 and V6 are one deployment.**

## BREAK 3 — v3 breaks the live radio

`LiveRadioV3` is live and working (`isLive = true`). It calls `hasValidLicense(address,uint256)`
to decide whether a queue request is free or costs `QUEUE_PRICE_NO_LICENSE`, and `masterTokens()`
to resolve the artist for the queue payment split. v3 implements **neither** — and the replacement
`V3_DESIGN` promises (`isValid(licenseId)`) **is not implemented either**.

`V3_DESIGN`'s cutover audit lists `hasValidLicense` as "none, never called". That audit covered
`app/`, `lib/` and `components/` only. It did not consider **on-chain callers**, and LiveRadioV3 is
one. Radio queue gating and queue payments both break at cutover.

**RESOLVED 2026-08-18.** `LiveRadioV3.setNFTContract(address)` exists and is `onlyOwner`, verified
present in the deployed bytecode, and the owner is `0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1` —
the key you hold. So the radio can be repointed rather than redeployed.

`LicenseRegistry` now carries a compatibility layer:

- `hasValidLicense(address,uint256)` — backed by `_licensesHeld`, an O(1) count maintained in
  `_update`, so it is correct across mint, transfer and burn by construction. This is deliberately
  a counter, not V2's `userLicenses` array: that array was append-only and never touched on
  transfer, which *is* H1. It also avoids V2's M3 unbounded loop.
- `masterTokens(uint256)` — returns V2's exact 13-field tuple. Verified field-for-field against the
  types `LiveRadioV3`'s own interface decodes:
  `(uint256,address,string,string,uint256,uint256,uint256,uint256,uint256,uint256,bool,uint8,uint96)`.
  Fields v3 does not hold are returned zero/empty, never reconstructed.

Cutover step: `LiveRadioV3.setNFTContract(<LicenseRegistry>)`, one owner call.

Six tests added (104 total, all passing). One found a real bug during implementation: `burn` deleted
`_licenses[tokenId]` *before* `_burn`, so the hook decremented master 0 and left the real count
standing — a burnt licence would have kept passing `hasValidLicense`. Burn now precedes the delete.

## Constraint C1 — what V6 must preserve

`SubscriptionReferrals` (v3, undeployed) calls four things on the subscription contract. V6 must
keep all four signatures intact:

```
subscribeFor(address user, uint256 userFid, SubscriptionTier tier)
getTierPrice(SubscriptionTier)
TREASURY_PERCENTAGE()
subscriptions(address)
```

Two traps in that list:

- **`TREASURY_PERCENTAGE()`** is currently a `constant` getter. The plan to make the split
  governable-with-hard-bounds must still expose a function of that exact name and signature, or
  `SubscriptionReferrals` breaks.
- **`subscribeFor` with `userFid = 0`.** `SubscriptionReferrals:200` documents "V5 requires this to
  be non-zero". Once V6 accepts zero, verify the referral routing still binds attribution correctly
  for a wallet-only subscriber rather than silently dropping it.

## Green-light checklist

- [x] BREAK 2 resolved — `MusicSubscriptionV6` reads masters via `getMaster()`, decoded by
      name through its own `IMusicRegistry.Master`. Pinned by
      `test_MasterStructShapeMatchesTheRegistry`, which mints a master with a distinct value in
      every field and decodes it through V6's interface — so V6's copy drifting from the
      registry fails the test instead of returning a neighbouring field's value
- [x] BREAK 3 resolved — compat layer on `LicenseRegistry`; radio repointed, not redeployed
- [x] C1 verified — `test_SubscriptionReferralsInterfaceStillBindsToV6` drives V6 through
      `SubscriptionReferrals`' own `IMusicSubscription`, exercises the `userFid = 0` path, and
      asserts `subscriptions()` field by field. **One signature did change:** `subscriptions`
      returns five fields, not six — V6 dropped `flagVotes` with `voteToFlag`.
      `SubscriptionReferrals` was updated in the same commit; its own suite (41 tests) runs
      against V6 now
- [ ] `PlayOracleV3.setMusicSubscription(V6)` executed (`onlyOwner`, one call)
- [ ] `LiveRadioV3.setNFTContract(LicenseRegistry)` executed (`onlyOwner`, one call)
- [ ] 9 existing V5 subscribers migrated or lapsed
- [ ] This matrix re-run against the new addresses, every cell green
- [x] BREAK 1 fixed — `LicenseRegistry` now maintains `artistMasterCount`, decremented on
      burn so burn-and-remint cannot inflate it, and stores the master's type behind
      `getMasterType`. `isArtistEligible` returns instead of reverting with empty data. (Still
      moot if TOURS is retired — task #8.)
