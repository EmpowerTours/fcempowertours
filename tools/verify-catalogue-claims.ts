/**
 * Verifies that no user-facing copy calls the music AI-generated.
 *
 * Run: `node --experimental-strip-types tools/verify-catalogue-claims.ts`
 *
 * ## What this is defending
 *
 * Every song in the catalogue is **real vocals over instrumentals purchased from human
 * producers**. AI is used for the music videos and the cover art, and nowhere else.
 *
 * The seed EPK said otherwise. Its bio called the artist a technologist "at the intersection of
 * AI-generated music and blockchain" with "experimental AI production", and `AI Music` was the
 * first listed genre. Worse, `["AI Music"]` was the fallback genre in `/api/epk/generate` for
 * ANY artist whose tracks carried no genre tag — so the label was not confined to the seed.
 *
 * This is not a style preference. An EPK is a press kit: it goes to promoters, press and DSPs. A
 * false "AI-generated" claim there is damaging to a working artist and is the kind of thing that
 * has to be retracted rather than edited.
 *
 * A written rule is not a control, so this is the check.
 *
 * ## What is deliberately allowed
 *
 * AI genuinely IS used for three things, and saying so is accurate:
 *
 * - passport stamp images (Nano Banana) — `lib/stamp-images.ts`, `generatePassportSVG.ts`
 * - cover art
 * - the "Money Making Machine (AI Music Video)" credit, and music videos generally
 * - "AI-generated draft" in the EPK modal, which describes Gemini-written TEXT, not music
 *
 * So the patterns below are written to catch claims about the MUSIC specifically, and the
 * allowances are listed rather than left to a loose regex. `AI Music Video` contains `AI Music`;
 * flagging it would push somebody to reword an accurate credit.
 */

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

const failures: string[] = [];
let checks = 0;

function check(name: string, actual: unknown, expected: unknown) {
  checks++;
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) failures.push(`${name}\n     expected ${e}\n     actual   ${a}`);
}

/** Claims that the MUSIC is AI. Each is written so an accurate AI credit does not match. */
const BANNED: { pattern: RegExp; why: string }[] = [
  {
    // Not followed by "Video" — "AI Music Video" is an accurate credit.
    pattern: /\bAI[\s-]Music\b(?!\s*Video)/i,
    why: '"AI Music" as a genre or descriptor',
  },
  {
    pattern: /\bAI[\s-]generated\s+(music|song|track|vocal|beat|instrumental)/i,
    why: '"AI-generated" applied to the music itself',
  },
  {
    pattern: /\bAI\s+production\b/i,
    why: '"AI production" — the instrumentals are bought from human producers',
  },
  {
    pattern: /\bAI[\s-](made|written|composed)\s+(music|song|track)/i,
    why: "AI credited with writing or composing",
  },
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

// Scans app/ AND components/. Components live in BOTH places in this repo, and
// a check that only walked app/ missed "Pending TOURS" in
// components/radio/ListenerRewardsClaim.tsx for a whole evening while I
// repeatedly reported the surface clean.
function walkRoots(root: string): string[] {
  const out: string[] = [];
  for (const dir of ["app", "components"]) {
    const full = join(root, dir);
    if (existsSync(full)) walk(full, out);
  }
  return out;
}

const files = [...walkRoots(root), ...walk(join(root, "lib"))].filter(
  // This file names every banned phrase in order to ban it.
  (f) => !f.endsWith("verify-catalogue-claims.ts"),
);

check("there are files to scan at all", files.length > 50, true);

const hits: string[] = [];
for (const file of files) {
  const source = readFileSync(file, "utf8");
  for (const { pattern, why } of BANNED) {
    const m = source.match(pattern);
    if (m)
      hits.push(
        `${relative(root, file)}: ${why} — found ${JSON.stringify(m[0])}`,
      );
  }
}

check(
  `no file claims the music is AI-generated${hits.length ? `\n     ${hits.join("\n     ")}` : ""}`,
  hits.length,
  0,
);

// --------------------------------------------------- the allowances really are still allowed
//
// A guard that also flags the accurate credits would get itself switched off. These assert the
// patterns are narrow enough to live with.

const ALLOWED = [
  "Money Making Machine (AI Music Video)",
  "AI-generated draft — review and edit before publishing",
  "AI-generated stamp image from Nano Banana",
  "AI-generated cover art",
  "AI cover art",
];
for (const phrase of ALLOWED) {
  check(
    `an accurate credit is not flagged: ${JSON.stringify(phrase)}`,
    BANNED.some(({ pattern }) => pattern.test(phrase)),
    false,
  );
}

// ----------------------------------------------------------- and the banned ones really bite

const SHOULD_CATCH = [
  "genre: ['AI Music', 'Electronic']",
  "at the intersection of AI-generated music and blockchain",
  "blends alternative hip-hop with experimental AI production",
  "an AI-generated track minted on Monad",
  "AI-written song",
];
for (const phrase of SHOULD_CATCH) {
  check(
    `a false claim IS flagged: ${JSON.stringify(phrase)}`,
    BANNED.some(({ pattern }) => pattern.test(phrase)),
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
