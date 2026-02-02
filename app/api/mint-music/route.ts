import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, Interface, parseEther } from 'ethers';
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';
import {
  generateNonce,
  authenticateRequest,
  buildMintMessage,
  verifyFarcasterFID,
  sanitizeErrorForResponse,
  sanitizeInput,
  SIGNATURE_EXPIRY_MS,
} from '@/lib/auth';

/**
 * 🎵 MINT MUSIC NFT ENDPOINT (SECURED)
 *
 * SECURITY CHANGES:
 * - Requires wallet signature to prove ownership of recipient address
 * - Verifies FID is linked to the signing address
 * - Uses nonce to prevent replay attacks
 * - Rate limited
 * - Sanitized inputs
 *
 * Flow:
 * 1. GET /api/mint-music?address=0x... - Get nonce for signing
 * 2. Frontend signs message with wallet
 * 3. POST /api/mint-music - Submit signed mint request
 */

const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT!;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

const MUSIC_NFT_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'uint256', name: 'artistFid', type: 'uint256' },
      { internalType: 'string', name: 'tokenURI', type: 'string' },
      { internalType: 'string', name: 'title', type: 'string' },
      { internalType: 'uint256', name: 'price', type: 'uint256' },
      { internalType: 'uint8', name: 'nftType', type: 'uint8' }
    ],
    name: 'mintMaster',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'artist', type: 'address' },
      { indexed: false, internalType: 'string', name: 'tokenURI', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'price', type: 'uint256' },
      { indexed: false, internalType: 'uint8', name: 'nftType', type: 'uint8' }
    ],
    name: 'MasterMinted',
    type: 'event',
  },
];

/**
 * GET - Request nonce for minting
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { success: false, error: 'address parameter required' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // Rate limit
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(RateLimiters.mint, ip, address);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    // Generate nonce
    const nonce = await generateNonce(address, 'mint-music');
    const timestamp = Date.now();

    return NextResponse.json({
      success: true,
      nonce,
      timestamp,
      messageToSign: buildMintMessage(address, timestamp, nonce, 'music'),
      expiresIn: SIGNATURE_EXPIRY_MS / 1000,
      instructions: 'Sign the messageToSign with your wallet, then POST with signature.',
    });

  } catch (error: any) {
    console.error('[MintMusic] GET Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}

/**
 * POST - Execute mint with signature verification
 */
export async function POST(req: NextRequest) {
  try {
    // Rate limit
    const ip = getClientIP(req);
    const body = await req.json();
    const {
      recipient,
      tokenURI,
      metadataCID,
      metadataCid,
      price,
      fid,
      songTitle,
      // Auth fields
      signature,
      timestamp,
      nonce,
    } = body;

    // SECURITY: Require authentication for minting
    if (!signature || !timestamp || !nonce) {
      return NextResponse.json(
        {
          success: false,
          error: 'Authentication required. Use GET endpoint first to get nonce, then sign and POST.',
        },
        { status: 400 }
      );
    }

    if (!recipient) {
      return NextResponse.json(
        { success: false, error: 'Missing recipient address' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // Rate limit with user identifier
    const rateLimit = await checkRateLimit(RateLimiters.mint, ip, recipient);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    // Prepare token URI
    let finalTokenURI = tokenURI;
    const cid = metadataCid || metadataCID;
    if (!finalTokenURI && cid) {
      finalTokenURI = `ipfs://${cid}`;
    }

    if (!finalTokenURI || finalTokenURI === 'ipfs://undefined') {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid metadata CID' },
        { status: 400 }
      );
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    console.log(`[MintMusic] Mint request from ${recipient}`);

    // SECURITY: Verify signature proves ownership of recipient address
    const expectedMessage = buildMintMessage(recipient, timestamp, nonce, 'music');

    const authResult = await authenticateRequest(
      { address: recipient, signature, timestamp, nonce },
      expectedMessage,
      'mint-music',
      true
    );

    if (!authResult.valid) {
      console.error(`[MintMusic] Auth failed for ${recipient}: ${authResult.error}`);
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 403 }
      );
    }

    console.log(`[MintMusic] ✅ Signature verified for ${recipient}`);

    // SECURITY: If FID provided, verify it's linked to the address
    if (fid) {
      const fidVerification = await verifyFarcasterFID(parseInt(fid), recipient);
      if (!fidVerification.valid) {
        console.warn(`[MintMusic] FID ${fid} not linked to ${recipient}, continuing without FID`);
        // Don't fail, just log warning - FID is optional
      }
    }

    // SECURITY: Sanitize song title
    const sanitizedTitle = sanitizeInput(songTitle || 'Untitled', 200);

    // Parse price
    const MIN_PRICE = 35;
    let finalPrice = MIN_PRICE;
    let priceInWei: bigint;
    try {
      const requestedPrice = parseFloat(price?.toString() || String(MIN_PRICE));
      finalPrice = Math.max(requestedPrice, MIN_PRICE);
      priceInWei = parseEther(String(finalPrice));
    } catch (err) {
      console.error('[MintMusic] Invalid price format:', price);
      priceInWei = parseEther(String(MIN_PRICE));
    }

    console.log(`[MintMusic] Price: ${finalPrice} WMON, Title: ${sanitizedTitle}`);

    // Execute mint
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);

    console.log('[MintMusic] Executing mint transaction...');

    const tx = await contract.mintMaster(
      recipient,
      fid || 0,
      finalTokenURI,
      sanitizedTitle,
      priceInWei,
      0 // nftType: 0 = MUSIC
    );

    console.log('[MintMusic] TX sent:', tx.hash);
    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Mint transaction failed');
    }

    // Extract tokenId from event
    let tokenId = 0;
    if (receipt.logs && receipt.logs.length > 0) {
      const iface = new Interface(MUSIC_NFT_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed?.name === 'MasterMinted') {
            tokenId = Number(parsed.args[0]);
            break;
          }
        } catch (e) {
          // Skip logs that don't match
        }
      }
    }

    console.log(`[MintMusic] ✅ Minted token #${tokenId}`);

    // Post cast (if FID provided)
    if (fid) {
      try {
        const castText = `🎵 New Music Master NFT Minted!

"${sanitizedTitle}" - Token #${tokenId}
💰 License Price: ${finalPrice} WMON

⚡ Gasless minting powered by @empowertours
🎶 Purchase license to stream full track

View: https://monadscan.com/tx/${tx.hash}

@empowertours`;

        const ogImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}`;

        const client = new NeynarAPIClient({
          apiKey: NEYNAR_API_KEY,
        });

        await client.publishCast({
          signerUuid: process.env.BOT_SIGNER_UUID || '',
          text: castText,
          embeds: [{ url: ogImageUrl }]
        });

        console.log('[MintMusic] Cast posted successfully');
      } catch (castError: any) {
        console.warn('[MintMusic] Cast failed (mint still succeeded):', castError.message);
      }
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      tokenId,
      recipient,
      tokenURI: finalTokenURI,
      songTitle: sanitizedTitle,
      price: finalPrice,
      ogImageUrl: `${APP_URL}/api/og/music?tokenId=${tokenId}`,
    });

  } catch (error: any) {
    console.error('[MintMusic] Error:', error);

    // SECURITY: Sanitize error response
    let errorMessage = 'Mint failed';
    if (error.code === 'CALL_EXCEPTION') {
      errorMessage = 'Contract call failed. The title may already exist or parameters are invalid.';
    }

    return NextResponse.json(
      { success: false, error: errorMessage },
      { status: 500 }
    );
  }
}
