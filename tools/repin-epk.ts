/**
 * Re-pin Earvin Gallardo's press kit with the corrected bio and genre.
 *
 * Run (dry run, changes nothing):
 *   node --experimental-strip-types tools/repin-epk.ts
 * Run (pins to IPFS, still sends no transaction):
 *   railway run node --experimental-strip-types tools/repin-epk.ts --pin
 *
 * ## What is wrong with what is published
 *
 * `EPKRegistry.artistEPKs(0x33fFCcb1…)` has pointed at one CID since 2026-02-02 08:06 UTC —
 * `createdAt` and `updatedAt` are the same second, so it has never been updated. That document
 * says the artist works "at the intersection of AI-generated music and blockchain", credits
 * "experimental AI production", and leads the genre list with "AI Music".
 *
 * None of that is true. The music is real vocals over instrumentals bought from human producers.
 * AI is used for the videos and the cover art, and those credits are accurate and stay.
 *
 * `lib/epk/constants.ts` was corrected already. That changed nothing anyone can see, because the
 * press kit is an immutable IPFS document and the page renders whatever CID the registry holds.
 * Correcting the source and correcting the publication are two different jobs; this is the second.
 *
 * ## Why this patches the published document rather than rebuilding it
 *
 * The obvious move is to rebuild from `EARVIN_GALLARDO_EPK` and pin that. It is the wrong one:
 * the published document and the constants have already drifted (the constants carry an `onChain`
 * key the publication does not), so a rebuild would silently ship every other difference along
 * with the fix. There is no way to tell from the resulting CID which changes were intended.
 *
 * So: fetch what is actually published, replace exactly two fields, and assert that nothing else
 * moved. The diff this prints is the whole change, and the assertion is what makes that a
 * measurement rather than a claim.
 *
 * ## It does not send the transaction
 *
 * Pinning changes nothing on its own — the page reads the registry, not Pinata. The document only
 * goes live when someone calls `updateEPK(cid)`, and that is a mainnet transaction against a
 * public-facing artist record, so it is the operator's to send. The command is printed at the end.
 */

import { EARVIN_GALLARDO_EPK } from "../lib/epk/constants.ts";

const REGISTRY = "0x232D2fF45459e9890ABA3a95e5E0c73Fe85D621D";
const ARTIST = "0x33fFCcb1802e13a7eead232BCd4706a2269582b0";
const RPC = process.env.NEXT_PUBLIC_MONAD_RPC ?? "https://rpc.monad.xyz";
const GATEWAY =
  process.env.PINATA_GATEWAY ?? "harlequin-used-hare-224.mypinata.cloud";

/** `artistEPKs(address)` -> the CID the page actually renders. */
async function readPublishedCid(): Promise<{ cid: string; updatedAt: number }> {
  // artistEPKs(address) returns (string ipfsCid, uint256 artistFid, uint256 createdAt,
  //                              uint256 updatedAt, bool active)
  const { createPublicClient, http } = await import("viem");
  const client = createPublicClient({ transport: http(RPC) });
  const result = (await client.readContract({
    address: REGISTRY as `0x${string}`,
    abi: [
      {
        type: "function",
        name: "artistEPKs",
        stateMutability: "view",
        inputs: [{ type: "address" }],
        outputs: [
          { type: "string" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "uint256" },
          { type: "bool" },
        ],
      },
    ] as const,
    functionName: "artistEPKs",
    args: [ARTIST as `0x${string}`],
  })) as readonly [string, bigint, bigint, bigint, boolean];
  return { cid: result[0], updatedAt: Number(result[3]) };
}

async function fetchFromIpfs(cid: string): Promise<Record<string, unknown>> {
  const gateways = [
    `https://${GATEWAY}/ipfs/${cid}`,
    `https://gateway.pinata.cloud/ipfs/${cid}`,
    `https://ipfs.io/ipfs/${cid}`,
  ];
  for (const url of gateways) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
      if (res.ok) return (await res.json()) as Record<string, unknown>;
    } catch {
      continue;
    }
  }
  throw new Error(`could not fetch ${cid} from any gateway`);
}

/** Every path where two documents differ, so "nothing else moved" is checked rather than assumed. */
function diffPaths(
  a: unknown,
  b: unknown,
  path = "",
  out: string[] = [],
): string[] {
  if (JSON.stringify(a) === JSON.stringify(b)) return out;
  const bothObjects =
    a &&
    b &&
    typeof a === "object" &&
    typeof b === "object" &&
    !Array.isArray(a) &&
    !Array.isArray(b);
  if (bothObjects) {
    const keys = new Set([
      ...Object.keys(a as object),
      ...Object.keys(b as object),
    ]);
    for (const k of keys) {
      diffPaths(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        path ? `${path}.${k}` : k,
        out,
      );
    }
    return out;
  }
  out.push(path);
  return out;
}

