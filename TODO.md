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

### THE CAP, and why these numbers

Only `owner()` or `oracle()` can honestly set `verified: true` — if a fan calls
`addVenueStamp` themselves they choose that flag, which is a self-stamp wearing a
false badge. So attested stamps come from the oracle, **and the oracle pays**.

Measured on mainnet 2026-09-07: `addVenueStamp` costs **292,236 gas**, which at
102 gwei is **0.0298 MON per stamp**.

    100 fans      3 MON
    1,000 fans   30 MON
    10,000 fans 298 MON

The deployer holds ~92 MON, so one stadium show would exceed the treasury. Start
with, in the same shape as the Hunt payout caps that already work:

- **150 attested stamps per show** (~4.5 MON). Comfortably covers any room this
  app will fill in the next year, and one runaway show cannot drain anything.
- **300 attested stamps per rolling 24h** across all shows (~9 MON). The blast
  radius if the claim endpoint is ever fooled at scale.
- **30 MON total programme budget** (~1,000 stamps) before someone re-approves.

Past the cap, claims still succeed — they record as pencilled rather than being
refused. A fan who showed up should never be told "no"; they should be told
"recorded", and the artist's attestation is what is scarce.

Revisit the numbers when a show actually sells more than 150 tickets. Until then
they are ceilings, not forecasts.

---

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
   are most of the 292k gas. If Google Maps data is not actually used, dropping
   them cuts the cost substantially.

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

## Passport artwork on MetaMask Mobile

The four passports carry `data:application/json;base64` tokenURIs — fully
on-chain, no gateway. **MetaMask Mobile does not render base64 data URIs**
(metamask-mobile issues #6200, #4561); the extension does. Your own music NFTs
render correctly because they use `ipfs://` at both the tokenURI and the `image`
field, which is the working reference.

To fix: pin the SVG to IPFS as its own file, pin JSON referencing it, and
`setTokenURI` on all four. About 0.001 MON. `tools/repair-passport-uris.ts`
already does this — run it without `ONCHAIN=1` and with `PINATA_JWT` set. Do one
passport first and check it on a phone before the other three.

---

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
