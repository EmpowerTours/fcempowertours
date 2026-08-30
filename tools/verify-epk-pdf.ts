/**
 * Verifies that the EPK PDF generator terminates and stays on one page.
 *
 * Run: `node --experimental-strip-types tools/verify-epk-pdf.ts`
 *
 * ## What this is defending
 *
 * `/api/epk/pdf/[identifier]` hung in production for five days. Not slowly — never. Railway
 * answered 502 after its own timeout, and there was no error to find in a log.
 *
 * The cause was an attempt to force single-page output by deleting the overflow pages:
 * `doc._pageBuffer.splice(1)`. `flushPages()` calls `page.end()` on every page still in that
 * buffer, so removing them first leaves their refs outstanding, `_finalize` never fires, the
 * `end` event never arrives, and the Promise never settles.
 *
 * Two properties made it survive review and five days of production:
 *
 * 1. **It only triggers on overflow.** With a short EPK `_pageBuffer.length` is 1, the splice is
 *    a no-op, and the PDF is correct. Every quick test passes.
 * 2. **It was untestable.** The generator lived inside the route handler, so nothing could call
 *    it without Redis, an IPFS fetch and a live registry.
 *
 * So the first check below is simply "does it finish", against the real EPK that hung — and the
 * whole reason it can be asked is that the function now lives in `lib/`.
 *
 * ## The timeout is the assertion
 *
 * A hang cannot be caught by comparing values, because nothing is ever returned to compare. The
 * check races the generator against a timer; the failure mode it exists for is the timer winning.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { generateEPKPDF, type NFTTrack } from "../lib/epk/pdf.ts";
import type { EPKMetadata } from "../lib/epk/types.ts";

const here = dirname(fileURLToPath(import.meta.url));

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/** Resolves to the PDF, or to `null` if the generator never finished. */
async function render(epk: EPKMetadata, nfts: NFTTrack[] = []) {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), 20_000);
  });
  try {
    return await Promise.race([generateEPKPDF(epk, nfts), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

/** PDFs declare their page count in the catalog; `/Type /Page` appears once per page. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
}

// ------------------------------------------------- the real EPK, the one that actually hung

const live = JSON.parse(
  readFileSync(join(here, "fixtures", "live-epk.json"), "utf8"),
) as EPKMetadata;

{
  const pdf = await render(live);
  check("the EPK that hung in production now finishes", pdf !== null, true);
  if (pdf) {
    check("...producing a real PDF", pdf.subarray(0, 5).toString(), "%PDF-");
    check("...of exactly one page", pageCount(pdf), 1);
    check("...that is not empty", pdf.length > 2000, true);
  }
}

// --------------------------------------------------------- content that WANTS to overflow
//
// The clamps are the thing keeping this to one page, so they are tested with input built to beat
// them: a rider far longer than the real one, and a bio far longer than the real one. This is the
// case the old code met in production.

{
  const huge: EPKMetadata = JSON.parse(JSON.stringify(live));
  huge.artist.bio = "Lorem ipsum dolor sit amet. ".repeat(400);
  huge.technicalRider = Object.fromEntries(
    Array.from({ length: 12 }, (_, i) => [
      `section${i}`,
      {
        title: `Section ${i} with a deliberately long heading that wraps`,
        // Only 3 sections x 3 items are ever drawn, so length is what has to do the work here —
        // more items would be sliced away and prove nothing.
        items: Array.from(
          { length: 12 },
          (_, j) => `Item ${j}: ${"a very long requirement line ".repeat(12)}`,
        ),
      },
    ]),
  ) as EPKMetadata["technicalRider"];

  const pdf = await render(huge);
  check("an EPK built to overflow still finishes", pdf !== null, true);
  if (pdf) {
    check("...and is still clamped to one page", pageCount(pdf), 1);
  }
}

// ------------------------------------------------------------------------- degenerate input

{
  const bare = {
    version: "1.0.0",
    artist: { name: "A", slug: "a", bio: "", genre: [], location: "" },
    musicCatalog: { showCatalog: false },
    media: { videos: [], photos: [] },
    press: [],
    booking: { inquiryEnabled: false },
    socials: {},
    onChain: {},
  } as unknown as EPKMetadata;

  const pdf = await render(bare);
  check("an almost-empty EPK finishes rather than hanging", pdf !== null, true);
  if (pdf) check("...still one page", pageCount(pdf), 1);
}

// ------------------------------------------------------------- the splice must not come back
//
// A source check, because the failure it guards is a hang: if this regressed, every check above
// would time out rather than report, and a 20s timeout per case is a slow way to learn it.

{
  const source = readFileSync(join(here, "..", "lib", "epk", "pdf.ts"), "utf8");
  const active = source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");
  // No `.splice(` at all, rather than `.splice(` near `_pageBuffer`. The narrow version was
  // blind: a mutation that assigned the buffer to a local first put more than 40 characters
  // between the two and sailed through. This file has no legitimate use for splice, so the
  // blunt rule is both stronger and simpler to keep true.
  check(
    "nothing splices a pdfkit array — deleting unended pages is what never terminates",
    /\.splice\(/.test(active),
    false,
  );
  check(
    "...and _pageBuffer is not written to at all",
    /_pageBuffer\s*(=|\.(push|pop|shift|unshift|length\s*=))/.test(active),
    false,
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
