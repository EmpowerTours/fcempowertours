// ---------------------------------------------------------------------------
// Remembering WHICH passkey to ask for, across EmpowerTours subdomains.
//
// The credential id is a public handle, not a secret: the private key never
// leaves the authenticator and every use still requires user verification. It
// is remembered only so the browser can be asked for one specific passkey
// (allowCredentials) instead of a discoverable lookup, which some Chrome builds
// surface as a "use your phone" / cross-origin sheet on a sibling subdomain.
//
// Two places, same as empowertours-hunt's lib/auth/passkey.ts:
//
//   localStorage  per-origin, this app's own memory
//   cookie        `et.passkey.credential`, scoped to the parent rpId, the SAME
//                 name and JSON shape hunt writes. A person who made their
//                 passkey on hunt.empowertours.xyz arrives here already
//                 pointed at it, and one made here is offered on hunt/rumbo.
//
// Every value read back is validated with the same canonical-base64url rule
// mera enforces (`isUsableCredentialId`, ported from hunt). A junk id in the
// shared cookie made every cota sign-in fail with INPUT_INVALID before; here it
// is ignored and cleared instead of being passed on.
// ---------------------------------------------------------------------------

export interface CredentialHint {
  credentialId: string;
  transports?: readonly string[];
}

/** Shared with hunt, cota and rumbo. Renaming it breaks the cross-app hint. */
export const SHARED_CREDENTIAL_COOKIE = "et.passkey.credential";
const LOCAL_KEY = "et.art.passkey.credential";

const BASE64URL = /^[A-Za-z0-9_-]+$/;
const LEFTOVER_MASK: Record<number, number> = { 2: 0b1111, 3: 0b11 };

function base64UrlValue(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 65 && code <= 90) return code - 65;
  if (code >= 97 && code <= 122) return code - 97 + 26;
  if (code >= 48 && code <= 57) return code - 48 + 52;
  if (char === "-") return 62;
  return 63;
}

/** Canonical unpadded base64url of at least one byte, the shape mera accepts. */
export function isUsableCredentialId(credentialId: string): boolean {
  if (credentialId.length === 0) return false;
  if (credentialId.length % 4 === 1) return false;
  if (!BASE64URL.test(credentialId)) return false;
  const mask = LEFTOVER_MASK[credentialId.length % 4];
  if (mask === undefined) return true;
  const last = base64UrlValue(credentialId[credentialId.length - 1]!);
  return (last & mask) === 0;
}

function asHint(parsed: unknown): CredentialHint | undefined {
  if (typeof parsed !== "object" || parsed === null) return undefined;
  const id = (parsed as { credentialId?: unknown }).credentialId;
  if (typeof id !== "string" || !isUsableCredentialId(id)) return undefined;
  const transports = (parsed as { transports?: unknown }).transports;
  return {
    credentialId: id,
    ...(Array.isArray(transports) &&
    transports.every((t) => typeof t === "string")
      ? { transports: transports as string[] }
      : {}),
  };
}

/** Only a real parent domain is shared; localhost keeps its hint to itself. */
function cookieDomain(rpId: string): string | null {
  const id = rpId.toLowerCase();
  if (!id.includes(".") || id === "localhost") return null;
  return id;
}

function readCookie(): CredentialHint | undefined {
  if (typeof document === "undefined") return undefined;
  try {
    const match = document.cookie
      .split("; ")
      .find((c) => c.startsWith(`${SHARED_CREDENTIAL_COOKIE}=`));
    if (!match) return undefined;
    return asHint(
      JSON.parse(
        decodeURIComponent(match.slice(SHARED_CREDENTIAL_COOKIE.length + 1)),
      ),
    );
  } catch {
    return undefined;
  }
}

function writeCookie(hint: CredentialHint, rpId: string): void {
  if (typeof document === "undefined") return;
  const domain = cookieDomain(rpId);
  if (domain === null) return;
  try {
    const value = encodeURIComponent(
      JSON.stringify({
        credentialId: hint.credentialId,
        transports: hint.transports,
      }),
    );
    document.cookie = `${SHARED_CREDENTIAL_COOKIE}=${value}; domain=${domain}; path=/; max-age=34560000; secure; samesite=lax`;
  } catch {
    // No cookie only means siblings fall back to a discoverable lookup.
  }
}

/** The passkey this browser last used, from this origin or a sibling. */
export function storedCredentialHint(rpId: string): CredentialHint | undefined {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    const local = raw === null ? undefined : asHint(JSON.parse(raw));
    if (local) {
      writeCookie(local, rpId);
      return local;
    }
  } catch {
    // Private mode can refuse storage; the cookie may still answer.
  }
  return readCookie();
}

export function rememberCredentialHint(hint: CredentialHint, rpId: string): void {
  if (!isUsableCredentialId(hint.credentialId)) return;
  try {
    localStorage.setItem(
      LOCAL_KEY,
      JSON.stringify({
        credentialId: hint.credentialId,
        transports: hint.transports,
      }),
    );
  } catch {
    // The passkey still works; the browser shows a chooser next time.
  }
  writeCookie(hint, rpId);
}

/**
 * Drop a hint that did not work, from BOTH places, so the next attempt is a
 * plain discoverable lookup instead of the same stale id forever.
 */
export function forgetCredentialHint(rpId: string): void {
  try {
    localStorage.removeItem(LOCAL_KEY);
  } catch {
    // ignore
  }
  if (typeof document === "undefined") return;
  const domain = cookieDomain(rpId);
  if (domain === null) return;
  try {
    document.cookie = `${SHARED_CREDENTIAL_COOKIE}=; domain=${domain}; path=/; max-age=0; secure; samesite=lax`;
  } catch {
    // ignore
  }
}
