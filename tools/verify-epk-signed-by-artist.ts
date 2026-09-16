/**
 * A press kit must be registered by the ARTIST'S wallet, never relayed through a Safe.
 *
 * Run: `npx tsx tools/verify-epk-signed-by-artist.ts`
 *
 * ## The bug this encodes
 *
 * `EPKRegistry` keys on `msg.sender`:
 *
 *     createEPK  writes    artistEPKs[msg.sender]
 *     updateEPK  requires  artistEPKs[msg.sender].createdAt != 0
 *
 * `/api/epk` used to send both through `sendUserSafeTransaction`, so `msg.sender` was the user's
 * Safe. `createEPK` therefore registered the SAFE as the artist, and `updateEPK` reverted
 * `EPKDoesNotExist` for any artist whose entry was on their own address.
 *
 * It happened. On 2026-02-02 at 07:12 UTC the platform Safe `0xf3b9D123…` registered itself as an
 * artist carrying unify34's fid. `EPKRegistryV2` was committed at 07:13 adding
 * `createEPKFor`/`updateEPKFor` specifically to fix it, and the correct entry landed at 08:06.
 * The Safe's entry is still there, still active, and will hold a stale document the moment the
 * real one is updated.
 *
 * ## Why a source check rather than a behavioural one
 *
 * The failure is not observable from outside: relaying through a Safe SUCCEEDS on `createEPK` —
 * it writes the wrong row and reports a transaction hash. Nothing 500s, nothing looks broken, and
 * the damage is a duplicate registration nobody reads until much later. So the check is on the
 * route's source: the registry write must not go through a Safe relay, and the calldata must be
 * handed back for the client to sign.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const routePath = join(here, "..", "app", "api", "epk", "route.ts");
const raw = readFileSync(routePath, "utf8");

/** Comments explain intent; only code is evidence. */
const code = raw.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

const failures: string[] = [];
let checks = 0;

/** No Safe relay may carry a registry write. */
checks++;
if (/sendUserSafeTransaction|sendSafeTransaction/.test(code)) {
  failures.push(
    "app/api/epk relays through a Safe again. The registry keys on msg.sender, so a Safe\n" +
      "     relay registers the SAFE as the artist (createEPK) or reverts EPKDoesNotExist\n" +
      "     (updateEPK). This is the 2026-02-02 duplicate, reintroduced.",
  );
}

/** The call must be returned for the client to sign. */
checks++;
if (!/\btx:\s*calldata\b|\btx:\s*\{/.test(code)) {
  failures.push(
    "app/api/epk no longer returns the transaction for the client to sign. If the route\n" +
      "     stopped handing back calldata, either it went back to sending it server-side or\n" +
      "     publishing silently stopped registering anything at all.",
  );
}

/** And the client must actually send it from the artist's address. */
const publishPath = join(here, "..", "lib", "epk-publish.ts");
let publish = "";
try {
  publish = readFileSync(publishPath, "utf8");
} catch {
  failures.push(
    "lib/epk-publish.ts is missing — nothing signs the registry call",
  );
}

if (publish) {
  const publishCode = publish
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  checks++;
  if (!/eth_sendTransaction/.test(publishCode)) {
    failures.push(
      "lib/epk-publish.ts does not send a transaction from the wallet",
    );
  }

  /**
   * Broadcast is not success. A receipt check must remain, or the UI can announce a published
   * press kit for a call that reverted — the exact failure lib/artist-claim.ts documents.
   */
  checks++;
  if (
    !/waitForTransactionReceipt/.test(publishCode) ||
    !/receipt\.status/.test(publishCode)
  ) {
    failures.push(
      "lib/epk-publish.ts no longer waits for the receipt and checks its status.\n" +
        "     eth_sendTransaction resolves on BROADCAST, so without this the UI reports a\n" +
        "     published press kit for a transaction that reverted.",
    );
  }

  /** The cache must not be written before the chain confirms. */
  checks++;
  const patchBeforeReceipt =
    publishCode.indexOf("PATCH") !== -1 &&
    publishCode.indexOf("PATCH") <
      publishCode.indexOf("waitForTransactionReceipt");
  if (patchBeforeReceipt) {
    failures.push(
      "lib/epk-publish.ts reports the CID to the server before the receipt is confirmed,\n" +
        "     so epk:cache can point at a document the registry never accepted.",
    );
  }
}

if (failures.length > 0) {
  console.error("✗ EPK publishing is not signed by the artist\n");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(
  `✓ EPK published by the artist's own wallet — ${checks} checks passed`,
);
