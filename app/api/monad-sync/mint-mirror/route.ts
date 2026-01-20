import { NextRequest, NextResponse } from 'next/server';
import { sendUserSafeTransaction, getUserSafeAddress } from '@/lib/user-safe';
import { encodeFunctionData, parseEther, Address, Hex, parseAbi, createPublicClient, http } from 'viem';
import { activeChain } from '@/app/chains';

const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
const MONAD_MIRROR_NFT = process.env.NEXT_PUBLIC_MONAD_MIRROR_NFT as Address;

export async function POST(req: NextRequest) {
  try {
    const { userAddress, fid, clarityScore, tier } = await req.json();

    if (!userAddress || !fid || clarityScore === undefined || !tier) {
      return NextResponse.json(
        { success: false, error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    console.log('🔮 Minting Monad Mirror NFT for:', userAddress);
    console.log('   Clarity:', clarityScore, '| Tier:', tier);

    if (!MONAD_MIRROR_NFT) {
      return NextResponse.json(
        { success: false, error: 'Monad Mirror NFT contract not deployed yet. Please deploy MonadMirrorNFT.sol first.' },
        { status: 400 }
      );
    }

    // Check TOURS balance before minting
    try {
      const client = createPublicClient({
        chain: activeChain,
        transport: http(),
      });

      const userSafe = await getUserSafeAddress(userAddress as Address);

      const toursBalance = await client.readContract({
        address: TOURS_TOKEN,
        abi: parseAbi(['function balanceOf(address) view returns (uint256)']),
        functionName: 'balanceOf',
        args: [userSafe],
      }) as bigint;

      console.log('💰 User Safe TOURS balance:', (Number(toursBalance) / 1e18).toFixed(4), 'TOURS');

      if (toursBalance < parseEther('10')) {
        const currentTOURS = (Number(toursBalance) / 1e18).toFixed(4);
        return NextResponse.json(
          {
            success: false,
            error: `Insufficient TOURS in Safe. You have ${currentTOURS} TOURS but need 10 TOURS to reveal your Monad Mirror NFT. Please swap MON for TOURS first.`
          },
          { status: 400 }
        );
      }
    } catch (balanceErr: any) {
      console.warn('⚠️ Could not check TOURS balance:', balanceErr.message);
    }

    // Prepare metadata URI
    const metadataURI = `https://fcempowertours.xyz/api/monad-sync/metadata/${userAddress}?clarity=${clarityScore}&tier=${encodeURIComponent(tier)}`;

    // Mint calls: approve + mint
    const mintCalls = [
      {
        to: TOURS_TOKEN,
        value: 0n,
        data: encodeFunctionData({
          abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
          functionName: 'approve',
          args: [MONAD_MIRROR_NFT, parseEther('10')],
        }) as Hex,
      },
      {
        to: MONAD_MIRROR_NFT,
        value: 0n,
        data: encodeFunctionData({
          abi: parseAbi([
            'function mintMonadMirror(address to, string memory metadataURI, uint256 clarityScore, string memory tier) external returns (uint256)'
          ]),
          functionName: 'mintMonadMirror',
          args: [userAddress as Address, metadataURI, BigInt(Math.floor(clarityScore * 10)), tier],
        }) as Hex,
      },
    ];

    console.log('💳 Executing mint transaction via User Safe...');
    const result = await sendUserSafeTransaction(userAddress, mintCalls);
    console.log('✅ Monad Mirror minted, TX:', result.txHash);

    // Extract token ID from transaction receipt (will be in logs)
    // For now, we'll use a placeholder and let the user check on-chain
    const tokenId = 'pending'; // TODO: Parse from tx receipt logs

    // Save NFT info to database
    try {
      await fetch(`${process.env.NEXT_PUBLIC_URL}/api/monad-sync/save-nft`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fid,
          walletAddress: userAddress,
          tokenId: tokenId,
          clarityScore,
          tier,
          txHash: result.txHash
        })
      });
    } catch (dbError) {
      console.warn('⚠️ Failed to save NFT to DB:', dbError);
    }

    return NextResponse.json({
      success: true,
      tokenId: tokenId,
      txHash: result.txHash,
      metadataURI,
      message: 'Monad Mirror NFT minted successfully!'
    });

  } catch (error: any) {
    console.error('❌ Mint error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Mint failed' },
      { status: 500 }
    );
  }
}
