/**
 * Where the catalogue is read from, and how that decision is made.
 *
 * ## The failure this exists for
 *
 * On 2026-08-13 the hosted indexer stopped at block 95,657,100 and stayed there. It was not
 * down: every query returned HTTP 200 with well-formed, internally consistent data. The app
 * served an eight-day-old catalogue and nothing anywhere reported a problem — the v3 migration
 * looked fine in the UI precisely because the UI was showing a snapshot from before it.
 *
 * So the health check cannot be "did the request succeed". It has to be "how far behind is it",
 * which means comparing the indexer's own cursor against the chain head.
 *
 * ## Shape
 *
 * One check, one fallback, no retry loop. When the indexer is fresh it is used, because it is
 * far cheaper than N contract reads and carries data the chain does not (resolved metadata,
 * play counts). When it is stale or unreachable the chain is read directly — slower and
 * thinner, but always correct. Recovery is automatic: the next request after the indexer
 * catches up uses it again, with no flag to flip and nothing to remember.
 *
 * The staleness threshold is deliberately generous. A backfill after a redeploy legitimately
 * runs millions of blocks behind for hours, and serving chain data throughout is the right
 * behaviour, not a degraded one.
 */

import {
  createPublicClient,
  http,
  parseAbi,
  type Address,
  type PublicClient,
} from "viem";
import { activeChain } from "@/app/chains";
import { isV3Contracts, readMasterPrice } from "@/lib/contract-generation";
import {
  checkEnvioHealth,
  resetEnvioHealthCache,
  type EnvioHealth,
} from "@/lib/envio-health";

export { resetEnvioHealthCache, type EnvioHealth };

/**
 * Is the indexer trustworthy right now?
 *
 * Delegates to `lib/envio-health`, which is deliberately free of project imports so it can be
 * tested under plain node. The chain head is supplied here, where the viem client lives.
 */
export async function envioHealth(client?: PublicClient): Promise<EnvioHealth> {
  return checkEnvioHealth({
    endpoint: process.env.NEXT_PUBLIC_ENVIO_ENDPOINT,
    getHead: async () => {
      const c =
        client ??
        (createPublicClient({
          chain: activeChain,
          transport: http(),
        }) as PublicClient);
      return c.getBlockNumber();
    },
  });
}

// --------------------------------------------------------------- chain fallback

/** The subset of an indexed row the catalogue actually needs. */
export interface CatalogueRow {
  id: string;
  tokenId: string;
  tokenURI: string;
  isArt: boolean;
  artist: string;
  /**
   * The Farcaster id the minter recorded for the artist, or 0 when none was given.
   *
   * Read but discarded until now, which is why every master rendered as a bare address: the
   * artist address on all five live masters is the deployer key, which has no Farcaster account,
   * so a by-address lookup could never answer. It is an unverified claim — `mintMaster` takes it
   * as an argument and never checks it against `msg.sender` — so `lib/artist-name.ts` treats a
   * name resolved from it as weaker than one resolved from the address.
   */
  artistFid: number;
  price: string;
  /**
   * Unix seconds from the registry's `createdAt`. Zero on the legacy contract, which stores no
   * mint time at all — a feed sorting on this must treat 0 as unknown rather than as 1970.
   */
  createdAt: number;
}

const REGISTRY_ABI = parseAbi([
  "function totalMasters() view returns (uint256)",
  "function tokenURI(uint256) view returns (string)",
  "function masterSuspended(uint256) view returns (bool)",
  "function masterPurged(uint256) view returns (bool)",
  "function getMaster(uint256) view returns (address artist, uint256 artistFid, uint64 createdAt, uint32 maxCollectorEditions, uint32 collectorsMinted, uint8 nftType, address referrer, uint96 royaltyShareBps, address royaltyShareSink)",
]);

const LEGACY_ABI = parseAbi([
  "function totalSupply() view returns (uint256)",
  "function masterTokens(uint256) view returns (uint256 artistFid, address originalArtist, string tokenURI, string collectorTokenURI, uint256 price, uint256 collectorPrice, uint256 totalSold, uint256 activeLicenses, uint256 maxCollectorEditions, uint256 collectorsMinted, bool active, uint8 nftType, uint96 royaltyPercentage)",
]);

/**
 * Read the catalogue straight from the contracts.
 *
 * Newest first, to match the indexer's `order_by: {mintedAt: desc}` — a fallback that silently
 * reorders the page is its own kind of wrong.
 *
 * Reads are per-master and unbatched. That is fine at this catalogue's size and deliberately
 * bounded by `limit`; if the catalogue grows enough for this to hurt, the answer is a working
 * indexer, not a multicall here.
 */
