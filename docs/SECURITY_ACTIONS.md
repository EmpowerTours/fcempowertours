# Open security actions

Things that need doing outside this repo, and the code changes that go with them. Verified
against the running deployment on 2026-08-19, not carried over from an older audit.

---

## 1. Google Maps key — split it in two (**console action required**)

**Verified live 2026-08-19.** Fetched the 31 chunks the homepage loads from
`fcempowertours-production-6551.up.railway.app`; a key matching `AIzaSy…` is present in
`/_next/static/chunks/1965-*.js`.

**That, on its own, is not the defect.** A Maps JS SDK key *has* to be in the browser — the SDK
loads via `<script src="…?key=…">`, so it is readable by anyone and no proxy changes that.
Google's answer for a browser key is an **HTTP-referrer restriction**, not secrecy.

The defect was that the same key was also serving the **billable server-side APIs**. Places
Details and Directions are called from the Next.js process with no referrer, so a referrer
restriction cannot protect them — and the key authorising them was sitting in the page source.
`lib/maps/google.ts` fell back to `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` whenever
`GOOGLE_MAPS_SERVER_KEY` was unset. **That fallback is now removed.**

### What you need to do in Google Cloud Console

1. **Create a new SERVER key.** Restrict it by API to *Places API (New)* and *Directions API*.
   Restrict by IP if Railway gives you a stable egress IP; otherwise leave IP unrestricted and
   rely on the API restriction.
2. Set it on Railway as **`GOOGLE_MAPS_SERVER_KEY`** — no `NEXT_PUBLIC_` prefix, or Next will
   compile it straight into the bundle and you are back where you started.
3. **Restrict the existing browser key** (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`) to *Maps JavaScript
   API* only, with an HTTP-referrer restriction for
   `fcempowertours-production-6551.up.railway.app/*` and any custom domain.
4. **Check billing** for unexpected Places/Directions usage — the key has been public for a
   while, and that is the endpoint someone would abuse.

> **Deploy note:** maps search and directions now **fail closed** if `GOOGLE_MAPS_SERVER_KEY` is
> missing, logging exactly that. Set it before or with the next deploy, or place search stops
> working. Failing closed is deliberate: silently billing against a public key is worse.

`GoogleMapsProvider.getClientConfig()` also embeds the browser key, but it has **no callers**.
Leave it unwired — if it is ever served from an API route, that is fine for the JS SDK key and
must never be used for the server key.

---

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
