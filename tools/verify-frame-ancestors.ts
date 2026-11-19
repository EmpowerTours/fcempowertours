/**
 * Who may frame the app is decided by CSP frame-ancestors, and only by it.
 *
 * The app is a Farcaster mini app (Warpcast / farcaster.xyz frame it) and is
 * also embedded by www.empowertours.xyz. A global `X-Frame-Options: SAMEORIGIN`
 * used to sit next to the CSP; browsers that honor XFO then refused the
 * cross-origin empowertours.xyz embed even though frame-ancestors allowed it.
 *
 * This evaluates next.config.js headers() and asserts that every rule setting
 * frame-ancestors keeps the Farcaster hosts and the empowertours.xyz hosts,
 * and that no rule sets X-Frame-Options.
 *
 * Run: npx tsx tools/verify-frame-ancestors.ts
 */
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join } from "node:path";

type Header = { key: string; value: string };
type Rule = { source: string; headers: Header[] };

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const REQUIRED = [
  "https://warpcast.com",
  "https://www.warpcast.com",
  "https://farcaster.xyz",
  "https://www.farcaster.xyz",
  "https://www.empowertours.xyz",
  "https://empowertours.xyz",
];

const configPath = process.argv[2] ?? join(root, "next.config.js");
const mod = await import(pathToFileURL(configPath).href);
const rules: Rule[] = await mod.default.headers();

let ancestorRules = 0;
for (const rule of rules) {
  for (const h of rule.headers) {
    const key = h.key.toLowerCase();
    if (key === "x-frame-options") {
      checks++;
      failures.push(
        `${rule.source} sets X-Frame-Options: ${h.value}; browsers that honor it ` +
          "block the empowertours.xyz embed",
      );
    }
    if (key === "content-security-policy") {
      const m = /frame-ancestors([^;]*)/.exec(h.value);
      if (!m) continue;
      ancestorRules++;
      const sources = m[1].trim().split(/\s+/);
      for (const want of REQUIRED) {
        checks++;
        if (!sources.includes(want)) {
          failures.push(`${rule.source} frame-ancestors is missing ${want}`);
        }
      }
    }
  }
}

checks++;
const catchAll = rules.find((r) => r.source === "/:path*");
if (
  !catchAll?.headers.some(
    (h) =>
      h.key.toLowerCase() === "content-security-policy" &&
      h.value.includes("frame-ancestors"),
  )
) {
  failures.push(
    "the catch-all /:path* rule no longer sets CSP frame-ancestors",
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(
  `✓ frame-ancestors on ${ancestorRules} rule(s), no X-Frame-Options — ${checks} checks passed`,
);
