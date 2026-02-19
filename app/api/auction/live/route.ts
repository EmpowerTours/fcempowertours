import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem } from 'viem';

const AUCTION_CONTRACT = '0x0992f5E8a2d9709d7897F413Ef294c47a18D029e' as `0x${string}`;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

// Simple in-memory cache: refresh at most every 4s
let cache: { intents: any[]; ts: number } = { intents: [], ts: 0 };

const IntentPostedAbi  = parseAbiItem('event IntentPosted(uint256 indexed intentId, address indexed user, uint256 amountIn, address tokenIn, address tokenOut, uint32 destChain)');
const BidSubmittedAbi  = parseAbiItem('event BidSubmitted(uint256 indexed intentId, address indexed agent, uint256 promisedOut)');
const IntentExecutedAbi = parseAbiItem('event IntentExecuted(uint256 indexed intentId, address indexed winner)');

export async function GET() {
  const now = Date.now();
  if (now - cache.ts < 4000) {
    return NextResponse.json({ intents: cache.intents });
  }

  try {
    const client = createPublicClient({
      transport: http(MONAD_RPC),
    });

    const latestBlock = await client.getBlockNumber();
    // Look back ~100 blocks (~5 min on Monad at ~3s block time)
    const fromBlock = latestBlock > 100n ? latestBlock - 100n : 0n;

    const [postedLogs, bidLogs, executedLogs] = await Promise.all([
      client.getLogs({ address: AUCTION_CONTRACT, event: IntentPostedAbi,   fromBlock }),
      client.getLogs({ address: AUCTION_CONTRACT, event: BidSubmittedAbi,   fromBlock }),
      client.getLogs({ address: AUCTION_CONTRACT, event: IntentExecutedAbi, fromBlock }),
    ]);

    // Build intent map
    const intentMap = new Map<string, { intentId: string; user: string; bidCount: number; executed: boolean }>();

    for (const log of postedLogs) {
      const id = log.args.intentId?.toString() ?? '?';
      intentMap.set(id, {
        intentId: id,
        user:     (log.args.user as string) ?? '',
        bidCount: 0,
        executed: false,
      });
    }

    for (const log of bidLogs) {
      const id = log.args.intentId?.toString() ?? '?';
      const existing = intentMap.get(id);
      if (existing) existing.bidCount++;
    }

    for (const log of executedLogs) {
      const id = log.args.intentId?.toString() ?? '?';
      const existing = intentMap.get(id);
      if (existing) existing.executed = true;
    }

    // Most recent first
    const intents = [...intentMap.values()].reverse().slice(0, 10);

    cache = { intents, ts: now };
    return NextResponse.json({ intents });
  } catch (err: any) {
    // Return stale cache on error rather than empty
    return NextResponse.json({ intents: cache.intents });
  }
}
