# Open work, ranked

One list, because the open items were spread across `DEPLOYMENT_PLAN.md`, `SECURITY_ACTIONS.md`,
`TOURS_ECONOMICS.md` and a session transcript, and nothing said what to do first.

Every claim here was verified against Monad mainnet or the running deployment on **2026-08-24**.
Where something is unverified, it says so — that is a finding, not a gap in the notes.

Items **A, E and F** were re-read against mainnet and production on **2026-09-14** and had moved;
each carries its own dated correction.

**On 2026-09-21 E and F were re-read again and both had moved further.** E was already done and
nobody had closed it. F's stated diagnosis was wrong — the defect was not an understated zero but
a page that contradicted itself — and the fix this file proposed would have made it worse. Item
**H** was found while checking F's premise. Two lessons, both already in the list above: read the
production value before trusting the item, and a note saying a problem "has stopped growing" is
an observation until some code enforces it.

**On 2026-09-15 the remaining open items were audited for whether their stated test can actually
distinguish done from not-done.** Five could not, or had drifted: 6, 12, 15, 19 and C. Item 6 is
the one worth learning from — it tested `ownerOf(1000004)` for a migration that never preserves
the source id, so the check returned "not done" no matter what, and blocked two irreversible
seals for three weeks. **Before trusting any entry here, ask what the check would print if the
work were finished.** If the answer is "the same thing", it is not a check.

Three items cannot be verified from a terminal at all, and are marked rather than left looking
open: **1** and **13** are both provider dashboard state, and **9** (the production TypeError)
needs a browser session. Absence of evidence here is not evidence they are outstanding.

Ranked by **what is losing something right now**, then by what is half-finished, then by what is
strategic, then hygiene. Effort is a rough guide, not an estimate.

---

## Tier 1 — something is exposed or wrong for a real user

### 1. Credential rotation — *do first*

A provider credential needs rotating. The code-side cause is fixed (`eb1502d`) and the redactor
is verified, so this is about the existing credential rather than a live code path.

Details are deliberately not in this file — see the operator notes outside the repo. **This
repository is public**; where a credential sits, and what still reads it, are not facts to
publish while the rotation is outstanding.

Effort: minutes, at the provider, then update the corresponding Railway variable.

### 2. `ENFORCE_QUICK_AUTH` — **the drain was already closed; the real gap was next to it**

This item, and `SECURITY_ACTIONS.md` #2, both described a drain that **does not exist**: every
action that moves funds fails closed on ownership, independently of this flag, and deliberately
so. The route's own comment says why — *"their safety must NOT depend on an env flag being set."*

A separate real gap was found and **fixed 2026-08-25**: a number of value-moving handlers sat
outside the fail-closed set. All are now gated, and `tools/verify-value-actions-gated.ts` decides
which handlers move value by what they do and requires each to be gated, so a future one fails
the check the day it is written. Handlers that touch value harmlessly are listed with reasons
rather than skipped.

**What remains is cleanup, not a security fix.** The flag governs non-value actions only; the
gate that matters no longer depends on it. Order: mint a service credential for token-less
internal callers, confirm from the logs that only known server callers are unauthenticated, then
enable it.

Specifics — which handlers, which routes, what an unauthenticated caller can still reach — are
kept out of this file on purpose. **This repository is public.** A ranked list of what is not yet
enforced, with file and line, is a map; the work item is all that needs to be here.

Note `radio_mark_played` is documented as the expected token-less server caller and **has no
caller anywhere in the repo** — worth resolving before anyone plans around it.

### 3. ~~The Envio indexer~~ — **DONE 2026-08-29: deleted**

Every surface reads the contracts. 8,524 lines and 527MB removed, `empowertours-envio/` gone,
`/api/envio/get-nfts` renamed `/api/nfts`. Closes #16 and #18 with it.

Lost and reported rather than faked: `uniqueListeners` (no contract keeps a roster — `null`,
renders "—"), `txHash` on feeds, and per-song play splits (Redis window, flagged
`totalPlaysIsFloor` when full). Gained: a deactivated EPK now 404s instead of rendering, which
the event-based read could never detect.

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

### 6. ~~Licence 1000004 is still unmigrated~~ — **IT WAS MIGRATED. The test was wrong. 2026-09-15**

**The migration ran on 2026-08-22, and this item has been reporting it as outstanding ever
since.** Proven from the transaction, not inferred:

