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
  'function stakeNFT(uint256 tokenId) external',
  'function ownerOf(uint256 tokenId) external view returns (address)',
  'function stakingInfo(uint256 tokenId) external view returns (address staker, uint256 stakedAt, uint256 lastClaimAt, bool isStaked)',
  'function stakingRewardRate() external view returns (uint256)',
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

    // ✅ VALIDATE ENVIRONMENT VARIABLES
    if (!PRIVATE_KEY) {
      console.error('❌ SAFE_OWNER_PRIVATE_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error: PRIVATE_KEY not set' },
        { status: 500 }
      );
    }

    if (!PIMLICO_API_KEY) {
      console.error('❌ PIMLICO_API_KEY not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error: PIMLICO_API_KEY not set' },
        { status: 500 }
      );
    }

    if (!MUSIC_NFT_ADDRESS) {
      console.error('❌ MUSIC_NFT_ADDRESS not configured');
      return NextResponse.json(
        { success: false, error: 'Server configuration error: MUSIC_NFT_ADDRESS not set' },
        { status: 500 }
      );
    }

    console.log(`📌 Staking music NFT #${tokenId} for user ${userAddress}`);

    // Setup clients
    const publicClient = createPublicClient({
      transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com'),
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

    // Check if already staked
    const stakingInfo = await publicClient.readContract({
      address: MUSIC_NFT_ADDRESS,
      abi: musicNFTAbi,
      functionName: 'stakingInfo',
      args: [BigInt(tokenId)],
    });

    if (stakingInfo[3]) { // isStaked
      return NextResponse.json(
        { success: false, error: 'This NFT is already staked' },
        { status: 400 }
      );
    }

    // Get reward rate
    const rewardRate = await publicClient.readContract({
      address: MUSIC_NFT_ADDRESS,
      abi: musicNFTAbi,
      functionName: 'stakingRewardRate',
    });

    console.log(`💰 Staking reward rate: ${rewardRate} TOURS per second`);

    // Encode stake call
    const stakeData = encodeFunctionData({
      abi: musicNFTAbi,
      functionName: 'stakeNFT',
      args: [BigInt(tokenId)],
    });

    console.log(`📝 Sending stake transaction for token #${tokenId}...`);

    // Send user operation
    const txHash = await smartAccountClient.sendTransaction({
      to: MUSIC_NFT_ADDRESS,
      data: stakeData,
      value: BigInt(0),
    });

    console.log(`✅ Music NFT #${tokenId} staked! TX: ${txHash}`);

    return NextResponse.json({
      success: true,
      txHash,
      rewardRate: rewardRate.toString(),
      message: `Music NFT #${tokenId} has been staked`,
    });
  } catch (error: any) {
    console.error('❌ Stake music error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to stake music NFT',
      },
      { status: 500 }
    );
  }
}
