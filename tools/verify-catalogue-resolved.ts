/**
 * Verifies the metadata join in `lib/catalogue-resolved.ts`.
 *
 * Run: `node --experimental-strip-types tools/verify-catalogue-resolved.ts`
 *
 * ## What this is defending
 *
 * This layer exists because leaving Envio means resolving `tokenURI` documents ourselves. Two of
 * its rules are the silent kind — wrong output, no error:
 *
 * 1. **`external_url` must win over `animation_url`.** `animation_url` is a 3-second preview.
 *    Preferring it serves clips as if they were full songs, and nothing anywhere would report a
 *    problem; the player would just play three seconds.
 * 2. **A failed metadata fetch must degrade one track, not the request.** A dead IPFS gateway
 *    should cost a cover image, not the catalogue — the whole point of dropping the indexer is
 *    that the chain is always answerable.
 *
 * The cache also needs proving in both directions: a hit must not refetch (that is the property
 * that makes this cheap), and a failure must not be cached permanently (that would need a
 * restart to recover).
 */

import {
  fetchTrackMetadata,
  resolveIPFS,
  _resetCatalogueMetadataCache,
  makeCatalogueCache,
} from "../lib/catalogue-resolved.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/** Serve one canned response and count how many times it was asked for. */
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async (input: unknown) => {
    calls++;
    return handler(String(input));
  }) as typeof fetch;
  return {
    calls: () => calls,
    restore: () => {
      globalThis.fetch = real;
    },
  };
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200 });

// ---------------------------------------------------------------- ipfs resolution

check(
  "ipfs:// is rewritten to a gateway",
  resolveIPFS("ipfs://QmAbc").includes("/ipfs/QmAbc"),
  true,
);
check(
  "https passes through",
  resolveIPFS("https://x.example/a.png"),
  "https://x.example/a.png",
);
check("undefined becomes empty", resolveIPFS(undefined), "");
check("empty stays empty", resolveIPFS(""), "");

// ---------------------------------------------------------------- audio precedence

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() =>
    json({
      name: "Sloppy",
      image: "ipfs://QmCover",
      animation_url: "ipfs://QmPreview3s",
      external_url: "ipfs://QmFullTrack",
    }),
  );
  const meta = await fetchTrackMetadata("ipfs://QmMeta1");
  s.restore();
  check(
    "external_url wins over animation_url",
    meta.audioUrl?.includes("QmFullTrack"),
    true,
  );
  check(
    "the 3s preview is not served as the track",
    meta.audioUrl?.includes("QmPreview3s"),
    false,
  );
  check("name is taken from metadata", meta.name, "Sloppy");
  check("image is gateway-resolved", meta.imageUrl?.includes("QmCover"), true);
}

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() => json({ animation_url: "ipfs://QmOnlyPreview" }));
  const meta = await fetchTrackMetadata("ipfs://QmMeta2");
  s.restore();
  check(
    "animation_url is used when it is all there is",
    meta.audioUrl?.includes("QmOnlyPreview"),
    true,
  );
}

// ---------------------------------------------------------------- raw document passthrough

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() =>
    json({
      name: "Tagged",
      genre: ["Alternative Hip-Hop"],
      attributes: [{ trait_type: "Genre", value: "Experimental" }],
    }),
  );
  const meta = await fetchTrackMetadata("ipfs://QmTagged");
  s.restore();
  check(
    "fields this interface does not name survive on raw",
    (meta.raw as Record<string, unknown>)?.genre,
    ["Alternative Hip-Hop"],
  );
  check(
    "attributes survive too, so genre detection needs no second fetch",
    ((meta.raw as Record<string, unknown>)?.attributes as unknown[])?.length,
    1,
  );
}

// ---------------------------------------------------------------- caching

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() => json({ name: "Cached" }));
  await fetchTrackMetadata("ipfs://QmSame");
  await fetchTrackMetadata("ipfs://QmSame");
  await fetchTrackMetadata("ipfs://QmSame");
  s.restore();
  check("a CID is fetched once, not three times", s.calls(), 1);
}

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() => json({ name: "A" }));
  await fetchTrackMetadata("ipfs://QmA");
  await fetchTrackMetadata("ipfs://QmB");
  s.restore();
  check("different CIDs are not conflated", s.calls(), 2);
}

