/**
 * Which generation of contracts the app is talking to.
 *
 * The v3 deployment (LicenseRegistry + SalesController + MusicSubscriptionV6 +
 * PassportNFTV4 + ProfileRegistry) replaces the live set in one batch. Until that batch is
 * actually on-chain the app must keep working exactly as it does today, so every difference
 * between the two generations is resolved here and gated on one environment variable.
 *
 * ## Flipping it
 *
 * Set `NEXT_PUBLIC_CONTRACTS_V3=true` on Railway *after* the new addresses are deployed and the
 * address env vars point at them. Unset it to go straight back. Nothing else needs editing.
 *
 * ## Why this file exists at all
 *
 * The dangerous differences are not the ones that throw. `getSubscriptionInfo` lost a field, so
 * a V5-shaped decode against V6 reads `isFlagged` where it expects `lastTier` — no error, just
 * wrong data. Likewise `LicenseRegistry.masterTokens` answers with a V2-shaped tuple whose price
 * fields are always zero, because pricing moved to `SalesController`. Both are silent.
 *
 * So the rule here is: **decode by name, never by position, and make the shape a function of the
 * generation rather than of whichever ABI string happened to be pasted into the call site.**
 */

import { parseAbi, type Address, type PublicClient } from "viem";

/** True when the app should talk to the v3 / V6 contract set. */
export function isV3Contracts(): boolean {
  return process.env.NEXT_PUBLIC_CONTRACTS_V3 === "true";
}

// ---------------------------------------------------------------- subscription

/**
 * V6 dropped `flagVotes` along with `voteToFlag`, so the tuple is one field shorter. Both ABIs
 * are kept side by side rather than one being edited in place, because the difference is the
 * whole point.
 */
export const SUBSCRIPTION_INFO_ABI_V5 = parseAbi([
  "function getSubscriptionInfo(address user) view returns (uint256 userFid, uint256 expiry, bool active, uint256 totalPlays, uint256 flagVotes, uint8 lastTier, bool isFlagged)",
]);

export const SUBSCRIPTION_INFO_ABI_V6 = parseAbi([
  "function getSubscriptionInfo(address user) view returns (uint256 userFid, uint256 expiry, bool active, uint256 totalPlays, uint8 lastTier, bool isFlagged)",
]);

export function subscriptionInfoAbi() {
  return isV3Contracts() ? SUBSCRIPTION_INFO_ABI_V6 : SUBSCRIPTION_INFO_ABI_V5;
}

export interface SubscriptionInfo {
  /** 0 means the subscriber has no Farcaster account. Never treat 0 as an error. */
  userFid: bigint;
  expiry: bigint;
  active: boolean;
  totalPlays: bigint;
  lastTier: number;
  isFlagged: boolean;
}

/**
 * Normalise either generation's tuple into one shape.
 *
 * Reading `lastTier` positionally is exactly the bug this guards: it sits at index 5 under V5
 * and index 4 under V6, and getting it wrong silently reports the wrong subscription tier.
 */
export function decodeSubscriptionInfo(
  raw: readonly unknown[],
): SubscriptionInfo {
  const v3 = isV3Contracts();
  return {
    userFid: raw[0] as bigint,
    expiry: raw[1] as bigint,
    active: raw[2] as boolean,
    totalPlays: raw[3] as bigint,
    lastTier: Number(v3 ? raw[4] : raw[5]),
    isFlagged: Boolean(v3 ? raw[5] : raw[6]),
  };
}

/**
 * The FID to pass when subscribing.
 *
 * V5 reverts on 0, so a wallet-only user genuinely cannot subscribe against it and the caller
 * needs to know that before building a transaction. V6 accepts 0 as "no Farcaster account".
 * Returning `null` rather than throwing lets the UI disable a button with an honest reason
 * instead of failing at send time.
 */
export function subscriptionFid(fid: number | undefined | null): bigint | null {
  if (fid && fid > 0) return BigInt(fid);
  return isV3Contracts() ? 0n : null;
}

/** Why a wallet-only user cannot subscribe on the legacy contracts. Null when they can. */
export function walletOnlySubscribeBlockedReason(
  fid: number | undefined | null,
): string | null {
  if (fid && fid > 0) return null;
  if (isV3Contracts()) return null;
  return "Subscribing currently requires a Farcaster account.";
}

// --------------------------------------------------------------------- pricing

