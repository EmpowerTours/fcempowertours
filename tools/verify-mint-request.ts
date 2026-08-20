/**
 * Pins `lib/mint-request.ts` against `contracts/v3/SalesController.sol`.
 *
 * Run: `node --experimental-strip-types tools/verify-mint-request.ts`
 *
 * EIP-712 hashes the *type string*. Rename a field, reorder two, or write `uint256` where the
 * contract says `uint96`, and the digest changes — so the recovered signer is some unrelated
 * address and the call reverts `BadSignature`, on-chain, after gas, with nothing explaining why.
 * The failure carries no diagnostic at all, which is exactly why it belongs in a local check.
 *
 * This reads the Solidity source rather than a copy of it, so drift in either direction fails.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import {
  MINT_REQUEST_TYPES,
  MINT_REQUEST_TYPE_STRING,
  MINT_DOMAIN_NAME,
  MINT_DOMAIN_VERSION,
  buildMintRequest,
  validateMintRequest,
  serializeMintRequest,
  deserializeMintRequest,
  mintRequestTuple,
  ZERO_ADDRESS,
} from "../lib/mint-request.ts";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const failures: string[] = [];
let checks = 0;

/**
 * BigInts appear both at the top level and nested inside the request tuple, and `JSON.stringify`
 * throws on either. A replacer handles both, so a mismatch is reported as a failure rather than
 * crashing the run — a crash is loud but says nothing about which check broke.
 */
function show(v: unknown): string {
  if (typeof v === "bigint") return `${v}n`;
  return (
    JSON.stringify(v, (_k, val) =>
      typeof val === "bigint" ? `${val}n` : val,
    ) ?? String(v)
  );
}

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = show(actual);
  const e = show(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const sol = readFileSync(
  join(root, "contracts/v3/SalesController.sol"),
  "utf8",
);

// ---------------------------------------------------------- the type string
// Pulled straight out of the contract: the string literal inside MINT_TYPEHASH.
const typeMatch = sol.match(/MINT_TYPEHASH\s*=\s*keccak256\(\s*"([^"]+)"/);
check(
  "MINT_TYPEHASH literal found in SalesController.sol",
  typeMatch !== null,
  true,
);

if (typeMatch) {
  const fromContract = typeMatch[1];
  check(
    "type string matches the contract exactly",
    MINT_REQUEST_TYPE_STRING,
    fromContract,
  );

  // And that the structured form the wallet signs rebuilds that same string.
  const rebuilt =
    "MintRequest(" +
    MINT_REQUEST_TYPES.MintRequest.map((f) => `${f.type} ${f.name}`).join(",") +
    ")";
  check(
    "MINT_REQUEST_TYPES rebuilds the contract's type string",
    rebuilt,
    fromContract,
  );
}

// ------------------------------------------------------------- the domain
const domainMatch = sol.match(/EIP712\(\s*"([^"]+)"\s*,\s*"([^"]+)"\s*\)/);
check("EIP712 domain found in SalesController.sol", domainMatch !== null, true);
if (domainMatch) {
  check("domain name matches", MINT_DOMAIN_NAME, domainMatch[1]);
  check("domain version matches", MINT_DOMAIN_VERSION, domainMatch[2]);
}

// ------------------------------------------------- struct field order vs Solidity
const structMatch = sol.match(/struct MintRequest \{([\s\S]*?)\}/);
check("struct MintRequest found", structMatch !== null, true);
if (structMatch) {
  const solFields = structMatch[1]
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, "").trim())
    .filter((l) => l.endsWith(";"))
    .map((l) => {
      const [type, name] = l.replace(";", "").split(/\s+/);
      return `${type} ${name}`;
    });
  const tsFields = MINT_REQUEST_TYPES.MintRequest.map(
    (f) => `${f.type} ${f.name}`,
  );
  check("struct field order and types match the TS type", tsFields, solFields);
}

// --------------------------------------------------------------- defaults
const NOW = 1_760_000_000_000; // fixed so the run is deterministic
const artist = "0x1111111111111111111111111111111111111111" as const;

const req = buildMintRequest({
  artist,
  uri: "ipfs://track",
  price: 100n,
  now: NOW,
});

check("artistFid defaults to 0 (no Farcaster account)", req.artistFid, 0n);
check("referrer defaults to the zero address", req.referrer, ZERO_ADDRESS);
check("nftType defaults to MUSIC", req.nftType, 0);
check("royalty defaults to 5%", req.royaltyBps, 500);
check(
  "deadline is 30 minutes out",
  req.deadline,
  BigInt(Math.floor(NOW / 1000) + 1800),
);
check(
  "no validation complaint for a good request",
  validateMintRequest(req, NOW),
  null,
);

// ------------------------------------------------------------- validation
const expired = buildMintRequest({
  artist,
  uri: "ipfs://x",
  price: 1n,
  now: NOW,
  ttlSeconds: -10,
});
check(
  "an expired request is refused",
  typeof validateMintRequest(expired, NOW) === "string",
  true,
);

const overRoyalty = buildMintRequest({
  artist,
  uri: "ipfs://x",
  price: 1n,
  royaltyBps: 5001,
  now: NOW,
});
check(
  "royalty over 50% is refused",
  typeof validateMintRequest(overRoyalty, NOW) === "string",
  true,
);
check(
  "royalty at exactly 50% is allowed",
  validateMintRequest(
    buildMintRequest({
      artist,
      uri: "ipfs://x",
      price: 1n,
      royaltyBps: 5000,
      now: NOW,
    }),
    NOW,
  ),
  null,
);
check(
  "an empty URI is refused",
  typeof validateMintRequest(
    buildMintRequest({ artist, uri: "  ", price: 1n, now: NOW }),
    NOW,
  ) === "string",
  true,
);

// ------------------------------------------------------------ round trip
const wire = JSON.parse(JSON.stringify(serializeMintRequest(req)));
const back = deserializeMintRequest(wire);
check("a serialised request survives JSON", "error" in back, false);
if (!("error" in back)) {
  check(
    "round trip preserves every field",
    mintRequestTuple(back),
    mintRequestTuple(req),
  );
}

// ------------------------------------------------- malformed input is rejected
// These matter because the server rebuilds the struct that gets signed over. A field silently
// defaulting to 0 would change what is minted while the signature still verifies.
for (const drop of [
  "artist",
  "price",
  "nonce",
  "deadline",
  "royaltyBps",
  "artistFid",
]) {
  const broken = { ...wire };
  delete broken[drop];
  const r = deserializeMintRequest(broken);
  check(`a request missing "${drop}" is rejected`, "error" in r, true);
}
check(
  "a non-numeric price is rejected",
  "error" in deserializeMintRequest({ ...wire, price: "abc" }),
  true,
);
check(
  "a negative price is rejected",
  "error" in deserializeMintRequest({ ...wire, price: "-5" }),
  true,
);
check(
  "a non-object body is rejected",
  "error" in (deserializeMintRequest("nope") as object),
  true,
);

console.log(`\n${checks} checks run`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
