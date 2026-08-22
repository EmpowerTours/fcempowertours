/**
 * Exercises the v3 contract reads the Envio handlers depend on, against live Monad mainnet.
 *
 * Run: `node --experimental-strip-types tools/verify-envio-v3-reads.ts`
 *
 * ## Why this is worth a file
 *
 * v3's `MasterMinted` carries no tokenURI, so every indexed master's title, artwork and audio
 * come from a hand-rolled `eth_call` and a hand-rolled ABI string decode. Both fail *soft* by
 * design — an exception in a handler stalls the whole indexer — which means a broken decode
 * produces five silent rows with no audio rather than an error anyone would notice.
 *
 * So the decode is checked against known-good fixtures, against deliberately malformed input,
 * and against the five real masters on chain.
 */

import {
  decodeAbiString,
  decodeRoyaltyPercent,
  readRoyaltyPercent,
  readTokenUri,
  word,
} from "../empowertours-envio/src/v3Reads.ts";

const REGISTRY = "0x42EbcD44C2295702130f0A641633c691bA5f9480";

const failures: string[] = [];
let checks = 0;
function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

// --- pure decoding -------------------------------------------------------
check("word pads to 32 bytes", word(1n).length, 64);
check("word encodes 10000", word(10000n).slice(-4), "2710");

// A real `tokenURI` return: offset 0x20, length 0x35 (53), then the ascii.
const uri = "ipfs://QmeWFYapNrV4uehNx8NpF1rspGYe6doL8uc2xDgecMQM5m";
const encoded =
  "0x" +
  word(32n) +
  word(BigInt(uri.length)) +
  Buffer.from(uri, "utf8")
    .toString("hex")
    .padEnd(64 * Math.ceil(uri.length / 32), "0");
check("decodes a well-formed string return", decodeAbiString(encoded), uri);

// A non-standard offset. The ABI permits it and a single-string return never uses it in
// practice, which is exactly why the branch that *reads* the offset needs a case: without this,
// hardcoding `offset = 0x20` passes every other check.
const padded =
  "0x" +
  word(64n) + // offset points one word further than usual
  word(0n) + // filler occupying the skipped word
  word(BigInt(uri.length)) +
  Buffer.from(uri, "utf8")
    .toString("hex")
    .padEnd(64 * Math.ceil(uri.length / 32), "0");
check(
  "decodes a string at a non-standard offset",
  decodeAbiString(padded),
  uri,
);

// Every malformed shape must yield "" rather than throwing — a throw stalls the indexer.
for (const [label, input] of [
  ["null", null],
  ["empty", "0x"],
  ["too short", "0x1234"],
  ["zero length", "0x" + word(32n) + word(0n)],
  ["offset past the end", "0x" + word(9999n) + word(4n)],
  ["length longer than the data", "0x" + word(32n) + word(999n) + "abcd"],
] as const) {
  check(
    `malformed (${label}) decodes to empty, not a throw`,
    decodeAbiString(input),
    "",
  );
}

// royaltyInfo(tokenId, 10000) -> [receiver, amount]; amount is the bps.
check(
  "royalty of 5000 bps reads as 50%",
  decodeRoyaltyPercent("0x" + word(0n) + word(5000n)),
  50,
);
check("royalty decode survives junk", decodeRoyaltyPercent("0x00"), 0);

// --- against the live chain ----------------------------------------------
// These are the five masters republished on 2026-08-21. Their uris were verified against the
// legacy contract at migration time, so any drift here is a decode bug, not a data change.
const EXPECTED: Record<number, string> = {
  1: "ipfs://QmeWFYapNrV4uehNx8NpF1rspGYe6doL8uc2xDgecMQM5m",
  2: "ipfs://QmXeAsQ6ueQAfGE46Ds1ubRdxPdsnjRjXWTMVafQuuY6K5",
  3: "ipfs://QmThzeM7aHigauzbi2QFcfKfQ3fyDHBqabd4uBnmGF3v1w",
  4: "ipfs://QmTTqKG3Tcrb2YP9urNgEkboNHVPjHpv5sS3econbN7cbv",
  5: "ipfs://QmT6UAiCrztregZFpM2afSVh7Q7VG41Fp3nMWGKVjhqwjJ",
};

for (const [id, expected] of Object.entries(EXPECTED)) {
  const got = await readTokenUri(REGISTRY, BigInt(id));
  check(`master ${id}: tokenURI read off chain`, got, expected);
}

// V2 hardcoded 5000 bps for music and art alike, and the migration preserved it.
for (const id of [1, 3, 5]) {
  const pct = await readRoyaltyPercent(REGISTRY, BigInt(id));
  check(`master ${id}: royalty reads as 50%`, pct, 50);
}

// A token that does not exist must not throw or invent a value.
check(
  "an unminted id reads as empty rather than failing",
  await readTokenUri(REGISTRY, 9999n),
  "",
);

console.log(`\n${checks} checks run`);
if (failures.length) {
  console.error(`\n✗ ${failures.length} FAILED:\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