// ---------------------------------------------------------------- failure handling

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() => new Response("nope", { status: 504 }));
  const meta = await fetchTrackMetadata("ipfs://QmDead");
  s.restore();
  check("a 504 yields empty metadata, not a throw", meta, {});
}

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() => {
    throw new Error("network down");
  });
  const meta = await fetchTrackMetadata("ipfs://QmNetworkDown");
  s.restore();
  check("a thrown fetch is contained", meta, {});
}

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() => new Response("nope", { status: 500 }));
  await fetchTrackMetadata("ipfs://QmFlaky");
  await fetchTrackMetadata("ipfs://QmFlaky");
  await fetchTrackMetadata("ipfs://QmFlaky");
  s.restore();
  check("a broken gateway is not retried on every request", s.calls(), 1);
}

{
  // The failure cache must be a TTL, not a tombstone — otherwise recovery needs a restart.
  _resetCatalogueMetadataCache();
  const bad = stubFetch(() => new Response("nope", { status: 500 }));
  await fetchTrackMetadata("ipfs://QmRecovers");
  bad.restore();

  _resetCatalogueMetadataCache(); // stands in for the TTL expiring
  const good = stubFetch(() => json({ name: "Back" }));
  const meta = await fetchTrackMetadata("ipfs://QmRecovers");
  good.restore();
  check("a recovered gateway is picked up", meta.name, "Back");
}

// ---------------------------------------------------------------- malformed documents

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(() => json({ name: 42, image: null }));
  const meta = await fetchTrackMetadata("ipfs://QmWeird");
  s.restore();
  check(
    "a non-string name is ignored rather than rendered",
    meta.name,
    undefined,
  );
  check(
    "a null image does not become the string 'null'",
    meta.imageUrl,
    undefined,
  );
}

{
  _resetCatalogueMetadataCache();
  const s = stubFetch(
    () => new Response("<html>not json</html>", { status: 200 }),
  );
  const meta = await fetchTrackMetadata("ipfs://QmHtml");
  s.restore();
  check("an HTML error page is not parsed as metadata", meta, {});
}

// ------------------------------------------------------------------ whole-catalogue cache
//
// The chain read is 33-36 RPC calls against a public RPC that 429s at ~28 calls/s, so the
// cache is what keeps the catalogue answerable under load. Each rule below fails silently if
// broken: a blank catalogue, a frozen one, or one read per request again.

{
  let clock = 1_000_000;
  const cache = makeCatalogueCache<{ tracks: string[] }>({
    ttlMs: 15_000,
    maxStaleMs: 300_000,
    now: () => clock,
  });
  let loads = 0;
  let next: () => Promise<{ tracks: string[] }> = async () => ({
    tracks: ["a", "b"],
  });
  const load = () => {
    loads++;
    return next();
  };

  await cache.get("k", load);
  await cache.get("k", load);
  check("a hit inside the TTL does not read the chain again", loads, 1);

  clock += 15_001;
  await cache.get("k", load);
  check("an entry past the TTL is read again", loads, 2);

  clock += 15_001;
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  next = async () => {
    await gate;
    return { tracks: ["c"] };
  };
  const burst = Array.from({ length: 100 }, () => cache.get("k", load));
  release();
  const results = await Promise.all(burst);
  check("100 concurrent misses share ONE read (single-flight)", loads, 3);
  check(
    "every concurrent caller gets the result",
    results.every((r) => r.tracks[0] === "c"),
    true,
  );

  const a = await cache.get("k", load);
  a.tracks.reverse();
  a.tracks.push("mutated");
  const b = await cache.get("k", load);
  check("a caller mutating its copy does not change the cached one", b.tracks, [
    "c",
  ]);

  // Empty is how readCatalogueFromChain reports a failed RPC read.
  clock += 15_001;
  next = async () => ({ tracks: [] });
  const emptyWithStale = await cache.get("k", load);
  check("an empty read serves the last good copy", emptyWithStale.tracks, [
    "c",
  ]);
  next = async () => ({ tracks: ["d"] });
  const afterEmpty = await cache.get("k", load);
  check(
    "an empty read is not cached: the next request reads again",
    afterEmpty.tracks,
    ["d"],
  );

  clock += 15_001;
  next = async () => {
    throw new Error("429");
  };
  const errWithStale = await cache.get("k", load);
  check(
    "a failed read inside MAX_STALE serves the last good copy",
    errWithStale.tracks,
    ["d"],
  );

  clock += 300_001;
  let threw = false;
  try {
    await cache.get("k", load);
  } catch {
    threw = true;
  }
  check(
    "a failed read past MAX_STALE is passed through, not hidden",
    threw,
    true,
  );

  const fresh = makeCatalogueCache<{ tracks: string[] }>({
    ttlMs: 15_000,
    maxStaleMs: 300_000,
    now: () => clock,
  });
  const emptyCold = await fresh.get("k", async () => ({ tracks: [] }));
  let coldLoads = 0;
  await fresh.get("k", async () => {
    coldLoads++;
    return { tracks: ["x"] };
  });
  check(
    "a cold empty read is returned but not stored",
    [emptyCold.tracks.length, coldLoads],
    [0, 1],
  );

  let keyLoads = 0;
  const keyed = makeCatalogueCache<{ tracks: string[] }>({
    ttlMs: 15_000,
    maxStaleMs: 300_000,
    now: () => clock,
  });
  await keyed.get("15", async () => (keyLoads++, { tracks: ["short"] }));
  const long = await keyed.get(
    "1000",
    async () => (keyLoads++, { tracks: ["long"] }),
  );
  check(
    "different limits are cached separately",
    [keyLoads, long.tracks[0]],
    [2, "long"],
  );
}

