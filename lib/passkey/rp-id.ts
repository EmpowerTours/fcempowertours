// ---------------------------------------------------------------------------
// Which WebAuthn relying party the passkey wallet is issued under.
//
// Pure, no browser and no mera import, so tools/verify-passkey-signin.ts can
// exercise every branch from Node.
//
// ## Configurable, but only between two values
//
// The wallet is a pure function of (credential, rpId, salt). The rpId is read
// from NEXT_PUBLIC_PASSKEY_RP_ID so a developer can run the ceremony on
// http://localhost, where WebAuthn refuses empowertours.xyz. That is the ONLY
// reason it is a setting, so the setting accepts exactly two values:
//
//   empowertours.xyz   production, the default. The registrable PARENT, so the
//                      same passkey opens the same wallet on art., rumbo.,
//                      hunt., cota. and the apex. No related-origin requests
//                      are needed: a subdomain may always claim its parent.
//   localhost          local development. A throwaway credential and wallet.
//
// Anything else is refused at the first ceremony rather than accepted. A
// subdomain rpId ("art.empowertours.xyz") would silently mint a second wallet
// for the same face, and a sibling app's own host ("hunt.empowertours.xyz",
// "regalo.empowertours.xyz") would reach into a wallet that is not this app's.
// Neither produces an error; both produce an empty address. A refusal is the
// only honest answer.
//
// The salt is deliberately NOT a setting at all: see derive.ts.
// ---------------------------------------------------------------------------

/**
 * Production rpId. Stated here rather than imported from derive.ts so this file has no imports
 * and runs under plain `node --experimental-strip-types`; tools/verify-passkey-signin.ts checks
 * the two statements agree, so neither can move alone.
 */
export const DEFAULT_PASSKEY_RP_ID = "empowertours.xyz";
const EMPOWERTOURS_RP_ID = DEFAULT_PASSKEY_RP_ID;

export const PASSKEY_RP_ID_ENV = "NEXT_PUBLIC_PASSKEY_RP_ID";

/** The only relying-party ids this app will run a ceremony under. */
export const ALLOWED_PASSKEY_RP_IDS = [EMPOWERTOURS_RP_ID, "localhost"] as const;
export type PasskeyRpId = (typeof ALLOWED_PASSKEY_RP_IDS)[number];

/**
 * Resolve the configured rpId. Unset or blank means production.
 *
 * @throws for any value outside ALLOWED_PASSKEY_RP_IDS.
 */
export function resolvePasskeyRpId(raw: string | undefined): PasskeyRpId {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "") return EMPOWERTOURS_RP_ID;
  const match = ALLOWED_PASSKEY_RP_IDS.find((id) => id === value);
  if (match) return match;
  throw new Error(
    `${PASSKEY_RP_ID_ENV}="${raw}" is not allowed. Use "${EMPOWERTOURS_RP_ID}" ` +
      `(production, shared across every EmpowerTours app) or "localhost" (development). ` +
      `Any other relying party derives a different wallet from the same passkey.`,
  );
}

/**
 * Whether a page served from `hostname` may run a ceremony for `rpId`.
 *
 * WebAuthn allows the rpId to equal the host or be a registrable suffix of it.
 * Checked up front so a visitor on the Railway URL gets "open the app at
 * art.empowertours.xyz" instead of an opaque SecurityError from the browser.
 */
export function hostCanUseRpId(hostname: string, rpId: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  const id = rpId.toLowerCase();
  return host === id || host.endsWith(`.${id}`);
}

/**
 * The rpId this build uses. NEXT_PUBLIC_* is inlined at build time only when
 * read as a literal property, so it is read exactly like this.
 */
export function configuredPasskeyRpId(): PasskeyRpId {
  return resolvePasskeyRpId(process.env.NEXT_PUBLIC_PASSKEY_RP_ID);
}
