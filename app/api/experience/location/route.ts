import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, Address } from 'viem';
import { activeChain } from '@/app/chains';

const EXPERIENCE_NFT_ADDRESS = process.env.NEXT_PUBLIC_EXPERIENCE_NFT as Address;

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(),
});

const ExperienceNFTABI = [
  {
    inputs: [{ name: 'experienceId', type: 'uint256' }],
    name: 'getExperienceLocation',
    outputs: [
      { name: 'latitude', type: 'int256' },
      { name: 'longitude', type: 'int256' },
      { name: 'locationName', type: 'string' },
      { name: 'fullDescription', type: 'string' },
      { name: 'proximityRadius', type: 'uint256' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

/**
 * Get experience location (GPS coordinates revealed only if user purchased)
 * POST /api/experience/location
 */
export async function POST(req: NextRequest) {
  try {
    const { experienceId, userAddress } = await req.json();

    if (!experienceId || !userAddress) {
      return NextResponse.json(
        { error: 'Missing experienceId or userAddress' },
        { status: 400 }
      );
    }

    // Call contract - will revert if user hasn't purchased
    const location = await publicClient.readContract({
      address: EXPERIENCE_NFT_ADDRESS,
      abi: ExperienceNFTABI,
      functionName: 'getExperienceLocation',
      args: [BigInt(experienceId)],
      account: userAddress as Address, // Use user's address for the call
    });

    return NextResponse.json({
      latitude: location[0],
      longitude: location[1],
      locationName: location[2],
      fullDescription: location[3],
      proximityRadius: Number(location[4]),
    });
  } catch (error: any) {
    console.error('Failed to fetch location:', error);

    // User hasn't purchased
    if (error.message?.includes('Must purchase')) {
      return NextResponse.json(
        { error: 'Must purchase experience to reveal location' },
        { status: 403 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to fetch location' },
      { status: 500 }
    );
  }
}