export async function readCatalogueFromChain(opts: {
  limit?: number;
  client?: PublicClient;
}): Promise<CatalogueRow[]> {
  const limit = opts.limit ?? 15;
  const client =
    opts.client ??
    (createPublicClient({
      chain: activeChain,
      transport: http(),
    }) as PublicClient);

  const nft = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined;
  if (!nft) return [];

  const v3 = isV3Contracts();
  const salesController = process.env.NEXT_PUBLIC_SALES_CONTROLLER as
    | Address
    | undefined;

  let total: bigint;
  try {
    total = (await client.readContract({
      address: nft,
      abi: v3 ? REGISTRY_ABI : LEGACY_ABI,
      functionName: v3 ? "totalMasters" : "totalSupply",
    })) as bigint;
  } catch {
    return [];
  }

  // Newest first, capped at `limit`. Ids are dense enough that taking the top `limit` and
  // dropping the gaps costs less than probing further down.
  const ids: bigint[] = [];
  for (let id = total; id >= 1n && ids.length < limit; id--) ids.push(id);
  if (ids.length === 0) return [];

  // One request instead of one per read.
  //
  // This loop used to await each call in turn: getMaster, tokenURI, price — three round trips
  // per master, ~150ms each, serialised. Five masters cost ~2-6 seconds, and the cause was
  // queueing rather than anything slow on-chain. `multicall` batches them into a single
  // eth_call, which needs `contracts.multicall3` declared on the chain (see app/chains.ts) or
  // viem silently degrades back to one request per call.
  //
  // `allowFailure` is on: a burned or purged id reverts, and one bad id must not take the
  // catalogue with it — the same reason the old loop caught per iteration.
  if (v3) {
    // All three start together. Prices depend only on the ids, not on anything getMaster
    // returns, so awaiting them afterwards added a whole round trip for no reason — measured at
    // ~500ms, which was a quarter of the endpoint's total time.
    //
    // Prices still go through `readMasterPrice`, which knows that v3 moved pricing to
    // SalesController and that `masterTokens` survives only as a view with hardcoded zeros.
    // Inlining that decision here to save one more round trip is how a price ends up right in
    // one place and wrong in another.
    const [masters, uris, prices] = await Promise.all([
      client.multicall({
        contracts: ids.map((id) => ({
          address: nft,
          abi: REGISTRY_ABI,
          functionName: "getMaster" as const,
          args: [id] as const,
        })),
        allowFailure: true,
      }),
      client.multicall({
        contracts: ids.map((id) => ({
          address: nft,
          abi: REGISTRY_ABI,
          functionName: "tokenURI" as const,
          args: [id] as const,
        })),
        allowFailure: true,
      }),
      Promise.all(
        ids.map((id) =>
          readMasterPrice(client, {
            nftAddress: nft,
            salesController,
            tokenId: id,
          }).catch(() => null),
        ),
      ),
    ]);

    const rows: CatalogueRow[] = [];
    ids.forEach((id, i) => {
      const m = masters[i];
      const u = uris[i];
      if (m?.status !== "success" || u?.status !== "success") return;

      const master = m.result as readonly unknown[];
      const artist = master[0] as string;
      if (!artist || artist === "0x0000000000000000000000000000000000000000")
        return;

      rows.push({
        id: `music-${activeChain.id}-${id}`,
        tokenId: id.toString(),
        tokenURI: u.result as string,
        isArt: Number(master[5]) === 1,
        artist: artist.toLowerCase(),
        price: (prices[i] ?? 0n).toString(),
        // getMaster returns MULTIPLE NAMED VALUES, which viem decodes as a positional tuple —
        // unlike a named struct, which decodes as an object. Index 1 is `artistFid`, index 2
        // `createdAt`. Reading these off by one yields a plausible number, not an error.
        artistFid: Number(master[1] ?? 0),
        createdAt: Number(master[2] ?? 0),
      });
    });
    return rows;
  }

  const legacy = await client.multicall({
    contracts: ids.map((id) => ({
      address: nft,
      abi: LEGACY_ABI,
      functionName: "masterTokens" as const,
      args: [id] as const,
    })),
    allowFailure: true,
  });

  const rows: CatalogueRow[] = [];
  ids.forEach((id, i) => {
    const entry = legacy[i];
    if (entry?.status !== "success") return;
    const m = entry.result as readonly unknown[];
    const artist = m[1] as string;
    if (!artist || artist === "0x0000000000000000000000000000000000000000")
      return;
    rows.push({
      id: `music-${activeChain.id}-${id}`,
      tokenId: id.toString(),
      tokenURI: m[2] as string,
      isArt: Number(m[11]) === 1,
      artist: artist.toLowerCase(),
      price: (m[4] as bigint).toString(),
      // The legacy layout puts artistFid FIRST and the artist address second — the opposite of
      // v3's. Swapping them here would name every track after a number.
      artistFid: Number(m[0] ?? 0),
      // `masterTokens` has no timestamp field, so the legacy contract genuinely cannot say when
      // a master was minted. 0 means unknown here, not 1970.
      createdAt: 0,
    });
  });
  return rows;
}

