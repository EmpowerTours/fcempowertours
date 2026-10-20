import { redis } from "@/lib/redis";

/**
 * One-time payment receipts for live-radio paid actions.
 *
 * execute-delegated records a receipt after the payment lands. The live-radio
 * submit consumes it atomically (GETDEL), so a submission is only applied when
 * the proven caller actually paid for that kind, and each payment can be used
 * once. Covers voice notes/ads (legacy) plus queue and skip.
 */

export type RadioPaymentKind = "shoutout" | "ad" | "queue" | "skip";

/** @deprecated Prefer RadioPaymentKind — kept for existing voice-note imports. */
export type VoiceNoteType = "shoutout" | "ad";

type Receipt = { user: string; kind: RadioPaymentKind };

const TTL_SECONDS = 60 * 60;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

const key = (txHash: string) => `radio:payment-receipt:${txHash.toLowerCase()}`;
/** Legacy key from the voice-note-only receipt module. Still consumed. */
const legacyKey = (txHash: string) =>
  `radio:voice-receipt:${txHash.toLowerCase()}`;

export async function recordRadioPaymentReceipt(
  txHash: string,
  userAddress: string,
  kind: RadioPaymentKind,
): Promise<void> {
  if (!TX_HASH_RE.test(txHash)) return;
  const receipt: Receipt = { user: userAddress.toLowerCase(), kind };
  await redis.set(key(txHash), JSON.stringify(receipt), { ex: TTL_SECONDS });
}

/**
 * True only when an unused receipt exists for this tx, paid by `userAddress`
 * for `kind`. The receipt is deleted on read either way. Fails closed.
 */
export async function consumeRadioPaymentReceipt(
  txHash: unknown,
  userAddress: string,
  kind: RadioPaymentKind,
): Promise<boolean> {
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) return false;
  const wantUser = userAddress.toLowerCase();
  try {
    const raw = await redis.getdel<Receipt | string>(key(txHash));
    if (raw) {
      const r: Receipt = typeof raw === "string" ? JSON.parse(raw) : raw;
      return r.user === wantUser && r.kind === kind;
    }
    // Voice notes recorded before this module may still sit under the legacy key.
    if (kind === "shoutout" || kind === "ad") {
      const legacy = await redis.getdel<{ user: string; noteType: string } | string>(
        legacyKey(txHash),
      );
      if (!legacy) return false;
      const r =
        typeof legacy === "string" ? JSON.parse(legacy) : legacy;
      return r.user === wantUser && r.noteType === kind;
    }
    return false;
  } catch {
    return false;
  }
}

/** Back-compat wrappers used by execute-delegated / live-radio voice paths. */
export async function recordVoiceNoteReceipt(
  txHash: string,
  userAddress: string,
  noteType: VoiceNoteType,
): Promise<void> {
  return recordRadioPaymentReceipt(txHash, userAddress, noteType);
}

export async function consumeVoiceNoteReceipt(
  txHash: unknown,
  userAddress: string,
  noteType: VoiceNoteType,
): Promise<boolean> {
  return consumeRadioPaymentReceipt(txHash, userAddress, noteType);
}
