/**
 * Passkey (Mera) sign-in must open the ONE EmpowerTours wallet, and that wallet must be just
 * another address to the server.
 *
 * Run: `npx tsx tools/verify-passkey-signin.ts`
 *
 * `verify-passkey-derivation.ts` pins the derivation (path, rpId constant, salt bytes, a known
 * vector, and hunt's salt when that repo is beside this one). This check covers what the
 * sign-in flow added on top of it:
 *
 * 1. **The rpId setting cannot fork the wallet.** `NEXT_PUBLIC_PASSKEY_RP_ID` exists so a
 *    developer can run the ceremony on localhost. Unset means empowertours.xyz, and every value
 *    other than those two is refused: a subdomain rpId (art., rumbo.) would mint a second wallet
 *    for the same face, and a sibling's host (hunt., regalo.) would reach into a wallet that is
 *    not this app's. Neither would raise an error anywhere else.
 *
 * 2. **The salt is not a setting at all.** Both ceremonies pass `EMPOWERTOURS_PRF_SALT`
 *    explicitly, and nothing reads a salt from the environment. mera falls back to its own
 *    default salt when the argument is missing, which would derive a different wallet with no
 *    error: the omission is as dangerous as an edit.
 *
 * 3. **A passkey address goes through the same `authorizeUserAddress` path as MetaMask.** There
 *    is no passkey branch in `useActionAuth` or the server; the passkey is a wagmi connector, its
 *    `personal_sign` is mera's account signing the raw bytes, and the server's ordinary EOA check
 *    accepts it. Proven here by deriving a wallet from a fixed PRF vector, signing the server's
 *    own `buildActionMessage` through mera exactly as the connector does, and verifying it with
 *    the server's own `verifySignature`. If a passkey signature ever needed special handling,
 *    the Safe, the delegation session and every fund-moving route would each need it too.
 *
 * 4. **Opening never silently creates.** A failed "I already have a wallet" must not fall back to
 *    minting a new passkey, which would be a second, empty address for the same person.
 *
 * 5. **Farcaster keeps its own wallet.** The dialog is only reachable after the Farcaster
 *    early-return; Farcaster webviews do not reliably expose WebAuthn PRF.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { toHex } from "viem";
import {
  EMPOWERTOURS_RP_ID,
  EMPOWERTOURS_PRF_SALT,
  EMPOWERTOURS_PRF_SALT_LABEL,
  walletFromPrfOutput,
} from "../lib/passkey/derive.ts";
import {
  ALLOWED_PASSKEY_RP_IDS,
  DEFAULT_PASSKEY_RP_ID,
  hostCanUseRpId,
  resolvePasskeyRpId,
} from "../lib/passkey/rp-id.ts";
import {
  SHARED_CREDENTIAL_COOKIE,
  isUsableCredentialId,
} from "../lib/passkey/credential-hint.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p: string) => readFileSync(join(root, p), "utf8");
/** Comments describe intent; only code decides. */
const code = (p: string) =>
  read(p)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

