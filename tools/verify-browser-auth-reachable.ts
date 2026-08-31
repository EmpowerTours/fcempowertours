/**
 * Verifies that a browser user can actually satisfy the ownership gate on fund-moving actions.
 *
 * Run: `node --experimental-strip-types tools/verify-browser-auth-reachable.ts`
 *
 * ## What this is defending
 *
 * `tools/verify-value-actions-gated.ts` proves the SERVER refuses a fund-moving action without
 * proven ownership. This proves the CLIENT can produce that proof. The two failures look
 * nothing alike and only one of them is a security hole — the other is the app not working.
 *
 * On 2026-08-31 every browser passport mint died on:
 *
 *   "This action requires proof you own this address. Reopen the mini app to sign in with
 *    Farcaster, or connect your wallet and sign the prompt."
 *
 * The server was right. `mint_passport` is fund-moving, so it demands proven ownership and
 * ignores ENFORCE_QUICK_AUTH. The client sent `authHeaders()` — a Farcaster Quick Auth token,
 * which cannot exist in a browser — and nothing else. The wallet-signature fallback existed on
 * both sides (`lib/wallet-auth.ts`, `lib/wallet-auth-client.ts`) and simply was not wired up
 * here, so the flow was unreachable outside Warpcast while looking complete in review.
 *
 * ## The invariant
 *
 * Any client module that POSTs a fund-moving `action` to `/api/execute-delegated` must import a
 * helper capable of producing a wallet signature — `useActionAuth` (the usual one),
 * `walletAuthHeaders`, or `authHeadersWithWalletFallback`. `authHeaders` alone is a
 * Farcaster-only path.
 *
 * Read from source rather than asserted against a list of files, so a new page that mints in a
 * browser fails this the day it is written.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const failures: string[] = [];
let checks = 0;

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");

/** Comments describe intent; only code is evidence. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

// ---- The fund-moving list, read from the route itself -----------------------
const routeSrc = strip(
  readFileSync(join(root, "app/api/execute-delegated/route.ts"), "utf8"),
);
const at = routeSrc.indexOf("const fundMovingActions = new Set(");
const open = routeSrc.indexOf("[", at);
const close = routeSrc.indexOf("]", open);
const fundMoving = new Set(
  [...routeSrc.slice(open, close).matchAll(/"([^"]+)"/g)].map((m) => m[1]),
);

checks++;
if (fundMoving.size === 0) {
  failures.push("could not read fundMovingActions from execute-delegated");
}

// ---- Every client file that names one of those actions ----------------------
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith("."))
      continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const clientFiles = walk(join(root, "app"))
  .concat(walk(join(root, "lib")))
  // API routes are the server side of this; they are not the caller.
  .filter((f) => !f.includes(`${join("app", "api")}`));

for (const file of clientFiles) {
  const raw = readFileSync(file, "utf8");
  if (!raw.includes('"use client"') && !raw.includes("'use client'")) continue;

  const code = strip(raw);
  if (!code.includes("/api/execute-delegated")) continue;

  const actions = [...code.matchAll(/action:\s*['"]([a-z_-]+)['"]/g)]
    .map((m) => m[1])
    .filter((a) => fundMoving.has(a));
  if (actions.length === 0) continue;

  checks++;
  const canSign =
    code.includes("useActionAuth") ||
    code.includes("walletAuthHeaders") ||
    code.includes("authHeadersWithWalletFallback");

  if (!canSign) {
    failures.push(
      `${relative(root, file)} POSTs fund-moving action(s) ` +
        `[${[...new Set(actions)].join(", ")}] but imports no wallet-signature helper — ` +
        `a browser user cannot prove ownership and will get a 401`,
    );
  }
}

// ---- bot-command fans out; its browser callers need the same reachability ----
const botHook = strip(
  readFileSync(join(root, "app/hooks/useBotCommand.ts"), "utf8"),
);
checks++;
if (!botHook.includes("walletAuthHeaders")) {
  failures.push(
    "useBotCommand no longer produces wallet-signature headers; every browser " +
      "mint routed through /api/bot-command will 401",
  );
}

// A signature cannot be forwarded across the bot-command → execute-delegated hop (it is bound
// to the fronting route's context and its nonce is single-use, while one command can fan out to
// three calls). The attestation is what carries identity across it.
const botRoute = strip(
  readFileSync(join(root, "app/api/bot-command/route.ts"), "utf8"),
);
checks++;
if (!botRoute.includes("issueOwnershipAttestation")) {
  failures.push(
    "bot-command no longer issues an ownership attestation; wallet-authenticated " +
      "callers lose their identity on the internal hop to execute-delegated",
  );
}

const quickAuth = strip(readFileSync(join(root, "lib/quick-auth.ts"), "utf8"));
checks++;
if (!quickAuth.includes("verifyOwnershipAttestation")) {
  failures.push(
    "authorizeUserAddress no longer accepts an ownership attestation; the " +
      "bot-command → execute-delegated hop is broken for browser users",
  );
}

// ---- Safe registration must not ride inside the mint request ----------------
// execute-delegated registers the Safe inline (ensureUserSafeRegistered), so a
// first-time mint becomes registration + mint: two sequential user-operation
// receipts in one HTTP request. The browser gives up first and fetch rejects
// with a bare TypeError — "Load failed" on WebKit. Every passport surface must
// therefore register in its own request, BEFORE the mint.
for (const surface of [
  "app/passport/page.tsx",
  "app/components/oracle/PassportMintModal.tsx",
]) {
  const src = strip(readFileSync(join(root, surface), "utf8"));
  checks++;
  // Match the CALL, not the identifier: an unused import still contains the
  // name, so includes() alone passes on code that never registers anything.
  if (!/ensureSafeRegistered\s*\(/.test(src)) {
    failures.push(
      `${surface} does not call ensureSafeRegistered; its first mint will do ` +
        "registration and the mint in one request and time out",
    );
  }
  // Registration spends platform gas and is fail-closed on proven ownership, so
  // a Farcaster-only header expression 401s for every browser user — and when
  // that failure is swallowed, registration silently never happens.
  checks++;
  if (/register-user-safe[\s\S]{0,300}isFarcaster \?/.test(src)) {
    failures.push(
      `${surface} guards its register-user-safe auth behind isFarcaster; a ` +
        "browser user sends no proof of ownership and the route returns 401",
    );
  }
}

// The client decides whether to spend a signature on registration by reading
// this flag, so it has to keep being served.
const userSafeRoute = strip(
  readFileSync(join(root, "app/api/user-safe/route.ts"), "utf8"),
);
checks++;
// Word-boundary, not substring: isRegisteredAsMinterX contains the name.
if (!/\bisRegisteredAsMinter\b/.test(userSafeRoute)) {
  failures.push(
    "GET /api/user-safe no longer reports isRegisteredAsMinter; the client " +
      "cannot tell whether registration is needed and will prompt every mint",
  );
}

// ---- Report -----------------------------------------------------------------
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ browser auth reachable — ${checks} checks passed`);
