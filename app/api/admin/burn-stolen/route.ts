import { NextRequest, NextResponse } from 'next/server';
import { createWalletClient, http, encodeFunctionData, parseAbi, Address } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';
import { publicClient } from '@/lib/pimlico-safe-aa';

/**
 * POST /api/admin/burn-stolen
 *
 * Admin endpoint to burn stolen/infringing NFT content.
 * Only callable by deployer (contract owner).
 */

const NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_ADDRESS as Address;
const DEPLOYER_KEY = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';

// Admin addresses that can burn (owner wallet)
const ADMIN_ADDRESSES = [
  '0x6d11A83fEeFa14eF1B38Dce97Be3995441c9fEc3', // Treasury
  '0xDdaE200DBc2874BAd4FdB5e39F227215386c7533', // Platform Safe
].map(a => a.toLowerCase());

const nftAbi = parseAbi([
  'function burnStolenContent(uint256 tokenId, string memory reason) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function owner() external view returns (address)',
  'function tokenURI(uint256 tokenId) external view returns (string)',
]);

interface BurnRequest {
  tokenId: number;
  reason: string;
  adminAddress?: string; // Optional: for verification
}

export async function POST(req: NextRequest) {
  try {
    const body: BurnRequest = await req.json();
    const { tokenId, reason, adminAddress } = body;

    // Validate inputs
    if (!tokenId || tokenId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid token ID' },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { success: false, error: 'Reason must be at least 10 characters' },
        { status: 400 }
      );
    }

    if (!DEPLOYER_KEY) {
      return NextResponse.json(
        { success: false, error: 'Server not configured for admin actions' },
        { status: 500 }
      );
    }

    // Verify token exists
    let currentOwner: string;
    let tokenURI: string = '';
    try {
      currentOwner = await publicClient.readContract({
        address: NFT_ADDRESS,
        abi: nftAbi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      }) as string;

      try {
        tokenURI = await publicClient.readContract({
          address: NFT_ADDRESS,
          abi: nftAbi,
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        }) as string;
      } catch {
        // Token URI might fail, continue anyway
      }
    } catch (error: any) {
      return NextResponse.json(
        { success: false, error: `Token #${tokenId} does not exist or already burned` },
        { status: 404 }
      );
    }

    console.log(`[AdminBurn] Burning token #${tokenId}`);
    console.log(`[AdminBurn] Current owner: ${currentOwner}`);
    console.log(`[AdminBurn] Reason: ${reason}`);

    // Create wallet client with deployer key
    const account = privateKeyToAccount(DEPLOYER_KEY);
    const walletClient = createWalletClient({
      account,
      chain: monadTestnet,
      transport: http(MONAD_RPC),
    });

    // Verify deployer is contract owner
    const contractOwner = await publicClient.readContract({
      address: NFT_ADDRESS,
      abi: nftAbi,
      functionName: 'owner',
    }) as string;

    if (contractOwner.toLowerCase() !== account.address.toLowerCase()) {
      console.error(`[AdminBurn] Deployer ${account.address} is not contract owner ${contractOwner}`);
      return NextResponse.json(
        { success: false, error: 'Deployer is not contract owner' },
        { status: 403 }
      );
    }

    // Execute burn
    const hash = await walletClient.writeContract({
      address: NFT_ADDRESS,
      abi: nftAbi,
      functionName: 'burnStolenContent',
      args: [BigInt(tokenId), reason],
    });

    console.log(`[AdminBurn] Transaction hash: ${hash}`);

    // Wait for confirmation
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[AdminBurn] Confirmed in block: ${receipt.blockNumber}`);

    return NextResponse.json({
      success: true,
      txHash: hash,
      tokenId,
      previousOwner: currentOwner,
      reason,
      blockNumber: receipt.blockNumber.toString(),
      message: `Token #${tokenId} has been burned`,
    });

  } catch (error: any) {
    console.error('[AdminBurn] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to burn token' },
      { status: 500 }
    );
  }
}

// GET endpoint to check token info before burning
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const tokenId = searchParams.get('tokenId');

    if (!tokenId) {
      return NextResponse.json(
        { success: false, error: 'Token ID required' },
        { status: 400 }
      );
    }

    let owner: string;
    let tokenURI: string = '';

    try {
      owner = await publicClient.readContract({
        address: NFT_ADDRESS,
        abi: nftAbi,
        functionName: 'ownerOf',
        args: [BigInt(tokenId)],
      }) as string;

      try {
        tokenURI = await publicClient.readContract({
          address: NFT_ADDRESS,
          abi: nftAbi,
          functionName: 'tokenURI',
          args: [BigInt(tokenId)],
        }) as string;
      } catch {
        // Ignore tokenURI errors
      }
    } catch {
      return NextResponse.json(
        { success: false, error: `Token #${tokenId} does not exist` },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      tokenId: parseInt(tokenId),
      owner,
      tokenURI,
      contract: NFT_ADDRESS,
    });

  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