```
tx hash  0x2c089f4ee38fd5a058f4a3c94aa42bfbcbc1d68e5d73ae48e34e8b2792487a28
block  98073070   2026-08-22 02:25:53 UTC   status 1   from 0x8dF64bAC… (governance)
logs   Transfer(0x0 -> 0xd6B624F5…, 1000001)
       LegacyLicenseMigrated(licenseId 1000001, masterTokenId 3, to 0xd6B624F5…)
       LicenseMinted(1000001, 3, 0xd6B624F5…)
```

`migrateLegacy` emits **both** `LegacyLicenseMigrated` and `LicenseMinted`; `mintLicense` emits
only the second. The first one being present is conclusive, and `onlyGovernance` matches the
sender.

**Why the check could never have passed.** This item tested `ownerOf(1000004)` and read the
revert as "not migrated". But `migrateLegacy` assigns `licenseId = ++_licenseCounter` — a fresh
sequential id. It does not carry the legacy token id across. `ownerOf(1000004)` on the v3
registry reverts whether or not the migration ran, so the test measured nothing and reported a
blocker on two irreversible seals for three weeks.

The state evidence pointed the same way and was cheaper: v3 licence 1000001 has
`mintedAt = 2026-08-01 17:09 UTC`, twenty days before the v3 contracts existed. `mintLicense`
sets `mintedAt` to `block.timestamp`, so only the migration path can produce that.

**What the legacy contract actually holds.** `EmpowerToursNFT` V2 `0xB9B3acf3…` has four
licences, 1000001–1000004 (1000005 reverts):

| Legacy id | Holder | Status |
|---|---|---|
| 1000001–1000003 | `0x868469E5…` | self-minted from `0x0` on 2026-02-04, never migrated |
| 1000004 | `0xd6B624F5…` | **migrated** → v3 licence 1000001 on master 3 |

`0x868469E5…` is almost certainly an owner-controlled wallet rather than a third-party collector:
it minted all three itself, has been dormant since 2026-02-07, and its last three transactions
funded `0x271885aE…`, `0xD5203FD3…` and `0xc28c035B…` — all three listed in
`~/.empowertours/agent-wallets.json`. **Confirm that before sealing**, because sealing is
irreversible and those three licences lose their route across.

**So the seals are unblocked**, pending that one confirmation. #4 (V5 subscribers) was resolved
2026-08-25; this was the other stated blocker and it is done. `migrationSealed()` and
`passportMigrationSealed()` are both still `false`.

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

Two independent blockers. `authorizedDistributors[MusicSubscriptionV6]` is `false` on
`ToursRewardManagerV2` — the cutover carried this defect from V5 onto V6 rather than fixing it.
And eligibility is unreachable.

**Re-tested 2026-09-15 with the right call.** The thresholds live on `MusicSubscriptionV6`
(`minMasterCount = 10`, `minLifetimePlays = 100`), not on the reward manager — calling them there
reverts, which is how this was miscounted before. `isArtistEligible` returns `false` for both:

```
0x33fFCcb1…  (artist)    6 masters,  0 lifetime plays
0x8dF64bAC…  (deployer)  5 masters,  8 lifetime plays
```

Item stands, with the numbers corrected — this said "both addresses sit at 5/5". Note the split
makes it worse than a single count suggests: the two halves of the same person's catalogue cannot
be added together, so neither address can reach 10 even though 11 masters exist between them.

The reward is **1 TOURS/month**, meaningless against 100B. Half-built reward paths are how the
`platformOperator` bug happened; pick one.

---

## Found 2026-08-24/25, not previously listed

### A. The five masters are attributed to the deployer — **LARGELY OVERTAKEN; re-read 2026-09-14**

> **The decision below was taken, and it was the cheaper option.** Read off mainnet 2026-09-14,
> `totalMasters()` is **12**, not the 5 this item assumes:
>
> | Masters | Artist | Suspended |
> |---|---|---|
> | 1–5 | deployer `0x8dF64bAC…` | **yes** |
> | 6 | `0x05d1599622915050C4981816ef5E8d51F53dbc7D` (different artist, fid 0) | no |
> | 7 | artist `0x33fFCcb1…` | yes |
> | 8–12 | artist `0x33fFCcb1…` | no |
>
> The five were re-minted from the artist wallet and the deployer originals suspended, so new
> sales, plays and radio accrue correctly and **the problem has stopped growing**. What did not
> move is the history: `artistLifetimePlays(deployer)` is **8** and the artist wallet's is **0**,
> and the existing licence sales still point at the old token ids. That residue is item F.
>
> Everything below is the reasoning that led here, kept because it explains why the cheap option
> was chosen over burn-and-remigrate. Its figures are from 2026-08-24 and are stale.

