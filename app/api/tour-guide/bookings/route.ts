import { NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi, type Address } from 'viem';
import { activeChain } from '@/app/chains';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(MONAD_RPC),
});

// ABI for booking-related functions
const registryAbi = parseAbi([
  'function getTravelerBookings(uint256 travelerFid) view returns (uint256[])',
  'function getGuideBookings(uint256 guideFid) view returns (uint256[])',
  'function bookings(uint256 bookingId) view returns (uint256 bookingId, uint256 guideFid, uint256 travelerFid, address guideAddress, address travelerAddress, uint256 hoursDuration, uint256 totalCost, address paymentToken, uint256 createdAt, bool completed, bool cancelled, bool guideMarkedComplete, uint256 guideMarkedAt, uint256 travelerRating, bool autoCompleted)',
]);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const fid = searchParams.get('fid');

  if (!fid) {
    return NextResponse.json({ error: 'FID required' }, { status: 400 });
  }

  if (!REGISTRY_ADDRESS) {
    return NextResponse.json({ error: 'Registry not configured' }, { status: 500 });
  }

  try {
    const fidBigInt = BigInt(fid);

    // Get both traveler and guide bookings for this FID
    const [travelerBookingIds, guideBookingIds] = await Promise.all([
      publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: 'getTravelerBookings',
        args: [fidBigInt],
      }) as Promise<bigint[]>,
      publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: 'getGuideBookings',
        args: [fidBigInt],
      }) as Promise<bigint[]>,
    ]);

    // Combine unique booking IDs
    const allBookingIds = [...new Set([...travelerBookingIds, ...guideBookingIds])];

    if (allBookingIds.length === 0) {
      return NextResponse.json({ bookings: [], count: 0 });
    }

    // Fetch all booking details
    const bookingPromises = allBookingIds.map(async (bookingId) => {
      const data = await publicClient.readContract({
        address: REGISTRY_ADDRESS,
        abi: registryAbi,
        functionName: 'bookings',
        args: [bookingId],
      }) as unknown as any[];

      return {
        bookingId: Number(data[0]),
        guideFid: Number(data[1]),
        travelerFid: Number(data[2]),
        guideAddress: data[3],
        travelerAddress: data[4],
        hoursDuration: Number(data[5]),
        totalCost: data[6].toString(),
        paymentToken: data[7],
        createdAt: Number(data[8]),
        completed: data[9],
        cancelled: data[10],
        guideMarkedComplete: data[11],
        guideMarkedAt: Number(data[12]),
        travelerRating: Number(data[13]),
        autoCompleted: data[14],
      };
    });

    const bookings = await Promise.all(bookingPromises);

    // Enrich with Farcaster profile data for guides
    const guideFids = [...new Set(bookings.map(b => b.guideFid))];
    let guideProfiles: Record<number, { username: string; displayName: string; pfpUrl: string }> = {};

    if (guideFids.length > 0 && NEYNAR_API_KEY) {
      try {
        const response = await fetch(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${guideFids.join(',')}`,
          { headers: { 'api_key': NEYNAR_API_KEY } }
        );
        if (response.ok) {
          const data = await response.json();
          for (const user of data.users || []) {
            guideProfiles[user.fid] = {
              username: user.username || 'unknown',
              displayName: user.display_name || user.username || 'Guide',
              pfpUrl: user.pfp_url || '',
            };
          }
        }
      } catch (e) {
        console.warn('[bookings] Failed to fetch Neynar profiles:', e);
      }
    }

    // Enrich bookings with profile data
    const enrichedBookings = bookings.map(booking => ({
      ...booking,
      guideUsername: guideProfiles[booking.guideFid]?.username,
      guideDisplayName: guideProfiles[booking.guideFid]?.displayName,
      guidePfpUrl: guideProfiles[booking.guideFid]?.pfpUrl,
    }));

    // Sort by createdAt descending (most recent first)
    enrichedBookings.sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({
      bookings: enrichedBookings,
      count: enrichedBookings.length,
    });

  } catch (error: any) {
    console.error('[bookings] Error:', error);
    return NextResponse.json({
      error: error.message || 'Failed to fetch bookings',
      bookings: [],
      count: 0,
    }, { status: 500 });
  }
}
