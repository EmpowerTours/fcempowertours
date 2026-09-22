/**
 * Whether a master may still earn a play.
 *
 * ## The gap this closes
 *
 * `MusicSubscriptionV6.recordPlay` checks the subscription, the replay cooldown, the daily caps,
 * `getMasterType` and `artist != address(0)`. It does **not** check `masterSuspended`, and it
 * cannot be made to — the contract is deployed and immutable. Nor did any of the four off-chain
 * paths that drive the oracle.
 *
 * Suspension was therefore only ever a *display* control. `LicenseRegistry` line 684 computes
 * `active` for the legacy accessor, which is what stops LiveRadioV3 queueing a track, and
 * `lib/catalogue-source.ts` filters suspended rows out of the catalogue. Neither touches
 * crediting. A suspended master that reaches the oracle by any other route still increments
 * `artistMonthlyPlays` and `artistLifetimePlays` for its artist, and those are the two numbers
 * the monthly WMON pool is divided by.
 *
 * Read off mainnet 2026-09-21: masters 1–5 are suspended, carry 8 lifetime plays and **3 of the
 * 4 plays in month 690**, and are attributed to the deployer key rather than the artist. That
 * month's 15 WMON pool is on course to pay three quarters of itself to the wrong address on
 * tracks that were taken down. Whether those three plays post-date the suspension could not be
 * established — the public RPC serves no archive state — so this defends the gap, and does not
 * claim it has been exploited.
 *
 * `docs/PRIORITIES.md` item A says the problem "has stopped growing". That was an observation,
 * not a control: it stopped because the catalogue no longer surfaces those masters, not because
 * anything refuses to credit them. This file is the control.
 *
 * ## Fail closed, and what that costs
 *
 * A read that does not come back means "cannot confirm this may earn", and the play is not
 * recorded. That is the same posture `lib/catalogue-source.ts` already takes for the same two
 * flags, and for the same reason: the failure modes are not symmetric. Refusing wrongly loses
 * one play; allowing wrongly pays the wrong person out of a pool shared by everyone else, in a
 * transaction nothing reverses.
 *
 * It is a takedown check, so it is deliberately not cached. A suspension exists to take effect
 * in seconds, and a TTL is exactly as long as it would keep paying afterwards.
 *
 * ## Check it once per track, not once per listener
 *
 * Suspension is a property of the master, not of who is listening. The radio and venue paths
 * loop over listeners for a single track, so the check belongs outside that loop — one read per
 * broadcast rather than one per listener.
 */

import { parseAbi, type Address, type PublicClient } from "viem";
import { isV3Contracts } from "./contract-generation";

const REGISTRY_ABI = parseAbi([
  "function masterSuspended(uint256) view returns (bool)",
  "function masterPurged(uint256) view returns (bool)",
  "function getMaster(uint256) view returns (address artist, uint256 artistFid, uint64 createdAt, uint32 maxCollectorEditions, uint32 collectorsMinted, uint8 nftType, address referrer, uint96 royaltyShareBps, address royaltyShareSink)",
]);

const ZERO = "0x0000000000000000000000000000000000000000";

/**
 * The pre-v3 contract has no suspension mapping; `active` on its master struct is the analogue.
 *
 * viem hands a multi-output function back as a positional tuple rather than an object, so this
 * is read by index — the one case `lib/contract-generation.ts` cannot avoid. The index is named
 * below rather than inlined, and the contract is frozen, so the shift that
 * `tools/verify-monthly-stats-decode.ts` defends against cannot happen here.
 */
const LEGACY_ABI = parseAbi([
  "function masterTokens(uint256) view returns (uint256 artistFid, address originalArtist, string tokenURI, string collectorTokenURI, uint256 price, uint256 collectorPrice, uint256 totalSold, uint256 activeLicenses, uint256 maxCollectorEditions, uint256 collectorsMinted, bool active, uint8 nftType, uint96 royaltyPercentage)",
]);

