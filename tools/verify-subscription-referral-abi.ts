/**
 * The TypeScript ABI for SubscriptionReferrals must match the Solidity.
 *
 * These two are one field-order mistake apart:
 *
 *   V6:        subscribeFor(address user,       uint256 userFid, uint8 tier)
 *   referrals: subscribeWithReferralFor(address subscriber, uint8 tier, uint256 userFid, address referrer)
 *
 * `tier` and `userFid` are swapped, and both are numbers, so encoding the wrong
 * order does not fail any type check — it buys the wrong tier, or reverts with
 * an error about a tier nobody chose. The subscription contract's own interface
 * declaration carries a comment saying the same thing about positional decodes.
 *
 * Compares each signature in lib/subscription-referrals.ts against the function
 * as declared in contracts/v3/SubscriptionReferrals.sol.
 *
 * Run: npx tsx tools/verify-subscription-referral-abi.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const failures: string[] = [];
let checks = 0;

const ts = readFileSync(join(root, "lib/subscription-referrals.ts"), "utf8");
const sol = readFileSync(
  join(root, "contracts/v3/SubscriptionReferrals.sol"),
  "utf8",
);

/** "function f(uint8 a, address b) ..." -> ["uint8", "address"] */
function paramTypes(params: string): string[] {
  return params
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => p.split(/\s+/)[0])
    .map((t) => (t === "IMusicSubscription.SubscriptionTier" ? "uint8" : t));
}

// Every signature the TS side declares.
const tsSigs = [...ts.matchAll(/"function\s+(\w+)\(([^)]*)\)/g)].map((m) => ({
  name: m[1],
  types: paramTypes(m[2]),
}));

checks++;
if (tsSigs.length === 0) {
  failures.push("no ABI signatures found in lib/subscription-referrals.ts");
}

// subscribeFor belongs to the subscription contract, not this one.
const OTHER_CONTRACT = new Set(["subscribeFor"]);

for (const sig of tsSigs) {
  if (OTHER_CONTRACT.has(sig.name)) continue;

  // Solidity declares params across multiple lines; take everything to the ")".
  const decl = new RegExp(`function\\s+${sig.name}\\s*\\(([^)]*)\\)`, "s").exec(
    sol,
  );

  // A `public` state variable has an implicit getter with no `function` keyword.
  // For a mapping the getter's arguments are its key types, so a plain variable
  // takes none and `mapping(address => X) public f` takes one address.
  const mappingDecl = new RegExp(
    `mapping\\s*\\(\\s*(\\w+)\\s*=>[^)]*\\)\\s+public\\s+${sig.name}\\b`,
  ).exec(sol);
  const scalarDecl = new RegExp(
    `^\\s*\\w+\\s+public\\s+${sig.name}\\b`,
    "m",
  ).exec(sol);

  checks++;
  if (!decl && !mappingDecl && !scalarDecl) {
    failures.push(
      `lib/subscription-referrals.ts declares "${sig.name}", which is neither a ` +
        "function nor a public state variable in contracts/v3/SubscriptionReferrals.sol",
    );
    continue;
  }

  const solTypes = decl
    ? paramTypes(decl[1])
    : mappingDecl
      ? [mappingDecl[1]]
      : [];
  checks++;
  if (solTypes.join(",") !== sig.types.join(",")) {
    failures.push(
      `${sig.name} argument types disagree — TypeScript has (${sig.types.join(", ")}), ` +
        `Solidity has (${solTypes.join(", ")}). Encoding against the wrong order ` +
        "does not fail a type check; it sends the wrong values.",
    );
  }
}

// The specific swap that motivates this file, asserted directly so the check
// still means something if the generic comparison above is ever loosened.
checks++;
const referralCall = tsSigs.find((s) => s.name === "subscribeWithReferralFor");
if (!referralCall) {
  failures.push(
    "subscribeWithReferralFor is no longer declared — the app is not routing " +
      "subscriptions through the referral contract",
  );
} else if (referralCall.types.join(",") !== "address,uint8,uint256,address") {
  failures.push(
    `subscribeWithReferralFor must be (address, uint8, uint256, address) — ` +
      `subscriber, tier, userFid, referrer — but is (${referralCall.types.join(", ")})`,
  );
}

if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ referral ABI matches the Solidity — ${checks} checks passed`);
