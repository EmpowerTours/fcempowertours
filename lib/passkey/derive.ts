import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
// @scure/bip39 is 2.4.0 here and its export map DOES carry the ".js" suffix.
// empowertours-hunt pins 1.6.0, where the same path WITHOUT the suffix is the
// working one and this form fails the Next build. Same import, two versions,
// opposite answers — a fact about this package.json, not a style choice. If
// @scure/bip39 is ever downgraded here, this line has to be rechecked.
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { sha256, stringToBytes } from "viem";

// ---------------------------------------------------------------------------
// Key derivation for the EmpowerTours passkey wallet.
//
// Ported from empowertours-hunt's lib/auth/derive.ts, which has been carrying
// real player funds. The reasoning is theirs. What is NOT copied is a new salt,
// and that omission is the entire point of this file.
//
// ## One wallet across the ecosystem, on purpose
//
// This derives the SAME address the hunt derives, and cota, and anything else
// under empowertours.xyz. Two things make that true and both must hold:
//
//   rpId  = empowertours.xyz  (the registrable PARENT, not a subdomain)
//   salt  = sha256("empowertours-hunt/passkey/v1")
//
// The rp id is what lets one credential exist across every subdomain; scoping
// to art.empowertours.xyz instead would mint a separate credential and a
// separate wallet, and would break the moment the app moved hosts — which this
// project has already done once.
//
// ## Why the salt still says "hunt"
//
// Because the BYTES are what matter and they are already in production. The
// label is hashed, so renaming it to something ecosystem-flavoured would change
// the hash, change the PRF output, and hand every existing hunter a different,
// empty wallet. The name is historical; the value is load-bearing.
//
// `tools/verify-passkey-derivation.ts` pins the exact bytes AND checks them
// against the hunt repo's own constant when that repo is present, so the two
// cannot drift apart without the gate failing. Wallets diverging silently is
// the failure this protects against, and nothing else would notice it.
//
// ## Identity, since there are now three
//
// This is the third artist identity — alongside unify34 (Farcaster) and the
// wallet-only Earvin Gallardo. Those are deliberately separate ADDRESSES with
// separate catalogues. This one is deliberately a single address shared across
// every EmpowerTours surface, which is a different axis: three artists, and one
// of them is reachable from every app.
//
// No mera import here on purpose: this half is pure and testable with no
// browser and no authenticator. The WebAuthn ceremony that produces the 32 PRF
// bytes can only run in a page.
//
// A passkey's PRF output is 32 secret bytes the authenticator reproduces for
// the same (credential, rpId, salt) forever. Mapping them through BIP-39 to a
// plain 24-word mnemonic and deriving m/44'/60'/0'/0/0 yields an ORDINARY
// Ethereum account. That is load-bearing: an artist who mints masters from this
// wallet must be able to walk away with them. A key derived straight from the
// PRF bytes would sign perfectly well and be permanently trapped in this app —
// for an address holding masters and receiving sale proceeds, that is not a
// wallet, it is a hostage.
//
// It is also the whole recovery story. There is no vault and no backup service:
// the mnemonic IS the backup, it is a standard phrase, and it imports into
// MetaMask or anything else.
// ---------------------------------------------------------------------------

/** Standard first Ethereum account. Changing this orphans every wallet. */
export const ACCOUNT_PATH = "m/44'/60'/0'/0/0";

/**
 * The relying-party id every EmpowerTours surface must use.
 *
 * The registrable parent, so one passkey works on art., hunt., cota. and
 * whatever comes next. A subdomain rp id would silently fork the wallet per
 * app, which is exactly what this file exists to prevent.
 */
export const EMPOWERTOURS_RP_ID = "empowertours.xyz";

/**
 * The ecosystem's WebAuthn PRF salt. **Never change this label.**
 *
 * It is hashed, so any edit — including a cosmetic rename away from "hunt" —
 * produces different bytes, a different PRF output, and a different wallet for
 * every person who already has one. Pinned by
 * `tools/verify-passkey-derivation.ts` so an edit fails the gate rather than
 * quietly orphaning accounts.
 */
export const EMPOWERTOURS_PRF_SALT_LABEL = "empowertours-hunt/passkey/v1";
export const EMPOWERTOURS_PRF_SALT: Uint8Array = sha256(
  stringToBytes(EMPOWERTOURS_PRF_SALT_LABEL),
  "bytes",
);

export interface DerivedWallet {
  /** BIP-39 phrase. Imports into MetaMask, Rabby or anything else. */
  mnemonic: string;
  /**
   * Raw secp256k1 private key for m/44'/60'/0'/0/0. mera's signing session
   * takes exactly this shape and keeps its own copy it can later zero.
   */
  privateKey: Uint8Array;
}

/**
 * Map 32 PRF bytes to a mnemonic and the account key beneath it.
 *
 * @throws when `prfOutput` is not exactly 32 bytes. BIP-39 would otherwise
 *         happily produce a shorter phrase from weaker entropy, and the caller
 *         would never learn the authenticator short-changed it.
 */
export function walletFromPrfOutput(prfOutput: Uint8Array): DerivedWallet {
  if (prfOutput.length !== 32) {
    throw new Error(
      `expected 32 bytes of PRF output, got ${String(prfOutput.length)}`,
    );
  }

  const mnemonic = entropyToMnemonic(prfOutput, wordlist);
  const node = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic)).derive(
    ACCOUNT_PATH,
  );
  if (node.privateKey === null) throw new Error("derivation produced no key");

  return { mnemonic, privateKey: node.privateKey };
}
