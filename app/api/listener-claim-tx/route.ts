import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import {
  createPublicClient,
  decodeEventLog,
  http,
  parseAbi,
  type Address,
  type Hex,
} from "viem";

/**
 * Listener claim receipts.
 *
 * Records which transaction paid out which month, so the UI can link a claimed
 * month straight to its Monadscan transaction.
 *
 * This cannot be derived on demand: Monad's public RPC caps eth_getLogs at a
 * 100-block range, so scanning history for ListenerClaimed events is not
 * viable, and Envio does not index ListenerRewardPool.
 *
 * POST is UNAUTHENTICATED but not trusting — it fetches the receipt and only
 * stores what the chain confirms: the transaction must be successful, emitted
 * by the pool, and carry a ListenerClaimed event naming that listener and
 * month. A caller therefore cannot record a claim that did not happen, and
 * anyone may backfill a transaction they did not send.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const LISTENER_REWARD_POOL = process.env
  .NEXT_PUBLIC_LISTENER_REWARD_POOL as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || "https://rpc.monad.xyz";

const CLAIMED_EVENT = parseAbi([
  "event ListenerClaimed(uint256 indexed monthId, address indexed listener, uint256 amount)",
]);

/** Redis hash per listener: field = monthId, value = txHash. */
const key = (address: string) => `listener-claim-tx:${address.toLowerCase()}`;

async function client() {
  const { activeChain } = await import("@/app/chains");
  return createPublicClient({ chain: activeChain, transport: http(MONAD_RPC) });
}

export async function GET(req: NextRequest) {
  try {
    const address = new URL(req.url).searchParams.get("address");
    if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: "valid address parameter required" },
        { status: 400 },
      );
    }

    const map =
      (await redis.hgetall<Record<string, string>>(key(address))) || {};
    return NextResponse.json({ success: true, txByMonth: map });
  } catch (error: any) {
    console.error("[ClaimTx] read failed:", error?.message);
    // A missing receipt map must never break the earnings UI.
    return NextResponse.json({ success: true, txByMonth: {} });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { txHash } = await req.json();

    if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
      return NextResponse.json(
        { success: false, error: "valid txHash required" },
        { status: 400 },
      );
    }
    if (!LISTENER_REWARD_POOL) {
      return NextResponse.json(
        { success: false, error: "Listener reward pool not configured" },
        { status: 500 },
      );
    }

    const publicClient = await client();

    // Wait rather than read: the mini app records the hash the moment the wallet
    // returns it, which is before the transaction is mined. Monad blocks are
    // fast, so a short bounded wait covers it without holding the request open.
    const receipt = await publicClient.waitForTransactionReceipt({
      hash: txHash as Hex,
      timeout: 30_000,
      confirmations: 1,
    });

    if (receipt.status !== "success") {
      return NextResponse.json(
        { success: false, error: "Transaction did not succeed" },
        { status: 400 },
      );
    }

    // Only ListenerClaimed events emitted by the pool itself are believed.
    const recorded: { monthId: string; listener: string }[] = [];
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== LISTENER_REWARD_POOL.toLowerCase())
        continue;
      try {
        const decoded = decodeEventLog({
          abi: CLAIMED_EVENT,
          data: log.data,
          topics: log.topics,
        });
        if (decoded.eventName !== "ListenerClaimed") continue;

        const monthId = String(decoded.args.monthId);
        const listener = String(decoded.args.listener).toLowerCase();
        await redis.hset(key(listener), { [monthId]: txHash });
        recorded.push({ monthId, listener });
      } catch {
        // Not a ListenerClaimed log; ignore.
      }
    }

    if (recorded.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error:
            "No ListenerClaimed event from the reward pool in that transaction",
        },
        { status: 400 },
      );
    }

    return NextResponse.json({ success: true, recorded });
  } catch (error: any) {
    console.error("[ClaimTx] record failed:", error?.message);
    return NextResponse.json(
      { success: false, error: error?.message || "Failed to record claim tx" },
      { status: 500 },
    );
  }
}
