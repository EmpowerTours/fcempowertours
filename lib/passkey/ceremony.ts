/**
 * The browser half: turning a passkey into this app's 32 PRF bytes.
 *
 * `lib/passkey/derive.ts` is pure and testable with no authenticator. This file is the part that
 * can only run in a page, and it exists so the two inputs that decide WHICH wallet you get —
 * the relying-party id and the PRF salt — are supplied from one place.
 *
 * Both are passed explicitly on every call. mera defaults `prfSalt` when it is omitted, and a
 * default salt here would silently derive a different wallet from the one hunt and cota already
 * use — the exact failure `verify-passkey-derivation.ts` exists to prevent, arriving through a
 * missing argument rather than an edited constant.
 */

import {
  EMPOWERTOURS_PRF_SALT,
  walletFromPrfOutput,
  type DerivedWallet,
} from "./derive";
import { configuredPasskeyRpId, hostCanUseRpId } from "./rp-id";
import {
  forgetCredentialHint,
  rememberCredentialHint,
  storedCredentialHint,
  type CredentialHint,
} from "./credential-hint";

/** Stored so a returning user can be asked for the same credential. */
export type PasskeyRef = CredentialHint;

/**
 * The rpId for this ceremony, checked against the page's host first.
 *
 * Production is empowertours.xyz (see rp-id.ts); a page on art.empowertours.xyz or the apex may
 * claim it, a page on the Railway URL may not. Failing here with a sentence beats the browser's
 * SecurityError, which names nothing a person can act on.
 */
function ceremonyRpId(): string {
  const rpId = configuredPasskeyRpId();
  if (typeof location !== "undefined" && !hostCanUseRpId(location.hostname, rpId)) {
    throw new PasskeyHostError(rpId);
  }
  return rpId;
}

export class PasskeyHostError extends Error {
  constructor(readonly rpId: string) {
    super(
      `Passkey wallets only work on ${rpId}. Open the app at https://art.${rpId} to use yours.`,
    );
    this.name = "PasskeyHostError";
  }
}

/** mera's error code, when the failure came from mera. */
export function meraErrorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code: unknown }).code;
    if (typeof code === "string") return code;
  }
  return undefined;
}

/**
 * Create a passkey and derive the wallet behind it.
 *
 * `user.name` is what the authenticator shows in its own list. It is a label, not an identity —
 * nothing downstream reads it, and the account is decided entirely by (credential, rpId, salt).
 */
export async function createWallet(
  label: string,
): Promise<{ wallet: DerivedWallet; ref: PasskeyRef }> {
  const rpId = ceremonyRpId();
  const { createPasskeyWithPrfOutput } = await import("@category-labs/mera");
  const result = await createPasskeyWithPrfOutput({
    rp: { id: rpId, name: "EmpowerTours" },
    user: { name: label, displayName: label },
    prfSalt: EMPOWERTOURS_PRF_SALT,
  });
  const ref: PasskeyRef = {
    credentialId: result.credentialId,
    ...(result.transports ? { transports: result.transports } : {}),
  };
  rememberCredentialHint(ref, rpId);
  return { wallet: walletFromPrfOutput(result.prfOutput), ref };
}

/**
 * Re-derive the wallet from an existing passkey.
 *
 * `ref` is optional: without it the authenticator offers whatever credentials it holds for this
 * rp id, which is what makes this work on a fresh device where nothing is stored locally. The
 * wallet is reproduced, never retrieved — there is nothing to restore.
 */
export async function openWallet(
  ref?: PasskeyRef,
  opts: { useHint?: boolean } = {},
): Promise<DerivedWallet> {
  const rpId = ceremonyRpId();
  const { getPasskeyPrfOutput } = await import("@category-labs/mera");
  // An explicit ref wins; otherwise the last passkey this browser used here or on a sibling
  // EmpowerTours app (shared cookie). `useHint: false` is the "choose another passkey" escape.
  const hint = ref ?? (opts.useHint === false ? undefined : storedCredentialHint(rpId));
  try {
    const result = await getPasskeyPrfOutput({
      rpId,
      prfSalt: EMPOWERTOURS_PRF_SALT,
      ...(hint
        ? {
            credential: {
              credentialId: hint.credentialId,
              ...(hint.transports ? { transports: hint.transports as never } : {}),
            },
          }
        : {}),
    });
    rememberCredentialHint(
      { credentialId: result.credentialId, ...(hint?.credentialId === result.credentialId && hint.transports ? { transports: hint.transports } : {}) },
      rpId,
    );
    return walletFromPrfOutput(result.prfOutput);
  } catch (e) {
    // A remembered id mera refuses to decode would fail every sign-in, forever, before any
    // prompt. Drop it so the next tap is a plain discoverable lookup.
    if (hint && !ref && meraErrorCode(e) === "INPUT_INVALID") forgetCredentialHint(rpId);
    throw e;
  }
}

/**
 * A viem account for signing, plus the session that holds the key.
 *
 * The caller MUST call `session.end()` when done: the key lives in memory until then, and ending
 * it is what zeroes it. Returned rather than hidden because only the caller knows when signing
 * is finished.
 */
export async function openSigner(
  ref?: PasskeyRef,
  opts: { useHint?: boolean } = {},
) {
  return signerFor(await openWallet(ref, opts));
}

/**
 * First visit: create the passkey AND hand back a signer, in one ceremony where the platform
 * allows it. The address is the same one `openSigner` will derive from this passkey later, on
 * any EmpowerTours app.
 */
export async function createSigner(label: string) {
  const { wallet } = await createWallet(label);
  return signerFor(wallet);
}

async function signerFor(wallet: DerivedWallet) {
  const { createSecp256k1SigningSession, getEvmAddress } = await import(
    "@category-labs/mera"
  );
  const { toViemAccount } = await import("@category-labs/mera/viem");
  const session = createSecp256k1SigningSession({
    privateKey: wallet.privateKey,
  });
  const account = toViemAccount(session);
  // mera's address helper and viem's adapter must agree, or something upstream changed and the
  // wrong address would be authorised, given a Safe, and credited. Fail loudly instead.
  if (
    getEvmAddress(session.publicKey).toLowerCase() !==
    account.address.toLowerCase()
  ) {
    session.end();
    throw new Error("address mismatch between mera and viem");
  }
  return { account, session };
}
