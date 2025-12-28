import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, Address, parseAbi } from 'viem';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com';
const RESONANCE_LANDS_ADDRESS = process.env.NEXT_PUBLIC_RESONANCE_LANDS as Address | undefined;

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC] } },
};

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC),
});

// ResonanceLands ABI for fetching lands
const resonanceLandsAbi = parseAbi([
  'function landCount() view returns (uint256)',
  'function getLand(uint256 landId) view returns (uint256 ownerFid, address ownerAddress, string name, string country, string region, int256 latitude, int256 longitude, uint256 totalArea, uint256 plotSize, uint256 totalPlots, uint256 pricePerPlotPerDay, bool active, bool verified, uint256 totalLeases, uint256 totalEarnings)',
  'function getAvailablePlots(uint256 landId) view returns (uint256[])',
]);

interface LandListItem {
  landId: number;
  ownerFid: number;
  ownerAddress: string;
  name: string;
  description: string;
  country: string;
  region: string;
  totalArea: number;
  plotSize: number;
  totalPlots: number;
  availablePlots: number[];
  pricePerPlotPerDay: string;
  verified: boolean;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

/**
 * List all available lands
 * GET /api/lands/list
 */
export async function GET(req: NextRequest) {
  try {
    // If ResonanceLands contract not deployed yet, return empty list
    if (!RESONANCE_LANDS_ADDRESS) {
      return NextResponse.json({
        success: true,
        lands: [],
        message: 'ResonanceLands contract not deployed yet',
      });
    }

    // Get total land count
    let landCount = 0n;
    try {
      landCount = await publicClient.readContract({
        address: RESONANCE_LANDS_ADDRESS,
        abi: resonanceLandsAbi,
        functionName: 'landCount',
      }) as bigint;
    } catch (err) {
      console.log('[Lands] landCount check failed:', err);
      return NextResponse.json({
        success: true,
        lands: [],
        message: 'Failed to fetch land count',
      });
    }

    if (landCount === 0n) {
      return NextResponse.json({
        success: true,
        lands: [],
      });
    }

    // Fetch all lands
    const lands: LandListItem[] = [];

    for (let i = 1n; i <= landCount; i++) {
      try {
        const landData = await publicClient.readContract({
          address: RESONANCE_LANDS_ADDRESS,
          abi: resonanceLandsAbi,
          functionName: 'getLand',
          args: [i],
        }) as [bigint, string, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean, bigint, bigint];

        // Only include active/approved lands
        if (!landData[11]) continue; // active flag

        // Get available plots
        let availablePlots: number[] = [];
        try {
          const plots = await publicClient.readContract({
            address: RESONANCE_LANDS_ADDRESS,
            abi: resonanceLandsAbi,
            functionName: 'getAvailablePlots',
            args: [i],
          }) as bigint[];
          availablePlots = plots.map(p => Number(p));
        } catch (err) {
          // If getAvailablePlots fails, assume all plots are available
          const totalPlots = Number(landData[9]);
          availablePlots = Array.from({ length: totalPlots }, (_, idx) => idx);
        }

        lands.push({
          landId: Number(i),
          ownerFid: Number(landData[0]),
          ownerAddress: landData[1],
          name: landData[2],
          description: '', // Not stored on-chain in this version
          country: landData[3],
          region: landData[4],
          totalArea: Number(landData[7]),
          plotSize: Number(landData[8]),
          totalPlots: Number(landData[9]),
          availablePlots,
          pricePerPlotPerDay: (Number(landData[10]) / 1e18).toFixed(2),
          verified: landData[12],
          status: 'APPROVED', // Only showing approved lands
        });
      } catch (err) {
        console.error(`[Lands] Failed to fetch land ${i}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      lands,
      totalCount: lands.length,
    });

  } catch (error: any) {
    console.error('[Lands] List error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to list lands',
    }, { status: 500 });
  }
}