const failures: string[] = [];
let checks = 0;
function check(label: string, ok: boolean) {
  checks++;
  if (!ok) failures.push(label);
}
function throws(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

// ---- 1. rpId: default, the two allowed values, and refusal of everything else.
check("rp-id.ts default disagrees with derive.ts EMPOWERTOURS_RP_ID", DEFAULT_PASSKEY_RP_ID === EMPOWERTOURS_RP_ID);
check("production rpId is not empowertours.xyz", EMPOWERTOURS_RP_ID === "empowertours.xyz");
check("allowed rpIds widened beyond empowertours.xyz + localhost",
  JSON.stringify([...ALLOWED_PASSKEY_RP_IDS]) === JSON.stringify(["empowertours.xyz", "localhost"]));
check("unset NEXT_PUBLIC_PASSKEY_RP_ID must mean empowertours.xyz", resolvePasskeyRpId(undefined) === "empowertours.xyz");
check("blank NEXT_PUBLIC_PASSKEY_RP_ID must mean empowertours.xyz", resolvePasskeyRpId("  ") === "empowertours.xyz");
check("localhost must be accepted for development", resolvePasskeyRpId("localhost") === "localhost");
check("case must not matter", resolvePasskeyRpId("EmpowerTours.xyz") === "empowertours.xyz");
for (const bad of [
  "art.empowertours.xyz",
  "rumbo.empowertours.xyz",
  "hunt.empowertours.xyz",
  "cota.empowertours.xyz",
  "regalo.empowertours.xyz",
  "fcempowertours-production.up.railway.app",
  "example.com",
]) {
  check(`rpId "${bad}" must be refused: it derives a different wallet`, throws(() => resolvePasskeyRpId(bad)));
}
for (const host of ["art.empowertours.xyz", "empowertours.xyz", "rumbo.empowertours.xyz", "www.empowertours.xyz"]) {
  check(`${host} must be able to claim rpId empowertours.xyz`, hostCanUseRpId(host, "empowertours.xyz"));
}
for (const host of ["fcempowertours-production.up.railway.app", "evilempowertours.xyz", "empowertours.xyz.evil.com"]) {
  check(`${host} must NOT be treated as able to claim empowertours.xyz`, !hostCanUseRpId(host, "empowertours.xyz"));
}

// The rpId must be read from the env only through resolvePasskeyRpId, never from the hostname.
const rpIdSrc = code("lib/passkey/rp-id.ts");
check("rp-id.ts must read NEXT_PUBLIC_PASSKEY_RP_ID as a literal (Next inlines only that form)",
  /process\.env\.NEXT_PUBLIC_PASSKEY_RP_ID/.test(rpIdSrc));
const ceremony = code("lib/passkey/ceremony.ts");
check("ceremony.ts derives the rpId from location.hostname — every subdomain would fork the wallet",
  !/rp(Id)?\s*[:=]\s*[^,;\n]*location\.hostname/.test(ceremony) && !/id:\s*location\.hostname/.test(ceremony));
check("ceremony.ts must take its rpId from configuredPasskeyRpId()", /configuredPasskeyRpId\s*\(/.test(ceremony));

// ---- 2. Salt: pinned, shared with hunt, passed explicitly, never from the environment.
check("salt label moved off the ecosystem label already in production",
  EMPOWERTOURS_PRF_SALT_LABEL === "empowertours-hunt/passkey/v1");
// sha256 digest of the public salt label, NOT key material.
check("salt bytes (sha256 digest of the label) changed",
  toHex(EMPOWERTOURS_PRF_SALT) === "0x9fc345cea9c77d56f4238d9940dfdc757b6a69fb1d83893e067cefbeda0f648f");
const createCall = ceremony.match(/createPasskeyWithPrfOutput\s*\(\s*\{[\s\S]*?\}\s*\)/)?.[0] ?? "";
const getCall = ceremony.match(/getPasskeyPrfOutput\s*\(\s*\{[\s\S]*?\n\s*\}\s*\)/)?.[0] ?? "";
check("createPasskeyWithPrfOutput must pass prfSalt: EMPOWERTOURS_PRF_SALT (mera's default salt is a different wallet)",
  /prfSalt:\s*EMPOWERTOURS_PRF_SALT\b/.test(createCall));
check("getPasskeyPrfOutput must pass prfSalt: EMPOWERTOURS_PRF_SALT (mera's default salt is a different wallet)",
  /prfSalt:\s*EMPOWERTOURS_PRF_SALT\b/.test(getCall));
for (const f of ["lib/passkey/derive.ts", "lib/passkey/ceremony.ts", "lib/passkey/connector.ts", "lib/passkey/rp-id.ts"]) {
  check(`${f} must not read a salt from the environment`, !/process\.env\.[A-Z_]*SALT/.test(code(f)));
}
check("shared credential cookie renamed — hunt writes et.passkey.credential", SHARED_CREDENTIAL_COOKIE === "et.passkey.credential");
check("a junk credential id (TESTCRED123) must be rejected before it reaches mera", !isUsableCredentialId("TESTCRED123"));
check("a canonical credential id must be accepted", isUsableCredentialId("AAECAwQFBgcICQoLDA0ODw"));

// ---- 3. Same authorizeUserAddress path as any wallet.
const actionAuth = code("app/hooks/useActionAuth.ts");
check("useActionAuth grew a passkey/mera branch — a passkey address must be signed for like any wallet",
  !/passkey|\bmera\b/i.test(actionAuth));
check("useActionAuth must sign through wagmi's useSignMessage (which reaches the passkey connector)",
  /useSignMessage\s*\(/.test(actionAuth) && /walletAuthHeaders\s*\(/.test(actionAuth));
const quickAuth = code("lib/quick-auth.ts");
check("authorizeUserAddress must still fall back to verifyWalletAuth", /verifyWalletAuth\s*\(/.test(quickAuth));
for (const f of ["lib/quick-auth.ts", "lib/wallet-auth.ts", "lib/auth.ts", "app/api/create-delegation/route.ts", "app/api/execute-delegated/route.ts", "app/api/register-user-safe/route.ts"]) {
  check(`${f} must not special-case passkey/mera addresses`, !/passkey|\bmera\b/i.test(code(f)));
}
const connector = code("lib/passkey/connector.ts");
check("connector personal_sign must sign the raw bytes with the mera account",
  /case\s+"personal_sign"[\s\S]*?signMessage\(\{\s*message:\s*\{\s*raw:/.test(connector));

// ---- 4. Opening never creates.
const connectBody = connector.match(/async connect\([\s\S]*?\n {4}\},/)?.[0] ?? "";
check("connect() must create ONLY when mode === \"create\"",
  /intent\?\.mode\s*===\s*"create"\s*\?\s*await createSigner/.test(connectBody) &&
  (connectBody.match(/createSigner\(/g) ?? []).length === 1);
check("connect() must not catch an open failure and fall back to creating",
  !/catch[\s\S]*createSigner/.test(connectBody));

// ---- 5. Farcaster keeps its wallet: the dialog opens only after the Farcaster early return.
const walletCtx = code("app/hooks/useWalletContext.tsx");
const reqWallet = walletCtx.match(/const requestWallet = useCallback\([\s\S]*?\n {2}\}, \[/)?.[0] ?? "";
const fcIdx = reqWallet.indexOf("if (isFarcaster) return farcaster.requestWallet()");
const dlgIdx = reqWallet.indexOf("openSignIn()");
check("requestWallet must keep the Farcaster wallet first and only then open the passkey dialog",
  fcIdx >= 0 && dlgIdx > fcIdx);
check("StandaloneProviders must mount the sign-in dialog", /<PasskeySignInDialog\s*\/>/.test(code("app/components/StandaloneProviders.tsx")));

// ---- 3 (runtime): a mera-signed action message verifies through the server's own check.
async function runtime() {
  const { createSecp256k1SigningSession, getEvmAddress } = await import("@category-labs/mera");
  const { toViemAccount } = await import("@category-labs/mera/viem");
  const { buildActionMessage, verifySignature } = await import("../lib/auth.ts");
  const { privateKey } = walletFromPrfOutput(new Uint8Array(32).fill(7));
  const session = createSecp256k1SigningSession({ privateKey });
  try {
    const account = toViemAccount(session);
    check("mera and viem disagree on the passkey address",
      getEvmAddress(session.publicKey).toLowerCase() === account.address.toLowerCase());
    const address = account.address.toLowerCase();
    const message = buildActionMessage(address, Date.now(), "nonce-verify-passkey", "execute-delegated:send_mon");
    // Exactly what the connector does for personal_sign: viem hex-encodes the message, the
    // connector signs those raw bytes.
    const hex = toHex(new TextEncoder().encode(message));
    const signature = await account.signMessage({ message: { raw: hex } });
    const ok = await verifySignature(message, signature, address);
    check("server verifySignature rejected a passkey (mera) signature over its own action message", ok.valid === true);
    const wrong = await verifySignature(message, signature, "0x000000000000000000000000000000000000dEaD");
    check("server verifySignature accepted a passkey signature for a DIFFERENT address", wrong.valid === false);
  } finally {
    session.end();
  }
}

await runtime().catch((e) => {
  failures.push(`runtime signature check could not run: ${e instanceof Error ? e.message : String(e)}`);
});

if (failures.length) {
  console.error(`verify-passkey-signin: ${failures.length} of ${checks} checks FAILED\n`);
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify-passkey-signin: all ${checks} checks pass`);
