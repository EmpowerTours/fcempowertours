# Open security actions

Things that need doing outside this repo, and the code changes that go with them. Verified
against the running deployment on 2026-08-19, not carried over from an older audit.

---

## 1. ~~Google Maps key — split it in two~~ — **closed 2026-08-22 by deletion**

No Console action is needed any more: the Maps integration is gone. `lib/maps/`,
`MapsResultsModal`, `PlaceDetailsCard`, `/api/maps/place-details`, the Oracle's Maps grounding
and the `maps_payment` action were all removed when the app narrowed to music.

Nothing in the repo reads `GOOGLE_MAPS_SERVER_KEY` or `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`, so the
browser key that was visible in `/_next/static/chunks/1965-*.js` is no longer emitted and the
billable server-side APIs are no longer called.

**Still worth doing once, in the Console:** delete or disable both keys. A key nothing uses is
not a vulnerability, but a live key that leaked into a public bundle is still a live key — and
the billing stays enabled until someone turns it off.

## 2. `ENFORCE_QUICK_AUTH` is still off — the Safe drain is open

`lib/quick-auth.ts:39` gates enforcement on `ENFORCE_QUICK_AUTH === "true"`. Until it is set,
Quick Auth verifies and logs but never rejects, so `send_mon` / `send_tours` /
`withdraw_to_user` on `/api/execute-delegated` take an attacker-chosen recipient.

**It cannot simply be switched on.** `bot-command → execute-delegated` is an unauthenticated
internal hop and would start 401-ing, taking `mint_music`, `mint_collector` and `buy music` with
it. Forwarding the user's wallet signature is **not** the fix — that signature is action-bound,
and verifying it downstream would let one captured for `bot-command` be replayed as `send_mon`.

Order: mint a service credential for the internal hop → watch Railway logs for
`[QuickAuth] … unauthenticated` until only known server callers appear (the radio scheduler
calling `radio_mark_played` is the expected one) → give those callers the credential → set the
flag → make the gate fail-closed by default so an unset variable can never mean "allow".

---

## 3. `/api/register-user-safe` is unauthenticated and spends platform gas

Still present. One caller (`PassportMintModal`). Needs the auth gate plus a global gas cap, so a
script cannot drain the platform wallet by requesting Safes in a loop.

---

## 4. Lower priority

- No rate limit on `bot-command`, `upload*`, `oracle/chat`.
- No global CSP `script-src`.
- The pre-commit hook **prints** `tsc` errors and then exits 0, so it reports success while the
  typecheck is failing. It gates nothing — run `npx tsc --noEmit` yourself.

## Closed since the July audit

- `/api/store-delegation` and `/api/migrate-delegations` — deleted.
- Next.js is on 15.5.22, past the 15.5.10 patch for CVE-2025-55182; React 18.3.1 is not affected
  by it at all, and no `react-server-dom-*` package is installed.
- Alchemy and Neynar key patterns were **not** found in the homepage's chunks on 2026-08-19.
  Both were flagged in July; only Google Maps still appears. Worth a re-check across routes
  other than the homepage before calling them fixed.
