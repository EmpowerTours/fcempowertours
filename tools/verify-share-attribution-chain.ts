/**
 * Verifies that share attribution survives every hop between the cast and the play.
 *
 * Run: `npx tsx tools/verify-share-attribution-chain.ts`
 *
 * ## Why a chain check and not a unit test
 *
 * Share credit is a five-link chain across four files, and every link fails the same way:
 * silently. The share is still recorded, the play still succeeds, nobody is credited, and
 * nothing anywhere logs an error. Two of the links were already broken when this was first
 * written:
 *
 *   1. cast-nft must mint the token BEFORE publishing — the cast's own hash cannot appear
 *      in the url the cast contains, because the embed is built before Neynar returns.
 *   2. the token must be stamped into the embed urls.
 *   3. the frame must carry `via` into the miniapp deep link — it hardcoded `${APP_URL}/discover`
 *      and dropped the token at exactly this hop.
 *   4. the client must capture it at the ROOT, because Next drops an unrecognised query
 *      param on client-side navigation and the player lives on a different route.
 *   5. record-play must forward it to creditShareOnPlay.
 *
 * A test of any single link would have passed while the chain was dead end to end.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const failures: string[] = [];
let checks = 0;

const here = dirname(fileURLToPath(import.meta.url));
const read = (...p: string[]) =>
  readFileSync(join(here, "..", ...p), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

const cast = read("app", "api", "cast-nft", "route.ts");
const frame = read("app", "api", "frames", "discover", "route.ts");
const root = read("app", "ClientProviders.tsx");
const player = read("app", "components", "oracle", "MusicPlaylist.tsx");
const play = read("app", "api", "record-play", "route.ts");

/** Link 1 — the token exists before the cast is published. */
checks++;
const recordAt = cast.indexOf("recordShare");
const publishAt = cast.indexOf("publishCast");
if (recordAt < 0) {
  failures.push("cast-nft never calls recordShare — no share is ever recorded");
} else if (publishAt >= 0 && recordAt > publishAt) {
  failures.push(
    "cast-nft records the share AFTER publishCast. The embed url is built before the\n" +
      "     cast exists, so a token minted afterwards can never be inside the link it\n" +
      "     travels in, and no play will ever carry it.",
  );
}

/** Link 2 — the token is stamped into the embed urls. */
checks++;
if (!/embeds\s*=\s*embeds\.map/.test(cast) || !cast.includes("via=")) {
  failures.push(
    "cast-nft does not stamp `via=` into the embed urls — the token is recorded but\n" +
      "     never leaves the server",
  );
}

/** Link 3 — the frame carries it into the deep link. */
checks++;
if (!frame.includes("via")) {
  failures.push(
    "the discover frame drops `via`: it builds the miniapp deep link and must copy the\n" +
      "     token across, or attribution dies at the frame boundary",
  );
}
checks++;
if (!/searchParams\.get\(\s*["']via["']\s*\)/.test(frame)) {
  failures.push(
    "the discover frame never reads `via` from its own request url",
  );
}

/** Link 4 — captured at the root, not at the player. */
checks++;
if (!root.includes("captureVia")) {
  failures.push(
    "ClientProviders does not call captureVia — the token is dropped by client-side\n" +
      "     navigation before the player ever runs",
  );
}
checks++;
if (/location\.search/.test(player)) {
  failures.push(
    "MusicPlaylist reads location.search directly. The player is reached by navigation\n" +
      "     from /discover and the param is gone by then; read the captured value instead.",
  );
}
checks++;
if (!player.includes("readVia")) {
  failures.push("MusicPlaylist does not send a `via` value with the play");
}

/** Link 5 — the server acts on it. */
checks++;
if (!play.includes("creditShareOnPlay")) {
  failures.push(
    "record-play never calls creditShareOnPlay — the token arrives and is ignored",
  );
}

/** The credit must not be reachable without the subscription gate that bounds its cost. */
checks++;
const subAt = play.indexOf("hasActiveSubscription");
const creditAt = play.indexOf("creditShareOnPlay");
if (subAt >= 0 && creditAt >= 0 && creditAt < subAt) {
  failures.push(
    "record-play credits a share BEFORE checking the subscription. That gate is what\n" +
      "     makes a manufactured credit cost a real subscription; ahead of it, credits are free.",
  );
}

if (failures.length > 0) {
  console.error(`✗ share attribution chain is broken\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(`✓ share attribution survives every hop — ${checks} checks passed`);
