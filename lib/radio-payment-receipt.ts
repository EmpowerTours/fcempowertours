import { redis } from "@/lib/redis";

/**
 * One-time payment receipts for live-radio paid actions.
 *
 * execute-delegated records a receipt after the payment lands. The live-radio
 * submit consumes it with an atomic compare-and-delete, so a submission is only applied when
 * the proven caller actually paid for that kind, and each payment can be used
 * once. Covers voice notes/ads (legacy) plus queue and skip.
 */

export type RadioPaymentKind = "shoutout" | "ad" | "queue" | "skip";

/** @deprecated Prefer RadioPaymentKind — kept for existing voice-note imports. */
export type VoiceNoteType = "shoutout" | "ad";

type Receipt = { user: string; kind: RadioPaymentKind; tokenId?: string };

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
  opts?: { tokenId?: string | number | bigint },
): Promise<void> {
  if (!TX_HASH_RE.test(txHash)) return;
  const receipt: Receipt = { user: userAddress.toLowerCase(), kind };
  if (opts?.tokenId !== undefined && opts.tokenId !== null) {
    receipt.tokenId = String(opts.tokenId);
  }
  // The payment has already landed on-chain when this runs, so a lost write
  // would strand a paid submission. Retry before giving up; the caller turns
  // a final failure into a non-success response instead of acknowledging it.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await redis.set(key(txHash), JSON.stringify(receipt), { ex: TTL_SECONDS });
      return;
    } catch (err) {
      lastErr = err;
      await new Promise((r) => setTimeout(r, 150 * (attempt + 1)));
    }
  }
  throw lastErr;
}

/**
 * Atomic compare-and-delete: the receipt is removed only when it belongs to
 * the expected wallet and kind (and token, when bound). A caller presenting
 * someone else's public txHash can no longer burn that receipt.
 */
const CAS_DELETE = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, r = pcall(cjson.decode, raw)
if not ok or type(r) ~= 'table' then return 0 end
if r.user ~= ARGV[1] then return 0 end
if ARGV[3] == 'legacy' then
  if r.noteType ~= ARGV[2] then return 0 end
else
  if r.kind ~= ARGV[2] then return 0 end
  if r.tokenId and ARGV[4] ~= '' and tostring(r.tokenId) ~= ARGV[4] then return 0 end
  if r.tokenId and ARGV[4] == '' and ARGV[2] == 'queue' then return 0 end
end
redis.call('DEL', KEYS[1])
return 1
`;

/**
 * True only when an unused receipt exists for this tx, paid by `userAddress`
 * for `kind` (and, for bound receipts, for `opts.tokenId`). The receipt is
 * deleted only on a match. Fails closed.
 */
export async function consumeRadioPaymentReceipt(
  txHash: unknown,
  userAddress: string,
  kind: RadioPaymentKind,
  opts?: { tokenId?: string | number | bigint },
): Promise<boolean> {
  if (typeof txHash !== "string" || !TX_HASH_RE.test(txHash)) return false;
  const wantUser = userAddress.toLowerCase();
  const wantToken =
    opts?.tokenId !== undefined && opts.tokenId !== null
      ? String(opts.tokenId)
      : "";
  try {
    const hit = await redis.eval<string[], number>(
      CAS_DELETE,
      [key(txHash)],
      [wantUser, kind, "v2", wantToken],
    );
    if (Number(hit) === 1) return true;
    // Voice notes recorded before this module may still sit under the legacy key.
    if (kind === "shoutout" || kind === "ad") {
      const legacyHit = await redis.eval<string[], number>(
        CAS_DELETE,
        [legacyKey(txHash)],
        [wantUser, kind, "legacy", ""],
      );
      return Number(legacyHit) === 1;
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
