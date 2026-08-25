/**
 * What to call an artist.
 *
 * ## Why this exists
 *
 * `contract-generation.ts` wrote the resolution order down and nothing ever called it:
 *
 *     Farcaster username (Neynar)  →  ProfileRegistry name  →  shortened address
 *
 * `readProfileName` and `shortenAddress` were exported with zero call sites, so an artist with
 * no Farcaster account rendered as a bare address everywhere. Meanwhile the Neynar half was
 * copy-pasted into five routes, each with its own cache and its own idea of what to do on a 404
 * — which is why the platform wallet's failed lookup shows up repeatedly in the logs.
 *
 * This is that order, once.
 *
 * ## The rule that is not negotiable
 *
 * A ProfileRegistry name is **not** a Farcaster username. Anyone can register one, first-come,
 * and the contract's own comment warns that homoglyphs are registerable — `Earvin Gallardo` and
 * a Cyrillic lookalike are different keys. So the result says which source it came from, and
 * callers must render a `profile` name with its address visible. `@` is reserved for `farcaster`.
 *
 * ## Caching
 *
 * Names change — a rename frees the old name in the same transaction — so unlike catalogue
 * metadata this cannot be cached forever. Five minutes is long enough to spare the lookup on a
 * page rendering the same artist repeatedly, short enough that a rename shows up without a
 * deploy.
 */

import type { Address, PublicClient } from "viem";

export type ArtistNameSource = "farcaster" | "profile" | "address";

export interface ArtistName {
  /** Ready to render. Never carries an `@` unless the source is `farcaster`. */
  display: string;
  source: ArtistNameSource;
  address: string;
  /** True when the caller must show the address alongside the name. */
  needsAddressShown: boolean;
}

const TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { value: ArtistName; expires: number }>();

export function _resetArtistNameCache(): void {
  cache.clear();
}

/** `0x1a2b…f9c0` — the fallback when nobody has a name at all. */
export function shortenAddress(address: string): string {
  if (!address || address.length < 10) return address ?? "";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function addressOnly(address: string): ArtistName {
  return {
    display: shortenAddress(address),
    source: "address",
    address,
    needsAddressShown: false, // the display already IS the address
  };
}

/**
 * Resolve one address.
 *
 * Every lookup is allowed to fail. A Farcaster 404 is the normal case for a wallet-only artist,
 * not an error — the platform wallet 404ing on every catalogue read is what made that obvious.
 */
export async function resolveArtistName(
  address: string,
  deps: {
    /** Returns a Farcaster username for the address, or null. */
    lookupFarcaster?: (address: string) => Promise<string | null>;
    /** Returns a ProfileRegistry display name for the address, or null. */
    lookupProfile?: (address: string) => Promise<string | null>;
    now?: () => number;
  } = {},
): Promise<ArtistName> {
  if (!address) return addressOnly("");

  const key = address.toLowerCase();
  const now = deps.now ?? Date.now;

  const hit = cache.get(key);
  if (hit && hit.expires > now()) return hit.value;

  let resolved: ArtistName | null = null;

  if (deps.lookupFarcaster) {
    try {
      const username = await deps.lookupFarcaster(address);
      if (username) {
        resolved = {
          display: `@${username}`,
          source: "farcaster",
          address,
          needsAddressShown: false,
        };
      }
    } catch {
      // A Farcaster lookup failing must never cost the caller a name.
    }
  }

  if (!resolved && deps.lookupProfile) {
    try {
      const name = await deps.lookupProfile(address);
      if (name) {
        resolved = {
          display: name,
          source: "profile",
          address,
          // Self-registered and not proof of identity. Always shown with the address.
          needsAddressShown: true,
        };
      }
    } catch {
      // fall through to the address
    }
  }

  const value = resolved ?? addressOnly(address);
  cache.set(key, { value, expires: now() + TTL_MS });
  return value;
}

const PROFILE_ABI = [
  {
    type: "function",
    name: "displayNameOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "string" }],
  },
] as const;

/** Bind `resolveArtistName`'s profile lookup to the live ProfileRegistry. */
export function profileLookup(
  client: PublicClient,
  registry: Address | undefined,
): (address: string) => Promise<string | null> {
  return async (address: string) => {
    if (!registry) return null;
    const name = (await client.readContract({
      address: registry,
      abi: PROFILE_ABI,
      functionName: "displayNameOf",
      args: [address as Address],
    })) as string;
    return name && name.length > 0 ? name : null;
  };
}
