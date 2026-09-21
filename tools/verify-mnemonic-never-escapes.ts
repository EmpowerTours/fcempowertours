/**
 * The recovery phrase must never leave the page it is shown on.
 *
 * Run: `npx tsx tools/verify-mnemonic-never-escapes.ts`
 *
 * ## What is being protected
 *
 * `app/wallet/backup` derives a 24-word BIP-39 phrase in the browser and displays it. Anyone
 * holding that phrase controls the address — its masters, its licences, any unclaimed sale
 * proceeds — permanently and irrevocably. The phrase is not stored anywhere, by design: it is
 * re-derived from the passkey each time and discarded.
 *
 * Every plausible regression here is a one-line convenience:
 *
 *   localStorage.setItem("mnemonic", …)   so it survives a refresh
 *   console.log(wallet)                   while debugging, left in
 *   fetch("/api/…", { body: wallet })     "just to check it matches the server"
 *   navigator.clipboard.writeText(words)  a copy button, added later by someone helpful
 *
 * None of those would fail a typecheck, a lint or a browser test. The page would keep working
 * perfectly, and the phrase would be somewhere it can be read by something else. That is the
 * entire failure mode: it is invisible, and it is permanent once a phrase has leaked.
 *
 * ## The clipboard rule is deliberately asymmetric
 *
 * The ADDRESS may be copied — it is public, on chain already, and copying it is the ordinary
 * thing to do with an address. The PHRASE may not: on several platforms the clipboard is
 * readable by other applications and survives long after the paste. So this does not ban
 * `clipboard` from the file; it bans the phrase reaching it.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = join(root, "app", "wallet", "backup", "page.tsx");

const failures: string[] = [];
let checks = 0;

checks++;
if (!existsSync(pagePath)) {
  console.error("✗ app/wallet/backup/page.tsx is missing — nothing to check");
  process.exit(1);
}

const raw = readFileSync(pagePath, "utf8");
/** Comments describe intent; only code can leak. */
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Anything that persists beyond this render, or crosses the network. */
const ESCAPES: [RegExp, string][] = [
  [/localStorage/, "localStorage"],
  [/sessionStorage/, "sessionStorage"],
  [/indexedDB/i, "IndexedDB"],
  [/document\.cookie/, "document.cookie"],
  [/\bfetch\s*\(/, "fetch() — the phrase must never reach a server"],
  [/navigator\.sendBeacon/, "sendBeacon"],
  [/console\.(log|warn|error|info|debug)/, "console — a log line is forever"],
  [/window\.location\s*=|router\.(push|replace)\s*\(\s*`/, "a URL"],
];

for (const [re, what] of ESCAPES) {
  checks++;
  if (re.test(code)) {
    failures.push(
      `app/wallet/backup reaches ${what}. The recovery phrase is derived in this file;\n` +
        `     anything that persists it or sends it puts full, permanent control of the\n` +
        `     wallet somewhere it can be read by something else.`,
    );
  }
}

/**
 * The clipboard may carry the ADDRESS and nothing else.
 *
 * Checked by what is passed, not by whether clipboard appears: banning the API outright would
 * force the address button out too, and a rule that forbids the reasonable thing gets deleted.
 */
checks++;
for (const m of code.matchAll(
  /clipboard[^;]*?writeText\(\s*([A-Za-z0-9_.]+)/g,
)) {
  const arg = m[1];
  if (!/^address$/.test(arg)) {
    failures.push(
      `clipboard.writeText(${arg}) — only \`address\` may be copied. On several platforms\n` +
        `     the clipboard is readable by other applications and survives the paste, so the\n` +
        `     phrase must never reach it.`,
    );
  }
}

/** The reveal must re-run the ceremony, not read a session. */
checks++;
if (!/openWallet\s*\(/.test(code)) {
  failures.push(
    "the page no longer calls openWallet() — if the phrase is now read from a session or a\n" +
      "     store rather than re-derived from the passkey, a stolen cookie or an unattended\n" +
      "     tab is enough to reveal it",
  );
}

/** And it must clear what it derived. */
checks++;
if (!/setWords\(null\)/.test(code)) {
  failures.push(
    "the page never clears the derived phrase — it should die with the component and on hide",
  );
}

if (failures.length > 0) {
  console.error("✗ the recovery phrase can escape the page\n");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(
  `✓ ${relative(root, pagePath)} keeps the phrase in the page — ${checks} checks passed`,
);
