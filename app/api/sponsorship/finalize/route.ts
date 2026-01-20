import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  readSponsorship,
  eventSponsorshipAbi,
  getContractAddress,
  publicClient,
  monadTestnet,
} from '@/lib/event-sponsorship';

/**
 * POST /api/sponsorship/finalize
 *
 * Finalize sponsorship after voting ends.
 * Releases funds to host (if YES majority) or refunds sponsor (if NO majority).
 *
 * Can be called by anyone after voting deadline.
 */

const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;

interface FinalizeRequest {
  sponsorshipId: number;
}

export async function POST(req: NextRequest) {
  try {
    const body: FinalizeRequest = await req.json();
    const { sponsorshipId } = body;

    if (sponsorshipId === undefined) {
      return NextResponse.json(
        { success: false, error: 'Missing sponsorshipId' },
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

    // Check status
    if (
      sponsorship.status !== 'Active' &&
      sponsorship.status !== 'CheckingIn' &&
      sponsorship.status !== 'Voting'
    ) {
      return NextResponse.json(
        { success: false, error: `Cannot finalize: status is ${sponsorship.status}` },
        { status: 400 }
      );
    }

    // Check timing
    const now = Math.floor(Date.now() / 1000);
    if (now <= sponsorship.votingDeadline) {
      const remaining = sponsorship.votingDeadline - now;
      return NextResponse.json(
        {
          success: false,
          error: `Voting not ended yet. ${Math.ceil(remaining / 60)} minutes remaining.`,
        },
        { status: 400 }
      );
    }

    // Check finalization outcome prediction
    const minCheckins = Math.max(1, Math.floor(sponsorship.expectedGuests * 0.25));
    const totalVotes = sponsorship.yesVotes + sponsorship.noVotes;
    const willRelease =
      sponsorship.checkedInCount >= minCheckins &&
      totalVotes > 0 &&
      sponsorship.yesVotes > sponsorship.noVotes;

    console.log('[SponsorshipFinalize] Outcome prediction:', {
      checkedInCount: sponsorship.checkedInCount,
      minCheckins,
      yesVotes: sponsorship.yesVotes,
      noVotes: sponsorship.noVotes,
      willRelease,
    });

    // Execute finalize
    if (!DEPLOYER_KEY) {
      return NextResponse.json(
        { success: false, error: 'Server not configured to execute transactions' },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(DEPLOYER_KEY);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(MONAD_RPC),
    });

    const hash = await walletClient.writeContract({
      address: getContractAddress(),
      abi: eventSponsorshipAbi,
      functionName: 'finalize',
      args: [BigInt(sponsorshipId)],
    });

    console.log('[SponsorshipFinalize] Transaction hash:', hash);

    // Wait for receipt
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log('[SponsorshipFinalize] Confirmed in block:', receipt.blockNumber);

    // Get updated status
    const updated = await readSponsorship(sponsorshipId);

    return NextResponse.json({
      success: true,
      txHash: hash,
      previousStatus: sponsorship.status,
      newStatus: updated?.status,
      outcome: willRelease ? 'released_to_host' : 'refunded_to_sponsor',
      summary: {
        checkedInCount: sponsorship.checkedInCount,
        minRequired: minCheckins,
        yesVotes: sponsorship.yesVotes,
        noVotes: sponsorship.noVotes,
        amount: sponsorship.amountFormatted,
        recipient: willRelease ? sponsorship.host : sponsorship.sponsor,
      },
    });
  } catch (error: any) {
    console.error('[SponsorshipFinalize] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