export interface PlayableVerdict {
  /** False means do not record a play. Never optimistic. */
  playable: boolean;
  /** Why, in a form worth putting in a log line. Empty when playable. */
  reason: string;
}

const PLAYABLE: PlayableVerdict = { playable: true, reason: "" };

/**
 * May this master earn a play right now?
 *
 * @param tokenId the master token id, as the oracle call takes it
 * @param client  reuse a caller's viem client; one is created when omitted
 */
export async function isMasterPlayable(
  tokenId: string | number | bigint,
  client?: PublicClient,
): Promise<PlayableVerdict> {
  const registry = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address | undefined;
  if (!registry) {
    return {
      playable: false,
      reason: "NEXT_PUBLIC_NFT_CONTRACT unset — cannot check for a takedown",
    };
  }

  let id: bigint;
  try {
    id = BigInt(tokenId);
  } catch {
    return { playable: false, reason: `unreadable token id ${tokenId}` };
  }

  const read = client ?? (await defaultClient());

  if (!isV3Contracts()) {
    // The legacy contract keeps one boolean where v3 keeps two. Same fail-closed treatment:
    // a master we cannot read is a master we do not pay for.
    try {
      const master = await read.readContract({
        address: registry,
        abi: LEGACY_ABI,
        functionName: "masterTokens",
        args: [id],
      });
      const LEGACY_ACTIVE = 10; // masterTokens(...).active, the eleventh field
      return master[LEGACY_ACTIVE]
        ? PLAYABLE
        : { playable: false, reason: `master ${id} is inactive` };
    } catch (error) {
      return {
        playable: false,
        reason: `could not read master ${id}: ${errText(error)}`,
      };
    }
  }

  try {
    const [suspended, purged, master] = await Promise.all([
      read.readContract({
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "masterSuspended",
        args: [id],
      }),
      read.readContract({
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "masterPurged",
        args: [id],
      }),
      read.readContract({
        address: registry,
        abi: REGISTRY_ABI,
        functionName: "getMaster",
        args: [id],
      }),
    ]);

    if (purged) return { playable: false, reason: `master ${id} is purged` };
    if (suspended)
      return { playable: false, reason: `master ${id} is suspended` };

    // A master that does not exist reads suspended=false and purged=false, so the two flags
    // alone would wave id 999 through. recordPlay requires `artist != address(0)` and would
    // revert — but Monad charges the FULL gas limit on a revert, refunding nothing, so buying
    // a guaranteed revert costs real MON. Refuse it here instead of paying to be told no.
    if (master[0].toLowerCase() === ZERO)
      return { playable: false, reason: `master ${id} does not exist` };

    return PLAYABLE;
  } catch (error) {
    return {
      playable: false,
      reason: `could not check master ${id} for a takedown: ${errText(error)}`,
    };
  }
}

/**
 * Log the refusal and say whether to proceed, so four call sites do not each invent a log line.
 * Returns true when the play may be recorded.
 */
export async function mayRecordPlay(
  tokenId: string | number | bigint,
  where: string,
  client?: PublicClient,
): Promise<boolean> {
  const verdict = await isMasterPlayable(tokenId, client);
  if (!verdict.playable) {
    console.warn(`[${where}] not recording a play: ${verdict.reason}`);
  }
  return verdict.playable;
}

/**
 * Built here rather than at module scope so importing this file costs nothing, and so the
 * `@/app/chains` import — which pulls the multicall3 declaration viem needs — stays dynamic, the
 * same shape `lib/epk/chain.ts` documents.
 */
async function defaultClient(): Promise<PublicClient> {
  const { createPublicClient, http } = await import("viem");
  const { activeChain } = await import("@/app/chains");
  return createPublicClient({
    chain: activeChain,
    transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || undefined),
  }) as PublicClient;
}

function errText(error: unknown): string {
  return error instanceof Error
    ? error.message.slice(0, 120)
    : String(error).slice(0, 120);
}
