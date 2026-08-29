/**
 * Verifies the LiveRadioV3 queue reader.
 *
 * Run: `node --experimental-strip-types tools/verify-radio-queue.ts`
 *
 * ## What this is defending
 *
 * The Envio exit declared tips unrecoverable because `LiveRadioV3` emits `TipReceived`. It also
 * stores them, in a public array nothing ever removes from. `artist-earnings` reported
 * `unavailable: ['tips']` on the strength of the wrong half of that.
 *
 * So the checks below are about not repeating either mistake: read every page (a total that
 * silently drops entries is worse than no total), and never turn a truncation or a failure into a
 * confident zero.
 */

import {
  readRadioQueue,
  tipsForMasters,
  PAGE_SIZE,
  MAX_ENTRIES,
} from "../lib/radio-queue.ts";

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const j = (v: unknown) =>
    JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? `${x}n` : x));
  if (j(actual) !== j(expected))
    failures.push(
      `${name}\n     expected ${j(expected)}\n     actual   ${j(actual)}`,
    );
}

const ADDR = "0x042EDF80713e6822a891e4e8a0800c332B8200fd" as const;

/** A client whose `getQueue` mimics viem: named structs decode as objects. */
function stubClient(length: bigint, tipAt: (i: bigint) => bigint = () => 0n) {
  const calls: { offset: bigint; limit: bigint }[] = [];
  const client = {
    async readContract({ functionName, args }: any) {
      if (functionName === "getQueueLength") return length;
      const [offset, limit] = args as [bigint, bigint];
      // The real contract reverts rather than clamping past the end; a stub more permissive than
      // the chain is how two earlier checks in this repo ended up blind.
      if (offset + limit > length) throw new Error("getQueue: out of bounds");
      calls.push({ offset, limit });
      const rows = [];
      for (let i = offset; i < offset + limit; i++) {
        rows.push({
          id: i,
          masterTokenId: (i % 5n) + 1n,
          queuedBy: `0x${i.toString(16).padStart(40, "0")}`,
          queuedByFid: 765994n,
          queuedAt: 1787365280n + i,
          paidAmount: 10n,
          tipAmount: tipAt(i),
          played: false,
        });
      }
      return rows;
    },
  };
  return { client, calls };
}

// ------------------------------------------------------------------ the empty queue is a real 0

{
  const { client, calls } = stubClient(0n);
  const q = await readRadioQueue(client as any, ADDR);
  check("an empty queue reads as zero entries", q.entries.length, 0);
  check("...and is not truncated", q.truncated, false);
  check("...and issues no getQueue call at all", calls.length, 0);
}

// ------------------------------------------------------------------------------ paging is total

{
  const { client, calls } = stubClient(PAGE_SIZE * 2n + 7n);
  const q = await readRadioQueue(client as any, ADDR);
  check(
    "every entry is read, not just the first page",
    q.entries.length,
    Number(PAGE_SIZE * 2n + 7n),
  );
  check("...across three pages", calls.length, 3);
  check(
    "...with the last page shortened to the remainder, not overrun",
    calls[2]?.limit ?? null,
    7n,
  );
  check("...starting at zero", calls[0]?.offset ?? null, 0n);
  check("...and advancing by a full page", calls[1]?.offset ?? null, PAGE_SIZE);
}

// ---------------------------------------------------------------- truncation is declared, not hidden

{
  const { client } = stubClient(MAX_ENTRIES + 1n);
  const q = await readRadioQueue(client as any, ADDR);
  check(
    "a queue past the cap stops at the cap",
    q.entries.length,
    Number(MAX_ENTRIES),
  );
  check("...and says so", q.truncated, true);
  check(
    "...while still reporting the true length",
    q.length,
    Number(MAX_ENTRIES + 1n),
  );
}

// ------------------------------------------------------------------------------ tip extraction

{
  const { client } = stubClient(10n, (i) => (i % 2n === 0n ? 5n : 0n));
  const q = await readRadioQueue(client as any, ADDR);

  const all = tipsForMasters(q, new Set(["1", "2", "3", "4", "5"]));
  check("zero-tip queue entries are dropped", all.length, 5);
  check(
    "...leaving only tipping entries",
    all.every((e) => e.tipAmount > 0n),
    true,
  );

  const mine = tipsForMasters(q, new Set(["1"]));
  check(
    "another artist's tips are not counted as mine",
    mine.every((e) => e.masterTokenId === "1"),
    true,
  );
  check(
    "an artist with no masters gets nothing",
    tipsForMasters(q, new Set()).length,
    0,
  );
  check(
    "the tipper is the address that queued the song",
    all[0]?.queuedBy ?? null,
    "0x0000000000000000000000000000000000000000",
  );
  check(
    "amounts stay bigint, never a lossy number",
    typeof all[0]?.tipAmount,
    "bigint",
  );
}

// ------------------------------------------------------------------- failure is not a quiet zero

{
  const client = {
    async readContract() {
      throw new Error("RPC down");
    },
  };
  let threw = false;
  try {
    await readRadioQueue(client as any, ADDR);
  } catch {
    threw = true;
  }
  check(
    "a read failure throws rather than returning an empty queue",
    threw,
    true,
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
