import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { activeChain } from '@/app/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';

const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY!;
const PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY! as `0x${string}`;
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT! as `0x${string}`;

const getPimlicoUrl = () => `https://api.pimlico.io/v2/${activeChain.id}/rpc?apikey=${PIMLICO_API_KEY}`;

const musicNFTAbi = parseAbi([
  'function unstakeNFT(uint256 tokenId) external',
  'function stakingInfo(uint256 tokenId) external view returns (address staker, uint256 stakedAt, uint256 lastClaimAt, bool isStaked)',
  'function calculatePendingRewards(uint256 tokenId) external view returns (uint256)',
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

    console.log(`📤 Unstaking music NFT #${tokenId} for user ${userAddress}`);

    // Setup clients
    const publicClient = createPublicClient({
      transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz'),
      chain: activeChain,
    });

    const pimlicoClient = createPimlicoClient({
      transport: http(getPimlicoUrl()),
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
      chain: activeChain,
      bundlerTransport: http(getPimlicoUrl()),
      paymaster: pimlicoClient,
      userOperation: {
        estimateFeesPerGas: async () => {
          const gasPrices = await pimlicoClient.getUserOperationGasPrice();
          return gasPrices.fast;
        },
      },
    });

    // Check staking info
    const stakingInfo = await publicClient.readContract({
      address: MUSIC_NFT_ADDRESS,
      abi: musicNFTAbi,
      functionName: 'stakingInfo',
      args: [BigInt(tokenId)],
    });

    if (!stakingInfo[3]) { // isStaked
      return NextResponse.json(
        { success: false, error: 'This NFT is not currently staked' },
        { status: 400 }
      );
    }

    if (stakingInfo[0].toLowerCase() !== userAddress.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: 'You are not the staker of this NFT' },
        { status: 403 }
      );
    }

    // Get pending rewards
    const pendingRewards = await publicClient.readContract({
      address: MUSIC_NFT_ADDRESS,
      abi: musicNFTAbi,
      functionName: 'calculatePendingRewards',
      args: [BigInt(tokenId)],
    });

    console.log(`💰 Pending rewards: ${pendingRewards} TOURS tokens`);

    // Encode unstake call
    const unstakeData = encodeFunctionData({
      abi: musicNFTAbi,
      functionName: 'unstakeNFT',
      args: [BigInt(tokenId)],
    });

    console.log(`📝 Sending unstake transaction for token #${tokenId}...`);

    // Send user operation
    const txHash = await smartAccountClient.sendTransaction({
      to: MUSIC_NFT_ADDRESS,
      data: unstakeData,
      value: BigInt(0),
    });

    console.log(`✅ Music NFT #${tokenId} unstaked! TX: ${txHash}`);

    return NextResponse.json({
      success: true,
      txHash,
      rewardsClaimed: pendingRewards.toString(),
      message: `Music NFT #${tokenId} has been unstaked`,
    });
  } catch (error: any) {
    console.error('❌ Unstake music error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to unstake music NFT',
      },
      { status: 500 }
    );
  }
}
