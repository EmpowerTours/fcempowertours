/**
 * A stamp for the first time a listener hears an artist.
 *
 * ## Why discovery rather than collection
 *
 * The obvious stamp is "you hold a licence by this artist" — and it is the wrong
 * one, because the profile already lists what you own. A profile shows what you
 * HAVE; a passport should show what you DID. Ownership is a state, already
 * visible, and it disappears when you sell.
 *
 * A real passport records border crossings: the moment you entered somewhere. The
 * music equivalent is the first time you crossed into an artist's world, dated. It
 * is chronological, unrepeatable, recorded nowhere else in this app, and you cannot
 * un-hear it by selling the licence.
 *
 * It also composes with the touring idea instead of competing with it:
 * "first heard Unify34" and later "saw Unify34 live" belong on the same page.
 *
 * ## Why this is affordable, and the property that makes it so
 *
 * ONE stamp per listener per ARTIST, ever — not per play. The cost is bounded by
 * the size of the roster, not by listening volume. The radio has played 35,196
 * songs across one artist, which under this rule is one stamp per listener, not
 * 35,196. Adding an artist adds at most one stamp per existing listener.
 *
 * Measured on mainnet 2026-09-07: `addVenueStamp` with empty placeId and
 * googleMapsUri costs 194,248 gas, about 0.0198 MON. Populating those two Google
 * Maps strings costs 292,236 — a third more for fields this app does not read, so
 * they are deliberately left empty.
 *
 * ## Who pays, and why it is the oracle here
 *
 * On the deployed PassportNFTV4 only `owner()`, `oracle()` or the passport holder
 * may stamp, and `verified` is a bool the caller passes. A holder stamping
 * themselves could therefore claim an attestation nobody made, so an honest
 * `verified: true` has to come from the oracle — which means the oracle pays.
 *
 * That is affordable only because of the bound above. It is not the design for
 * venue stamps at show scale; PassportNFTV5's `claimStamp` moves payment to the
 * holder and proves the attester by signature. See TODO.md.
 */

import type { Redis } from "@upstash/redis";

const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT_NFT ?? "";
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC ?? "https://rpc.monad.xyz";
const ORACLE_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY ?? "";
const LICENSE_REGISTRY = process.env.NEXT_PUBLIC_NFT_CONTRACT ?? "";

/** Redis key marking that `listener` has already heard `artist`. */
const heardKey = (listener: string, artist: string) =>
  `discovery:${listener.toLowerCase()}:${artist.toLowerCase()}`;

/** Redis key holding a pending prompt: this listener discovered someone but owns no passport. */
export const pendingKey = (listener: string) =>
  `discovery:pending:${listener.toLowerCase()}`;

export interface DiscoveryResult {
  /** A stamp was written on chain. */
  stamped: boolean;
  /** Already heard this artist before; nothing to do. */
  alreadyHeard: boolean;
  /** Discovered someone, but owns no passport — a prompt is queued instead. */
  needsPassport: boolean;
  artist?: string;
  artistName?: string;
  txHash?: string;
  reason?: string;
}

/**
 * Stamp `listener`'s passport for discovering the artist behind `masterTokenId`.
 *
 * Idempotent by design and in three layers, because a double stamp is permanent:
 * the Redis marker is set BEFORE the transaction, the chain is consulted when
 * Redis has no opinion, and the stamp itself is skipped if the same artist is
 * already stamped on that passport.
 *
 * Never throws. A discovery stamp is a decoration on a play that already
 * succeeded; failing to write one must not fail the play.
 */
