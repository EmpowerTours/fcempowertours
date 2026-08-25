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
  price: string;
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

  const rows: CatalogueRow[] = [];
  for (let id = total; id >= 1n && rows.length < limit; id--) {
    try {
      if (v3) {
        const master = (await client.readContract({
          address: nft,
          abi: REGISTRY_ABI,
          functionName: "getMaster",
          args: [id],
        })) as readonly unknown[];
        // Named return values decode as a tuple, not an object: artist is [0], nftType is [5].
        const artist = master[0] as string;
        if (!artist || artist === "0x0000000000000000000000000000000000000000")
          continue;

        // Moderation state, which this reader ignored until 2026-08-24.
        //
        // `setMasterSuspended` and `purgeMaster` exist so a track can be taken down, and the
        // registry records a stated reason for each. None of that reached a listener: the only
        // condition here was `artist != 0`, so a suspended master stayed in the catalogue and
        // kept playing. A takedown that does not take anything down is worse than no takedown,
        // because someone believes it worked.
        //
        // Read together, and both excluded. A purge is irreversible by construction; a
        // suspension is not, so an unsuspended master returns on the next read with no cache to
        // clear.
        const [suspended, purged] = (await Promise.all([
          client.readContract({
            address: nft,
            abi: REGISTRY_ABI,
            functionName: "masterSuspended",
            args: [id],
          }),
          client.readContract({
            address: nft,
            abi: REGISTRY_ABI,
            functionName: "masterPurged",
            args: [id],
          }),
        ])) as [boolean, boolean];
        if (suspended || purged) continue;

        const tokenURI = (await client.readContract({
          address: nft,
          abi: REGISTRY_ABI,
          functionName: "tokenURI",
          args: [id],
        })) as string;

        const price = await readMasterPrice(client, {
          nftAddress: nft,
          salesController,
          tokenId: id,
        });

        rows.push({
          id: `music-${activeChain.id}-${id}`,
          tokenId: id.toString(),
          tokenURI,
          isArt: Number(master[5]) === 1,
          artist: artist.toLowerCase(),
          price: (price ?? 0n).toString(),
        });
      } else {
        const m = (await client.readContract({
          address: nft,
          abi: LEGACY_ABI,
          functionName: "masterTokens",
          args: [id],
        })) as readonly unknown[];
        const artist = m[1] as string;
        if (!artist || artist === "0x0000000000000000000000000000000000000000")
          continue;
        rows.push({
          id: `music-${activeChain.id}-${id}`,
          tokenId: id.toString(),
          tokenURI: m[2] as string,
          isArt: Number(m[11]) === 1,
          artist: artist.toLowerCase(),
          price: (m[4] as bigint).toString(),
        });
      }
    } catch {
      // A burned or purged id. Skip it rather than truncating the catalogue at the gap.
      continue;
    }
  }

  return rows;
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

  if (health.healthy && opts?.fetchFromEnvio) {
    try {
      const rows = await opts.fetchFromEnvio();
      // A fresh indexer returning nothing is not proof the catalogue is empty — it is far more
      // likely a schema or query problem. Fall through to the chain and let it disagree.
      if (rows.length > 0)
        return { rows, source: "envio", reason: health.reason };
    } catch {
      // fall through
    }
  }

  const rows = await readCatalogueFromChain({
    limit: opts?.limit,
    client: opts?.client,
  });
  return {
    rows,
    source: "chain",
    reason: health.healthy ? "indexer returned nothing usable" : health.reason,
  };
}
