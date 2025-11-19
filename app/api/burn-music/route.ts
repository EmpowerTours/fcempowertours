import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, encodeFunctionData, parseAbi } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';
import { createSmartAccountClient } from 'permissionless';
import { toSafeSmartAccount } from 'permissionless/accounts';
import { createPimlicoClient } from 'permissionless/clients/pimlico';
import { entryPoint07Address } from 'viem/account-abstraction';

const PIMLICO_API_KEY = process.env.NEXT_PUBLIC_PIMLICO_API_KEY!;
const PRIVATE_KEY = process.env.SAFE_OWNER_PRIVATE_KEY! as `0x${string}`;
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS! as `0x${string}`;
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT! as `0x${string}`;

const pimlicoUrl = `https://api.pimlico.io/v2/10143/rpc?apikey=${PIMLICO_API_KEY}`;

// Helper to fetch Pimlico gas prices
async function getPimlicoGasPrices(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  try {
    const response = await fetch(pimlicoUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'pimlico_getUserOperationGasPrice',
        params: [],
      }),
    });

    if (!response.ok) {
      throw new Error(`Pimlico API returned ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`Pimlico error: ${data.error.message}`);
    }

    const { fast } = data.result;
    return {
      maxFeePerGas: BigInt(fast.maxFeePerGas),
      maxPriorityFeePerGas: BigInt(fast.maxPriorityFeePerGas),
    };
  } catch (error: any) {
    console.error('❌ Failed to fetch Pimlico gas prices:', error.message);
    throw error;
  }
}

const musicNFTAbi = parseAbi([
  'function burnMusicNFT(uint256 tokenId) external',
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
      transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz'),
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

    // Create Safe account - use existing deployed Safe
    const safeAccount = await toSafeSmartAccount({
      client: publicClient,
      owners: [signer],
      version: '1.4.1',
      entryPoint: {
        address: entryPoint07Address,
        version: '0.7',
      },
      address: SAFE_ACCOUNT, // ✅ Use existing deployed Safe account
      saltNonce: 0n,
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

    // Encode burn call
    const burnData = encodeFunctionData({
      abi: musicNFTAbi,
      functionName: 'burnMusicNFT',
      args: [BigInt(tokenId)],
    });

    console.log(`📝 Sending burn transaction for token #${tokenId}...`);

    // Get gas prices from Pimlico
    const { maxFeePerGas, maxPriorityFeePerGas } = await getPimlicoGasPrices();

    console.log('⛽ Gas prices:', {
      maxFeePerGas: maxFeePerGas.toString(),
      maxPriorityFeePerGas: maxPriorityFeePerGas.toString(),
    });

    // Initial gas limits for estimation (required for deployment scenarios)
    const initialGasLimits = {
      callGasLimit: 500_000n,
      verificationGasLimit: 500_000n,
      preVerificationGas: 100_000n,
    };

    // Estimate gas
    let estimatedGas;
    try {
      console.log('🔍 Estimating gas...');
      estimatedGas = await smartAccountClient.estimateUserOperationGas({
        account: smartAccountClient.account!,
        calls: [{
          to: MUSIC_NFT_ADDRESS,
          data: burnData,
          value: BigInt(0),
        }],
        maxFeePerGas,
        maxPriorityFeePerGas,
        ...initialGasLimits,
      });
      console.log('✅ Gas estimated:', {
        callGasLimit: estimatedGas.callGasLimit.toString(),
        verificationGasLimit: estimatedGas.verificationGasLimit.toString(),
        preVerificationGas: estimatedGas.preVerificationGas.toString(),
      });
    } catch (gasErr: any) {
      console.error('❌ Gas estimation failed:', gasErr.message);
      // Use higher fallback gas limits
      estimatedGas = {
        callGasLimit: 1_000_000n,
        verificationGasLimit: 1_000_000n,
        preVerificationGas: 200_000n,
      };
      console.log('⚠️ Using fallback gas limits');
    }

    // Add 20% buffer for safety
    const gasWithBuffer = {
      callGasLimit: (estimatedGas.callGasLimit * 120n) / 100n,
      verificationGasLimit: (estimatedGas.verificationGasLimit * 120n) / 100n,
      preVerificationGas: (estimatedGas.preVerificationGas * 120n) / 100n,
    };

    console.log('🚀 Final gas limits with 20% buffer:', {
      callGasLimit: gasWithBuffer.callGasLimit.toString(),
      verificationGasLimit: gasWithBuffer.verificationGasLimit.toString(),
      preVerificationGas: gasWithBuffer.preVerificationGas.toString(),
    });

    // Send user operation with explicit gas limits
    const userOpHash = await smartAccountClient.sendUserOperation({
      account: smartAccountClient.account!,
      calls: [{
        to: MUSIC_NFT_ADDRESS,
        data: burnData,
        value: BigInt(0),
      }],
      maxFeePerGas,
      maxPriorityFeePerGas,
      ...gasWithBuffer,
    });

    console.log('✅ UserOperation submitted:', userOpHash);

    // Wait for the transaction to be mined
    console.log('⏳ Waiting for transaction to be mined...');
    const receipt = await smartAccountClient.waitForUserOperationReceipt({
      hash: userOpHash,
      timeout: 300_000, // 5 minutes
    });

    const txHash = receipt.receipt.transactionHash;
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