export async function stampDiscovery(
  redis: Redis,
  listener: string,
  masterTokenId: string | number,
): Promise<DiscoveryResult> {
  if (!PASSPORT_NFT || !ORACLE_PRIVATE_KEY || !LICENSE_REGISTRY) {
    return {
      stamped: false,
      alreadyHeard: false,
      needsPassport: false,
      reason: "not configured",
    };
  }

  try {
    const { JsonRpcProvider, Wallet, Contract } = await import("ethers");
    const provider = new JsonRpcProvider(MONAD_RPC);

    const registry = new Contract(
      LICENSE_REGISTRY,
      [
        "function getMaster(uint256) view returns (address artist, uint256 artistFid, uint64 createdAt, uint32 maxCollectorEditions, uint32 collectorsMinted, uint8 nftType, address referrer, uint96 royaltyShareBps, address royaltyShareSink)",
      ],
      provider,
    );
    const master = await registry.getMaster(masterTokenId);
    const artist: string = master[0];
    if (!artist || /^0x0+$/.test(artist)) {
      return {
        stamped: false,
        alreadyHeard: false,
        needsPassport: false,
        reason: "no artist",
      };
    }

    // A listener never discovers themselves.
    if (artist.toLowerCase() === listener.toLowerCase()) {
      return {
        stamped: false,
        alreadyHeard: true,
        needsPassport: false,
        artist,
      };
    }

    // Layer 1: the fast path. `set` with NX returns null when the key already
    // existed, which makes "have they heard this artist" and "claim the right to
    // stamp" a single atomic step — two concurrent plays cannot both proceed.
    const claimed = await redis.set(heardKey(listener, artist), Date.now(), {
      nx: true,
    });
    if (claimed === null) {
      return {
        stamped: false,
        alreadyHeard: true,
        needsPassport: false,
        artist,
      };
    }

    const passport = new Contract(
      PASSPORT_NFT,
      [
        "function balanceOf(address) view returns (uint256)",
        "function getTotalSupply() view returns (uint256)",
        "function ownerOf(uint256) view returns (address)",
        "function getPassportStamps(uint256) view returns (tuple(string location,string eventType,address artist,uint256 timestamp,bool verified,string placeId,string googleMapsUri,int256 latitude,int256 longitude)[])",
        "function addVenueStamp(uint256 tokenId, string location, string eventType, address artist, bool verified, string placeId, string googleMapsUri, int256 latitude, int256 longitude) external",
      ],
      new Wallet(ORACLE_PRIVATE_KEY, provider),
    );

    const balance: bigint = await passport.balanceOf(listener);
    if (balance === 0n) {
      // Discovered someone with no passport to stamp. Queue it rather than drop
      // it: the moment is real and the app prompts them to mint, after which the
      // backlog is written. The heard-marker is released so the prompt is not the
      // only record — if they never mint, hearing the artist again re-queues it.
      await redis.del(heardKey(listener, artist));
      await redis.hset(pendingKey(listener), {
        [artist.toLowerCase()]: String(masterTokenId),
      });
      return {
        stamped: false,
        alreadyHeard: false,
        needsPassport: true,
        artist,
      };
    }

    const tokenId = await findPassport(passport, listener);
    if (tokenId === null) {
      await redis.del(heardKey(listener, artist));
      return {
        stamped: false,
        alreadyHeard: false,
        needsPassport: true,
        artist,
      };
    }

    // Layer 3: the chain is the source of truth. Redis can be flushed; a stamp
    // cannot be removed.
    const existing = await passport.getPassportStamps(tokenId);
    const already = existing.some(
      (s: { artist: string; eventType: string }) =>
        s.eventType === "discovery" &&
        s.artist.toLowerCase() === artist.toLowerCase(),
    );
    if (already) {
      return {
        stamped: false,
        alreadyHeard: true,
        needsPassport: false,
        artist,
      };
    }

    const artistName = await resolveArtistName(
      provider,
      artist,
      master[1] as bigint,
    );

    // placeId and googleMapsUri deliberately empty: 194,248 gas rather than
    // 292,236, and this app reads neither.
    const tx = await passport.addVenueStamp(
      tokenId,
      artistName,
      "discovery",
      artist,
      true,
      "",
      "",
      0,
      0,
    );
    await tx.wait();

    return {
      stamped: true,
      alreadyHeard: false,
      needsPassport: false,
      artist,
      artistName,
      txHash: tx.hash,
    };
  } catch (err: unknown) {
    const reason =
      err instanceof Error
        ? err.message.slice(0, 120)
        : String(err).slice(0, 120);
    console.warn("[Discovery] stamp failed:", reason);
    return {
      stamped: false,
      alreadyHeard: false,
      needsPassport: false,
      reason,
    };
  }
}

/** The listener's first passport token id, or null. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function findPassport(
  passport: any,
  listener: string,
): Promise<bigint | null> {
  const total = await passport.getTotalSupply();
  for (let id = total; id >= 1n; id--) {
    try {
      const owner = await passport.ownerOf(id);
      if (owner.toLowerCase() === listener.toLowerCase()) return id;
    } catch {
      // burned or missing; keep looking
    }
  }
  return null;
}

/**
 * What to write on the stamp.
 *
 * The ProfileRegistry name first, because it is what the artist chose to be
 * called. A shortened address is the honest fallback — better a legible address
 * than a name invented for them.
 */
async function resolveArtistName(
  provider: unknown,
  artist: string,
  fid: bigint,
): Promise<string> {
  // The fid the master carries comes first: it is what the artist is actually
  // known as, and the only artist on the platform has a Farcaster account and no
  // registered profile name. Without this every stamp would read a hex address.
  if (fid && fid !== 0n) {
    try {
      const res = await fetch(
        `https://fnames.farcaster.xyz/transfers?fid=${fid.toString()}`,
      );
      if (res.ok) {
        const body = (await res.json()) as {
          transfers?: { username?: string }[];
        };
        const last = body.transfers?.[body.transfers.length - 1];
        if (last?.username) return String(last.username).slice(0, 24);
      }
    } catch {
      // fall through
    }
  }

  const registry = process.env.NEXT_PUBLIC_PROFILE_REGISTRY;
  if (registry) {
    try {
      const { Contract } = await import("ethers");
      const profiles = new Contract(
        registry,
        ["function displayNameOf(address) view returns (string)"],
        provider as never,
      );
      const name: string = await profiles.displayNameOf(artist);
      if (name && name.trim().length > 0) return name.trim().slice(0, 24);
    } catch {
      // fall through to the address
    }
  }
  return `${artist.slice(0, 6)}…${artist.slice(-4)}`;
}
