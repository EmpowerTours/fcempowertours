# Open work, ranked

One list, because the open items were spread across `DEPLOYMENT_PLAN.md`, `SECURITY_ACTIONS.md`,
`TOURS_ECONOMICS.md` and a session transcript, and nothing said what to do first.

Every claim here was verified against Monad mainnet or the running deployment on **2026-08-24**.
Where something is unverified, it says so — that is a finding, not a gap in the notes.

Ranked by **what is losing something right now**, then by what is half-finished, then by what is
strategic, then hygiene. Effort is a rough guide, not an estimate.

---

## Tier 1 — something is exposed or wrong for a real user

### 1. Rotate the Pimlico API key — *external exposure, do first*

A live key was written to the Railway logs on 2026-08-23 and is in that log store now. The code
leak is fixed (`eb1502d`) and the redactor is verified, but **that stops the next key, not this
one.** Nothing else on this list involves a credential a third party can already read.

Effort: minutes, in the Pimlico dashboard. Then update `PIMLICO_BUNDLER_URL` on Railway.

### 2. `ENFORCE_QUICK_AUTH` — **the drain was already closed; the real gap was next to it**

This item, and `SECURITY_ACTIONS.md` #2, both said `send_mon` / `send_tours` /
`withdraw_to_user` "take an attacker-chosen recipient" until the flag is set. **They do not.**
`execute-delegated:155` has a `fundMovingActions` set that fails closed on `authz.ownsAddress`
and deliberately ignores `authz.allowed`, which is the field the flag governs. Its own comment
says why: *"their safety must NOT depend on an env flag being set."*

`platform_send_mon` is likewise gated, by `authenticateAdminAction` over the exact recipient and
amount.

**What was actually open**, fixed 2026-08-25: nine other actions sat in `publicActions` — which
skips the delegation check — while spending the user's Safe, and were not in the fail-closed set.
`buy_music`, `music-subscribe`, `mint_music`, `mint_collector`, the four radio payments,
`studio_pay`, the vault actions, and — found by the new check rather than by reading —
`mint_passport` (**150 WMON**) and `dao_create_deployment_proposal` (**100 MON**).

A stranger could POST a victim's address and make them buy a track, take out a subscription, mint
a passport, or burn 100 MON on a DAO proposal, repeatedly. The money went to an artist or the
platform rather than the attacker, so it is griefing rather than theft — and it is still the
victim's funds leaving on somebody else's instruction. All are now fail-closed.

`tools/verify-value-actions-gated.ts` parses both lists out of the route and every `case` body,
decides which handlers move value by what they do, and requires each public one to be gated. A
future action that spends a Safe fails it the day it is written. Handlers that touch value
harmlessly — `wrap_mon`, claims, burns — are listed with reasons rather than skipped.

**What remains of this item is smaller than it was.** `ENFORCE_QUICK_AUTH` is still off, so
non-value actions still allow unauthenticated callers, and the gate that matters no longer
depends on it. Turning it on is now cleanup, not a security fix: mint a service credential for
token-less internal callers, watch for `[QuickAuth] … unauthenticated` in the logs, then flip it.

Note `radio_mark_played` is documented as the expected token-less server caller and **has no
caller anywhere in the repo** — worth resolving before anyone plans around it.

### 3. The Envio indexer has been dead since 2026-08-01 — but consider leaving instead

**Scoped 2026-08-24: see `ENVIO_EXIT.md`.** Dropping Envio is now the recommended path rather
than restarting it, which makes this item a migration instead of a repair. The short version:
Multicall3 is on Monad, `licensesHeld` is keyed owner→master so licences need 5 reads not
enumeration, and the passport lookup resolves in one 195-call multicall (measured: 1202ms cold,
returns the right three passports). The only real loss is per-play radio history.

Note the licences view is broken for a second reason a healthy indexer would not fix — the
cutover split licence data across the legacy and v3 contracts.

If restarting the indexer is faster in the moment, that is still fine; the exit work is not
wasted either way.

**The current state.** `lastUpdated: 2026-08-01T17:09:19`, roughly **2.98M blocks behind** a head
of ~98.62M. The chain fallback from `7134adb` is why the catalogue still loads, and why this went
unnoticed for three weeks. What it is breaking meanwhile:

- `get-user-licenses` queries Envio and logs `Licenses matching query address: 0` — the licences
  view serves empty data.
- `[StreamingStats]` and the dashboard read the same stale rows.

It is **not** why #4 is blocked. Enumerating V5 subscribers needs `eth_getLogs` and the Alchemy
key regardless of the indexer, because the public RPC caps at a 100-block range.

### 4. ~~V5 subscribers~~ — **RESOLVED 2026-08-25: nobody is stranded**

