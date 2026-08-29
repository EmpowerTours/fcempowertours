/**
 * What to call an artist.
 *
 * ## Why this exists
 *
 * `contract-generation.ts` wrote the resolution order down and nothing ever called it:
 *
 *     Farcaster username (Neynar)  →  ProfileRegistry name  →  shortened address
 *
 * That order asks Farcaster **by address**, which is why every existing master renders as
 * `0x8df6…8ec1`. The five live masters were minted by the deployer key during the v3 migration,
 * and a deployer key has no Farcaster account — so the lookup 404s and falls all the way through.
 *
 * The contract knew the answer the whole time. `getMaster` returns `artistFid` alongside the
 * artist address, and all five carry `765994` — `@unify34`. The catalogue decoded that field and
 * threw it away. So the order gains a tier:
 *
 *     by address  →  by artistFid  →  ProfileRegistry  →  shortened address
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
 * callers must render a `profile` name with its address visible.
 *
 * ## Why a name from the FID is a WEAKER claim, not an equal one
 *
 * `artistFid` is whatever the minter passed. `mintMaster` takes it as an argument and sets the
 * artist to `msg.sender`; nothing checks that the two belong to the same person. Minting a track
 * with someone else's FID and having the UI print their handle on it is a one-argument
 * impersonation, so `farcaster-fid` must never be presented the way a verified handle is.
 *
 * Verification is free, and it falls out of the order rather than needing an address comparison.
 * Neynar's by-address lookup covers custody AND verified addresses, so if the artist address
 * belonged to that FID the FIRST tier would already have answered. Reaching the FID tier at all
 * therefore MEANS the claim is unconfirmed — hence `needsAddressShown: true`, the same treatment
 * a self-registered ProfileRegistry name gets.
 *
 * Checked against the live data: FID 765994 has verified `0x33fFCcb1…82b0` and `0x7c5090B9…09E0`.
 * The artist address on all five masters is `0x8dF64bAC…8ec1`, which is neither. The claim is
 * true — it is the same person's deployer key — but it is not provable from public data, and this
 * function reports what is provable.
 *
 * `@` is reserved for the two Farcaster tiers, which are genuinely Farcaster handles.
 *
 * ## Caching
 *
 * Names change — a rename frees the old name in the same transaction — so unlike catalogue
 * metadata this cannot be cached forever. Five minutes is long enough to spare the lookup on a
 * page rendering the same artist repeatedly, short enough that a rename shows up without a
 * deploy.
 */

import type { Address, PublicClient } from "viem";

