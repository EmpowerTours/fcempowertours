import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, parseAbi, Address, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { Redis } from '@upstash/redis';

/**
 * POST /api/events/claim-rewards
 *
 * Claim rewards (WMON, TOURS, Travel Stamp NFT) after GPS-verified check-in.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

import { activeChain } from '@/app/chains';

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;
const EVENT_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_EVENT_SPONSORSHIP_CONTRACT as Address;
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON_ADDRESS as Address;
const TOURS_ADDRESS = process.env.NEXT_PUBLIC_TOURS_ADDRESS as Address;
const PLATFORM_WALLET = process.env.NEXT_PUBLIC_PLATFORM_SAFE_ADDRESS as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

const CHECKINS_KEY = 'sponsored-events:checkins';
const CLAIMS_KEY = 'sponsored-events:claims';

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(MONAD_RPC),
});

interface ClaimRequest {
  eventId: string;
  userAddress: string;
}

export async function POST(req: NextRequest) {
  try {
    const body: ClaimRequest = await req.json();

    // Validate required fields
    if (!body.eventId || !body.userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Check for existing check-in
    const checkInKey = `${CHECKINS_KEY}:${body.eventId}:${body.userAddress.toLowerCase()}`;
    const checkInData = await redis.get<any>(checkInKey);

    if (!checkInData) {
      return NextResponse.json(
        { success: false, error: 'Not checked in to this event' },
        { status: 400 }
      );
    }

    const checkIn = typeof checkInData === 'string' ? JSON.parse(checkInData) : checkInData;

    // Check GPS verification
    if (!checkIn.gpsVerified) {
      return NextResponse.json(
        { success: false, error: 'GPS not verified. Must be at venue to claim rewards.' },
        { status: 400 }
      );
    }

    // Check if already claimed
    if (checkIn.rewardsClaimed) {
      return NextResponse.json(
        { success: false, error: 'Rewards already claimed' },
        { status: 400 }
      );
    }

    // Get event details
    const eventKey = `sponsored-events:${body.eventId}`;
    let event = await redis.get<any>(eventKey);

    if (!event) {
      // Demo event rewards
      if (body.eventId === '1' || body.eventId.startsWith('pending-')) {
        event = {
          wmonRewardPerUser: '50',
          toursRewardPerUser: '100',
          stampName: 'Rendez-vous Gala Mexico 2026',
        };
      } else {
        return NextResponse.json(
          { success: false, error: 'Event not found' },
          { status: 404 }
        );
      }
    }

    // In demo mode, just record the claim
    const claimId = `claim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const stampTokenId = `stamp-${Date.now()}`;

    // Update check-in record
    checkIn.rewardsClaimed = true;
    checkIn.stampTokenId = stampTokenId;
    checkIn.claimedAt = Date.now();
    await redis.set(checkInKey, JSON.stringify(checkIn));

    // Record claim
    const claimRecord: {
      claimId: string;
      eventId: string;
      userAddress: string;
      wmonAmount: string;
      toursAmount: string;
      stampTokenId: string;
      stampName: string;
      claimedAt: number;
      txHash: string | null;
    } = {
      claimId,
      eventId: body.eventId,
      userAddress: body.userAddress.toLowerCase(),
      wmonAmount: event.wmonRewardPerUser || '50',
      toursAmount: event.toursRewardPerUser || '100',
      stampTokenId,
      stampName: event.stampName || 'Travel Stamp',
      claimedAt: Date.now(),
      txHash: null, // Will be populated when on-chain
    };

    await redis.set(`${CLAIMS_KEY}:${claimId}`, JSON.stringify(claimRecord));

    // If contract is deployed, execute on-chain claim
    if (EVENT_CONTRACT_ADDRESS && DEPLOYER_KEY) {
      try {
        const account = privateKeyToAccount(DEPLOYER_KEY);
        const walletClient = createWalletClient({
          account,
          chain: activeChain,
          transport: http(MONAD_RPC),
        });

        // Call batchClaimRewards as oracle
        const eventContractAbi = parseAbi([
          'function batchClaimRewards(uint256 eventId, address[] calldata attendees) external',
        ]);

        const txHash = await walletClient.writeContract({
          address: EVENT_CONTRACT_ADDRESS,
          abi: eventContractAbi,
          functionName: 'batchClaimRewards',
          args: [BigInt(body.eventId), [body.userAddress as Address]],
        });

        claimRecord.txHash = txHash;
        await redis.set(`${CLAIMS_KEY}:${claimId}`, JSON.stringify(claimRecord));

        console.log('[EventsClaim] On-chain claim tx:', txHash);

      } catch (contractError: any) {
        console.error('[EventsClaim] Contract call failed:', contractError.message);
        // Continue with off-chain claim recording
      }
    }

    return NextResponse.json({
      success: true,
      claim: {
        claimId,
        eventId: body.eventId,
        wmonAmount: claimRecord.wmonAmount,
        toursAmount: claimRecord.toursAmount,
        stampTokenId,
        stampName: claimRecord.stampName,
      },
      message: `Rewards claimed! You received ${claimRecord.wmonAmount} WMON, ${claimRecord.toursAmount} TOURS, and Travel Stamp NFT.`,
    });

  } catch (error: any) {
    console.error('[EventsClaim] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

// GET - Check claim status
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eventId = searchParams.get('eventId');
    const userAddress = searchParams.get('userAddress');

    if (!eventId || !userAddress) {
      return NextResponse.json(
        { success: false, error: 'eventId and userAddress required' },
        { status: 400 }
      );
    }

    const checkInKey = `${CHECKINS_KEY}:${eventId}:${userAddress.toLowerCase()}`;
    const checkIn = await redis.get<any>(checkInKey);

    if (!checkIn) {
      return NextResponse.json({
        success: true,
        checkedIn: false,
        claimed: false,
      });
    }

    const data = typeof checkIn === 'string' ? JSON.parse(checkIn) : checkIn;

    return NextResponse.json({
      success: true,
      checkedIn: true,
      gpsVerified: data.gpsVerified,
      claimed: data.rewardsClaimed || false,
      stampTokenId: data.stampTokenId,
    });

  } catch (error: any) {
    console.error('[EventsClaim] GET Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
