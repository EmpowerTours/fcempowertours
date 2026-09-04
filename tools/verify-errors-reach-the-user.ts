/**
 * A catch block that composes a message for the user must show it.
 *
 * LiveRadioModal's recording handler built exactly the right message --
 * "Microphone access denied", "No microphone found" -- and then only
 * console.error'd it. Its own comment said "Show error in UI (alert doesn't
 * work in Farcaster)". So a denied microphone on a phone reset the state to
 * idle and showed nothing: the Quick Shoutout button looked dead, and the one
 * person who could have fixed it in two seconds was never told why.
 *
 * A console line is invisible on a phone. If code has gone to the trouble of
 * phrasing a failure for a human, a human has to see it.
 *
 * Run: npx tsx tools/verify-errors-reach-the-user.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
let blocks = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx$/.test(entry)) out.push(full);
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

/** Body of the block starting at the `{` index, brace-matched. */
function blockAt(code: string, open: number): string {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === "{") depth++;
    else if (code[i] === "}") {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  return code.slice(open);
}

// Something that puts a message in front of a person.
const SHOWN =
  /\b(showToast|setError|setErrorMessage|setStatus|setSuccess|toast\.|alert\(|setGenerationError|setSearchError|setRecordingError)/;

for (const file of walkRoots(root)) {
  const src = readFileSync(file, "utf8");
  // A server route cannot show a toast; this rule is about screens.
  if (!/^\s*["']use client["']/m.test(src)) continue;
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const m of code.matchAll(/\bcatch\s*\([^)]*\)\s*\{/g)) {
    const body = blockAt(code, (m.index ?? 0) + m[0].length - 1);

    // Deliberately narrow. A first version also flagged any catch containing a
    // longish string literal, which matched 77 blocks -- mostly server routes
    // with no UI to show anything in. A check that noisy is one you learn to
    // override unread, so this fires ONLY where code names a variable for the
    // express purpose of telling a person what went wrong.
    if (!/\b(errorMessage|userMessage|friendlyMessage)\s*=/.test(body))
      continue;
    if (!/console\.(error|warn|log)/.test(body)) continue;

    blocks++;
    checks++;
    if (!SHOWN.test(body)) {
      const line = code.slice(0, m.index ?? 0).split("\n").length;
      failures.push(
        `${relative(root, file)}:${line} composes a message for the user inside ` +
          "a catch block and only logs it. A console line is invisible on a " +
          "phone — the UI just appears to do nothing.",
      );
    }
  }
}

checks++;
if (blocks === 0) {
  failures.push(
    "found no message-composing catch blocks — the detection has gone stale " +
      "and this check is not testing anything",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${blocks} message-composing catch block(s) reach the user — ${checks} checks passed`,
);
