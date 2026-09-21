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
  EMPOWERTOURS_RP_ID,
  walletFromPrfOutput,
  type DerivedWallet,
} from "./derive";

/** Stored so a returning user can be asked for the same credential. */
export interface PasskeyRef {
  credentialId: string;
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
  const { createPasskeyWithPrfOutput } = await import("@category-labs/mera");
  const result = await createPasskeyWithPrfOutput({
    rp: { id: EMPOWERTOURS_RP_ID, name: "EmpowerTours" },
    user: { name: label, displayName: label },
    prfSalt: EMPOWERTOURS_PRF_SALT,
  });
  return {
    wallet: walletFromPrfOutput(result.prfOutput),
    ref: { credentialId: result.credentialId },
  };
}

/**
 * Re-derive the wallet from an existing passkey.
 *
 * `ref` is optional: without it the authenticator offers whatever credentials it holds for this
 * rp id, which is what makes this work on a fresh device where nothing is stored locally. The
 * wallet is reproduced, never retrieved — there is nothing to restore.
 */
export async function openWallet(ref?: PasskeyRef): Promise<DerivedWallet> {
  const { getPasskeyPrfOutput } = await import("@category-labs/mera");
  const result = await getPasskeyPrfOutput({
    rpId: EMPOWERTOURS_RP_ID,
    prfSalt: EMPOWERTOURS_PRF_SALT,
    ...(ref ? { credential: { credentialId: ref.credentialId } } : {}),
  });
  return walletFromPrfOutput(result.prfOutput);
}

/**
 * A viem account for signing, plus the session that holds the key.
 *
 * The caller MUST call `session.end()` when done: the key lives in memory until then, and ending
 * it is what zeroes it. Returned rather than hidden because only the caller knows when signing
 * is finished.
 */
export async function openSigner(ref?: PasskeyRef) {
  const { createSecp256k1SigningSession } = await import("@category-labs/mera");
  const { toViemAccount } = await import("@category-labs/mera/viem");
  const wallet = await openWallet(ref);
  const session = createSecp256k1SigningSession({
    privateKey: wallet.privateKey,
  });
  return { account: toViemAccount(session), session };
}
