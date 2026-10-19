import { redis } from "@/lib/redis";

/**
 * One-time payment receipts for live-radio voice notes and voice ads.
 *
 * execute-delegated records a receipt after the WMON payment lands. The
 * live-radio submit consumes it atomically (GETDEL), so a submission is only
 * queued -- and only cast by the bot -- when the proven caller actually paid
 * for that note type, and each payment can be used once.
 */

export type VoiceNoteType = "shoutout" | "ad";

type Receipt = { user: string; noteType: VoiceNoteType };

const TTL_SECONDS = 60 * 60;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

const key = (txHash: string) => `radio:voice-receipt:${txHash.toLowerCase()}`;

export async function recordVoiceNoteReceipt(
  txHash: string,
  userAddress: string,
  noteType: VoiceNoteType,
): Promise<void> {
  if (!TX_HASH_RE.test(txHash)) return;
  const receipt: Receipt = { user: userAddress.toLowerCase(), noteType };
  await redis.set(key(txHash), JSON.stringify(receipt), { ex: TTL_SECONDS });
}

/**
 * True only when an unused receipt exists for this tx, paid by `userAddress`
 * for `noteType`. The receipt is deleted on read either way. Fails closed.
 */
export async function consumeVoiceNoteReceipt(
  txHash: unknown,
  userAddress: string,
  noteType: VoiceNoteType,
): Promise<boolean> {
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) return false;
  try {
    const raw = await redis.getdel<Receipt | string>(key(txHash));
    if (!raw) return false;
    const r: Receipt = typeof raw === "string" ? JSON.parse(raw) : raw;
    return r.user === userAddress.toLowerCase() && r.noteType === noteType;
  } catch {
    return false;
  }
}
