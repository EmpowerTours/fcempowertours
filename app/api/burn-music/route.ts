import { NextRequest, NextResponse } from 'next/server';
import { encodeFunctionData, parseAbi, Address, Hex } from 'viem';
import { sendSafeTransaction, publicClient } from '@/lib/pimlico-safe-aa';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';
import {
  generateNonce,
  authenticateRequest,
  buildBurnMessage,
  sanitizeErrorForResponse,
  SIGNATURE_EXPIRY_MS,
} from '@/lib/auth';

/**
 * 🔥 BURN MUSIC NFT ENDPOINT (SECURED)
 *
 * SECURITY CHANGES:
 * - Requires wallet signature to prove ownership (frontend can't spoof)
 * - Uses nonce to prevent replay attacks
 * - Validates timestamp
 * - Rate limited
 *
 * Flow:
 * 1. GET /api/burn-music?address=0x...&tokenId=123 - Get nonce for signing
 * 2. Frontend signs message with wallet
 * 3. POST /api/burn-music - Submit signed burn request
 */

const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT! as `0x${string}`;

const musicNFTAbi = parseAbi([
  'function burnNFT(uint256 tokenId) external',
  'function burnNFTFor(address owner, uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function burnRewardAmount() external view returns (uint256)',
]);

/**
 * GET - Request nonce for burn operation
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userAddress = searchParams.get('address');
    const tokenId = searchParams.get('tokenId');

    if (!userAddress || !tokenId) {
      return NextResponse.json(
        { success: false, error: 'address and tokenId parameters required' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // Rate limit nonce requests
    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(RateLimiters.burn, ip, userAddress);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    // Verify ownership first (don't waste nonce if user doesn't own it)
    try {
      const owner = await publicClient.readContract({
        address: MUSIC_NFT_ADDRESS,
        abi: musicNFTAbi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      }) as string;

      if (owner.toLowerCase() !== userAddress.toLowerCase()) {
        return NextResponse.json(
          { success: false, error: `You do not own token #${tokenId}` },
          { status: 403 }
        );
      }
    } catch (error: any) {
      return NextResponse.json(
        { success: false, error: 'Token does not exist or has been burned' },
        { status: 404 }
      );
    }

    // Generate nonce for signing
    const nonce = await generateNonce(userAddress, `burn-${tokenId}`);
    const timestamp = Date.now();

    return NextResponse.json({
      success: true,
      nonce,
      timestamp,
      tokenId,
      messageToSign: buildBurnMessage(userAddress, timestamp, nonce, tokenId),
      expiresIn: SIGNATURE_EXPIRY_MS / 1000,
      instructions: 'Sign the messageToSign with your wallet, then POST with signature.',
    });

  } catch (error: any) {
    console.error('[BurnMusic] GET Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}

/**
 * POST - Execute burn with signature verification
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userAddress, tokenId, signature, timestamp, nonce } = body;

    // Validate required fields
    if (!userAddress || !tokenId) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or tokenId' },
        { status: 400 }
      );
    }

    // SECURITY: Require signature authentication
    if (!signature || !timestamp || !nonce) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing authentication. Use GET endpoint first to get nonce, then sign and POST.',
        },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // Rate limit
    const ip = getClientIP(request);
    const rateLimit = await checkRateLimit(RateLimiters.burn, ip, userAddress);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    console.log(`[BurnMusic] Burn request for token #${tokenId} by ${userAddress}`);

    // SECURITY: Verify signature proves ownership of address
    const expectedMessage = buildBurnMessage(userAddress, timestamp, nonce, tokenId);

    const authResult = await authenticateRequest(
      { address: userAddress, signature, timestamp, nonce },
      expectedMessage,
      `burn-${tokenId}`,
      true // Require nonce
    );

    if (!authResult.valid) {
      console.error(`[BurnMusic] Auth failed for ${userAddress}: ${authResult.error}`);
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 403 }
      );
    }

    console.log(`[BurnMusic] ✅ Signature verified for ${userAddress}`);

    // Verify on-chain ownership (double-check after auth)
    let owner: string;
    try {
      owner = await publicClient.readContract({
        address: MUSIC_NFT_ADDRESS,
        abi: musicNFTAbi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      }) as string;

      console.log(`[BurnMusic] Owner of token #${tokenId}: ${owner}`);
    } catch (ownerError: any) {
      console.error(`[BurnMusic] Failed to get owner of token #${tokenId}:`, ownerError);

      if (ownerError.message?.includes('ERC721')) {
        return NextResponse.json(
          { success: false, error: 'This NFT does not exist or has already been burned' },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { success: false, error: 'Failed to verify ownership' },
        { status: 500 }
      );
    }

    // Verify authenticated address matches on-chain owner
    if (!owner || owner.toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'You do not own this NFT' },
        { status: 403 }
      );
    }

    // Get burn reward amount
    const burnReward = await publicClient.readContract({
      address: MUSIC_NFT_ADDRESS,
      abi: musicNFTAbi,
      functionName: 'burnRewardAmount',
    });

    console.log(`[BurnMusic] Burn reward: ${burnReward} TOURS tokens`);

    // Encode burn call
    const burnData = encodeFunctionData({
      abi: musicNFTAbi,
      functionName: 'burnNFTFor',
      args: [userAddress as Address, BigInt(tokenId)],
    });

    console.log(`[BurnMusic] Sending burn transaction for token #${tokenId}...`);

    const txHash = await sendSafeTransaction([
      {
        to: MUSIC_NFT_ADDRESS,
        value: BigInt(0),
        data: burnData as Hex,
      },
    ]);

    console.log(`[BurnMusic] ✅ Music NFT #${tokenId} burned! TX: ${txHash}`);

    return NextResponse.json({
      success: true,
      txHash,
      burnReward: burnReward.toString(),
      message: `Music NFT #${tokenId} has been burned`,
    });

  } catch (error: any) {
    console.error('[BurnMusic] POST Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}