Checked with `tools/list-v5-subscribers.ts`. Every address this project has a record of reads
inactive on V5:

```
0x33ffccb1…  V5 expiry 2026-08-24T13:39   V5 active false   V6 active false
0x868469e5…  never                        false             false
0xd6b624f5…  never                        false             false
0xce1e82bb…  never                        false             false
```

The artist's V5 subscription lapsed on its own the day before the check; nobody else ever
subscribed on V5. Nothing to migrate, nobody paying for something invisible.

**The stated blocker was wrong, and that is worth recording.** This item said it "needs the
Alchemy key". The key is on Alchemy's **Free** plan, which caps `eth_getLogs` at a **10**-block
range — *worse* than the public Monad RPC's 100. Covering the ~48.7M blocks since the
subscription contract went live would need roughly 4.9 million requests. Event enumeration is
unavailable at any tier this project currently has, so anything else that assumed the key unlocks
log queries should be re-planned. See also item C: a paid RPC is the lever for latency too.

The check therefore reads contract state per address rather than discovering addresses from
events. That answers the question at this scale but **cannot find a subscriber nobody recorded**
— a real limit, printed in the tool's own output rather than left implied.

### 5. ~~`/api/register-user-safe`~~ — **CLOSED 2026-08-25**

The item said "unauthenticated". It was not — `authorizeUserAddress` gates it and returns
`ownsAddress: false` on failure **regardless of `ENFORCE_QUICK_AUTH`**, and the route checks
`ownsAddress` rather than `allowed`. That half was already fail-closed and independent of #2.

Two things were genuinely missing, and one was not on the list:

**No global ceiling.** The rate limit is keyed on IP plus address, so it bounds one caller.
Producing a fresh address and signing with it is free and unlimited, so N wallets each pass
authentication, each pass their own limit, and the platform pays for all of them.
`lib/platform-gas-budget.ts` adds a single platform-wide counter per rolling window, defaulting
to 100 registrations/day, overridable via `PLATFORM_GAS_MAX_SAFE_REGISTRATIONS_PER_DAY`.

**The rate limit failed OPEN.** `checkRateLimit` infers fail-closed from a substring of the
prefix — `['delegation','admin','upload','mint','burn','transfer']`. This route uses the
`execute` limiter, which matches none of them, so a Redis outage removed the only per-caller
bound on a route that spends platform funds. `RateLimitConfig` now takes an explicit
`failClosed`, and `execute` sets it.

**Worth naming: this became urgent because of another fix.** Until `9d2e660` set
`PassportNFTV4.platformOperator`, the registration batch reverted during gas estimation and no
transaction was ever sent — the route spent nothing. Fixing the feature turned it into one that
spends. The cap is the missing half of that change.

---

## Tier 2 — half-finished, and the halves are load-bearing

### 6. Licence 1000004 is still unmigrated, and both seals are open

`LicenseRegistry.ownerOf(1000004)` reverts `ERC721NonexistentToken`. The five masters are in
(`totalMasters() = 5`); only the legacy licence is outstanding. `migrationSealed()` and
`passportMigrationSealed()` are both `false` — the designed state, since the seals are
irreversible and go last. Do not seal until this and #4 are done.

Runbook: `docs/DEPLOYMENT_PLAN.md`, "Migration runbook".

### 7. TOURS: connect the faucet to the reward manager, or turn it off

Listener rewards are paid by **direct ERC-20 transfer from the platform Safe**, bypassing the
daily cap, the halving schedule and the on-chain audit trail. Meanwhile the 1,000,000 TOURS in
the correctly-authorized `ToursRewardManagerV2` has never moved — `totalDistributed` and
`currentEpoch` are both still `0`.

