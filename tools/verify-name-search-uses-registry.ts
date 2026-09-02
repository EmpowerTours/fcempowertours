/**
 * Searching a name must consult ProfileRegistry, not Neynar alone.
 *
 * Registering an artist name onchain is how a wallet-only user becomes findable
 * at all — most people using this app have no Farcaster account. A route that
 * resolves a username through Neynar and stops there answers "User not found"
 * for exactly the users the registry exists to serve.
 *
 * This was already fixed once, in /api/farcaster/search-user — but the profile
 * search UI calls /api/user/public-profile, which had the same gap and was still
 * failing. Fixing one resolver is not fixing name search; this checks every
 * route that resolves one.
 *
 * Run: npx tsx tools/verify-name-search-uses-registry.ts
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
let resolvers = 0;

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/^route\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

const routes = walk(join(root, "app/api"));
checks++;
if (routes.length === 0) {
  failures.push("found no API routes to check — did app/api move?");
}

for (const file of routes) {
  const src = readFileSync(file, "utf8");
  // Comments explain the rule; only code is evidence that it is followed.
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  // A username resolver: it takes a name from the query and asks Neynar to
  // turn it into a user.
  const takesUsername = /searchParams\.get\(\s*['"`]username['"`]\s*\)/.test(
    code,
  );
  const asksNeynar =
    /api\.neynar\.com\/[^\s'"`]*user\/(by_username|search)/.test(code);
  if (!takesUsername || !asksNeynar) continue;

  resolvers++;
  checks++;
  if (!/ownerOfName/.test(code)) {
    failures.push(
      `${relative(root, file)} resolves a username through Neynar with no ` +
        "ProfileRegistry (ownerOfName) fallback — every wallet-only artist " +
        'who registered a name onchain returns "User not found" there',
    );
  }
}

checks++;
if (resolvers === 0) {
  failures.push(
    "found no username resolvers at all — the detection above has gone stale, " +
      "so this check is passing without testing anything",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${resolvers} username resolver(s) fall back to ProfileRegistry — ${checks} checks passed`,
);
