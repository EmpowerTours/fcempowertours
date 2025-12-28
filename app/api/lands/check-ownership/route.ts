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

// ResonanceLands ABI for land ownership checks
const resonanceLandsAbi = parseAbi([
  'function isLandOwner(uint256 fid) view returns (bool)',
  'function getLandsByFid(uint256 fid) view returns (uint256[])',
  'function getLand(uint256 landId) view returns (uint256 ownerFid, address ownerAddress, string name, string country, string region, int256 latitude, int256 longitude, uint256 totalArea, uint256 plotSize, uint256 totalPlots, uint256 pricePerPlotPerDay, bool active, bool verified, uint256 totalLeases, uint256 totalEarnings)',
]);

interface LandSummary {
  landId: number;
  name: string;
  country: string;
  region: string;
  totalArea: number;      // in m²
  totalPlots: number;
  verified: boolean;
}

/**
 * Check if a Farcaster user owns land on ResonanceLands
 * GET /api/lands/check-ownership?fid=12345
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fidParam = searchParams.get('fid');

    if (!fidParam) {
      return NextResponse.json({ error: 'FID parameter required' }, { status: 400 });
    }

    const fid = BigInt(fidParam);

    // If ResonanceLands contract not deployed yet, return empty
    if (!RESONANCE_LANDS_ADDRESS) {
      return NextResponse.json({
        success: true,
        isLandOwner: false,
        lands: [],
        message: 'ResonanceLands contract not deployed yet',
      });
    }

    // Check if user owns any land
    let isLandOwner = false;
    try {
      isLandOwner = await publicClient.readContract({
        address: RESONANCE_LANDS_ADDRESS,
        abi: resonanceLandsAbi,
        functionName: 'isLandOwner',
        args: [fid],
      }) as boolean;
    } catch (err) {
      console.log('[Lands] isLandOwner check failed:', err);
    }

    if (!isLandOwner) {
      return NextResponse.json({
        success: true,
        isLandOwner: false,
        lands: [],
      });
    }

    // Get user's lands
    const landIds = await publicClient.readContract({
      address: RESONANCE_LANDS_ADDRESS,
      abi: resonanceLandsAbi,
      functionName: 'getLandsByFid',
      args: [fid],
    }) as bigint[];

    // Fetch details for each land
    const lands: LandSummary[] = [];
    for (const landId of landIds) {
      try {
        const landData = await publicClient.readContract({
          address: RESONANCE_LANDS_ADDRESS,
          abi: resonanceLandsAbi,
          functionName: 'getLand',
          args: [landId],
        }) as [bigint, string, string, string, string, bigint, bigint, bigint, bigint, bigint, bigint, boolean, boolean, bigint, bigint];

        // Only include approved lands
        if (landData[11]) { // active
          lands.push({
            landId: Number(landId),
            name: landData[2],
            country: landData[3],
            region: landData[4],
            totalArea: Number(landData[7]),
            totalPlots: Number(landData[9]),
            verified: landData[12],
          });
        }
      } catch (err) {
        console.error(`[Lands] Failed to fetch land ${landId}:`, err);
      }
    }

    return NextResponse.json({
      success: true,
      isLandOwner: lands.length > 0,
      landCount: lands.length,
      lands,
    });

  } catch (error: any) {
    console.error('[Lands] Check ownership error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to check land ownership',
    }, { status: 500 });
  }
}