`getMaster(1..5).artist` is `0x8dF64bAC…` (deployer); `artistFid` is `765994` (@unify34), which
is correct. The v3 re-publish ran from the deployer key and `mintMaster` sets the artist to
`msg.sender`, so the address is wrong and immutable — there is no `setArtist`.

**Fixed (display only), 2026-08-29:** names resolve via the on-chain fid, and `/api/user-stats`
counts a master as yours if the address matches OR the fid does, reporting `createdViaFid`
separately so the divergence stays visible. That restored the Press Kit button, which is gated on
`musicCreated > 0` and had disappeared.

**NOT fixed, and not fixable without a re-mint:** every contract path keys on the artist ADDRESS.
`SalesController._settle` pays `m.artist`; `MusicSubscriptionV6.recordPlay` credits
`artistMonthlyPlays[month][artist]` and `artistLifetimePlays[artist]`; LiveRadioV3 pays the
registry's artist. So sales, plays and radio all accrue to the deployer.

Nothing has been lost: `artistFirstSaleAt(deployer) = 0` — no sale has ever settled — and the
deployer key is the owner's own. TOURS artist eligibility needs 10 masters / 100 plays and both
addresses sit at 5/5, so that harm is future rather than present.

**The decision, still open.** Burn and re-mint via `mintMasterFor` signed by the artist wallet.
Masters 1, 2, 4 and 5 have no licence holders. Master 3 (MARINA) does:
`0xd6B624F524E554e478bd3B9dC5d1b5d44158630F` holds licence 1000001, a real collector — they can be
made whole with `migrateLegacy`, which is governance-only, still unsealed, and preserves their
original `mintedAt`. Costs: token ids become 6–10, `/nft/1..5` and shared casts break, `createdAt`
resets to today, and `artistLifetimePlays` does not transfer.

Cheaper alternative: leave these five and mint everything future from the artist wallet, so the
problem stops growing. Sunk cost today is 5 plays and 1 sale.

### B. Two surfaces still resolve artist names themselves

`artist/[address]` and `LiveRadioModal` do their own lookup and will show addresses rather than
registry names. `discover` and `nft/[tokenId]` are wired.

Also worth a check rather than a comment: every `@${…}` in the app currently prefixes a Farcaster
username or FID, which is correct. Nothing stops a future edit wiring a ProfileRegistry name into
one of those — `og/music`, `og/art`, `execute-delegated`, `cast-nft` all have the pattern sitting
there — which would present a self-registered name as a verified handle.

### C. ~~`/api/catalogue` is on the hot path and is slow~~ — **measured in the wrong place (2026-09-15)**

The 2.7–3.4s figure was **dev**. Production answers in **0.45–0.58s** over two consecutive calls.
The conclusion drawn from the dev number — "a paid RPC endpoint is the next lever" — was a
spending decision resting on a measurement never taken against the thing users hit.

Not fully closed: two warm calls are not a cold-cache measurement, so the honest claim is that
production is roughly 5x faster than recorded and the case for buying an RPC is unproven, not that
latency is fine. Measure cold before reopening it.

Original note, for the record: Multicall3 is declared and used, per-stage timings show the
batching works (5 calls in 107–538ms), and what remained was ~4 dependent round trips on the free
public RPC at 100–550ms each.

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

### E. ~~The published EPK still says "AI-generated music"~~ — **DONE 2026-09-19, verified 2026-09-21**

Read off mainnet and fetched back from the gateway:

```
EPKRegistry 0x232D2fF4…  artistEPKs(0x33fFCcb1…)
  cid        QmU6mhNb9F3BBLspZb5JmxpPx7iGQ3G4B4uqcrHvyks8tM
  createdAt  2026-02-02 08:06 UTC
  updatedAt  2026-09-19 18:32 UTC      <- it has been updated
```

The published bio now reads "at the intersection of **music and blockchain**"; genre is
`Electronic, Alternative Hip-Hop, Experimental`. The only surviving AI mention in the whole
document is `Money Making Machine (AI Music Video)`, which is accurate and deliberate (item 14).

**The live CID is a third document**, not the `QmXv14bTum…` this item said was pinned and not the
old `QmZzaviA2…` — so the transaction went out with a freshly built kit rather than the patched
one `tools/repin-epk.ts` produced. The content is right, which is what matters, but the tool's
"fetch what is published and change exactly two fields" guarantee does **not** describe what is
now live. If that document is ever audited, diff it rather than assuming the two-field patch.