The Safe holds **898.8 TOURS**. At the observed rate (13.8 for one listener's session) that is
roughly 65 more claims before it empties. A dry Safe produces a failed claim, not a silent loss
— the handler restores the reserved Redis balance in a `catch`, verified — but it still breaks.

Current shape is the worst of both: real tokens leaving, no schedule, no audit trail, and a hard
stop at ~900. **Product call needed:** route through the manager, or retire listen-to-earn.

### 8. ~~Verify the play-history reset did not touch WMON accounting~~ — **VERIFIED 2026-08-25, intact**

The `19 → 0` reset is a **lifetime** counter, read only by the artist TOURS bonus eligibility.
The WMON path keys on `artistMonthlyPlays[monthId][artist]` and `monthlyStats[monthId]`, which
start fresh each month by design. Read off mainnet:

```
V5 month 688   300 WMON revenue, 19 plays, 210 distributed, finalized: true
V5 month 689   all zero            <- nothing landed after the cutover
V5 WMON balance             0      <- nothing stranded on the abandoned contract
V6 month 689   15 WMON revenue, 5 plays, unfinalized (month has not ended)
V6 monthSplit[689]  10/20/70, set: true
V6 unclaimedArtistPool      0
```

The cutover did not catch a month mid-flight: V5's last revenue month settled and was claimed,
and nothing arrived on V5 afterwards.

`monthSplit[689].set` is `true`, which matters more than it looks —
`finalizeMonthlyDistribution` has `require(sp.set)`, so a month that took revenue without a
recorded split could never be finalized and its WMON would be unreachable. It is recorded.

One thing this confirms rather than fixes: month 689's 5 plays are credited to the **deployer**,
per item A. When it finalizes, the artist pool follows the registry's artist field. Both wallets
belong to the same person, so nothing is lost — but the accounting is correct about an
attribution that is not.

### 9. Production page error, unexplained

`TypeError: Cannot read properties of undefined (reading 'result')` on the live site, absent
locally. Does not block any of the four restored modals. Most likely an env-dependent path
(a wallet/RPC response shape) rather than the restored JSX — **but that is a guess, not a
diagnosis.**

---

## Tier 3 — strategic, and cheap to get wrong

### 10. Burn ~99% of TOURS V2

`totalSupply == MAX_SUPPLY == 100,000,000,000`, with 99,998,978,800 (**99.999%**) on the
deployer. Supply can never grow — `mint()` checks against a cap already reached — so the only
levers are distribute or burn.

At 100B, TOURS needs a user count in the hundreds of millions to be worth a cent. No realistic
growth fixes that. The precedent is already set: V1 was burned 100B → 22.1M on 2026-08-21.

Reversible alternative: move it to the timelock, making distribution a governance act rather
than a single key.

### 11. Pick TOURS a role — one, not several

Recommendation: **governance-only.** `VotingTOURS` and `EmpowerToursGovernor` already exist, it
is mostly deletion, it removes the farming surface, and it leaves app-currency open for later.

The constraint is not token design, it is traction: 1 artist, 9 subscribers, 19 lifetime plays.
Listen-to-earn with 9 users is not an incentive, it is a rounding error with a farming risk.

### 12. Artist TOURS bonus: fix or delete

Two independent blockers. `authorizedDistributors[MusicSubscriptionV6]` is `false` — the cutover
carried this defect from V5 onto V6 rather than fixing it. And eligibility is unreachable:
`minMasterCount = 10`, `minLifetimePlays = 100`, against 5 masters and 0 plays.

The reward is **1 TOURS/month**, meaningless against 100B. Half-built reward paths are how the
`platformOperator` bug happened; pick one.

---

## Found 2026-08-24/25, not previously listed

### A. The five masters are attributed to the deployer, not the artist

`LicenseRegistry.getMaster(1..5).artist` returns `0x8dF64bAC…` (deployer), while the legacy
contract records `0x33fFCcb1…` (unify34). So `artistMasterCount(unify34) = 0` and
`artistLifetimePlays(unify34) = 0`, while the deployer shows 5 and 5.

Money follows the chain, not the display: `SalesController._settle` pays `m.artist` directly per
sale, ERC-2981 resale royalties use the same field, and `claimArtistPayout` is `msg.sender`-keyed.

**Both wallets belong to the same person, so nothing is mis-paid.** The cost is that the public
record attributes the catalogue to the platform, artist-facing surfaces read zero, and the Neynar
lookup 404s on the platform wallet.

This was deliberate, not a slip. `tools/build-migration-manifest.ts:130` says so:

> Minted BY the deployer, so the deployer is the artist of record and receives every payout.
> That was the deliberate choice: the Farcaster wallet is Warpcast-managed with no key export.

The failure was recording that consequence **only there** — not in `DEPLOYMENT_PLAN.md`, not in
`V3_DESIGN.md`'s identity section. A deliberate trade nobody writes down is indistinguishable
from a bug three days later, which is how it was found: by accident, checking an endpoint.

**The constraint no longer holds.** `SalesController.mintMaster` sets `artist = msg.sender` and a
Warpcast wallet can send from the browser — simulated live from `0x33fFCcb1…`, returns master id
6. But a naive re-mint doubles the catalogue: there is no on-chain URI index, and
`findDuplicateMaster` is artist-scoped so it cannot see the deployer's copies. Any fix needs
sequencing against licence ids, which reference masters 1–5 — including the outstanding
`migrateLegacy` for licence 1000004, which targets master 3.

New artists are unaffected: the app mints via `mintMasterFor` with the artist's EIP-712
signature, so the signer is the artist of record. Only a manifest that calls `mintMaster` has
this problem.

### B. Two surfaces still resolve artist names themselves

`artist/[address]` and `LiveRadioModal` do their own lookup and will show addresses rather than
registry names. `discover` and `nft/[tokenId]` are wired.

Also worth a check rather than a comment: every `@${…}` in the app currently prefixes a Farcaster
username or FID, which is correct. Nothing stops a future edit wiring a ProfileRegistry name into
one of those — `og/music`, `og/art`, `execute-delegated`, `cast-nft` all have the pattern sitting
there — which would present a self-registered name as a verified handle.

### C. `/api/catalogue` is on the hot path and is slow

2.7–3.4s in dev after batching. Multicall3 is declared and used, and per-stage timings show the
batching works (5 calls in 107–538ms); what remains is ~4 dependent round trips on the free
public RPC at 100–550ms each. **A paid RPC endpoint is the next lever, not more batching.**

Everything now reads through this: radio, discover, buy path, NFT page, artist page, frames,
venue, EPK.

### D. ~~`mint-music` builds a bare OG image URL~~ — **FIXED 2026-08-25**

`frames/music` passes `imageUrl`, `title` and `price` in the OG URL so the card renders without
a lookup; `mint-music` built a bare `?tokenId=` and paid a full read on every render, with a
Farcaster client waiting. It now passes all three. The cover comes from the metadata just pinned,
via `fetchTrackMetadata`, which caches on the CID — immutable, so one fetch per track ever rather
than one per cast.

**The latency win is modest and I over-sold it.** Measured on cold cache entries: ~0.66-0.81s
bare versus ~0.49-0.66s direct, roughly 25%. The `og/music` route already had a blockchain
fallback, so the bare path was never catastrophic.

The better argument is correctness, not speed: passing the values means the card shows the right
title, price and cover even when the catalogue read is stale or fails — and a track minted
seconds ago is precisely the case a stale indexer does not have yet.

## Tier 4 — hygiene, real but not urgent

### 13. Disable the leaked Google Maps keys in the Console

Nothing reads them since `bc3292b`, so this is not a vulnerability any more. But a key that
leaked into a public bundle stays live until someone turns it off, and billing stays enabled.

### 14. The "AI Music" labelling

Four sites: the EPK bio and genre in `lib/epk/constants.ts:35-36`, and
`app/api/epk/generate/route.ts:323,388` — where `['AI Music']` is the **fallback for any artist**
with no genre set, asserting something about other people's work.

`'Money Making Machine (AI Music Video)'` describes a *video* and `EPKModal.tsx:307`'s
"AI-generated draft" describes Gemini-written text; both may be accurate. Needs an owner
decision on the bio wording — it is a personal biography, not a bug.

### 15. Three unreachable modals

`showDepositModal`, `showEventOracleModal`, and the page-level `showSubscriptionModal` render JSX
that nothing can open. All three predate the travel deletion. `LiveRadioModal` renders its own
subscription modal, which is the one users actually see. Strip or wire up.

`tools/verify-modal-wiring.ts` reports these as non-fatal warnings.

### 16. `empowertours-envio/` is lint-gated but not type-gated

The pre-commit hook runs the **root** `tsc` only, and that subproject has its own tsconfig. This
already let a break through once (`d50e015`). It also carries one pre-existing error:
`event.transaction.from` on `DailyLottery_TicketPurchased`.

### 17. Standalone radio bot: deploy or retire

`DEPLOYMENT_PLAN.md` task #10, marked ready, awaiting a Discord token.

### 18. Envio lottery cleanup

`DEPLOYMENT_PLAN.md` task #9 — deliberately scheduled after the cutover, which has now happened.

### 19. Rate limits and CSP

No rate limit on `bot-command`, `upload*`, `oracle/chat`. No global CSP `script-src`.

### 20. 82 lint warnings

56 are `@next/next/no-img-element`, a performance suggestion. Deliberately non-blocking — the
pre-commit hook fails on errors only, because a gate that fires on every UI commit gets bypassed
by habit.

---

## Done this session, for context

- Restored six modals the travel deletion removed (`6b237cd`) — Profile, Dashboard, Radio, EPK,
  Event Oracle, User Profile were dead in production for a day.
- `tools/verify-modal-wiring.ts` (`75356fc`) so it cannot recur silently.
- Corrected `DEPLOYMENT_PLAN.md`, which claimed the v3 cutover had not run (`51deaed`).
- 4,181 → 0 lint errors, and made the pre-commit hook actually block (`30b990f`, `9cad035`,
  `2072342`) — both its `tsc` and lint steps were reporting success while failing.
- Set `PassportNFTV4.platformOperator`, which the cutover missed (`9d2e660`) — it was reverting
  the Safe-registration batch on every user action.
- Stopped viem publishing the bundler API key (`eb1502d`).