/**
 * Drop masters that have been taken down.
 *
 * ## Why this is here and not in the chain reader
 *
 * It was in the chain reader first, which looked right and was not: `getCatalogue` returns
 * indexer rows untouched when the indexer is fresh, so the filter simply would not run. Envio
 * does not track v3 suspension, so a suspended track would have reappeared the day the indexer
 * recovered — and that would have been invisible in testing, because the indexer has been dead
 * since 2026-08-01 and every test would have exercised the chain path.
 *
 * Applied to whichever rows come back, it cannot be bypassed by a source.
 *
 * ## Fail closed
 *
 * If the moderation read fails, the rows are dropped rather than served. Everywhere else in this
 * module a degraded RPC falls back to something usable, because showing a stale catalogue beats
 * showing none. Not here: the cost of wrongly hiding a track is that it is missing for a few
 * minutes, and the cost of wrongly showing one is serving material somebody demanded be pulled.
 */
async function filterModerated(
  rows: CatalogueRow[],
  client: PublicClient,
): Promise<CatalogueRow[]> {
  if (rows.length === 0) return rows;
  if (!isV3Contracts()) return rows; // V2 has no suspension concept

  const nft = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined;
  if (!nft) return rows;

  try {
    // Batched for the same reason as the catalogue read above: this runs on every request, on
    // both source paths, so two sequential round trips per track would have handed back the
    // latency multicall was introduced to remove.
    const ids = rows.map((row) => BigInt(row.tokenId));
    const [suspended, purged] = await Promise.all([
      client.multicall({
        contracts: ids.map((id) => ({
          address: nft,
          abi: REGISTRY_ABI,
          functionName: "masterSuspended" as const,
          args: [id] as const,
        })),
        allowFailure: true,
      }),
      client.multicall({
        contracts: ids.map((id) => ({
          address: nft,
          abi: REGISTRY_ABI,
          functionName: "masterPurged" as const,
          args: [id] as const,
        })),
        allowFailure: true,
      }),
    ]);

    // Fail closed per row as well as overall: a read that did not come back is treated as
    // "cannot confirm this is allowed", which for a takedown means hide it.
    const flags = rows.map((_, i) => {
      const s = suspended[i];
      const p = purged[i];
      if (s?.status !== "success" || p?.status !== "success") return true;
      return Boolean(s.result) || Boolean(p.result);
    });

    return rows.filter((_, i) => !flags[i]);
  } catch {
    return [];
  }
}

/**
 * The catalogue, from whichever source is currently trustworthy.
 *
 * `source` is returned rather than logged only, so the caller can surface it: an operator
 * seeing "chain" for a week is the signal that the indexer bill went unpaid, which is exactly
 * the failure that produced this module.
 */
export async function getCatalogue(opts?: {
  limit?: number;
  client?: PublicClient;
  fetchFromEnvio?: () => Promise<CatalogueRow[]>;
}): Promise<{
  rows: CatalogueRow[];
  source: "envio" | "chain";
  reason: string;
}> {
  const health = await envioHealth(opts?.client);

  // The moderation filter needs a client whichever path is taken, so build one once here rather
  // than twice below.
  const resolved =
    opts?.client ??
    (createPublicClient({
      chain: activeChain,
      transport: http(),
    }) as PublicClient);

  if (health.healthy && opts?.fetchFromEnvio) {
    try {
      const rows = await opts.fetchFromEnvio();
      // A fresh indexer returning nothing is not proof the catalogue is empty — it is far more
      // likely a schema or query problem. Fall through to the chain and let it disagree.
      if (rows.length > 0) {
        return {
          rows: await filterModerated(rows, resolved),
          source: "envio",
          reason: health.reason,
        };
      }
    } catch {
      // fall through
    }
  }

  const rows = await readCatalogueFromChain({
    limit: opts?.limit,
    client: opts?.client,
  });
  return {
    rows: await filterModerated(rows, resolved),
    source: "chain",
    reason: health.healthy ? "indexer returned nothing usable" : health.reason,
  };
}
