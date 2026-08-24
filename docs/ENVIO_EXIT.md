# Leaving Envio — route-by-route scope

Scoped 2026-08-24. Every number below was measured against Monad mainnet or read out of the
tree; none is an estimate dressed up as a fact.

**Conclusion first: this is worth doing, and it is smaller than 38 files suggests.** Nine of
those files query entities for features that no longer exist, so they are deletions. Most of the
rest read the catalogue, which already has a working chain path.

---

## Why, in one paragraph

Envio indexes millions of events. The dataset is:

```
totalMasters   5      artists      1
totalLicenses  4      subscribers  9
                      lifetime plays 19
```

That is a catalogue readable in one `multicall`. The cost is not the main argument though — the
2026-08-13 incident is. The indexer stopped at block 95,657,100 and kept answering **HTTP 200
with well-formed, eight-day-old data**. Nothing failed; the UI just showed a snapshot. That
entire class of bug — confidently wrong, silently — does not exist when reading the chain.

As of 2026-08-24 it is stale again: `lastUpdated 2026-08-01`, ~2.98M blocks behind.

## The two facts that make it possible

**`Multicall3` is deployed on Monad** at the canonical `0xcA11bde05977b3631167028862bE2a173976CA11`
(7,619 bytes). viem uses it natively, so N reads cost one round trip.

**`LicenseRegistry` is not ERC721Enumerable** — no `tokenOfOwnerByIndex` — so licences cannot be
enumerated. They do not need to be: `_licensesHeld` is keyed `owner → masterId → count` with a
public getter, so you iterate **masters (5), not licences**. Verified live: `licensesHeld(0xd6b6…, 3)`
returns `1`, matching licence 1000004 in the logs.

---

## Group E — DONE 2026-08-24 (`a3e5d29`)

3,509 lines out. The scope grew once: `/api/envio/get-guides` could not be deleted alone because
**MirrorMate still called it**, and MirrorMate turned out to be already broken — every backing
route and all four `mirrormate_*` executor actions were removed by `3b833d4`/`10052d8`, while the
Oracle still advertised `game:"MIRROR"` and the page still rendered it. A user asking for it got a
working modal in which nothing worked.

Also swept: the `game` action type (leaving it would have the model emit an action nothing
handles), three `TourGuideRegistry` executor actions `10052d8` missed, and `EnvioDashboard.tsx`,
which nothing rendered.

Verified: tsc clean, 0 eslint errors, seven verify suites pass, build exits 0 at 101 static pages
(down from 103), and in a browser all four oracle modals still open with `/dashboard` and
`/profile` — the two pages that lost query fragments, state and JSX — still rendering.

### Original scope (9 files)

These query entities for the travel features removed in `3b833d4`. Dead queries against a dead
indexer for a dead product.

| File | Dead entities |
|---|---|
| `app/api/envio/get-guides/route.ts` | `TourGuide` |
| `app/api/guides/route.ts` | `TourGuideRegistry_GuideRegistered/Updated` |
| `app/api/user/public-profile/route.ts` | `Experience`, `ItineraryPurchase` |
| `app/api/passport/image/[tokenId]/route.ts` | `ClimbAccessBadge` |
| `app/components/EnvioDashboard.tsx` | `Itinerary`, `ItineraryPurchase` |
| `app/dashboard/page.tsx` | `Experience` |
| `app/profile/page.tsx` | `Experience`, `ItineraryPurchase` |

Do this first. It is free, it shrinks every group below, and `verify-modal-wiring.ts` already
proves the deletion tooling works.

## Group A — catalogue (`MusicNFT`), 14 call sites

**Already solved.** `lib/catalogue-source.ts` does health-check → chain fallback → automatic
recovery, and `get-nfts` uses it in production today. These sites just switch to `getCatalogue()`.

`epk/generate`, `epk/pdf`, `execute-delegated`, `frames/music`, `live-radio`,
`live-radio/scheduler`, `og/art`, `og/music`, `artist/[address]`, `LiveRadioModal`, `discover`,
`nft/[tokenId]`, `lib/venue`, `bot-command`.