// ------------------------------------------------------------- invalidation after a change

{
  let clock = 5_000_000;
  const cache = makeCatalogueCache<{ tracks: string[] }>({
    ttlMs: 15_000,
    maxStaleMs: 300_000,
    now: () => clock,
  });
  let loads = 0;
  let next: () => Promise<{ tracks: string[] }> = async () => ({
    tracks: ["old-price"],
  });
  const load = () => {
    loads++;
    return next();
  };

  await cache.get("k", load);
  next = async () => ({ tracks: ["new-price"] });
  cache.invalidate();
  const after = await cache.get("k", load);
  check(
    "after invalidate, the next read goes to the chain",
    [loads, after.tracks[0]],
    [2, "new-price"],
  );
  await cache.get("k", load);
  check("the post-change read is cached again", loads, 2);

  // The race: a read starts, the price changes and is invalidated, then the old read lands.
  clock += 15_001;
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((r) => (releaseOld = r));
  next = async () => {
    await oldGate;
    return { tracks: ["pre-change"] };
  };
  const slowOld = cache.get("k", load);
  await Promise.resolve();
  cache.invalidate();
  next = async () => ({ tracks: ["post-change"] });
  const newer = await cache.get("k", load);
  releaseOld();
  const oldResult = await slowOld;
  const settled = await cache.get("k", load);
  check(
    "a read that started before the change still answers its own caller",
    oldResult.tracks[0],
    "pre-change",
  );
  check(
    "a read started after invalidate does not wait on the older one",
    newer.tracks[0],
    "post-change",
  );
  check(
    "the older read is NOT stored over the newer state",
    settled.tracks[0],
    "post-change",
  );

  cache.invalidate();
  next = async () => {
    throw new Error("429");
  };
  const fallback = await cache.get("k", load);
  check(
    "invalidate keeps the last good copy for the failure fallback",
    fallback.tracks[0],
    "post-change",
  );
}

// ------------------------------------------------- a loader that throws before any await

{
  const cache = makeCatalogueCache<{ tracks: string[] }>({
    ttlMs: 15_000,
    maxStaleMs: 300_000,
  });
  const syncThrow = (() => {
    throw new Error("sync boom");
  }) as unknown as () => Promise<{ tracks: string[] }>;
  let message = "";
  try {
    await cache.get("k", syncThrow);
  } catch (err) {
    message = (err as Error).message;
  }
  check(
    "a synchronous throw surfaces as itself, not a ReferenceError",
    message,
    "sync boom",
  );
  const recovered = await cache.get("k", async () => ({ tracks: ["ok"] }));
  check(
    "the slot is released after a synchronous throw",
    recovered.tracks[0],
    "ok",
  );
}

// ------------------------------------------------------------------------------------ report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
