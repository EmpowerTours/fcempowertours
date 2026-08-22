/**
 * Re-pin the master metadata for the legacy masters that have collector artwork.
 *
 * Run: `node --experimental-strip-types tools/repin-master-metadata.ts`
 * Needs `PINATA_JWT` in the environment. Writes to IPFS; changes nothing on-chain.
 *
 * ## Why this is needed before the catalogue moves
 *
 * V2 stores a second `collectorTokenURI` per master in contract storage. v3 has no such field —
 * `purchase(masterId, isCollector, uri)` takes the licence uri from the buyer's call — so the
 * pointer lives in the master's own metadata document as `collector_token_uri`.
 *
 * The legacy masters' metadata was pinned before that field existed, and an IPFS CID is immutable:
 * the existing document cannot be amended. Re-publishing those masters into v3 with their current
 * uris would therefore lose the collector artwork permanently, with nothing failing to say so.
 *
 * So: fetch each document, add the pointer, pin the result, and use the new CID as the v3 uri.
 * Everything else in the document is copied byte-for-byte. This is additive — the old CIDs stay
 * pinned and keep resolving, and nothing on-chain is touched.
 */

const PINATA_JSON_URL =
  process.env.PINATA_JSON_URL ||
  "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const GATEWAY = process.env.PINATA_GATEWAY || "gateway.pinata.cloud";

/** Read from the live legacy contract on 2026-08-21. Only masters with collector art appear. */
const MASTERS = [
  {
    legacyId: 3,
    uri: "ipfs://QmbuMxUTC5UWbox2sG7gN9UzKAm87z6gRsAAkCCHE3wQmw",
    collectorUri: "ipfs://QmPWthxwb2FAnn74ERVRTcnSGFXGu2t57qPaR9G6QXfyuv",
  },
  {
    legacyId: 4,
    uri: "ipfs://QmNaLRTW3VBqELMUNopvbco3EpY8TLi9WcghV5Su5rHQ8Y",
    collectorUri: "ipfs://QmUg9s617TquzjCPVsh89QzpFNNuDR4FfZQA1Wzrrmm1ot",
  },
  {
    legacyId: 5,
    uri: "ipfs://QmV895YjnkLfQkHvmsppsRJgPvNshaoejSWrfQtUdXSWt2",
    collectorUri: "ipfs://QmezDwEYXqAz5odjhtytzrceEWDgc9MxuWQyBz5DD3ewFY",
  },
] as const;

function gateway(uri: string): string {
  return `https://${GATEWAY}/ipfs/${uri.replace("ipfs://", "")}`;
}

const jwt = process.env.PINATA_JWT;
if (!jwt) {
  console.error("PINATA_JWT is not set. Nothing was pinned.");
  process.exit(1);
}

const results: Record<number, string> = {};

for (const m of MASTERS) {
  console.log(`\n--- legacy master ${m.legacyId} ---`);
  const res = await fetch(gateway(m.uri), {
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    console.error(`  could not fetch ${m.uri} (HTTP ${res.status}) — skipped`);
    continue;
  }
  const doc = await res.json();

  if (doc.collector_token_uri === m.collectorUri) {
    console.log("  already carries the pointer; nothing to do");
    results[m.legacyId] = m.uri;
    continue;
  }

  // Copy everything, add the pointer. Never reshape a document we did not author.
  const updated = { ...doc, collector_token_uri: m.collectorUri };

  const pin = await fetch(PINATA_JSON_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: updated,
      pinataMetadata: { name: `master-${m.legacyId}-v3-metadata` },
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!pin.ok) {
    console.error(`  pin failed: HTTP ${pin.status} ${await pin.text()}`);
    continue;
  }
  const { IpfsHash } = await pin.json();
  results[m.legacyId] = `ipfs://${IpfsHash}`;
  console.log(`  old: ${m.uri}`);
  console.log(`  new: ipfs://${IpfsHash}`);
}

console.log("\n=== use these as the v3 uris ===");
console.log(JSON.stringify(results, null, 2));