Mechanical. The design work is done.

## Group B — passports (`PassportNFT`), 8 call sites

**The one open question, now resolved.** The app asks
`PassportNFT(where: {owner: {_eq: $address}})` — "which passports does this address own" — and
on-chain there is only `getPassportByAddress(address, string country)`. No enumerator.

Resolution: **one multicall over the country list.** The app already loads 195 countries at boot.

Measured on the free public RPC, cold, no cache:

```
195 hasPassportByAddress calls, one Multicall3 request  →  1202ms, 195/195 ok
 34 real ISO codes for the artist                       →   581ms
```

and it returns the right answer — `0x33fFCcb1…` resolves to **MX, FR, CN**, exactly the three
passports the cutover migrated. Then fetch `getPassportData` only for the hits.

1.2s cold is acceptable for a profile view and it caches well: a passport set changes only on
mint. On the Alchemy key it will be faster. If it ever needs to be instant, record the country
in Redis at mint time — but do not build that until the multicall is proven too slow.

## Group C — licences (`MusicLicense`), 8 call sites

`licensesHeld(owner, masterId)` across `totalMasters()`, in one multicall — 5 calls today.

**This group has a second bug that Envio would not fix.** The cutover split licence data across
two contracts:

```
legacy 0xB9B3acf3…  balanceOf(0x868469e5…) = 3
v3     0x42EbcD44…  balanceOf(0x868469e5…) = 0
```

A v3-only query misses those three licences whether it comes from the indexer or the chain. The
chain path has to read **both** contracts. So this work is not wasted even if Envio is later
restored — the licences view is broken for reasons a healthy indexer does not address.

## Group D — aggregates (`GlobalStats`), 5 call sites

`totalMasters()` and `totalLicenses()` exist on the registry. Trivial.

## Group F — the genuine loss

`app/api/artist-earnings/route.ts` queries `RadioPlay` and `RadioTip` — a per-play and per-tip
ledger with `playedAt`, `artistPayout`, `tipper`, `amount`. That is event-sourced history and
there is no contract getter for it. `LiveRadioV3` exposes only aggregates: `totalSongsPlayed()`,
`totalListenRewardsPaid()`, `getListenerStats(address)` — global or per-listener, never
per-artist-per-song over time.

Three options, in order of preference:

1. **Redis ledger.** The listener-stats ledger already works this way and survived the indexer
   being dead for 23 days without anyone noticing, which is the strongest evidence available
   that it is sufficient. Write on `markSongPlayed`.
2. **`eth_getLogs` over a bounded range.** Needs the Alchemy key — the public RPC caps at a
   **100-block range**, which is the same wall that blocked enumerating V5 subscribers.
3. **Accept aggregates only.** Artist earnings become a total, not a timeline.

This is the only place where leaving Envio costs a capability rather than moving one.

---

## Order

1. **Group E** — delete the dead travel queries. Free, shrinks everything else.
2. **Group A** — point the 14 catalogue sites at `getCatalogue()`. Mechanical, and it retires the
   largest share of the surface.
3. **Group C + D** — licences and aggregates, one multicall helper serving both, reading both the
   legacy and v3 contracts.
4. **Group B** — passports, via the country multicall.
5. **Group F** — decide radio history. Recommend the Redis ledger.
6. Delete `empowertours-envio/`, `NEXT_PUBLIC_ENVIO_ENDPOINT`, `lib/envio-health.ts`, and the
   staleness fallback in `catalogue-source.ts` — which becomes dead once nothing can be stale.

## What to keep from the indexer era

`lib/catalogue-source.ts`'s shape, minus the health check: one source, no retry loop, correct by
construction. Its header comment is the best written record of why the 2026-08-13 failure was
hard to see, and that reasoning should outlive the indexer it describes.

## What this does not fix

Dropping Envio does **not** resolve priority #4 (enumerating V5 subscribers). That needs
`eth_getLogs` and therefore the Alchemy key, indexer or no indexer.
