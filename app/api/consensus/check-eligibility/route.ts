import { NextRequest, NextResponse } from 'next/server';
import { checkConsensusNFTEligibility } from '@/lib/ethereum-balance-checker';

/**
 * Check if an Ethereum address is eligible to mint the Consensus NFT
 * 
 * POST /api/consensus/check-eligibility
 * Body: { ethereumAddress: string }
 * 
 * Response:
 * {
 *   success: boolean,
 *   eligible: boolean,
 *   nftCount: number,
 *   message: string,
 *   error?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const { ethereumAddress } = await request.json();

    if (!ethereumAddress) {
      return NextResponse.json(
        { success: false, error: 'Ethereum address required' },
        { status: 400 }
      );
    }

    const eligibility = await checkConsensusNFTEligibility(ethereumAddress);

    if (eligibility.error) {
      return NextResponse.json(
        { success: false, error: eligibility.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      eligible: eligibility.isEligible,
      nftCount: eligibility.nftCount,
      message: eligibility.isEligible
        ? `✅ Eligible! You own ${eligibility.nftCount} Consensus NFT${eligibility.nftCount > 1 ? 's' : ''}`
        : '❌ Not eligible. You need to own at least one Consensus Hong Kong NFT.',
    });
  } catch (error) {
    console.error('[ConsensusNFT] Check eligibility error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to check eligibility' },
      { status: 500 }
    );
  }
}
