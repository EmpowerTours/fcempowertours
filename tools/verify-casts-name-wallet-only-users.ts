/**
 * A cast must not be silently skipped for someone without a Farcaster account.
 *
 * Most people using this app have no fid -- registering a name on
 * ProfileRegistry is how they become nameable at all. /api/cast-nft opened with
 * `if (!fid) return { message: 'No FID provided' }`, so every skip, voice note
 * and recorded play by a wallet-only user vanished: no error, a 200, and
 * nothing posted. The mint casts already handled this correctly by resolving a
 * name from the address; this route was simply never updated.
 *
 * `castArtistLabel` is the shared resolution -- Farcaster handle, else
 * registered artist name, else a short address -- and it needs an address, not
 * an fid.
 *
 * Run: npx tsx tools/verify-casts-name-wallet-only-users.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const ROUTE = "app/api/cast-nft/route.ts";
const src = readFileSync(join(root, ROUTE), "utf8");
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

// 1. No blanket "no fid, no cast".
checks++;
if (/if\s*\(\s*!\s*fid\s*\)\s*\{[^}]*return/.test(code)) {
  failures.push(
    `${ROUTE} still returns early when there is no fid, so nothing is posted ` +
      "for a wallet-only user — a silent 200 that looks like success",
  );
}

// 2. It must be able to name someone from an address.
checks++;
if (!/castArtistLabel/.test(code)) {
  failures.push(
    `${ROUTE} never calls castArtistLabel, so it cannot name a user who has ` +
      "no Farcaster handle",
  );
}

// 3. Every display name goes through the shared resolver, not fid alone.
const fidOnly = [
  ...code.matchAll(/let\s+(\w*[Dd]isplay\w*)\s*=\s*["'][^"']*["'];/g),
];
for (const m of fidOnly) {
  checks++;
  failures.push(
    `${ROUTE} builds "${m[1]}" with a mutable fid-only lookup. Use the shared ` +
      "displayFor() so a wallet-only user gets their registered name rather " +
      'than "Someone".',
  );
}

// 4. Callers must not re-impose the gate the route just dropped.
const exec = readFileSync(
  join(root, "app/api/execute-delegated/route.ts"),
  "utf8",
)
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");
checks++;
if (
  /if\s*\(\s*fid\s*\)\s*\{\s*fetch\(`\$\{APP_URL\}\/api\/cast-nft`/.test(exec)
) {
  failures.push(
    "app/api/execute-delegated/route.ts gates a cast-nft call on `if (fid)`, " +
      "which re-creates the exclusion at the call site",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ casts name wallet-only users — ${checks} checks passed`);
