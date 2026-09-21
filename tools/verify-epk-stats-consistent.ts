/**
 * Verifies that the press kit's headline play total can never be smaller than the per-song
 * plays printed beside it.
 *
 * Run: `npx tsx tools/verify-epk-stats-consistent.ts`
 *
 * ## What this is defending
 *
 * `EPKPage.tsx` draws the song list at line 162 and the stat cards at line 173 — eleven lines
 * apart, on one page, for a booker to read. They were fed from different sources, and on
 * 2026-09-21 production served this:
 *
 *     Total Plays  0                                   <- artistLifetimePlays(artist), from V6
 *     Killah 20 · Sloppy 16 · Dime Que Si 15 · MARINA 13 · Suddenly 10 · Money Making Machine 9
 *                                                      <- the play ledger, 83 between them
 *
 * with "Verified on Monad" stamped under the zero. The same pair went into the EPK generation
 * prompt under the header "use these facts, do not invent", which leaves a model to either
 * repeat the zero or reconcile it by making something up.
 *
 * The cause is not arithmetic: `artistLifetimePlays` is keyed by ADDRESS, these masters were
 * re-minted under the artist's own wallet after the originals were minted from the deployer key,
 * and the counter stayed with the old address. It will happen again to the next artist who
 * changes wallets, and there is no `setArtist` on the registry.
 *
 * ## Why the invariant is a comparison and not a number
 *
 * A fixture asserting `totalPlays === 83` passes forever while either source changes underneath
 * it (feedback_gates_must_measure_invariants). The property that actually matters is relational
 * and holds for every artist, every month, both sources: **a total drawn on a page must be at
 * least the sum of the parts drawn on the same page**. Anything else is a document that
 * disproves itself.
 *
 * The second property is the honesty marker: when the figure is a lower bound rather than a
 * count, `totalPlaysIsFloor` must say so, because a floor rendered as a total is worse than no
 * number — it looks precise. That is the same defect `verify-play-ledger.ts` defends.
 *
 * ## Why a stub client rather than a source scan
 *
 * The bug lives in a returned value, not in a line of source, so this exercises the real
 * `readArtistStreamingStats` and reads what comes out. The stub answers only the two contract
 * reads the function makes; an unexpected read throws rather than returning a convenient
 * default, so this check goes red if the function starts depending on something new instead of
 * quietly testing a path that no longer exists.
 */

import type { PublicClient } from "viem";
import { readArtistStreamingStats } from "../lib/epk/chain.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

const ARTIST = "0x33fFCcb1802e13a7eead232BCd4706a2269582b0";

/** A client that answers the two reads the function makes, and refuses anything else. */
function stubClient(lifetimePlays: bigint): PublicClient {
  return {
    readContract: async ({ functionName }: { functionName: string }) => {
      if (functionName === "artistLifetimePlays") return lifetimePlays;
      // monthId, totalRevenue, totalPlays, finalized
      if (functionName === "getCurrentMonthStats") return [690n, 0n, 0n, false];
      throw new Error(
        `verify-epk-stats-consistent: unexpected read ${functionName} — this stub is now blind`,
      );
    },
    // Every month's payout reverts to "no data"; revenue is not what this file is about.
    multicall: async () => [],
  } as unknown as PublicClient;
}

/** The six live masters, so the shape matches what production actually serves. */
function tracks(plays: number[]) {
  return plays.map((_, i) => ({
    tokenId: String(8 + i),
    name: `Track ${8 + i}`,
    artist: ARTIST,
    imageUrl: "",
    audioUrl: "",
  }));
}

function ledger(plays: number[], saturated: boolean) {
  const byToken = new Map<string, number>();
  plays.forEach((n, i) => byToken.set(String(8 + i), n));
  return { byToken, saturated };
}

/** The whole point: a total that its own page disproves. */
function totalCoversTheParts(stats: {
  totalPlays: number;
  topSongs: { plays: number }[];
}) {
  const sum = stats.topSongs.reduce((n, s) => n + s.plays, 0);
  return stats.totalPlays >= sum;
}

// ------------------------------------------------------- the shape that shipped, 2026-09-21

const PRODUCTION = [20, 16, 15, 13, 10, 9]; // 83 between them
{
  const stats = await readArtistStreamingStats(stubClient(0n), ARTIST, {
    tracks: tracks(PRODUCTION),
    subscription: "0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B",
    ledgerPlays: ledger(PRODUCTION, true),
  });

  check(
    "an address-keyed zero does not contradict the songs printed beside it",
    totalCoversTheParts(stats),
    true,
  );
  check(
    "...and the total is the ledger sum, not the chain zero",
    stats.totalPlays,
    83,
  );
  check(
    "...and is marked a floor, because the window supplied it",
    stats.totalPlaysIsFloor,
    true,
  );
}

// ------------------------------------------------------------- the chain figure is the larger

{
  const stats = await readArtistStreamingStats(stubClient(120n), ARTIST, {
    tracks: tracks(PRODUCTION),
    subscription: "0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B",
    ledgerPlays: ledger(PRODUCTION, false),
  });

  check(
    "the chain figure wins when it is the better lower bound",
    stats.totalPlays,
    120,
  );
  check(
    "...and an unsaturated window leaves it reported as a count",
    stats.totalPlaysIsFloor,
    false,
  );
  check("...still covering the parts", totalCoversTheParts(stats), true);
}

// ---------------------------------------------- a saturated window the chain figure outgrows

{
  const stats = await readArtistStreamingStats(stubClient(120n), ARTIST, {
    tracks: tracks(PRODUCTION),
    subscription: "0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B",
    ledgerPlays: ledger(PRODUCTION, true),
  });

  check(
    "a full window keeps the figure a floor even when the chain figure is used",
    stats.totalPlaysIsFloor,
    true,
  );
}

// ------------------------------------------------------------------ no ledger, and no history

{
  const stats = await readArtistStreamingStats(stubClient(0n), ARTIST, {
    tracks: tracks(PRODUCTION),
    subscription: "0xc7EDB67B59B8B89cF4E9bA9bd7b940052563611B",
  });

  check(
    "a genuine zero stays zero — it is the measurement",
    stats.totalPlays,
    0,
  );
  check("...and is not dressed up as a floor", stats.totalPlaysIsFloor, false);
  check(
    "...and the missing split is reported",
    stats.unavailable.includes("per-song play split"),
    true,
  );
}

// ------------------------------------------------------- the check can fail, demonstrated here

{
  // Ran once against the pre-fix code, where this was the actual production shape and the
  // assertion above went red. Kept as a literal so the comparison itself stays honest: a
  // predicate that cannot return false is not a check.
  const disproved = {
    totalPlays: 0,
    topSongs: PRODUCTION.map((plays) => ({ plays })),
  };
  check(
    "the invariant rejects a total its own song list disproves",
    totalCoversTheParts(disproved),
    false,
  );
}

// ------------------------------------------------------------------------------------- report

console.log(`\n${checks} checks run`);
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failed\n`);
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}
console.log("✓ all passed\n");
