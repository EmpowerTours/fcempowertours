/**
 * Farcaster `accountAssociation` blobs, keyed by the domain they were signed for.
 *
 * The signature binds the manifest to one exact domain, so a manifest served from
 * `music.empowertours.xyz` carrying the railway.app blob is invalid. Keeping both
 * here lets the two domains serve valid manifests at the same time, which is what
 * makes the cutover non-breaking: existing casts that point at the railway domain
 * keep resolving while the new domain comes up.
 *
 * These are public values — they are served verbatim at /.well-known/farcaster.json.
 *
 * To add a domain: sign the manifest for it in the Farcaster manifest tool with the
 * custody wallet of FID 765994, then add the blob below (or set
 * FARCASTER_ACCOUNT_ASSOCIATIONS to a JSON object of the same shape to merge in
 * more without a code change).
 */
export type AccountAssociation = {
  header: string;
  payload: string;
  signature: string;
};

const BUILT_IN: Record<string, AccountAssociation> = {
  "fcempowertours-production-6551.up.railway.app": {
    header:
      "eyJmaWQiOjc2NTk5NCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDVDNDQwOWM4ODcxQzc1NjAzOTI2NGZmQTE3QTUxNENFMzE3RjdhM2MifQ",
    payload:
      "eyJkb21haW4iOiJmY2VtcG93ZXJ0b3Vycy1wcm9kdWN0aW9uLTY1NTEudXAucmFpbHdheS5hcHAifQ",
    signature:
      "MHg0ZDcxNzU1ZjA0N2I4ZjE4Zjg5ZWM3YWFhMmU1NjUwNmY4MGFhOTg0ZDc0Y2ZkMmMxY2JkZGI0NjJmZmZlOGEwNWU2N2U1NTI2NWJjZDg0MmNlYTI5YzA2MmZmNzMzNTA5ZGQ3MjJmYWYzMDI3N2E4YWRmMDg0M2NhMzZkOWRkODFi",
  },
  // Signed 2026-09-20 with the same FID 765994 custody key. Note the signature
  // encoding differs from the one above: the current Farcaster tool emits the raw
  // 65-byte secp256k1 signature base64-encoded, where the older blob is a base64
  // of the "0x…" hex string. Both are accepted; do not "normalise" either one.
  "music.empowertours.xyz": {
    header:
      "eyJmaWQiOjc2NTk5NCwidHlwZSI6ImN1c3RvZHkiLCJrZXkiOiIweDVDNDQwOWM4ODcxQzc1NjAzOTI2NGZmQTE3QTUxNENFMzE3RjdhM2MifQ",
    payload: "eyJkb21haW4iOiJtdXNpYy5lbXBvd2VydG91cnMueHl6In0",
    signature:
      "75gB1x5797kGTjGuCatOUBl6nUGFE8LNBCgaD0FnFxgMgpA5ZS+TPapBCZMrdTQGV3HMjKruxPRUFEv2lUmgjxs=",
  },
};

function fromEnv(): Record<string, AccountAssociation> {
  const raw = process.env.FARCASTER_ACCOUNT_ASSOCIATIONS;
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, AccountAssociation>;
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([, v]) =>
          v &&
          typeof v.header === "string" &&
          typeof v.payload === "string" &&
          typeof v.signature === "string",
      ),
    );
  } catch {
    // A malformed env var must not take the manifest down.
    console.error(
      "FARCASTER_ACCOUNT_ASSOCIATIONS is not valid JSON; ignoring it",
    );
    return {};
  }
}

/** The domain each association was signed for, as encoded in its own payload. */
export function signedDomain(a: AccountAssociation): string | null {
  try {
    return (
      JSON.parse(Buffer.from(a.payload, "base64url").toString()).domain ?? null
    );
  } catch {
    return null;
  }
}

export function associationForHost(host: string | null | undefined): {
  association: AccountAssociation;
  matched: boolean;
} {
  const all = { ...BUILT_IN, ...fromEnv() };
  const key = (host ?? "").split(":")[0].toLowerCase();
  const hit = all[key];
  if (hit) return { association: hit, matched: true };
  // Unknown host: serve the canonical blob rather than nothing. The manifest will
  // not validate on that host, which is the correct signal that it needs signing.
  return {
    association:
      all["fcempowertours-production-6551.up.railway.app"] ??
      Object.values(all)[0],
    matched: false,
  };
}
