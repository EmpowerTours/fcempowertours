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

### 2. `ENFORCE_QUICK_AUTH` is off — the Safe drain is open

`lib/quick-auth.ts:39` gates enforcement on the flag. Until it is set, `send_mon`, `send_tours`
and `withdraw_to_user` on `/api/execute-delegated` accept an attacker-chosen recipient.

**It cannot simply be switched on.** `bot-command → execute-delegated` is an unauthenticated
internal hop that would start 401-ing, taking `mint_music`, `mint_collector` and `buy music` with
it. Forwarding the user's wallet signature is *not* the fix — that signature is action-bound and
verifying it downstream would let one captured for `bot-command` be replayed as `send_mon`.

Order: mint a service credential for the internal hop → watch logs for
`[QuickAuth] … unauthenticated` until only known callers appear (the radio scheduler calling
`radio_mark_played` is the expected one) → give those callers the credential → set the flag →
make the gate fail-closed so an unset variable can never mean "allow".

Effort: high. Biggest security item open.

### 3. The Envio indexer has been dead since 2026-08-01

`lastUpdated: 2026-08-01T17:09:19`, roughly **2.98M blocks behind** a head of ~98.62M. The
chain fallback from `7134adb` is why the catalogue still loads, and why this went unnoticed for
three weeks.

What it is actually breaking:

- `get-user-licenses` still queries Envio and logs `Licenses matching query address: 0`. The
  licences view serves stale, empty data.
- It is why the V5 subscriber set (#4) cannot be enumerated.
- `[StreamingStats]` and the dashboard read the same stale rows.

Effort: medium. Restart/redeploy the indexer, then confirm `lastUpdated` tracks the head.

### 4. V5 subscribers — unverified, and someone may be paying for nothing

The app reads `MusicSubscriptionV6`. Anyone holding an unexpired **V5** subscription is invisible
to it. The set was never enumerated: the public Monad RPC caps `eth_getLogs` at a **100-block
range**, so it needs the Alchemy key or a working indexer (#3).

This is the only item where a paying user may already be losing something. Do it right after #3.

### 5. `/api/register-user-safe` is unauthenticated and spends platform gas

One caller (`PassportMintModal`). Needs an auth gate plus a global gas cap, or a script can drain
the platform wallet by requesting Safes in a loop.

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

### 8. Verify the play-history reset did not touch WMON accounting

The cutover left `artistLifetimePlays` reading **19 on V5 and 0 on V6**. The artist TOURS bonus
this feeds never worked anyway, but the **WMON** payout path counts plays *per month*, not
lifetime. Confirm month accounting is intact before assuming this is cosmetic. The WMON economy
is the part that actually works; it is worth ten minutes.

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