const MASTER_TOKENS_ABI = parseAbi([
  "function masterTokens(uint256) view returns (uint256 artistFid, address originalArtist, string tokenURI, string collectorTokenURI, uint256 price, uint256 collectorPrice, uint256 totalSold, uint256 activeLicenses, uint256 maxCollectorEditions, uint256 collectorsMinted, bool active, uint8 nftType, uint96 royaltyPercentage)",
]);

const PRICE_OF_ABI = parseAbi([
  "function priceOf(uint256 masterTokenId, bool isCollector) view returns (uint256)",
]);

/**
 * Read a master's price, from whichever contract actually holds it.
 *
 * Under v3 the registry still answers `masterTokens`, but it is a compatibility view for
 * LiveRadioV3 and every price field in it is hardcoded zero — pricing lives in
 * `SalesController.priceOf`. A caller that keeps reading the old tuple gets `0`, and 0 is not an
 * error value: it approves nothing and shows a free track. Hence one function for both.
 *
 * Returns `null` when the price genuinely cannot be established, so callers can fail loudly.
 */
export async function readMasterPrice(
  client: PublicClient,
  opts: {
    /** The NFT V2 address, or the v3 LicenseRegistry once flipped. */
    nftAddress: Address;
    /** Required when `NEXT_PUBLIC_CONTRACTS_V3` is on. */
    salesController?: Address;
    tokenId: bigint;
    isCollector?: boolean;
  },
): Promise<bigint | null> {
  const { nftAddress, salesController, tokenId, isCollector = false } = opts;

  if (isV3Contracts()) {
    if (!salesController) {
      console.error(
        "[contract-generation] NEXT_PUBLIC_CONTRACTS_V3 is on but NEXT_PUBLIC_SALES_CONTROLLER is unset — pricing lives there in v3 and cannot be read from the registry",
      );
      return null;
    }
    const price = (await client.readContract({
      address: salesController,
      abi: PRICE_OF_ABI,
      functionName: "priceOf",
      args: [tokenId, isCollector],
    })) as bigint;
    return price > 0n ? price : null;
  }

  const master = (await client.readContract({
    address: nftAddress,
    abi: MASTER_TOKENS_ABI,
    functionName: "masterTokens",
    args: [tokenId],
  })) as readonly unknown[];

  const price = (isCollector ? master[5] : master[4]) as bigint;
  return price > 0n ? price : null;
}

/**
 * The artist who owns a master.
 *
 * Safe on both generations: v3's compat view reports `originalArtist` truthfully even though its
 * price fields do not survive. Kept here so call sites stop pasting the 13-field ABI string.
 */
export async function readMasterArtist(
  client: PublicClient,
  nftAddress: Address,
  tokenId: bigint,
): Promise<Address | null> {
  const master = (await client.readContract({
    address: nftAddress,
    abi: MASTER_TOKENS_ABI,
    functionName: "masterTokens",
    args: [tokenId],
  })) as readonly unknown[];

  const artist = master[1] as Address;
  return artist && artist !== "0x0000000000000000000000000000000000000000"
    ? artist
    : null;
}

// -------------------------------------------------------------------- passport

const PASSPORT_LOOKUP_ABI = parseAbi([
  "function getPassportByFid(uint256 fid, string countryCode) view returns (uint256)",
  "function getPassportByAddress(address user, string countryCode) view returns (uint256)",
]);

/**
 * Find someone's passport for a country.
 *
 * The address lookup only exists on `PassportNFTV4`, and it is the only one that can see a
 * wallet-only holder — under V4 a holder with no Farcaster account is deliberately absent from
 * the FID index, so `getPassportByFid` returns 0 for them. On the legacy contract there is no
 * address view at all, so the FID lookup is all there is.
 */
export async function findPassport(
  client: PublicClient,
  opts: {
    passportAddress: Address;
    countryCodes: readonly string[];
    address?: Address;
    fid?: number;
  },
): Promise<{ tokenId: bigint; countryCode: string } | null> {
  const { passportAddress, countryCodes, address, fid } = opts;
  const v3 = isV3Contracts();

  for (const code of countryCodes) {
    // Address first under v3: it is the lookup that works for everyone.
    if (v3 && address) {
      try {
        const tokenId = (await client.readContract({
          address: passportAddress,
          abi: PASSPORT_LOOKUP_ABI,
          functionName: "getPassportByAddress",
          args: [address, code],
        })) as bigint;
        if (tokenId > 0n) return { tokenId, countryCode: code };
      } catch {
        // Fall through to the FID lookup rather than failing the whole request.
      }
    }

    if (fid && fid > 0) {
      try {
        const tokenId = (await client.readContract({
          address: passportAddress,
          abi: PASSPORT_LOOKUP_ABI,
          functionName: "getPassportByFid",
          args: [BigInt(fid), code],
        })) as bigint;
        if (tokenId > 0n) return { tokenId, countryCode: code };
      } catch {
        // Try the next country code.
      }
    }
  }

  return null;
}

