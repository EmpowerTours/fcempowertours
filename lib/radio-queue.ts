/**
 * Song-queue tips, read from `LiveRadioV3`.
 *
 * ## Why this exists
 *
 * The Envio exit wrote tips off as unrecoverable, on the grounds that `LiveRadioV3` emits
 * `TipReceived` and keeps nothing — which would have put the history behind `eth_getLogs`, capped
 * at 100 blocks on the public RPC and 10 on the current key, i.e. out of reach at any tier
 * available to us.
 *
 * That was wrong. `queueSong` emits the event AND pushes a `QueuedSong` into `songQueue`, a public
 * array carrying `tipAmount` per entry. Nothing ever removes an entry — `queueHead` is a read
 * cursor, not a pop — so the array is the complete lifetime record and `getQueue(offset, limit)`
 * hands it back without touching a log.
 *
 * The lesson worth keeping: "the contract emits an event for X" says nothing about whether it also
 * stores X. Read the struct before declaring anything unrecoverable.
 *
 * ## Why the cap fails loudly
 *
 * A lifetime total that silently drops the oldest entries is worse than no total, because it looks
 * like a measured figure. The queue is empty today, so any cap is theoretical — but if it is ever
 * exceeded the caller is told the total is incomplete rather than handed a short one.
 */

import { parseAbi, type Address, type PublicClient } from "viem";

const RADIO_ABI = parseAbi([
  "function getQueueLength() view returns (uint256)",
  "function getQueue(uint256 offset, uint256 limit) view returns ((uint256 id, uint256 masterTokenId, address queuedBy, uint256 queuedByFid, uint256 queuedAt, uint256 paidAmount, uint256 tipAmount, bool played)[])",
]);

/** Entries per `getQueue` call. Large enough to be one request today, small enough to return. */
export const PAGE_SIZE = 500n;

/** Above this the total would be a partial one, so it is refused instead. */
export const MAX_ENTRIES = 10_000n;

export interface QueueEntry {
  queueId: string;
  masterTokenId: string;
  /** The address that queued the song — the tipper, when `tipAmount` is non-zero. */
  queuedBy: string;
  queuedAt: number;
  /** Queue fee, in wei. Goes to the platform, not the artist. */
  paidAmount: bigint;
  /** Tip, in wei. Transferred straight to the artist by `queueSong`. */
  tipAmount: bigint;
  played: boolean;
}

export interface RadioQueue {
  entries: QueueEntry[];
  /** True when the queue was longer than `MAX_ENTRIES`; totals below are then incomplete. */
  truncated: boolean;
  /** Total length reported by the contract, whether or not every entry was read. */
  length: number;
}

/**
 * Every queue entry, oldest first.
 *
 * @throws if the contract cannot be read. A caller that would rather show nothing than fail
 *   should catch — but it must not turn the failure into a zero.
 */
export async function readRadioQueue(
  client: PublicClient,
  radioAddress: Address,
): Promise<RadioQueue> {
  const length = (await client.readContract({
    address: radioAddress,
    abi: RADIO_ABI,
    functionName: "getQueueLength",
  })) as bigint;

  if (length === 0n) return { entries: [], truncated: false, length: 0 };

  const readable = length > MAX_ENTRIES ? MAX_ENTRIES : length;
  const entries: QueueEntry[] = [];

  for (let offset = 0n; offset < readable; offset += PAGE_SIZE) {
    const limit = offset + PAGE_SIZE > readable ? readable - offset : PAGE_SIZE;
    // `getQueue` returns an array of named structs, which viem decodes as OBJECTS. Multiple named
    // return values decode as a positional tuple instead; both shapes exist in this codebase, and
    // reading one as the other yields `undefined` everywhere rather than an error.
    const page = (await client.readContract({
      address: radioAddress,
      abi: RADIO_ABI,
      functionName: "getQueue",
      args: [offset, limit],
    })) as readonly {
      id: bigint;
      masterTokenId: bigint;
      queuedBy: string;
      queuedByFid: bigint;
      queuedAt: bigint;
      paidAmount: bigint;
      tipAmount: bigint;
      played: boolean;
    }[];

    for (const row of page) {
      entries.push({
        queueId: row.id.toString(),
        masterTokenId: row.masterTokenId.toString(),
        queuedBy: row.queuedBy,
        queuedAt: Number(row.queuedAt),
        paidAmount: row.paidAmount,
        tipAmount: row.tipAmount,
        played: row.played,
      });
    }
  }

  return {
    entries,
    truncated: length > MAX_ENTRIES,
    length: Number(length),
  };
}

/** The tipping entries for one artist's masters. Zero-tip queue entries are dropped. */
export function tipsForMasters(
  queue: RadioQueue,
  masterTokenIds: Set<string>,
): QueueEntry[] {
  return queue.entries.filter(
    (e) => e.tipAmount > 0n && masterTokenIds.has(e.masterTokenId),
  );
}