/** Report every surviving mention of AI, so an accurate credit is kept deliberately. */
function aiMentions(doc: unknown, path = "", out: string[] = []): string[] {
  if (typeof doc === "string") {
    if (/\bAI\b/.test(doc)) out.push(`${path}: ${doc.slice(0, 90)}`);
  } else if (Array.isArray(doc)) {
    doc.forEach((v, i) => aiMentions(v, `${path}[${i}]`, out));
  } else if (doc && typeof doc === "object") {
    for (const [k, v] of Object.entries(doc)) {
      aiMentions(v, path ? `${path}.${k}` : k, out);
    }
  }
  return out;
}

async function pinToIpfs(doc: unknown): Promise<string> {
  const jwt = process.env.PINATA_JWT;
  if (!jwt) {
    throw new Error(
      "PINATA_JWT is not set. Run under `railway run` so the credential is injected " +
        "rather than pasted into a shell.",
    );
  }
  const res = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      pinataContent: doc,
      pinataMetadata: { name: `EPK-earvin-gallardo-${Date.now()}` },
    }),
  });
  const body = (await res.json()) as { IpfsHash?: string; error?: unknown };
  if (!res.ok || !body.IpfsHash) {
    throw new Error(`Pinata refused the pin: ${JSON.stringify(body)}`);
  }
  return body.IpfsHash;
}

async function main() {
  const doPin = process.argv.includes("--pin");

  const { cid, updatedAt } = await readPublishedCid();
  console.log(`published CID   ${cid}`);
  console.log(
    `last updated    ${new Date(updatedAt * 1000).toISOString()} (on chain)`,
  );

  const published = await fetchFromIpfs(cid);
  const artist = published.artist as Record<string, unknown>;

  const corrected = {
    ...published,
    artist: {
      ...artist,
      bio: EARVIN_GALLARDO_EPK.artist.bio,
      genre: EARVIN_GALLARDO_EPK.artist.genre,
    },
  };

  const changed = diffPaths(published, corrected);
  console.log(`\nfields changed  ${changed.length}`);
  for (const p of changed) console.log(`  ${p}`);

  const expected = ["artist.bio", "artist.genre"];
  const unexpected = changed.filter((p) => !expected.includes(p));
  if (unexpected.length > 0) {
    console.error(
      `\nFAIL: this was meant to change ${expected.join(" and ")} only, but also ` +
        `changed: ${unexpected.join(", ")}`,
    );
    process.exit(1);
  }
  if (changed.length === 0) {
    console.log(
      "\nNothing to do: what is published already matches the source.",
    );
    return;
  }

  console.log(`\n  genre  - ${JSON.stringify(artist.genre)}`);
  console.log(`         + ${JSON.stringify(corrected.artist.genre)}`);
  console.log(`\n  bio    - ${String(artist.bio)}`);
  console.log(`\n         + ${corrected.artist.bio}`);

  // The bio is the whole point; check the claim is actually gone rather than trusting the diff.
  const bio = corrected.artist.bio.toLowerCase();
  for (const phrase of ["ai-generated", "ai production", "ai music"]) {
    if (bio.includes(phrase)) {
      console.error(`\nFAIL: corrected bio still contains "${phrase}"`);
      process.exit(1);
    }
  }
  if ((corrected.artist.genre as string[]).some((g) => /\bAI\b/i.test(g))) {
    console.error("\nFAIL: corrected genre list still names AI");
    process.exit(1);
  }

  const remaining = aiMentions(corrected);
  console.log(`\nAI mentions kept on purpose (${remaining.length}):`);
  for (const m of remaining) console.log(`  ${m}`);

  if (!doPin) {
    console.log("\nDry run. Pass --pin to publish this to IPFS.");
    return;
  }

  const newCid = await pinToIpfs(corrected);
  console.log(`\npinned          ${newCid}`);
  console.log(`                https://${GATEWAY}/ipfs/${newCid}`);
  console.log(
    `\nNothing is live yet — the page reads the registry, not Pinata. To publish:\n\n` +
      `  cast send ${REGISTRY} "updateEPK(string)" ${newCid} \\\n` +
      `    --rpc-url ${RPC} --account <artist-wallet>\n\n` +
      `must be sent from ${ARTIST} (the artist's own wallet). updateEPKFor is onlyOwner,\n` +
      `and the owner is the 2-of-3 platform Safe, so that path needs two signatures.`,
  );
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
