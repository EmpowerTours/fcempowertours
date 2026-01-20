import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, Address } from 'viem';
import { activeChain } from '@/app/chains';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

const publicClient = createPublicClient({
  chain: activeChain,
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
  hourlyRateWMON?: string;
}

export async function GET() {
  try {
    if (!ENVIO_ENDPOINT) {
      return NextResponse.json({ error: 'ENVIO_ENDPOINT not configured' }, { status: 500 });
    }
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

    // Collect FIDs that need Farcaster profile data
    const fidsNeedingProfiles = guides
      .filter((g: any) => !g.username || g.username === 'unknown' || !g.displayName || !g.pfpUrl)
      .map((g: any) => g.guideFid);

    // Fetch Farcaster profiles from Neynar for guides missing profile data
    let farcasterProfiles: Record<string, { username: string; displayName: string; pfpUrl: string }> = {};

    if (fidsNeedingProfiles.length > 0 && NEYNAR_API_KEY) {
      try {
        console.log(`🔄 Fetching Farcaster profiles for ${fidsNeedingProfiles.length} guides...`);
        const neynarResponse = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fidsNeedingProfiles.join(',')}`,
          { headers: { 'api_key': NEYNAR_API_KEY } }
        );

        if (neynarResponse.ok) {
          const neynarData = await neynarResponse.json();
          for (const user of neynarData.users || []) {
            farcasterProfiles[user.fid.toString()] = {
              username: user.username || 'unknown',
              displayName: user.display_name || user.username || 'Unknown Guide',
              pfpUrl: user.pfp_url || '',
            };
          }
          console.log(`✅ Fetched ${Object.keys(farcasterProfiles).length} Farcaster profiles`);
        }
      } catch (neynarError) {
        console.warn('Failed to fetch Farcaster profiles:', neynarError);
      }
    }

    // Transform to expected format, enriching with Farcaster data
    const processedGuides: GuideObject[] = guides.map((guide: any) => {
      const fidStr = guide.guideFid?.toString();
      const fcProfile = farcasterProfiles[fidStr];

      return {
        fid: guide.guideFid,
        username: guide.username || fcProfile?.username || 'unknown',
        displayName: guide.displayName || fcProfile?.displayName || guide.username || fcProfile?.username || 'Unknown Guide',
        pfpUrl: guide.pfpUrl || fcProfile?.pfpUrl || '',
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
      };
    });

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
  ]);

  // Use a separate ABI for the guides function with correct struct layout
  const guidesAbi = [{
    name: 'guides',
    type: 'function',
    inputs: [{ name: 'guideFid', type: 'uint256' }],
    outputs: [
      { name: 'guideFid', type: 'uint256' },           // 0
      { name: 'guideAddress', type: 'address' },        // 1
      { name: 'passportTokenId', type: 'uint256' },     // 2
      { name: 'countries', type: 'string[]' },          // 3
      { name: 'hourlyRateWMON', type: 'uint256' },      // 4
      { name: 'hourlyRateTOURS', type: 'uint256' },     // 5
      { name: 'bio', type: 'string' },                  // 6
      { name: 'profileImageIPFS', type: 'string' },     // 7
      { name: 'registeredAt', type: 'uint256' },        // 8
      { name: 'totalBookings', type: 'uint256' },       // 9
      { name: 'totalCompletedTours', type: 'uint256' }, // 10
      { name: 'cancellationCount', type: 'uint256' },   // 11
      { name: 'totalEarningsWMON', type: 'uint256' },   // 12
      { name: 'totalEarningsTOURS', type: 'uint256' },  // 13
      { name: 'active', type: 'bool' },                 // 14
      { name: 'averageRating', type: 'uint256' },       // 15
      { name: 'ratingCount', type: 'uint256' },         // 16
      { name: 'suspended', type: 'bool' },              // 17
    ],
    stateMutability: 'view'
  }] as const;

  try {
    // Get GuideRegistered events from the contract (last 500000 blocks to capture older registrations)
    const currentBlock = await publicClient.getBlockNumber();
    const fromBlock = currentBlock > 500000n ? currentBlock - 500000n : 0n;

    console.log(`[get-guides] Fetching GuideRegistered events from block ${fromBlock} to ${currentBlock}`);

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

        // Get guide details using the correct ABI
        const guideData = await publicClient.readContract({
          address: REGISTRY_ADDRESS,
          abi: guidesAbi,
          functionName: 'guides',
          args: [fid],
        }) as any;

        // Skip if suspended (index 17) or inactive (index 14)
        if (guideData[17]) continue; // suspended
        if (!guideData[14]) continue; // not active

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

        // Extract location from countries array (index 3)
        const countries = guideData[3] as string[] || [];
        const locationFromContract = countries.length > 0 ? countries[0] : '';

        guides.push({
          fid: fidStr,
          username,
          displayName,
          pfpUrl,
          bio: guideData[6] || '',                          // index 6
          location: locationFromContract,
          languages: '',
          transport: '',
          registeredAt: guideData[8]?.toString() || '0',    // index 8
          lastUpdated: '0',
          active: guideData[14],                            // index 14
          suspended: guideData[17],                         // index 17
          averageRating: guideData[15]?.toString() || '0',  // index 15
          ratingCount: Number(guideData[16]) || 0,          // index 16
          totalBookings: Number(guideData[9]) || 0,         // index 9
          completedBookings: Number(guideData[10]) || 0,    // index 10
          hourlyRateWMON: guideData[4]?.toString() || '0',  // index 4
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
