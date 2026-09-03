/**
 * Rendering a wallet-only artist's profile picture, safely and small.
 *
 * `ProfileRegistry.setProfile` is ungated and takes an arbitrary 256-byte
 * string, so the avatar URI is chosen by whoever owns the address — not by us.
 * Rendering it blindly means a stranger deciding what loads in the app: a
 * remote tracking pixel, a huge file, a `data:` payload, or someone else's
 * artist photo used to impersonate them.
 *
 * So the chain stays permissionless and the app is picky: only IPFS content,
 * either `ipfs://<cid>` or a URL on the gateway this app pins to. Anything else
 * renders as the fallback initial. That is a display policy, not censorship —
 * the value is still on chain for anyone else to read.
 */

const PINATA_GATEWAY =
  process.env.NEXT_PUBLIC_PINATA_GATEWAY ||
  "harlequin-used-hare-224.mypinata.cloud";

/** A bare CIDv0 or CIDv1, which is all we ever write. */
const CID = /^[A-Za-z0-9]{46,64}$/;

/**
 * The size an avatar renders at, in CSS pixels.
 *
 * Emitted as HTML `width`/`height` attributes, not only as classes. Ganado's
 * 1024px cover filled a phone screen because `w-12 h-12` was inert — Tailwind
 * was emitting no utilities at all — and an image with no intrinsic size falls
 * back to its natural dimensions. Width and height attributes hold with zero
 * stylesheet, so a CSS failure can never again let a profile picture take over
 * the page.
 */
export const AVATAR_PX = 48;

/** Resolve a stored avatarURI to a URL, or null if we will not render it. */
export function resolveAvatarUri(uri?: string | null): string | null {
  if (!uri) return null;
  const trimmed = uri.trim();
  if (!trimmed || trimmed.length > 256) return null;

  if (trimmed.startsWith("ipfs://")) {
    const cid = trimmed.slice("ipfs://".length).split(/[/?#]/)[0];
    if (!CID.test(cid)) return null;
    return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  }

  // A gateway URL, but only our own gateway.
  try {
    const url = new URL(trimmed);
    if (url.protocol !== "https:") return null;
    if (url.hostname !== PINATA_GATEWAY) return null;
    const cid = url.pathname.replace(/^\/ipfs\//, "").split("/")[0];
    if (!CID.test(cid)) return null;
    return `https://${PINATA_GATEWAY}/ipfs/${cid}`;
  } catch {
    return null;
  }
}

/** What we store on chain after pinning: canonical, short, gateway-independent. */
export function avatarUriForCid(cid: string): string {
  return `ipfs://${cid}`;
}
