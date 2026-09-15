# Open security actions

Things that need doing outside this repo, and the code changes that go with them.

---

## This file is deliberately thin, and that is the point

`EmpowerTours/fcempowertours` is a **public repository.** An earlier version of this file named
the gate's file and line, listed the exact handlers that were not yet enforced, and gave the
bundle path a key had appeared in. Written for one maintainer, it reads equally well as
instructions for someone else — and every unfixed item on it was a live gap at the time.

So the rule here: **state the work, not the route to it.** What needs doing, who does it, and
when it is done. Not where the hole is, what reaches it, or what a credential unlocks while it is
still valid.

Specifics belong in the operator notes outside the repo, where an audit trail is not also a
publication. If an item cannot be described without the specifics, that is a sign it should not
be in a public file at all until it is closed.

---

## 1. ~~Mapping-provider keys~~ — **code side closed 2026-08-22 by deletion**

The mapping integration is gone — the library, the modals, the place-details route, the Oracle's
grounding and the related payment action were all removed when the app narrowed to music.
Nothing in the repo reads either key.

**Still worth doing once, at the provider:** disable both. A key nothing uses is not a
vulnerability, but it stays billable until someone turns it off. Tracked as `PRIORITIES.md` #13.

## 2. `ENFORCE_QUICK_AUTH` is still off — **cleanup, not a drain**

The drain this item used to describe **does not exist**: fund-moving actions fail closed on
ownership regardless of this flag, by design. The flag governs non-value actions only.

**It cannot simply be switched on.** An internal service-to-service hop is unauthenticated and
would start failing, taking several user-facing actions with it. Forwarding a user's wallet
signature is **not** the fix — that signature is action-bound, and verifying it downstream would
let one captured for a harmless action be replayed as a costly one.

Order: mint a service credential for the internal hop → confirm from the logs that only known
server callers appear unauthenticated → give those callers the credential → set the flag → make
the gate fail-closed by default, so an unset variable can never mean "allow".

## 3. ~~`/api/register-user-safe` is unauthenticated~~ — **closed 2026-08-25**

It was not unauthenticated. The route is gated and fails closed independently of
`ENFORCE_QUICK_AUTH`. A global gas cap was added alongside, because the per-caller rate limit
bounded one caller and not the total. See `PRIORITIES.md` #5.

## 4. Lower priority

- ~~Rate limits on the three named route groups~~ — **done**, verified 2026-09-15.
- CSP does not yet cover script sources. `PRIORITIES.md` #19.
- ~~The pre-commit hook reports success while the typecheck fails~~ — **fixed**; it blocks now.

## Closed since the July audit

- Two orphaned unauthenticated routes — deleted.
- Next.js is past the patch for CVE-2025-55182; React 18.3.1 is not affected by it at all, and no
  `react-server-dom-*` package is installed.
- Two of the three key patterns flagged in July were **not** found in the homepage's chunks on
  2026-08-19. Worth a re-check across other routes before calling them fixed — a single-page
  scan is not a bundle-wide one.
