import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, encodeFunctionData, parseAbi, Address, Hex } from 'viem';
import { activeChain } from '@/app/chains';
import { sendSafeTransaction, publicClient } from '@/lib/pimlico-safe-aa';

const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT! as `0x${string}`;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT! as `0x${string}`;

const musicNFTAbi = parseAbi([
  'function burnNFT(uint256 tokenId) external',
  'function burnNFTFor(address owner, uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function burnRewardAmount() external view returns (uint256)',
]);

export async function POST(request: NextRequest) {
  try {
    const { userAddress, tokenId } = await request.json();

    if (!userAddress || !tokenId) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or tokenId' },
        { status: 400 }
      );
    }

    console.log(`🔥 Burning music NFT #${tokenId} for user ${userAddress}`);

    // Verify ownership
    let owner: string;
    try {
      owner = await publicClient.readContract({
        address: MUSIC_NFT_ADDRESS,
        abi: musicNFTAbi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      }) as string;

      console.log(`📋 Owner of token #${tokenId}:`, owner);
      console.log(`📋 User address:`, userAddress);
    } catch (ownerError: any) {
      console.error(`❌ Failed to get owner of token #${tokenId}:`, ownerError);

      // Token likely doesn't exist or was already burned
      if (ownerError.message?.includes('ERC721')) {
        return NextResponse.json(
          { success: false, error: 'This NFT does not exist or has already been burned' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: false, error: `Failed to verify ownership: ${ownerError.message}` },
        { status: 500 }
      );
    }

    if (!owner || owner.toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: `You do not own this music NFT. Owner: ${owner}, User: ${userAddress}` },
        { status: 403 }
      );
    }

    // Get burn reward amount
    const burnReward = await publicClient.readContract({
      address: MUSIC_NFT_ADDRESS,
      abi: musicNFTAbi,
      functionName: 'burnRewardAmount',
    });

    console.log(`💰 Burn reward: ${burnReward} TOURS tokens`);

    // Encode burn call using burnNFTFor (Safe account burning on behalf of owner)
    const burnData = encodeFunctionData({
      abi: musicNFTAbi,
      functionName: 'burnNFTFor',
      args: [userAddress as Address, BigInt(tokenId)],
    });

    console.log(`📝 Sending burn transaction for token #${tokenId}...`);

    // Use the sendSafeTransaction helper which includes:
    // - UserOperation success validation (detects silent failures)
    // - Proper gas estimation and buffers
    // - All error handling and validations
    const txHash = await sendSafeTransaction([
      {
        to: MUSIC_NFT_ADDRESS,
        value: BigInt(0),
        data: burnData as Hex,
      },
    ]);

    console.log(`✅ Music NFT #${tokenId} burned! TX: ${txHash}`);

    return NextResponse.json({
      success: true,
      txHash,
      burnReward: burnReward.toString(),
      message: `Music NFT #${tokenId} has been burned`,
    });
  } catch (error: any) {
    console.error('❌ Burn music error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to burn music NFT',
      },
      { status: 500 }
    );
  }
}
