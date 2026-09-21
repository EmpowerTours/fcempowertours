/**
 * Creating a delegation must accept EITHER proof of ownership, not only the Farcaster one.
 *
 * Run: `npx tsx tools/verify-delegation-accepts-either-proof.ts`
 *
 * ## The bug this encodes
 *
 * `useActionAuth` produces two different proofs depending on where the app is running: a Quick
 * Auth token inside Farcaster, a wallet signature in a browser. `authorizeUserAddress` accepts
 * both — it tries the token first and falls back to the signature — and `execute-delegated` has
 * always relied on that.
 *
 * `create-delegation` called it only when `authMethod === "farcaster"`. So a browser wallet's
 * signature was never examined, the request fell through to the body-signature branch, and the
 * user got:
 *
 *   "Missing required fields: userAddress, signature, timestamp, nonce. Use GET ?nonce=true
 *    first. Or use authMethod=farcaster with fid."
 *
 * They had proven ownership perfectly well. Nothing looked. Every wallet-only user hitting a
 * delegation-covered action saw that message with nothing to act on — first found wrapping MON
 * from a passkey wallet in a browser, where `ensureDelegationCovers` sends header auth for both
 * paths.
 *
 * ## And the fix had its own trap, which is why the second check exists
 *
 * Removing the gate made `authorizeUserAddress` run for everyone — including callers using the
 * GET ?nonce=true flow, who send no auth headers at all. Returning 403 on their absence would
 * have broken the path this route was originally built around: widening who MAY be checked must
 * not narrow who MAY pass. Only `authMethod === "farcaster"` has no second proof to offer, so
 * only it may be rejected there.
 *
 * Both halves are invisible at runtime until a real user with the wrong shape of proof arrives.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(
  join(root, "app", "api", "create-delegation", "route.ts"),
  "utf8",
);
/** Comments describe intent; only code decides. */
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, " ")
  .replace(/(^|[^:])\/\/.*$/gm, "$1");

const failures: string[] = [];
let checks = 0;

/** It must consult the shared authorizer at all. */
checks++;
if (!/authorizeUserAddress\s*\(/.test(code)) {
  failures.push(
    "create-delegation no longer calls authorizeUserAddress — the only thing that accepts a\n" +
      "     browser wallet signature. Wallet-only users cannot create a delegation without it.",
  );
}

/** And not behind an authMethod gate. */
checks++;
if (
  /if\s*\(\s*!ownershipProven\s*&&\s*authMethod\s*===\s*["']farcaster["']\s*\)/.test(
    code,
  )
) {
  failures.push(
    "the authorizeUserAddress call is gated on authMethod === 'farcaster' again. That proof\n" +
      "     path also verifies WALLET signatures, so gating it means a browser wallet's\n" +
      "     signature is never examined and the caller is told to send fields it already\n" +
      "     proved another way.",
  );
}

/**
 * A rejection there must stay scoped to the Farcaster path.
 *
 * Checked by finding the 403 that follows the authorizer and requiring its condition to name
 * authMethod — an unconditional `if (!authz.allowed) return 403` breaks every body-signature
 * caller, who sends no headers by design.
 */
checks++;
// The CALL, not the import. A first version used indexOf("authorizeUserAddress"), which found
// the import on line 12 and then read 900 characters of import block — 5,551 characters short
// of the condition it was meant to inspect. It reported success while measuring nothing, which
// is the exact failure this repo's checks keep catching elsewhere.
const call = /await\s+authorizeUserAddress\s*\(/.exec(code);
const at = call ? call.index : -1;
if (at !== -1) {
  const after = code.slice(at, at + 900);
  const rejects = /if\s*\(\s*!authz\.allowed\s*(&&[^)]*)?\)/.exec(after);
  if (rejects && !/authMethod/.test(rejects[0])) {
    failures.push(
      "a failed authorization now rejects unconditionally. Callers using the GET ?nonce=true\n" +
        "     flow send no auth headers at all, so this 403s the path the route was built\n" +
        "     around. Only authMethod 'farcaster' has no second proof to offer.",
    );
  }
}

/** The body-signature branch must still exist to fall through to. */
checks++;
const bodyBranch = /(\}\s*)?(else\s+)?if\s*\(\s*!ownershipProven\s*&&\s*\(\s*!signature\s*\|\|\s*!timestamp\s*\|\|\s*!nonce/.exec(
  code,
);
if (!bodyBranch) {
  failures.push(
    "the body-signature branch is gone — there is nothing left to fall through to, so a\n" +
      "     caller without headers has no way in at all",
  );
}

/**
 * And it must be REACHABLE, which is a different question from existing.
 *
 * This check exists because the fix for the bug above introduced a second one that the check
 * above sailed through. The body-signature branch was written as `else if` chained to the
 * authorizer block, back when that block's condition was `authMethod === "farcaster"` — two
 * genuinely different tests, so the chain was fine. Widening the authorizer to plain
 * `!ownershipProven` made both conditions the same test, and an `else` after it can never run:
 * every caller the authorizer failed to prove skipped the body-signature requirement entirely
 * instead of being asked for one.
 *
 * eslint's no-dupe-else-if caught it; the check above did not, because the branch was still
 * right there in the file, spelled correctly, doing nothing. "The code is present" is not the
 * same claim as "the code executes", and only the second one is worth checking.
 */
checks++;
if (bodyBranch && /else/.test(bodyBranch[0])) {
  failures.push(
    "the body-signature branch is an `else if` chained to the authorizer above. Both now\n" +
      "     test !ownershipProven, so the else can never execute — a caller with no headers\n" +
      "     and no body signature walks past the requirement instead of being asked for one.\n" +
      "     It must be a standalone `if` that runs after the authorizer block.",
  );
}

if (failures.length > 0) {
  console.error(
    "✗ create-delegation does not accept both proofs of ownership\n",
  );
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(
  `✓ create-delegation accepts a Quick Auth token or a wallet signature — ${checks} checks passed`,
);
