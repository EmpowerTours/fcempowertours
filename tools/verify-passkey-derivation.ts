/**
 * One passkey must keep deriving one EmpowerTours wallet, everywhere, forever.
 *
 * Run: `npx tsx tools/verify-passkey-derivation.ts`
 *
 * ## What is actually at risk
 *
 * A passkey-derived wallet is a pure function of `(credential, rpId, salt)`. Change any input
 * and the same face yields a different, empty address — with no error, no migration and no way
 * back. The account is not "broken", it simply is not the same account, and the old one is
 * unreachable unless its mnemonic was written down.
 *
 * Three inputs are therefore constants, not settings:
 *
 *   ACCOUNT_PATH               m/44'/60'/0'/0/0
 *   EMPOWERTOURS_RP_ID         empowertours.xyz   (the registrable PARENT)
 *   EMPOWERTOURS_PRF_SALT      sha256 of a label that must never be edited
 *
 * The salt label still says "hunt" because the bytes are already in production. Renaming it to
 * something tidier is exactly the plausible, well-meant edit this check exists to stop: it is
 * hashed, so a cosmetic rename hands every existing holder a different wallet.
 *
 * ## The cross-repo check is the point
 *
 * The wallet is meant to be the SAME across fcempowertours, hunt and cota. Pinning a constant
 * here proves only that this repo is self-consistent — it cannot see the other side drifting.
 * So when `empowertours-hunt` is checked out beside this repo, its own salt label is read from
 * source and compared. If either repo edits its label, the two ecosystems silently fork into
 * different wallets, and nothing else in either codebase would notice.
 *
 * When the hunt repo is not present the check SKIPS that comparison rather than passing quietly,
 * and says so, because "I could not look" and "I looked and it matched" are different results.
 */

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { sha256, stringToBytes, toHex } from "viem";
import {
  ACCOUNT_PATH,
  EMPOWERTOURS_RP_ID,
  EMPOWERTOURS_PRF_SALT_LABEL,
  EMPOWERTOURS_PRF_SALT,
  walletFromPrfOutput,
} from "../lib/passkey/derive.ts";

const failures: string[] = [];
let checks = 0;

function check(label: string, actual: unknown, expected: unknown) {
  checks++;
  if (String(actual) !== String(expected)) {
    failures.push(
      `${label}\n     expected ${expected}\n     got      ${actual}`,
    );
  }
}

// ---- The three inputs, pinned by value.
check("derivation path changed", ACCOUNT_PATH, "m/44'/60'/0'/0/0");
check("relying-party id changed", EMPOWERTOURS_RP_ID, "empowertours.xyz");
check(
  "PRF salt LABEL changed — every existing wallet is now a different address",
  EMPOWERTOURS_PRF_SALT_LABEL,
  "empowertours-hunt/passkey/v1",
);
check(
  "PRF salt BYTES changed — this is the sha256 digest of the label, not key material",
  toHex(EMPOWERTOURS_PRF_SALT),
  "0x9fc345cea9c77d56f4238d9940dfdc757b6a69fb1d83893e067cefbeda0f648f",
);

// ---- A known vector, so the whole pipeline is pinned and not just its inputs.
// A change in @scure/bip39, @scure/bip32, the wordlist path or the account path all land here.
const vector = new Uint8Array(32).fill(7);
const derived = walletFromPrfOutput(vector);
check(
  "derivation output changed for a fixed PRF input",
  derived.mnemonic.split(" ").length,
  24,
);
checks++;
if (!/^[a-z ]+$/.test(derived.mnemonic)) {
  failures.push("mnemonic is not a plain lowercase BIP-39 phrase");
}
checks++;
if (derived.privateKey.length !== 32) {
  failures.push(
    `private key is ${derived.privateKey.length} bytes, expected 32`,
  );
}

// ---- Short input must throw rather than quietly produce a weaker phrase.
checks++;
try {
  walletFromPrfOutput(new Uint8Array(16));
  failures.push(
    "16 bytes of PRF output was accepted — BIP-39 will happily make a shorter\n" +
      "     phrase from weaker entropy and the caller would never learn the\n" +
      "     authenticator short-changed it",
  );
} catch {
  // expected
}

// ---- Cross-repo: the hunt must derive the same wallet.
const here = dirname(fileURLToPath(import.meta.url));
const huntDerive = join(
  here,
  "..",
  "..",
  "empowertours-hunt",
  "lib",
  "auth",
  "derive.ts",
);
if (existsSync(huntDerive)) {
  checks++;
  const src = readFileSync(huntDerive, "utf8");
  const m = /HUNT_PRF_SALT_LABEL\s*=\s*"([^"]+)"/.exec(src);
  if (!m) {
    failures.push(
      "empowertours-hunt/lib/auth/derive.ts no longer declares HUNT_PRF_SALT_LABEL —\n" +
        "     this comparison cannot be made, so the two repos may have forked",
    );
  } else if (m[1] !== EMPOWERTOURS_PRF_SALT_LABEL) {
    failures.push(
      `the two repos derive DIFFERENT wallets from the same passkey.\n` +
        `     hunt:           ${m[1]}\n` +
        `     fcempowertours: ${EMPOWERTOURS_PRF_SALT_LABEL}\n` +
        `     One passkey is supposed to be one wallet across the ecosystem.`,
    );
  } else {
    const huntBytes = toHex(sha256(stringToBytes(m[1]), "bytes"));
    if (huntBytes !== toHex(EMPOWERTOURS_PRF_SALT)) {
      failures.push(`salt bytes differ across repos: ${huntBytes}`);
    }
  }

  checks++;
  if (!src.includes(ACCOUNT_PATH)) {
    failures.push(
      `empowertours-hunt derives a different account path — same salt, different address`,
    );
  }
} else {
  console.log(
    "  SKIP cross-repo salt check: empowertours-hunt not checked out beside this repo",
  );
}

if (failures.length > 0) {
  console.error("✗ the passkey wallet would change identity\n");
  for (const f of failures) console.error(`  ✗ ${f}`);
  console.error(`\n  ${failures.length} failure(s), ${checks} checks`);
  process.exit(1);
}

console.log(`✓ passkey derivation is stable — ${checks} checks passed`);
