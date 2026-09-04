/**
 * A Farcaster-only number must not be rendered for a wallet-only profile.
 *
 * Most people using this app have no Farcaster account — registering a name on
 * ProfileRegistry is how they become findable at all. Those profiles come back
 * with `fid: null` and `followerCount: 0`, and the search card rendered
 * "0 followers" for them. That is not a low number, it is an inapplicable one,
 * and it reads to a visitor as "nobody follows this artist".
 *
 * Same failure as reporting an artist's earnings from a hardcoded percentage:
 * a figure that is structurally meaningless, displayed as fact.
 *
 * So any render of a Farcaster follower/following count must be guarded by a
 * check that the profile has an fid.
 *
 * Run: npx tsx tools/verify-farcaster-metrics-need-fid.ts
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;
let renders = 0;

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

const METRICS = ["followerCount", "followingCount"];

for (const file of walkRoots(root)) {
  const src = readFileSync(file, "utf8");
  const code = src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

  for (const metric of METRICS) {
    // Rendered into markup, i.e. inside JSX braces followed by display text —
    // not merely assigned or passed through.
    const rendered = new RegExp(
      `\\{[^{}]*\\b${metric}\\b[^{}]*\\}\\s*(followers|following)`,
      "i",
    );
    if (!rendered.test(code)) continue;

    renders++;
    checks++;
    // The guard must appear in the same file, testing an fid.
    const guarded =
      /\bfid\s*(!=|!==|>|\?\?|&&)|\bfid\s*!=\s*null|\.fid\s*&&/.test(code);
    if (!guarded) {
      failures.push(
        `${relative(root, file)} renders ${metric} with no fid guard — a ` +
          'wallet-only profile has fid null and shows "0 followers", which ' +
          "says something untrue about an artist who simply is not on Farcaster",
      );
    }
  }
}

checks++;
if (renders === 0) {
  failures.push(
    "found no follower/following renders at all — the detection above has gone " +
      "stale, so this check is passing without testing anything",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ all ${renders} follower/following render(s) are fid-guarded — ${checks} checks passed`,
);
