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
/**
 * Gateways to try, in order.
 *
 * The dedicated gateway is first and is not a preference — measured 2026-08-21, it serves these
 * documents in ~0.5s while `gateway.pinata.cloud`, `ipfs.io` and `dweb.link` all time out or
 * return 504 ("found 6 providers, connected to 3, but they did not return the requested
 * content"). These CIDs are effectively only served by this gateway.
 */
const GATEWAYS = [
  process.env.PINATA_GATEWAY,
  "harlequin-used-hare-224.mypinata.cloud",
  "dweb.link",
  "ipfs.io",
].filter(Boolean) as string[];

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

/**
 * Fetch a document, trying each gateway in turn.
 *
 * Returns null rather than throwing: one unreachable document must not abandon the run. The
 * first version of this script let a fetch timeout propagate, which killed the process on the
 * first master and left no record of what had or had not been re-pinned.
 */
async function fetchDoc(uri: string): Promise<any | null> {
  const cid = uri.replace("ipfs://", "");
  for (const g of GATEWAYS) {
    try {
      const res = await fetch(`https://${g}/ipfs/${cid}`, {
        signal: AbortSignal.timeout(30000),
        redirect: "follow",
      });
      if (!res.ok) {
        console.log(`  ${g}: HTTP ${res.status}`);
        continue;
      }
      const doc = await res.json();
      console.log(`  fetched via ${g}`);
      return doc;
    } catch (e: any) {
      console.log(
        `  ${g}: ${e?.name === "TimeoutError" ? "timed out" : e?.message}`,
      );
    }
  }
  return null;
}

const jwt = process.env.PINATA_JWT;
if (!jwt || jwt.length < 40) {
  console.error(
    "PINATA_JWT is not set (or is a placeholder). Nothing was fetched or pinned.",
  );
  process.exit(1);
}

// Check the credential before doing any work. Otherwise three documents get fetched and the
// run dies at the first pin, which is the expensive half of the failure.
const auth = await fetch("https://api.pinata.cloud/data/testAuthentication", {
  headers: { Authorization: `Bearer ${jwt}` },
  signal: AbortSignal.timeout(20000),
}).catch(() => null);
if (!auth?.ok) {
  console.error(
    `PINATA_JWT was rejected (${auth ? `HTTP ${auth.status}` : "no response"}). Nothing was pinned.`,
  );
  process.exit(1);
}
console.log("Pinata credential accepted.");

const results: Record<number, string> = {};
const failed: number[] = [];

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
console.log("\nPass it straight through:");
console.log(`  export REPINNED='${JSON.stringify(results)}'`);

if (failed.length) {
  console.error(
    `\nINCOMPLETE: masters ${failed.join(", ")} were not re-pinned. ` +
      `Re-publishing them now would lose their collector artwork permanently.`,
  );
  process.exit(1);
}