export type ArtistNameSource =
  | "farcaster"
  | "farcaster-fid"
  | "profile"
  | "address";

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
    /**
     * Returns a Farcaster username for the on-chain `artistFid`, or null. Only consulted when the
     * address lookup found nothing, which is what makes the result unverified — see above.
     */
    lookupFarcasterByFid?: (fid: number) => Promise<string | null>;
    /** The `artistFid` the contract stores for this master. */
    fid?: number;
    /** Returns a ProfileRegistry display name for the address, or null. */
    lookupProfile?: (address: string) => Promise<string | null>;
    now?: () => number;
  } = {},
): Promise<ArtistName> {
  if (!address) return addressOnly("");

  // The fid is part of the key: one address can be the artist on masters claiming different
  // fids, and caching the first answer under the bare address would spread it to the rest.
  const key = `${address.toLowerCase()}:${deps.fid ?? ""}`;
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

  // Only reached when the address lookup found nothing, which is precisely the condition that
  // makes this claim unverified. Do not reorder these two.
  if (!resolved && deps.lookupFarcasterByFid && deps.fid) {
    try {
      const username = await deps.lookupFarcasterByFid(deps.fid);
      if (username) {
        resolved = {
          display: `@${username}`,
          source: "farcaster-fid",
          address,
          // The minter asserted this FID. Show the address so the claim can be checked.
          needsAddressShown: true,
        };
      }
    } catch {
      // Same as above: a lookup failing must never cost the caller a name.
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

const NEYNAR_BULK = "https://api.neynar.com/v2/farcaster/user/bulk-by-address";
const NEYNAR_BULK_FIDS = "https://api.neynar.com/v2/farcaster/user/bulk";

/**
 * Batch Farcaster lookup, bound to Neynar.
 *
 * One request for every address on a page rather than one per artist. A 404 is the ordinary
 * answer for a wallet-only artist and resolves to `null`, not an error — the platform wallet
 * 404ing on every catalogue read is what made the old per-route handling obviously wrong.
 */
export async function farcasterNames(
  addresses: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const key = process.env.NEYNAR_API_KEY;
  const unique = [
    ...new Set(addresses.filter(Boolean).map((a) => a.toLowerCase())),
  ];
  if (!key || unique.length === 0) return out;

  try {
    const res = await fetch(
      `${NEYNAR_BULK}?addresses=${unique.join(",")}&address_types=custody_address,verified_address`,
      { headers: { api_key: key } },
    );
    if (!res.ok) return out; // 404 = nobody here is on Farcaster. Normal.

    const data = (await res.json()) as Record<
      string,
      Array<{ username?: string }>
    >;
    for (const address of unique) {
      const username = data[address]?.[0]?.username;
      if (username) out.set(address, username);
    }
  } catch {
    // A Neynar outage costs display names, never the page.
  }
  return out;
}

/**
 * Batch Farcaster lookup by FID.
 *
 * Separate from `farcasterNames` because the two answer different questions and carry different
 * weight: this one resolves an id the minter typed, that one resolves an address Farcaster itself
 * attested. `resolveArtistName` keeps them in that order for exactly that reason.
 */
export async function farcasterNamesByFid(
  fids: number[],
): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const key = process.env.NEYNAR_API_KEY;
  const unique = [...new Set(fids.filter((f) => Number.isInteger(f) && f > 0))];
  if (!key || unique.length === 0) return out;

  try {
    const res = await fetch(`${NEYNAR_BULK_FIDS}?fids=${unique.join(",")}`, {
      headers: { api_key: key },
    });
    if (!res.ok) return out;

    const data = (await res.json()) as {
      users?: Array<{ fid?: number; username?: string }>;
    };
    for (const user of data.users ?? []) {
      if (user.fid && user.username) out.set(user.fid, user.username);
    }
  } catch {
    // A Neynar outage costs display names, never the page.
  }
  return out;
}

/** One artist to resolve. A bare string is an address with no FID claim attached. */
export type ArtistRef = string | { address: string; fid?: number };

/**
 * Resolve many artists at once: one Neynar request by address, a second by FID for whoever the
 * first did not answer for, then one registry read per artist still unnamed.
 *
 * The second request covers only the leftovers, so an all-Farcaster page still costs one call.
 */
export async function resolveArtistNames(
  artists: ArtistRef[],
  lookupProfile?: (address: string) => Promise<string | null>,
): Promise<Map<string, ArtistName>> {
  // Keyed by address, so two masters by the same artist resolve once. A conflicting FID claim on
  // the same address keeps the first seen rather than flapping between them.
  const byAddress = new Map<string, number | undefined>();
  for (const a of artists) {
    const address = (typeof a === "string" ? a : a.address)?.toLowerCase();
    if (!address) continue;
    const fid = typeof a === "string" ? undefined : a.fid;
    if (!byAddress.has(address)) byAddress.set(address, fid);
    else if (byAddress.get(address) === undefined) byAddress.set(address, fid);
  }

  const addresses = [...byAddress.keys()];
  const farcaster = await farcasterNames(addresses);

  // Only the addresses Farcaster did not answer for. Asking for the rest would be wasted, and
  // worse, would invite using the FID answer where the verified one already exists.
  const leftoverFids = addresses
    .filter((a) => !farcaster.has(a))
    .map((a) => byAddress.get(a))
    .filter((f): f is number => typeof f === "number" && f > 0);
  const byFid = await farcasterNamesByFid(leftoverFids);

  const out = new Map<string, ArtistName>();
  await Promise.all(
    addresses.map(async (address) => {
      const name = await resolveArtistName(address, {
        fid: byAddress.get(address),
        lookupFarcaster: async () => farcaster.get(address) ?? null,
        lookupFarcasterByFid: async (fid) => byFid.get(fid) ?? null,
        lookupProfile,
      });
      out.set(address, name);
    }),
  );
  return out;
}
