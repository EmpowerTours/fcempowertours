import { NextRequest, NextResponse } from 'next/server';
import { Address } from 'viem';

const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;
const MUSIC_NFT_V5 = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address;

/**
 * Returns the contract call data for approving Safe to manage NFTs
 * User needs to sign this transaction with their wallet
 */
export async function GET(req: NextRequest) {
  try {
    return NextResponse.json({
      success: true,
      contract: MUSIC_NFT_V5,
      safeAddress: SAFE_ACCOUNT,
      method: 'setApprovalForAll',
      functionSignature: 'setApprovalForAll(address,bool)',
      parameters: [SAFE_ACCOUNT, true],
      // ABI-encoded call data
      data: `0xa22cb465${SAFE_ACCOUNT.slice(2).padStart(64, '0')}${'1'.padStart(64, '0')}`,
      instructions: 'Call setApprovalForAll on the NFT contract to approve the Safe for gasless burns',
      note: 'This is a one-time approval. After this, you can burn NFTs gaslessly.'
    });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
