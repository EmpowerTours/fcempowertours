import { NextRequest, NextResponse } from 'next/server';
import { Address, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  readSponsorship,
  checkIsCheckedIn,
  checkHasVoted,
  eventSponsorshipAbi,
  getContractAddress,
  publicClient,
  monadTestnet,
} from '@/lib/event-sponsorship';

/**
 * POST /api/sponsorship/vote
 *
 * Cast vote on sponsorship. Only checked-in guests can vote.
 *
 * For testnet: Oracle casts vote on behalf of user (gasless)
 * For mainnet: User would sign and submit their own tx
 */

const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

interface VoteRequest {
  sponsorshipId: number;
  voterAddress: Address;
  vote: boolean; // true = "Sponsor was mentioned", false = "Not mentioned"
}

export async function POST(req: NextRequest) {
  try {
    const body: VoteRequest = await req.json();
    const { sponsorshipId, voterAddress, vote } = body;

    if (sponsorshipId === undefined || !voterAddress || vote === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing sponsorshipId, voterAddress, or vote' },
        { status: 400 }
      );
    }

    // Get sponsorship
    const sponsorship = await readSponsorship(sponsorshipId);
    if (!sponsorship) {
      return NextResponse.json(
        { success: false, error: 'Sponsorship not found' },
        { status: 404 }
      );
    }

    // Check timing - must be after check-in ends
    const now = Math.floor(Date.now() / 1000);
    if (now <= sponsorship.checkInEnd) {
      return NextResponse.json(
        { success: false, error: 'Voting not yet open. Wait for check-in to close.' },
        { status: 400 }
      );
    }
    if (now > sponsorship.votingDeadline) {
      return NextResponse.json(
        { success: false, error: 'Voting period has ended' },
        { status: 400 }
      );
    }

    // Check if user checked in
    const isCheckedIn = await checkIsCheckedIn(sponsorshipId, voterAddress);
    if (!isCheckedIn) {
      return NextResponse.json(
        { success: false, error: 'Only checked-in guests can vote' },
        { status: 403 }
      );
    }

    // Check if already voted
    const hasVoted = await checkHasVoted(sponsorshipId, voterAddress);
    if (hasVoted) {
      return NextResponse.json(
        { success: false, error: 'Already voted' },
        { status: 400 }
      );
    }

    // For testnet: Submit vote via Oracle
    // The contract requires msg.sender to be the voter, so we need meta-tx
    // For now, we'll track the intent and note this limitation

    // NOTE: In production, this would need EIP-712 signatures for gasless voting
    // For now, returning the prepared transaction for the user to submit

    console.log(`[SponsorshipVote] Vote intent: ${voterAddress} votes ${vote ? 'YES' : 'NO'} on sponsorship ${sponsorshipId}`);

    // Return transaction data for user to submit
    return NextResponse.json({
      success: true,
      message: 'Vote prepared. Submit transaction to complete.',
      transaction: {
        to: getContractAddress(),
        functionName: 'vote',
        args: [sponsorshipId, vote],
        description: vote
          ? 'Vote YES - Sponsor was mentioned at event'
          : 'Vote NO - Sponsor was NOT mentioned at event',
      },
    });
  } catch (error: any) {
    console.error('[SponsorshipVote] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
