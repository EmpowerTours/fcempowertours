import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, createWalletClient, http, encodeFunctionData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';

const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY!;
const PRIVATE_KEY = process.env.PRIVATE_KEY! as `0x${string}`;
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSIC_NFT_ADDRESS! as `0x${string}`;

const pimlicoUrl = `https://api.pimlico.io/v2/10143/rpc?apikey=${PIMLICO_API_KEY}`;

const musicNFTAbi = parseAbi([
  'function burnMusic(uint256 tokenId) external',
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

    // Setup clients
    const publicClient = createPublicClient({
      transport: http('https://testnet.monad.xyz'),
      chain: monadTestnet,
    });

    const pimlicoClient = createPimlicoClient({
      transport: http(pimlicoUrl),
      entryPoint: {
        address: entryPoint07Address,
        version: '0.7',
      },
    });

    // Create signer account
    const signer = privateKeyToAccount(PRIVATE_KEY);

    // Create Safe account
    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      owners: [signer],
      version: '1.4.1',
      entryPoint: {
        address: entryPoint07Address,
        version: '0.7',
      },
      safe4337ModuleAddress: '0x3Fdb5BC686e861480ef99A6E3FaAe03c0b9F32e2',
      erc7579LaunchpadAddress: '0xEBe001b3D534B9B6E2500FB78E67a1A137f561CE',
    });

    const smartAccountClient = createSmartAccountClient({
      account: safeAccount,
      chain: monadTestnet,
      bundlerTransport: http(pimlicoUrl),
      paymaster: pimlicoClient,
      userOperation: {
        estimateFeesPerGas: async () => {
          const gasPrices = await pimlicoClient.getUserOperationGasPrice();
          return gasPrices.fast;
        },
      },
    });

    // Verify ownership
    const owner = await publicClient.readContract({
      address: MUSIC_NFT_ADDRESS,
      abi: musicNFTAbi,
      functionName: 'ownerOf',
      args: [BigInt(tokenId)],
    });

    if (owner.toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'You do not own this music NFT' },
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

    // Encode burn call
    const burnData = encodeFunctionData({
      abi: musicNFTAbi,
      functionName: 'burnMusic',
      args: [BigInt(tokenId)],
    });

    console.log(`📝 Sending burn transaction for token #${tokenId}...`);

    // Send user operation
    const txHash = await smartAccountClient.sendTransaction({
      to: MUSIC_NFT_ADDRESS,
      data: burnData,
      value: BigInt(0),
    });

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
