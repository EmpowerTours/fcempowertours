# TODO

Decisions and work that are agreed but not built. Each entry says what is true
today, so it can be picked up without re-deriving the situation.

---

## Venue stamps for shows

Fans and artists collect a stamp per performance. Replaces the venue-booking and
itinerary features, which were removed — **no venue registry is needed**, because
the artist signing their own show is the authority for it.

### What already exists

- `PassportNFTV4` at `0x4D5533e29Cf190131885Dc7Dbef22e31F4252410`, live.
  `addVenueStamp(tokenId, location, eventType, artist, verified, placeId,
googleMapsUri, latitude, longitude)` already models exactly this. It was never
  venue-registry-dependent; the dead part was `addItineraryStamp`.
- The oracle that may stamp is `0xe210b31bBDf8B28B28c07D45E9B4FC886aafDCEf` — the
  same PlayOracle already recording plays daily. The stamping authority is a
  running service, not something to build.
- `qrcode` is already a dependency. No scanner library is needed: the QR encodes a
  URL and the fan's native camera opens it.
- The artwork renders both stamp styles already
  (`lib/passport/generatePassportSVG.ts`).

### What to build

1. **Show grant.** The artist signs ONE EIP-712 message per show —
   `{artist, location, eventType, lat, lng, radius, startTime, endTime}`. One
   signature regardless of attendance. Signing fans individually does not scale
   and is not the design.
2. **Rotating QR.** `…/show/<id>?c=HMAC(showSecret, 30s slot)`. A static QR is in a
   group chat within two minutes of doors; a rotating code makes a screenshot
   worthless almost immediately.
3. **Claim endpoint.** Verify: grant signature recovers to the artist, code matches
   a recent slot, now is inside the window, position is inside the radius,
   accuracy is sane. Then the oracle calls `addVenueStamp(..., verified: true)`.
4. **Self-recording.** Anyone may log a show they attended; it stamps with
   `verified: false` and renders pencilled.

### What ships NOW, with the contract that is already deployed

**Self-recorded stamps work today and cost the platform nothing.**

`addVenueStamp` permits `msg.sender == _ownerOf(tokenId)`. Verified on mainnet
2026-09-07: the holder of #4 can stamp their own passport; a stranger is refused
with `Unauthorized`. So a fan records a show they attended, signs it themselves,
and pays their own gas. No oracle, no cap, no platform spend, no contract change.

Those render pencilled, which is honest — nobody attested them. Shipping only
pencilled stamps first is coherent rather than a compromise: the struck ones
arrive later and mean something precisely because they were scarce from the start.

**Cost: 0.0198 MON**, not the 0.0298 quoted earlier — leaving `placeId` and
`googleMapsUri` empty drops the write from 292,236 gas to 194,248. A third cheaper
for free, because those two strings are most of the cost and the app does not use
Google Maps data. Do not populate them.

So phase one is a UI to record a show and a transaction the fan signs. That is it.

### Attested stamps: per-artist pre-pay, NOT a platform cap

An earlier draft of this file set a platform-wide ceiling of 150 attested stamps
per show. That was the wrong shape, and `lib/platform-gas-budget.ts` already
explains why in its own header: a per-caller limit bounds one caller and "does not
bound what _everyone_ can do". A per-SHOW cap has the same defect one level up —
ten artists each running a show inside the limit costs ten times as much, and none
of them did anything wrong.

**The artist pre-pays for their own show.** Opening a show for N attested stamps
moves `N x 0.0198 MON` from the artist's Safe to the oracle's gas wallet, and the
show's ceiling is simply what they bought. Self-limiting by construction rather
than by a number somebody picked, and the platform's exposure does not grow with
the roster. It also matches the existing economics: the Safe is already the
account fees are charged from, even though sale proceeds land in the artist's
wallet.

Two constraints on building it:

- Only `owner()` or `oracle()` may set `verified: true`, so the artist's Safe
  cannot be the caller. The oracle still stamps; the artist has funded it.
- Safes hold MON, so a WMON charge has to wrap first. That step exists whatever
  currency the pre-pay is billed in.

Keep `platform-gas-budget` behind it as a backstop. A bug in the pre-pay
accounting is exactly the case its fail-closed default was written for.

### The honesty hole, and its real size