// --------------------------------------------------------------------- profile

const PROFILE_ABI = parseAbi([
  "function displayNameOf(address user) view returns (string)",
]);

/**
 * Display name for someone with no Farcaster account.
 *
 * Deliberately the **last** resort. The resolution order the app must follow is:
 *
 *     Farcaster username (Neynar)  →  ProfileRegistry name  →  shortened address
 *
 * A ProfileRegistry name is not a Farcaster username and must never be presented as one. Names
 * are unique first-come but *not* proof of identity — a homoglyph can be registered — so render
 * the address alongside it.
 */
export async function readProfileName(
  client: PublicClient,
  address: Address,
): Promise<string | null> {
  if (!isV3Contracts()) return null;

  const registry = process.env.NEXT_PUBLIC_PROFILE_REGISTRY as
    | Address
    | undefined;
  if (!registry) return null;

  try {
    const name = (await client.readContract({
      address: registry,
      abi: PROFILE_ABI,
      functionName: "displayNameOf",
      args: [address],
    })) as string;
    return name && name.length > 0 ? name : null;
  } catch {
    return null;
  }
}

/** `0x1a2b…f9c0` — the fallback when nobody has a name at all. */
export function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

// ------------------------------------------------------- duplicate detection

const DEDUPE_ABI = parseAbi([
  "function totalMasters() view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function hasSong(address artist, string songTitle) view returns (bool)",
]);

const GET_MASTER_ARTIST_ABI = parseAbi([
  "function getMaster(uint256) view returns (address artist, uint256 artistFid, uint64 createdAt, uint32 maxCollectorEditions, uint32 collectorsMinted, uint8 nftType, address referrer, uint96 royaltyShareBps, address royaltyShareSink)",
]);

/**
 * Has this artist already published this track?
 *
 * ## Why the question changes shape between generations
 *
 * V2 answers it directly: masters carry a title and `hasSong(artist, title)` exists. v3 masters
 * carry no title at all — only a uri — so there is nothing to collide on by name. The uri is the
 * one field both generations agree on and the only thing left to compare, which makes dedup a
 * scan rather than a lookup.
 *
 * The scan is bounded by `totalMasters()` and runs once, before a wallet prompt. That is
 * affordable now and will not be forever; when it stops being affordable the answer is an
 * indexer query, not a contract change. Returning `null` on any failure keeps a degraded RPC
 * from blocking a legitimate mint — this check exists to save an artist from a duplicate, not to
 * be a gate that can strand them.
 *
 * @returns the colliding master id, or `null` if there is no duplicate (or the check could not run)
 */
export async function findDuplicateMaster(
  client: PublicClient,
  opts: {
    nftAddress: Address;
    artist: Address;
    /** The master metadata uri. Used under v3. */
    uri: string;
    /** The track title. Used under V2, which has no uri index. */
    title: string;
  },
): Promise<bigint | null> {
  try {
    if (!isV3Contracts()) {
      const exists = (await client.readContract({
        address: opts.nftAddress,
        abi: DEDUPE_ABI,
        functionName: "hasSong",
        args: [opts.artist, opts.title],
      })) as boolean;
      // V2 answers yes/no without saying which token, and 0n is not a valid master id, so it
      // reads unambiguously as "a duplicate exists" to every caller.
      return exists ? 0n : null;
    }

    if (!opts.uri) return null;

    const total = (await client.readContract({
      address: opts.nftAddress,
      abi: DEDUPE_ABI,
      functionName: "totalMasters",
    })) as bigint;

    const wanted = opts.artist.toLowerCase();
    for (let id = 1n; id <= total; id++) {
      try {
        const master = (await client.readContract({
          address: opts.nftAddress,
          abi: GET_MASTER_ARTIST_ABI,
          functionName: "getMaster",
          args: [id],
        })) as readonly unknown[];
        // Multiple named return values decode as a tuple, not an object — `artist` is [0].
        if ((master[0] as string).toLowerCase() !== wanted) continue;

        const uri = (await client.readContract({
          address: opts.nftAddress,
          abi: DEDUPE_ABI,
          functionName: "tokenURI",
          args: [id],
        })) as string;
        if (uri && uri === opts.uri) return id;
      } catch {
        // A purged or missing id. Skip it rather than abandoning the scan.
      }
    }
    return null;
  } catch {
    return null;
  }
}
