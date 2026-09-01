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

// ---- every v3 mint branch must carry the artist's signature -----------------
// v3 will not mint on the platform's say-so: SalesController.mintMasterFor
// takes a MintRequest the ARTIST signed. There is no separate collector
// entrypoint — a collector edition is a master with maxCollectorEditions and
// collectorPrice set — so both branches need it. The collector branch shipped
// without, and the server refused with "mintRequest must be an object".
const mintModal = strip(
  readFileSync(join(root, "app/components/oracle/CreateNFTModal.tsx"), "utf8"),
);
checks++;
const signCalls = (mintModal.match(/signMintRequest\(\{/g) || []).length;
const mintCommands = (mintModal.match(/`mint_[a-z_]+ \$\{/g) || []).length;
if (mintCommands > 0 && signCalls < mintCommands) {
  failures.push(
    `CreateNFTModal issues ${mintCommands} mint command(s) but calls ` +
      `signMintRequest ${signCalls} time(s); a branch that does not sign sends ` +
      'no mintRequest and v3 refuses it as "mintRequest must be an object"',
  );
}
// The signed payload has to actually reach the command, not just be computed.
checks++;
const spreads = (mintModal.match(/\.\.\.[a-zA-Z]*[Ss]igned\b/g) || []).length;
if (mintCommands > 0 && spreads < mintCommands) {
  failures.push(
    `CreateNFTModal computes a signed mint request but only ${spreads} of ` +
      `${mintCommands} mint command(s) spread it into the params`,
  );
}

// ---- the mint gate must ask the SERVER, not a build-time flag ---------------
// isV3Contracts() reads NEXT_PUBLIC_CONTRACTS_V3, which Next inlines into the
// client bundle at BUILD time while the server reads it at RUNTIME. When the
// build environment lacks it those disagree — config-check reported v3 true
// while the browser skipped signing the MintRequest, and every collector mint
// was refused with "mintRequest must be an object". Both sides were correct
// about their own value and wrong about each other's.
const mintModalRaw = readFileSync(
  join(root, "app/components/oracle/CreateNFTModal.tsx"),
  "utf8",
);
checks++;
if (/isV3Contracts\(\)/.test(strip(mintModalRaw))) {
  failures.push(
    "CreateNFTModal decides whether to sign from the build-time " +
      "NEXT_PUBLIC_CONTRACTS_V3 rather than asking the server; the two can " +
      "disagree and the mint is then refused for a missing signature",
  );
}
checks++;
if (!/serverUsesV3\(\)/.test(strip(mintModalRaw))) {
  failures.push(
    "CreateNFTModal no longer asks the server which contracts are live before " +
      "deciding to sign the MintRequest",
  );
}

// ---- bot-command callers must ASK for the signature -------------------------
// The scan above only sees files that POST to /api/execute-delegated. A client
// that mints through /api/bot-command instead is invisible to it — which is
// exactly how CreateNFTModal shipped calling executeCommand with no
// requireWalletAuth, sending no auth at all outside Farcaster and being refused
// with "caller did not prove ownership (No Bearer token)".
//
// useBotCommand only signs when asked: without requireWalletAuth it sends {}.
for (const file of clientFiles) {
  const raw = readFileSync(file, "utf8");
  if (!raw.includes('"use client"') && !raw.includes("'use client'")) continue;
  const code = strip(raw);
  if (!code.includes("executeCommand(")) continue;

  // Only the ones issuing a fund-moving command.
  const commands = [...code.matchAll(/`(mint_[a-z_]+|buy_[a-z_]+)\s/g)].map(
    (m) => m[1],
  );
  if (!commands.some((c) => fundMoving.has(c))) continue;

  checks++;
  const calls = (code.match(/executeCommand\(/g) || []).length;
  const asks = (code.match(/requireWalletAuth:\s*true/g) || []).length;
  if (asks < calls) {
    failures.push(
      `${relative(root, file)} calls executeCommand ${calls} time(s) with a ` +
        `fund-moving command but only ${asks} pass requireWalletAuth — ` +
        "useBotCommand sends no auth outside Farcaster and the mint is denied",
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

// ---- Registration must not depend on the Platform Safe -----------------------
// The Platform Safe is a 2-of-3 multisig and the server holds one key, so
// Safe4337Module.validateUserOp can never satisfy checkSignatures. Its
// EntryPoint nonce is 0: it has never executed a user operation, and every
// registration sent through it failed at submission. Registration is a plain
// administrative write and goes directly from the bot signer, which is already
// owner() of these contracts and so strictly outranks platformOperator.
//
// The registrations are also independent of each other, so a stale or repointed
// contract must cost a warning rather than the passport registration that gates
// minting — hence simulate-then-send over the filtered list.
const userSafeLib = strip(readFileSync(join(root, "lib/user-safe.ts"), "utf8"));
checks++;
if (!/publicClient\.call\(\{[\s\S]{0,120}to: call\.to/.test(userSafeLib)) {
  failures.push(
    "lib/user-safe.ts no longer simulates each registration call before " +
      "sending; one reverting contract silently blocks passport minting for " +
      "every user",
  );
}
checks++;
if (!/for\s*\(const call of viable\)/.test(userSafeLib)) {
  failures.push(
    "lib/user-safe.ts no longer sends only the simulated-viable calls; a " +
      "reverting contract is back in the send path",
  );
}
// File-wide now, not scoped to one function. registerUserSafeAsBurner carried
// the same defect and has been moved off the Platform Safe too, so nothing in
// this file should reach for it: every Safe registration here is a plain
// administrative write from the bot signer, which is already owner() of these
// contracts and outranks the platformOperator role it uses.
checks++;
if (/sendSafeTransaction\(/.test(userSafeLib)) {
  failures.push(
    "lib/user-safe.ts routes a Safe registration through the Platform Safe " +
      "again; that Safe is 2-of-3, the server has one key, and no user " +
      "operation from it has ever validated",
  );
}

// ---- A rejected mint must say so where the user is looking -------------------
// The mint form is long and its button sits at the bottom, while the error
// banner sits near the top — off-screen from there. A validation failure
// therefore painted a message the user never saw and the button read as doing
// nothing at all. The error has to render at the point of action.
//
// There were two of these once. app/nft/page.tsx was a parallel implementation
// that captured no rights declaration, no ISRC and no instrumental licence; it
// is now a thin wrapper over this modal, checked separately below. The loop
// stays a loop so a second mint surface reappearing has to satisfy this too.
for (const surface of ["app/components/oracle/CreateNFTModal.tsx"]) {
  const src = readFileSync(join(root, surface), "utf8");
  const mintBtnAt = src.indexOf("onClick={uploadAndMint}");

  checks++;
  if (
    mintBtnAt < 0 ||
    !/\{\(error \|\| botError\) && \(/.test(
      src.slice(Math.max(0, mintBtnAt - 900), mintBtnAt),
    )
  ) {
    failures.push(
      `${surface} renders no error beside the mint button; a rejected mint ` +
        "reports itself off-screen and the button looks inert",
    );
  }

  // A static label is the same failure on the happy path: the mint starts and
  // nothing on screen changes, so it is indistinguishable from a dead click.
  checks++;
  const label = mintBtnAt > 0 ? src.slice(mintBtnAt, mintBtnAt + 900) : "";
  if (!/\buploading\b\s*\?/.test(label)) {
    failures.push(
      `${surface} has a mint button whose label never changes while uploading; ` +
        "a mint in progress looks identical to a click that did nothing",
    );
  }
}

// ---- /nft must stay a wrapper, never a second implementation -----------------
// It was one once: 1,454 lines duplicating the create flow, minus the rights
// declaration. Every bug in that flow then had to be found and fixed twice, and
// one of them was fixed in the copy nobody used. The route is kept because swipe
// navigation needs a real path, but it must delegate.
const nftRoute = readFileSync(join(root, "app/nft/page.tsx"), "utf8");
checks++;
if (!/CreateNFTModal/.test(nftRoute)) {
  failures.push(
    "app/nft/page.tsx no longer renders CreateNFTModal; the create flow has a " +
      "second implementation again",
  );
}
checks++;
if (/uploadAndMint|execute-delegated|mint_music/.test(nftRoute)) {
  failures.push(
    "app/nft/page.tsx has grown its own mint logic; it must delegate to " +
      "CreateNFTModal so the rights declaration cannot be bypassed",
  );
}

// ---- A rejected mint must land on the step that owns the problem ------------
// Validation runs at Review, but the field it complains about lives two or
// three steps back — a bad collector price is set on Set Details. Reporting it
// at Review left the user reading a rule they could not act on, with the only
// route back a button rendered far above the mint, which for music lands on
// Rights rather than pricing.
const createModal = strip(
  readFileSync(join(root, "app/components/oracle/CreateNFTModal.tsx"), "utf8"),
);
checks++;
if (!/const rejectAt = \(step: number/.test(createModal)) {
  failures.push(
    "CreateNFTModal has no rejectAt; a validation failure reports a field the " +
      "user is several steps away from and cannot navigate to",
  );
}
// Named messages rather than a setError/rejectAt count: a count breaks the day
// someone adds a legitimate setError(null), and a check that cries wolf gets
// ignored. These are the field-specific rejections, and each must route.
for (const msg of [
  "Collector price must be between",
  "Price must be between",
  "Max editions must be between",
]) {
  checks++;
  const at = createModal.indexOf(msg);
  if (at < 0) continue;
  const before = createModal.slice(Math.max(0, at - 160), at);
  if (!/rejectAt\(\s*\d+\s*,\s*$/.test(before.replace(/\s+$/, "") + "\n")) {
    if (!/rejectAt\(/.test(before)) {
      failures.push(
        `CreateNFTModal reports "${msg}..." without routing to its step; the ` +
          "user is left on Review unable to reach the field",
      );
    }
  }
}

// ---- A failed registration must not report success ---------------------------
// register-user-safe answered 200 carrying success:false, and
// registerUserSafeOnV2Contracts swallows every error into exactly that. A
// caller checking only res.ok therefore treated a failed registration as a
// successful one, minted anyway, and reverted with "Not authorized to mint" —
// the real failure reported nowhere. Both halves are pinned.
const regRoute = strip(
  readFileSync(join(root, "app/api/register-user-safe/route.ts"), "utf8"),
);
checks++;
if (!/if\s*\(!result\.success\)/.test(regRoute)) {
  failures.push(
    "register-user-safe no longer branches on result.success; it answers 200 " +
      "for a registration that failed and the caller mints into a revert",
  );
}
const ensureLib = strip(
  readFileSync(join(root, "lib/ensure-safe-registered.ts"), "utf8"),
);
checks++;
if (!/body\?\.success\s*!==\s*true/.test(ensureLib)) {
  failures.push(
    "ensure-safe-registered trusts the HTTP status alone; a 200 carrying " +
      "success:false passes for a registered Safe",
  );
}

// ---- Report -----------------------------------------------------------------
if (failures.length > 0) {
  console.error(`✗ ${failures.length} failure(s) across ${checks} checks:\n`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ browser auth reachable — ${checks} checks passed`);
