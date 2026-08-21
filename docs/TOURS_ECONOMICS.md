# TOURS token — current state and the decision to make

All on-chain figures verified against Monad mainnet (chain 143) via `https://rpc.monad.xyz`
on **2026-08-16**, at block ~96.27M. Nothing in this document has been changed on-chain —
it is a diagnosis, not a change record.

Token: `ToursTokenV2` — `0x45b76a127167fD7FC7Ed264ad490144300eCfcBF`, "EmpowerTours Token V2" / TOURS, 18 dec.

---

## 0. Correction, 2026-08-20: there are TWO TOURS tokens, not one

Found by scanning all 74 contracts the deployer has ever created. Only V2 appeared in any doc or
memory; V1 was forgotten.

| | V1 `0xf61F2b01…` | V2 `0x45b76a12…` |
|---|---|---|
| Name | EmpowerTours Token | EmpowerTours Token V2 |
| Supply | 100,000,000,000 | 100,000,000,000 |
| Deployer holds | 99,977,900,000 | 99,998,978,800 |
| Burned | **0** | **0** |

**The real supply is 200 billion.** Every per-token figure below was calculated against 100B and is
therefore twice as generous as reality.

Two live tokens under nearly the same name is a standing scam vector: the moment either has value,
the other gets sold as the real one.

**Also correcting section 3's claim that no third party was ever paid TOURS.** True of V2. Not true
of V1 — the old reward manager `0x7fff35BB…` paid 5 TOURS at a time to real outside wallets across
90 transfers. Roughly 442 V1 sits across ~8 external addresses; the three largest hold 313 between
them. Dust against 100B, but not nobody.

V1's remaining supply after retiring the treasury would be **22.1M** — 20M of it locked in the old
reward manager, which is owner-controlled and pausable, plus that dust.

---

## 1. Supply is fixed and already fully issued

```
totalSupply = 100,000,000,000 TOURS
MAX_SUPPLY  = 100,000,000,000 TOURS   ← identical
```

`ToursTokenV2`'s constructor runs `_mint(msg.sender, MAX_SUPPLY)`. Because `mint()` requires
`totalSupply() + amount <= MAX_SUPPLY`, **no TOURS can ever be minted again**.

Consequence: the entire `authorizedMinters` mechanism is dead code. `authorizedMinters[rewardManager]`
is in fact `false`, and setting it `true` would change nothing. Every future distribution must come
out of the existing treasury balance. **TOURS is a distribution problem, not an emission problem.**

## 2. Distribution is 99.999% one wallet

| Holder | Balance | Share |
|---|---|---|
| Deployer `0x8dF64bACf6b70F7787f8d14429b258B3fF958ec1` | 99,998,978,800 TOURS | **99.999%** |
| `ToursRewardManagerV2` `0x056452a4…af85` | 1,000,000 TOURS | 0.001% |
| Safe `0xf3b9D123…25bA` | 912.6 TOURS | ~0% |
| `0x0` + `0x…dEaD` (burned) | 0 | 0% |

A 100-billion supply with 99.999% on one key is the standard rug profile. Since supply cannot be
minted, the only levers are **distribute** or **burn**.

## 3. The emission system has never emitted

`ToursRewardManagerV2` is configured and looks healthy — 365-day halving interval, 20 max epochs,
10,000 TOURS/day cap, `LiveRadioV3` correctly authorized as a distributor. And yet:

```
totalDistributed = 0
currentEpoch     = 0
```

It has never paid out once. Actual listener rewards are sent as **manual Safe transfers**, which
bypass the daily cap, the halving schedule, and the on-chain audit trail entirely.

## 4. There are no sinks

- Zero TOURS burned, ever.
- No TOURS-denominated price anywhere in contracts or app code. Subscriptions (15/75/300/3000) and
  voice ads (2) are priced in **WMON**.
- The only TOURS `transferFrom` paths in the codebase are inside `DAOContractFactory`.

Nothing consumes TOURS, so nothing creates a reason to hold it.

## 5. Two live defects on the artist TOURS path

`MusicSubscriptionV5` lets an artist claim an `ARTIST_MONTHLY` TOURS reward. It cannot succeed today,
for two independent reasons:

1. **Eligibility is unreachable.** `isArtistEligible` requires `minMasterCount = 10` and
   `minLifetimePlays = 100`. The catalog's only artist has **5 masters and 19 lifetime plays**.
2. **The wiring is missing.** `authorizedDistributors[MusicSubscriptionV5]` on the reward manager is
   `false`, so `distributeReward` would revert even for an eligible artist.

Defect 2 is the same class of bug repaired for `LiveRadioV3` on 2026-07-25. The reward itself is
1 TOURS/month, which is economically meaningless against a 100B supply.

## 6. Half the reward types belong to a product that no longer exists

`RewardType` still enumerates `ITINERARY_COMPLETE`, `TOUR_GUIDE_COMPLETE`, `CLIMB_JOURNAL` and
`VENUE_OPERATOR` — leftovers from the climbing/travel era, not the music app.

## 7. What is NOT broken

The music economy runs on **WMON**, not TOURS, and it works end-to-end: subscription revenue →
oracle-recorded plays → monthly finalization → 70/20/10 split → artist claims and receives payment.
Month 688 completed this cycle with 300 WMON in and 210 WMON claimed by the artist.

**TOURS is not load-bearing for any of it.** The TOURS decision can be made without risk to the
part of the system that functions.

---

## The decision

Supply cannot grow; listen-to-earn is a farming target with no users to reward (9 subscribers,
19 lifetime plays); and the working economy is WMON-denominated. Four coherent options:

| Option | What it means | Cost |
|---|---|---|
| **Governance only** | Retire listen-to-earn. TOURS becomes the vote over the artist pool and platform params — `VotingTOURS` and `EmpowerToursGovernor` already exist. No emissions, no sink required. | Low. Mostly deletion. |
| **Fix the plumbing** | Route all rewards through `ToursRewardManagerV2` instead of Safe transfers so emissions are capped, halving and auditable. Add at least one real sink. | Medium. Keeps current UX. |
| **App currency** | Price subscriptions and voice ads in TOURS; revenue burns supply. Real demand, real sink. | High. Needs liquidity; adds user friction. |
| **Retire it** | Music economy is WMON-only and already works. | Low, but abandons the token. |

Separately, and independent of the above: decide whether the deployer's 99.99B is **burned** (fixes
concentration optics, irreversible) or **moved to the timelock** (makes distribution a governance act
rather than a single key).