With this contract, `verified` is whatever the caller passes. A technical user can
call `addVenueStamp` directly with `verified: true` and self-award a struck stamp,
bypassing the app entirely. There is no on-chain fix without a redeploy.

The app can cross-check a struck stamp against a known show grant and render an
unmatched one as pencilled, which handles the honest majority. Past that: a stamp
carries no money, so faking one earns a picture of a circle on your own passport.
That is the bound, and it is why this is acceptable to ship before V5 rather than
after.

## PassportNFTV5 — fold three fixes into one redeploy

Three separate things each want a contract change. They should ship together
rather than as three redeploys.

1. **Fan-paid attested stamps.** Let `addVenueStamp` accept the artist's show
   signature and verify it on-chain. Then the payer and the attester are
   decoupled: fans pay their own gas and `verified` becomes trustworthy instead of
   caller-asserted. This removes the cap problem entirely rather than bounding it.
2. **Refuse an empty tokenURI at mint.** Passports #1–#4 minted with no metadata
   at all because a caller passed `""` (fixed app-side in `27224ff`, but the
   contract still permits it). A mint that cannot produce metadata should revert.
3. **Cheaper stamps.** `placeId` and `googleMapsUri` are stored as full strings and
   are most of the cost — passing them empty already drops the write from 292,236
   to 194,248 gas, so removing the fields entirely is the rest of that saving.

### Migration is already solved — do not redesign it

`migrateLegacyPassport(to, userFid, countryCode, countryName, region, continent,
uri, originalMintedAt)` exists on the current contract and **preserves the original
mint date**, which is the whole reason it was written. `passportMigrationSealed()`
is currently `false`, so the door is open.

State at time of writing: **4 passports** (#1 Mexico, #2 France, #3 China,
#4 Mexico), all with on-chain `data:` metadata set 2026-09-06. Migrating all four
costs roughly **0.12 MON**. Their stamps would need carrying across too — none
exist yet, so today the migration is trivial and it gets harder the longer it
waits.

Call `sealPassportMigration()` once the four are across, so the door does not stay
open indefinitely.

---

## ~~Passport artwork on MetaMask Mobile~~ — DONE 2026-09-07

**MetaMask does not resolve `ipfs://` NFT URIs on Monad.** Both the tokenURI and
the `image` inside it must be plain `https://`. Fixed for all four passports and
for new mints (`lib/passport/token-uri.ts`). Full account in
`reference_metamask_monad_nft_media` — it cost five wrong theories and about
2.3 MON, because the music NFTs use `ipfs://` and render, which looked like a
working reference. They are fetched by the app, not by MetaMask's resolver.

## Governance still answers to one hot key

All six live v3 contracts — LicenseRegistry, SalesController, SubscriptionReferrals,
ProfileRegistry, MusicSubscriptionV6, PassportNFTV4 — have governance/owner set to
`0x8dF64bAC…`, a key in a `.env` on one machine. `daoTimelock()` is `0x0`. The
2-of-3 Safe holds funds but controls nothing.

Four of the six use two-step transfer (`setGovernance` then `acceptGovernance`), so
moving them to the Safe cannot brick them. V6 and PassportNFTV4 are one-step
`transferOwnership` and need more care — and V6's owner runs the monthly payout
keeper, so moving it means the keeper needs Safe signatures every month.

This is the largest unmitigated risk in the app and the only one that cannot be
undone after the fact.

---

## ~~Stamps do not appear until the artwork is regenerated~~ — DONE 2026-09-07

`refreshPassportMetadata()` rebuilds the artwork and rewrites the tokenURI, and
both stamping paths call it. About 0.001 MON per refresh, because only a ~90-byte
https:// URL goes on chain. It never throws: a refresh rides on a stamp that
already succeeded, so a failure cannot undo one.

---

## Climbing stamps are wired but never exercised

`POST /api/climb-stamp` is live, `CLIMB_STAMP_SECRET` is set on both services, and
version1 calls it from both transaction-confirmation paths (commit `7b50db4`).

**Nobody has ever completed a `/journal`.** All three ClimbingLocations contracts
show 0 NFT mints and 2 transactions each — deployment and funding. So the passport
half is correct and untested, and the first person to log a climb is also the
first test of `/journal` itself. If it fails, look there before looking here.
