import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, Address } from 'viem';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com';
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';


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

interface GuideObject {
  fid: string;
  username: string;
  displayName: string;
  pfpUrl: string;
  bio: string;
  location: string;
  languages: string;
  transport: string;
  registeredAt: string;
  lastUpdated: string;
  active: boolean;
  suspended: boolean;
  averageRating: string;
  ratingCount: number;
  totalBookings: number;
  completedBookings: number;
}

export async function GET() {
  try {
    // Query for active tour guides from Envio indexer
    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `
          query GetTourGuides {
            TourGuide(
              where: {
                active: {_eq: true},
                suspended: {_eq: false}
              },
              order_by: {registeredAt: desc},
              limit: 50
            ) {
              guideFid
              guideAddress
              username
              displayName
              pfpUrl
              bio
              location
              languages
              transport
              active
              suspended
              averageRating
              ratingCount
              totalBookings
              completedBookings
              registeredAt
              lastUpdated
            }
          }
        `
      }),
    });

    if (!response.ok) {
      throw new Error(`Envio query failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const guides = data.data?.TourGuide || [];

    console.log(`✅ Fetched ${guides.length} active tour guides from Envio`);

    // Transform to expected format
    const processedGuides: GuideObject[] = guides.map((guide: any) => ({
      fid: guide.guideFid,
      username: guide.username || 'unknown',
      displayName: guide.displayName || guide.username || 'Unknown Guide',
      pfpUrl: guide.pfpUrl || '',
      bio: guide.bio || '',
      location: guide.location || '',
      languages: guide.languages || '',
      transport: guide.transport || '',
      registeredAt: guide.registeredAt || '0',
      lastUpdated: guide.lastUpdated || '0',
      active: guide.active,
      suspended: guide.suspended,
      averageRating: guide.averageRating || '0',
      ratingCount: guide.ratingCount || 0,
      totalBookings: guide.totalBookings || 0,
      completedBookings: guide.completedBookings || 0,
    }));

    return NextResponse.json({
      success: true,
      guides: processedGuides,
      count: processedGuides.length,
    });

  } catch (error: any) {
    console.error('❌ Error fetching guides from Envio:', error);

    // Fallback: Query contract directly for known guide FIDs
    try {
      console.log('🔄 Falling back to direct contract query...');
      const guidesFromContract = await fetchGuidesFromContract();

      if (guidesFromContract.length > 0) {
        console.log(`✅ Found ${guidesFromContract.length} guides from contract`);
        return NextResponse.json({
          success: true,
          guides: guidesFromContract,
          count: guidesFromContract.length,
          source: 'contract-fallback',
        });
      }
    } catch (contractError) {
      console.error('❌ Contract fallback also failed:', contractError);
    }

    // Return empty but successful response when both fail
    return NextResponse.json({
      success: true,
      guides: [],
      count: 0,
      indexerUnavailable: true,
      message: 'Indexer temporarily unavailable. Guide registration still works on-chain.',
    });
  }
}

// Fallback function to query guides directly from contract via events
async function fetchGuidesFromContract(): Promise<GuideObject[]> {
  if (!REGISTRY_ADDRESS) {
    console.log('No registry address configured');
    return [];
  }

  // Event ABI for GuideRegistered
  const eventAbi = parseAbi([
    'event GuideRegistered(uint256 indexed guideFid, address indexed guideAddress, uint256 indexed passportTokenId, string[] countries)',
  ]);

  const registryAbi = parseAbi([
    'function isRegisteredGuide(uint256 guideFid) view returns (bool)',
    'function guides(uint256 guideFid) view returns (uint256 guideFid, address guideAddress, uint256 passportTokenId, uint256 hourlyRateWMON, uint256 hourlyRateTOURS, bool active, bool suspended, uint256 averageRating, uint256 ratingCount, uint256 totalBookings, uint256 totalCompletedTours, uint256 cancellationCount, string bio, string profileImageIPFS)',
  ]);

  try {
    // Get GuideRegistered events from the contract (last 50000 blocks ~= a few days)
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock > 50000n ? currentBlock - 50000n : 0n;

    console.log(`Fetching GuideRegistered events from block ${fromBlock} to ${currentBlock}`);

    const logs = await publicClient.getLogs({
      address: REGISTRY_ADDRESS,
      event: eventAbi[0],
      fromBlock,
      toBlock: currentBlock,
    });

    console.log(`Found ${logs.length} GuideRegistered events`);

    // Extract unique FIDs from events
    const fidSet = new Set<string>();
    for (const log of logs) {
      const guideFid = (log as any).args?.guideFid;
      if (guideFid) {
        fidSet.add(guideFid.toString());
      }
    }

    const guides: GuideObject[] = [];

    // Fetch details for each registered guide
    for (const fidStr of fidSet) {
      try {
        const fid = BigInt(fidStr);

        // Check if still registered (not unregistered)
        const isRegistered = await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: registryAbi,
          functionName: 'isRegisteredGuide',
          args: [fid],
        });

        if (!isRegistered) continue;

        // Get guide details
        const guideData = await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: registryAbi,
          functionName: 'guides',
          args: [fid],
        }) as any;

        // Skip if suspended or inactive
        if (guideData[6]) continue; // suspended
        if (!guideData[5]) continue; // not active

        // Fetch Farcaster profile
        let username = 'unknown';
        let displayName = 'Unknown Guide';
        let pfpUrl = '';

        try {
          const neynarResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidStr}`,
            { headers: { 'api_key': NEYNAR_API_KEY } }
          );
          if (neynarResponse.ok) {
            const neynarData = await neynarResponse.json();
            const fcUser = neynarData.users?.[0];
            if (fcUser) {
              username = fcUser.username || 'unknown';
              displayName = fcUser.display_name || username;
              pfpUrl = fcUser.pfp_url || '';
            }
          }
        } catch (neynarError) {
          console.warn('Failed to fetch Farcaster profile for FID:', fidStr);
        }

        guides.push({
          fid: fidStr,
          username,
          displayName,
          pfpUrl,
          bio: guideData[12] || '',
          location: '',
          languages: '',
          transport: '',
          registeredAt: '0',
          lastUpdated: '0',
          active: guideData[5],
          suspended: guideData[6],
          averageRating: guideData[7]?.toString() || '0',
          ratingCount: Number(guideData[8]) || 0,
          totalBookings: Number(guideData[9]) || 0,
          completedBookings: Number(guideData[10]) || 0,
        });

        console.log(`✅ Added guide: ${username} (FID: ${fidStr})`);
      } catch (err) {
        console.error(`Failed to fetch guide ${fidStr}:`, err);
      }
    }

    return guides;
  } catch (err) {
    console.error('Failed to fetch events:', err);
    return [];
  }
}