### F. The EPK contradicted itself about plays — **FIXED 2026-09-21**

This item used to say the press kit "reports zero plays and zero sales" and proposed rendering
"—" instead of a 0. **That diagnosis was wrong, and the fix would have been wrong too.** Read
from production 2026-09-21:

```
totalPlays   0
topSongs     Killah 20 · Sloppy 16 · Dime Que Si 15 · MARINA 13 · Suddenly 10 · Money Making Machine 9
totalSales   2      totalRevenue 0.00
```

`EPKPage.tsx:162` renders that song list and `:173` renders the stat cards — **eleven lines apart
on one page**. So the press kit printed **"Total Plays: 0 — Verified on Monad"** directly above
six songs totalling **83**. Not an understated zero: a document that disproves itself, with the
chain stamp under the wrong half. The same pair went into the EPK generation prompt beneath "use
these facts, do not invent", leaving the model to repeat the zero or invent a reconciliation.

Cause, as item A predicted: `artistLifetimePlays` is keyed by **address**, the masters were
re-minted under the artist's wallet, and the counter stayed with the deployer key. Per-song
counts come from the Redis ledger window, which did not move.

**What changed.** `lib/epk/chain.ts` now takes `max(artistLifetimePlays, sum(per-song))`. Both
sources are lower bounds — the chain figure is exact for one address and blind to any history
that moved or predates the v3 cutover; the ledger is a trimmed window complete for no period at
all — so the larger is the better bound, and being at least the ledger sum it can never be
smaller than the parts printed beside it. `totalPlaysIsFloor` marks it, and both surfaces render
`83+` rather than `83`, because a floor shown as a total looks precise.

Also corrected while in there, same class of defect:

- **"Verified on Monad" sat under all four cards** and was wrong under three. Each card now
  states its own provenance; "—" for unique listeners says "no contract keeps a listener roster".
- **"Revenue (WMON)" is `artistMonthlyPayouts` — the subscription pool only.** Licence sales
  settle through SalesController straight to the artist and never pass through it, so `0.00` sat
  next to `2` sales and implied the sales earned nothing. Relabelled "Subscription Payouts"
  on the press kit and "Payouts" in `ProfileModal`, which also stopped calling a part-ledger
  figure "On-Chain Stats".

`tools/verify-epk-stats-consistent.ts` holds the invariant — a total drawn on a page is at least
the sum of the parts drawn on the same page — against the real function with a stub client.
**Made to fail on purpose:** reverting the `max` to the bare chain read turns two of its eleven
checks red with `expected 83, actual 0`.

**Not fixed, and deliberately not:** the 8 orphaned plays and old licence sales still sit on the
deployer address. Nothing carries them forward, and after this change nothing needs to — the
figure the booker reads no longer depends on them.

### G. Every client-signed transaction was failing — **FIXED 2026-08-29, watch for fallout**

`sendTransaction` looked for `sdk.ethereum`, which `@farcaster/miniapp-sdk@0.2.1` does not define
(its wallet is `sdk.wallet.getEthereumProvider()` / `.ethProvider`). Every branch missed,
`window.ethereum` is absent in the Farcaster webview, and anything the user signed threw "no
transaction sending method available". Gasless paths go through `/api/execute-delegated`, which is
why it went unnoticed.

Fixed and covered by `tools/verify-wallet-and-migration.ts`, but **nothing signed by a user has
been exercised end to end since** — display-name claims and catalogue migration were both dead
for an unknown period. Worth one real transaction to confirm.

### H. ~~A suspended master still earns~~ — **FIXED 2026-09-21**

`MusicSubscriptionV6.recordPlay` (`contracts/MusicSubscriptionV6.sol:415-456`) checks the
subscription, the cooldowns, the daily caps, `getMasterType` and `artist != address(0)`. It
**never checks `masterSuspended`**, and cannot be made to — it is deployed and immutable. Nor did
any of the **five** call sites that drive the oracle (`lib/play-recording.ts` ×2,
`app/api/record-play/route.ts`, `app/api/live-radio/route.ts`,
`app/api/venue/[venueId]/route.ts` — this item said four; the scan found the fifth).

Suspension was only ever a *display* control: it makes the registry report `active: false`, which
stops LiveRadioV3 queueing the track, and `lib/catalogue-source.ts` filters it out of the
catalogue. Neither touches crediting.

Chain state when found, 2026-09-21:

```
masters 1–5  artist 0x8dF64bACf6b7… (deployer)  suspended=true   month690=3  lifetime=8
master  6    artist 0x05d15996…                 suspended=false  month690=1  lifetime=1
masters 7–13 artist 0x33fFCcb1… (the artist)    7 suspended      month690=0  lifetime=0
month 690 (2026-09-04 → 10-04)   4 plays, 15 WMON revenue, not finalized
```

Three quarters of that month's pool was on course to pay the deployer key for tracks that had
been taken down, and nothing to the artist. Item A said the problem "had stopped growing" — true,
but because the catalogue stopped listing those masters, not because anything refused to credit
them. An observation, not a control.

**What changed.** `lib/master-playable.ts` is the control, and all five call sites go through it.
It reads `masterSuspended`, `masterPurged` and `getMaster` and **fails closed**: a read that does
not come back means "cannot confirm this may earn", and the play is not recorded — the same
posture `catalogue-source.ts` already takes for the same flags. The radio and venue paths check
once per track rather than once per listener, because suspension is a property of the master. It
is deliberately **not cached**: a takedown exists to take effect in seconds, and a TTL is exactly
how long it would keep paying afterwards.

The existence check earns its place separately. A master that does not exist reads
`suspended=false, purged=false`, so the two flags alone waved token id 999 through; `recordPlay`
would revert on `artist != address(0)`, and **Monad charges the full gas limit on a revert**, so
that is real MON spent to be told no. Verified against mainnet: ids 1, 5 and 7 refuse as
suspended, 6, 8 and 13 pass, 999 refuses as nonexistent.

`tools/verify-suspended-masters-earn-nothing.ts` holds it — a source scan requiring every
contract-level `recordPlay` call to sit below a gate in its own file, plus stub-client checks
that suspended, purged, nonexistent and unreadable all refuse. It does not hard-code the five
files: a sixth route is the case it exists for, and a list would not contain it. **Made to fail
on purpose:** removing the gate from the venue route turns it red naming
`app/api/venue/[venueId]/route.ts:370`.

**Not done, and it is a separate decision:** the 8 plays and the month-690 credit already on the
deployer key are not reversed. `artistMonthlyPlays` has no setter and month 690 is unfinalized;
whether to let it settle as-is is a call about ~11 WMON, not a code change.

---

## Tier 4 — hygiene, real but not urgent

### 13. Disable two unused third-party keys at the provider

Nothing has read them since `bc3292b`, so there is no live code path. They stay billable until
someone turns them off, which is the whole of the task. Provider and key identities are in the
operator notes outside the repo.

### 14. ~~The "AI Music" labelling~~ — **CLOSED 2026-09-21: source fixed 08-29, publication 09-19**

Bio and genre corrected in `lib/epk/constants.ts`; the `['AI Music']` fallback in
`epk/generate` is now an empty list, so it no longer asserts anything about other artists' work.
`tools/verify-catalogue-claims.ts` guards it, and deliberately still passes the accurate credits —
the "(AI Music Video)" video credit, the Nano Banana stamp images, and EPKModal's "AI-generated
draft", which describes Gemini-written text.

The publication caught up on 2026-09-19 and was verified from chain and gateway on 09-21 — see item E. Both halves are done.

### 15. ~~Three unreachable modals~~ — **DONE; the guard has been silent for some time (2026-09-15)**

`tools/verify-modal-wiring.ts` passes clean: 53 checks across 79 files, zero warnings. The tool
still has its `warn()` path (lines 38–54, raised at 170, reported at 317), so this is a check that
can fail and does not, rather than a check that stopped looking.

### 16. ~~`empowertours-envio/` type gate~~ — **MOOT 2026-08-29, directory deleted**

### 17. Standalone radio bot: deploy or retire

`DEPLOYMENT_PLAN.md` task #10, marked ready, awaiting a Discord token.

### 18. ~~Envio config cleanup~~ — **MOOT 2026-08-29, deleted with the indexer**

### 19. ~~Rate limits~~ and CSP — **rate limits DONE; CSP still open (2026-09-15)**

Every route this named now has a limiter: `bot-command`, `oracle/chat`, and all four upload routes
(`upload`, `upload-json-to-ipfs`, `upload-metadata`, `upload-to-ipfs`).

**CSP stands.** A `content-security-policy` header is sent, but it does not yet cover script
sources — so a check for "is there a CSP at all" answers yes and tells you nothing. Verify the
directive list rather than the header's presence. Current contents are not restated here; this
repository is public.

### 20. ~~82~~ 70 lint warnings

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
