import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbiItem, formatEther, formatUnits, defineChain } from 'viem';

const VAULT_CONTRACT = (process.env.VAULT_CONTRACT || '') as `0x${string}`;
// Force public RPC for getLogs - Alchemy free tier has 10-block range limit
const MONAD_RPC = 'https://rpc.monad.xyz';
const LOGS_CHUNK = 100n; // Monad public RPC limits eth_getLogs to 100 blocks

const monad = defineChain({
  id: 143,
  name: 'Monad',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC] } },
});

const WMON_ADDRESS = '0x3bd359C1119dA7Da1D913D1C4D2B7c461115433A'.toLowerCase();

const TOKEN_NAMES: Record<string, string> = {
  '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': 'WMON',
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': 'USDC',
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': 'USDT0',
  '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242': 'WETH',
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': 'WBTC',
};

const TOKEN_DECIMALS: Record<string, number> = {
  '0x3bd359c1119da7da1d913d1c4d2b7c461115433a': 18,
  '0x754704bc059f8c67012fed69bc8a327a5aafb603': 6,
  '0xe7cd86e13ac4309349f30b3435a9d337750fc82d': 6,
  '0xee8c0e9f1bffb4eb878d8f15f368a02a35481242': 18,
  '0x0555e30da8f98308edb960aa94c0db47230d2b9c': 8,
};

const TradeExecutedAbi = parseAbiItem(
  'event TradeExecuted(uint8 indexed agentId, address indexed router, address tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut)'
);

const DepositedAbi = parseAbiItem(
  'event Deposited(uint8 indexed agentId, address indexed user, uint256 amount, uint256 sharesMinted)'
);

const WithdrawnAbi = parseAbiItem(
  'event Withdrawn(uint8 indexed agentId, address indexed user, uint256 sharesBurned, uint256 amountOut, uint256 performanceFee)'
);

// Per-agent cache: refresh at most every 10s
const caches: Record<number, { data: any; ts: number }> = {};

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const agentIdParam = url.searchParams.get('agentId');

  if (agentIdParam === null) {
    return NextResponse.json({ error: 'Missing agentId query parameter' }, { status: 400 });
  }

  const agentId = parseInt(agentIdParam, 10);
  if (isNaN(agentId) || agentId < 0 || agentId > 7) {
    return NextResponse.json({ error: 'agentId must be 0-7' }, { status: 400 });
  }

  const now = Date.now();
  if (caches[agentId]?.data && now - caches[agentId].ts < 10000) {
    return NextResponse.json(caches[agentId].data);
  }

  if (!VAULT_CONTRACT || VAULT_CONTRACT === '0x') {
    return NextResponse.json({ error: 'VAULT_CONTRACT not configured' }, { status: 500 });
  }

  try {
    const client = createPublicClient({ chain: monad, transport: http(MONAD_RPC) });
    const latestBlock = await client.getBlockNumber();
    // Look back ~1000 blocks (~50 min at ~3s blocks on Monad)
    const fromBlock = latestBlock > 1000n ? latestBlock - 1000n : 0n;

    // Paginated getLogs: Monad RPC limits eth_getLogs to 100 blocks per request
    async function getLogsPaginated(event: any): Promise<any[]> {
      const allLogs: any[] = [];
      for (let start = fromBlock; start <= latestBlock; start += LOGS_CHUNK) {
        const end = start + LOGS_CHUNK - 1n > latestBlock ? latestBlock : start + LOGS_CHUNK - 1n;
        try {
          const chunk = await client.getLogs({
            address: VAULT_CONTRACT,
            event,
            fromBlock: start,
            toBlock: end,
          });
          allLogs.push(...chunk);
        } catch (chunkErr: any) {
          console.warn(`[VaultHistory] Chunk ${start}-${end} failed:`, chunkErr.message?.slice(0, 100));
        }
      }
      return allLogs;
    }

    const [tradeLogs, depositLogs, withdrawLogs] = await Promise.all([
      getLogsPaginated(TradeExecutedAbi),
      getLogsPaginated(DepositedAbi),
      getLogsPaginated(WithdrawnAbi),
    ]);

    // Filter by agentId client-side (more compatible than RPC-level args filter)
    const filterByAgent = (logs: any[]) => logs.filter(l => Number(l.args?.agentId) === agentId);
    const filteredTrades = filterByAgent(tradeLogs);
    const filteredDeposits = filterByAgent(depositLogs);
    const filteredWithdrawals = filterByAgent(withdrawLogs);

    const trades = filteredTrades.map(log => {
      const tokenIn = (log.args.tokenIn as string).toLowerCase();
      const tokenOut = (log.args.tokenOut as string).toLowerCase();
      const amountIn = log.args.amountIn as bigint;
      const amountOut = log.args.amountOut as bigint;

      const action = tokenIn === WMON_ADDRESS ? 'BUY' : 'SELL';
      const token = tokenIn === WMON_ADDRESS ? tokenOut : tokenIn;

      return {
        type: 'trade',
        action,
        tokenIn: TOKEN_NAMES[tokenIn] || tokenIn,
        tokenOut: TOKEN_NAMES[tokenOut] || tokenOut,
        amountIn: formatUnits(amountIn, TOKEN_DECIMALS[tokenIn] || 18),
        amountOut: formatUnits(amountOut, TOKEN_DECIMALS[tokenOut] || 18),
        router: log.args.router as string,
        blockNumber: Number(log.blockNumber),
        txHash: log.transactionHash,
      };
    });

    const deposits = filteredDeposits.map(log => ({
      type: 'deposit',
      user: log.args.user as string,
      amount: formatEther(log.args.amount as bigint),
      sharesMinted: formatEther(log.args.sharesMinted as bigint),
      blockNumber: Number(log.blockNumber),
      txHash: log.transactionHash,
    }));

    const withdrawals = filteredWithdrawals.map(log => ({
      type: 'withdrawal',
      user: log.args.user as string,
      sharesBurned: formatEther(log.args.sharesBurned as bigint),
      amountOut: formatEther(log.args.amountOut as bigint),
      performanceFee: formatEther(log.args.performanceFee as bigint),
      blockNumber: Number(log.blockNumber),
      txHash: log.transactionHash,
    }));

    // Merge and sort by block number (most recent first)
    const history = [...trades, ...deposits, ...withdrawals]
      .sort((a, b) => b.blockNumber - a.blockNumber)
      .slice(0, 50);

    const result = {
      agentId,
      history,
      fromBlock: Number(fromBlock),
      toBlock: Number(latestBlock),
      timestamp: now,
    };

    caches[agentId] = { data: result, ts: now };
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('[VaultHistory] Error:', err.message);
    if (caches[agentId]?.data) return NextResponse.json(caches[agentId].data);
    return NextResponse.json({
      error: 'Failed to fetch vault history',
      detail: err.message?.slice(0, 200),
      vault: VAULT_CONTRACT?.slice(0, 10) + '...',
    }, { status: 500 });
  }
}
