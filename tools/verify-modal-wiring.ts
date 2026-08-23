/**
 * Verifies that every modal the app can *open* is a modal the app actually *renders*.
 *
 * Run: `node --experimental-strip-types tools/verify-modal-wiring.ts`
 *
 * ## What this is defending
 *
 * On 2026-08-22, `3b833d4` removed the travel features by deleting one contiguous JSX region.
 * That region began with the travel payment portal and ran through six modals that had nothing
 * to do with travel — Profile, Live Radio, Event Oracle, EPK, Dashboard and User Profile, plus
 * the inline Deposit modal. Their imports stayed. Their `useState` flags stayed. Their buttons
 * stayed and still flipped the flags.
 *
 * Nothing detected it:
 *
 * - `tsc --noEmit` is clean, because an unused *import* is not a type error.
 * - `next build` succeeds for the same reason.
 * - The pre-commit hook prints `tsc` output and then exits 0 (see docs/SECURITY_ACTIONS.md #4).
 * - The page still *looked* alive: the crystal ball reads the same `show*` flags to blur itself,
 *   so clicking Profile dimmed the globe and opened nothing. It read as a stall, not a crash.
 *
 * So the invariant here is deliberately not "the page compiles" or "the modals worked once in a
 * browser". It is structural, and it is the exact thing the deletion broke:
 *
 *   1. A component imported from `app/components/**` must appear as `<Component` in the file.
 *   2. Any state flag the file can set to `true` must be read somewhere else in the file.
 *
 * Check 2 is what catches an inline modal with no component to import — the Deposit modal had
 * no import to miss.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;

const failures: string[] = [];
const warnings: string[] = [];
let checks = 0;

function fail(file: string, message: string) {
  failures.push(`${relative(ROOT, file)}\n     ${message}`);
}

/**
 * Reported, not fatal.
 *
 * A modal that renders but has no opener is dead weight, not a break — the user sees nothing
 * missing because there was never a button. Three of these predate the travel deletion
 * (Deposit, Event Oracle, and the page-level subscription modal, which LiveRadioModal renders
 * its own copy of). Failing on them would make this gate red for something nobody regressed.
 */
function warn(file: string, message: string) {
  warnings.push(`${relative(ROOT, file)}\n     ${message}`);
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith("."))
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * Strip comments only.
 *
 * Comments must go: a deletion leaves `{/* Live Radio Modal *\/}` behind, and counting that as a
 * reference to the component it no longer renders gives exactly the wrong answer.
 *
 * String literals are deliberately left alone. Stripping them looks safer and is not: an
 * apostrophe in ordinary JSX text — `Don't have a wallet` — opens a quote that closes at the
 * next apostrophe hundreds of lines later, silently erasing real `<Component>` renders in
 * between. That produced four false positives on `app/discover/page.tsx` the first time this
 * ran. A string containing a literal `<ComponentName` is the far rarer hazard.
 */
function stripNoise(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");
}

const files = walk(join(ROOT, "app"));

for (const file of files) {
  const raw = readFileSync(file, "utf8");
  const src = stripNoise(raw);

  // ---- check 1: every imported local component is rendered -------------------------------
  //
  // `import type` is skipped: a type-only import is never meant to appear as an element.
  for (const m of raw.matchAll(
    /import\s+(?!type\s)(?:{([^}]*)}|(\w+))\s+from\s+["'](@\/app\/components\/[^"']+)["']/g,
  )) {
    const named = (m[1] ?? "")
      .split(",")
      .map((s) =>
        s
          .trim()
          .split(/\s+as\s+/)
          .pop()!
          .trim(),
      )
      .filter(Boolean);
    const idents = [...named, m[2]].filter(Boolean) as string[];

    for (const ident of idents) {
      // Only components (PascalCase). Hooks and helpers share these paths and are called,
      // not rendered.
      if (!/^[A-Z]/.test(ident)) continue;
      checks++;
      const rendered = new RegExp(`<${ident}[\\s/>]`).test(src);
      if (!rendered) {
        fail(
          file,
          `imports ${ident} from app/components but never renders <${ident}>. ` +
            `Its buttons and state flags will still work — the modal simply will not appear.`,
        );
      }
    }
  }

  // ---- check 2: every flag the file can open must gate something -------------------------
  //
  // An opener proves intent: some button sets this flag to make something appear. If nothing
  // in the file then reads the flag as a guard, whatever it was meant to reveal is gone — which
  // is exactly what happened to the Deposit modal, an inline block with no import to miss.
  //
  // The first version of this check subtracted setter occurrences from a raw count of flag
  // reads. That arithmetic is wrong — `setShowFoo` does not match /\bshowFoo\b/, so the
  // subtraction drove the total negative and the check never fired. Stated as a plain
  // invariant it needs no counting at all.
  for (const m of src.matchAll(
    /\[\s*(\w+)\s*,\s*(set\w+)\s*\]\s*=\s*useState/g,
  )) {
    const [, flag, setter] = m;

    // An opener is any call that is not literally `setFoo(false)`. Matching only `setFoo(true)`
    // misses the toggle form `setFoo(!foo)`, which is how the radio leaderboard and the
    // playlist queue open — both were false positives on the first run.
    const opens = [
      ...src.matchAll(new RegExp(`\\b${setter}\\(([^)]*)\\)`, "g")),
    ].some((c) => c[1].trim() !== "false");

    // `if (loading) return <Spinner/>` is an early return, not a JSX guard, and is just as
    // valid a way to render behind a flag. Missing it flagged app/nft/[tokenId]/page.tsx.
    const guarded =
      new RegExp(`\\b${flag}\\s*&&`).test(src) ||
      new RegExp(`\\b${flag}\\s*\\?`).test(src) ||
      new RegExp(`\\b${flag}={`).test(src) ||
      new RegExp(`={\\s*${flag}\\s*}`).test(src) ||
      new RegExp(`if\\s*\\(\\s*!?${flag}\\s*\\)`).test(src) ||
      new RegExp(`\\b${flag}\\s*\\|\\|`).test(src);

    // Only modal-shaped flags. A `show*` name is the convention this page uses throughout, and
    // widening it to every boolean turns the check into noise about unrelated state.
    if (!/^show[A-Z]/.test(flag)) continue;
    checks++;

    if (opens && !guarded) {
      fail(
        file,
        `${setter} opens ${flag}, but ${flag} never gates any JSX. ` +
          `The button will work and nothing will appear.`,
      );
    }

    if (!opens && guarded) {
      warn(
        file,
        `${flag} gates JSX but ${setter} is only ever called with false — nothing can open it.`,
      );
    }
  }
}

// ------------------------------------------------------------------------------------ report

if (warnings.length > 0) {
  console.warn(
    `\n! modal wiring: ${warnings.length} unreachable (reported, not fatal)\n`,
  );
  for (const w of warnings) console.warn(`  - ${w}\n`);
}

if (failures.length > 0) {
  console.error(
    `\n✗ modal wiring: ${failures.length} of ${checks} checks failed\n`,
  );
  for (const f of failures) console.error(`  - ${f}\n`);
  process.exit(1);
}

console.log(
  `✓ modal wiring: ${checks} checks passed across ${files.length} files`,
);
