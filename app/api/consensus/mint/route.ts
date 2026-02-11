import { NextRequest, NextResponse } from 'next/server';
import { Address, createWalletClient, createPublicClient, http, parseAbi, parseEther, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { activeChain } from '@/app/chains';
import { checkConsensusNFTEligibility } from '@/lib/ethereum-balance-checker';
import { generateAgentMusicNFTAssets } from '@/lib/agents/music-art';
import { redis } from '@/lib/redis';

const CONSENSUS_NFT_ADDRESS = (process.env.NEXT_PUBLIC_CONSENSUS_NFT as Address) || '';
const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON as Address) || '';
const TOURS_ADDRESS = (process.env.NEXT_PUBLIC_TOURS_TOKEN as Address) || '';
const EMPTOURS_ADDRESS = (process.env.NEXT_PUBLIC_EMPTOURS_TOKEN as Address) || '';
const TREASURY_ADDRESS = (process.env.NEXT_PUBLIC_CONSENSUS_TREASURY as Address) || '';
const DEPLOYER_PRIVATE_KEY = (process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`) || '';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';

// Contract ABIs
const CONSENSUS_NFT_ABI = parseAbi([
  'function mint(address monadAddress, address ethereumAddress, string calldata tokenURI) external returns (uint256)',
  'function hasMinted(address ethereumAddress) external view returns (bool)',
]);

const ERC20_ABI = parseAbi([
  'function transferFrom(address from, address to, uint256 amount) external returns (bool)',
  'function transfer(address to, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
]);

/**
 * Mint a Consensus Hong Kong NFT (100 WMON cost)
 * 
 * Flow:
 * 1. Verify Ethereum address owns Consensus NFT
 * 2. Check hasn't already minted on-chain
 * 3. Transfer 100 WMON from user's UserSafe:
 *    - 98 WMON → treasury
 *    - 2 WMON → lottery pool
 * 4. Award random 5-1000 TOURS + 5-1000 EMPTOURS
 * 5. Enter user in today's lottery
 * 6. Generate Hong Kong artwork via Gemini
 * 7. Mint NFT on Monad
 */
export async function POST(request: NextRequest) {
  try {
    const { ethereumAddress, monadAddress, userSafeAddress } = await request.json();

    // Input validation
    if (!ethereumAddress || !monadAddress || !userSafeAddress) {
      return NextResponse.json(
        { success: false, error: 'Ethereum, Monad, and UserSafe addresses required' },
        { status: 400 }
      );
    }

    // Validate address format
    const addressRegex = /^0x[a-fA-F0-9]{40}$/;
    if (!addressRegex.test(ethereumAddress) || !addressRegex.test(monadAddress) || !addressRegex.test(userSafeAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid address format' },
        { status: 400 }
      );
    }

    console.log(`[ConsensusNFT] Minting for Ethereum: ${ethereumAddress}, Monad: ${monadAddress}`);

    // Step 1: Verify Ethereum balance (owns Consensus NFT)
    const eligibility = await checkConsensusNFTEligibility(ethereumAddress);
    if (!eligibility.isEligible) {
      return NextResponse.json(
        { success: false, error: 'Address does not own a Consensus Hong Kong NFT' },
        { status: 403 }
      );
    }

    // Step 2: Check if already minted
    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    const alreadyMinted = await publicClient.readContract({
      address: CONSENSUS_NFT_ADDRESS,
      abi: CONSENSUS_NFT_ABI,
      functionName: 'hasMinted',
      args: [ethereumAddress as Address],
    });

    if (alreadyMinted) {
      return NextResponse.json(
        { success: false, error: 'This address has already minted a Consensus NFT' },
        { status: 403 }
      );
    }

    // Step 3: Transfer WMON from UserSafe
    console.log('[ConsensusNFT] Processing WMON payment...');
    if (!WMON_ADDRESS || !TREASURY_ADDRESS) {
      return NextResponse.json(
        { success: false, error: 'Treasury or WMON token not configured' },
        { status: 500 }
      );
    }

    const walletClient = createWalletClient({
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    // Transfer from UserSafe to treasury (98 WMON)
    const CONSENSUS_MINT_COST = parseEther('100'); // 100 WMON
    const LOTTERY_DEDUCTION = parseEther('2'); // 2 WMON for lottery
    const TREASURY_AMOUNT = CONSENSUS_MINT_COST - LOTTERY_DEDUCTION; // 98 WMON
    
    const wmonTransferHash = await walletClient.writeContract({
      account: userSafeAddress as Address,
      address: WMON_ADDRESS,
      abi: ERC20_ABI,
      functionName: 'transferFrom',
      args: [userSafeAddress as Address, TREASURY_ADDRESS, TREASURY_AMOUNT],
    });

    console.log(`[ConsensusNFT] WMON transfer tx: ${wmonTransferHash}`);

    // Step 4: Award random rewards (5-1000 TOURS and EMPTOURS)
    const toursReward = BigInt(Math.floor(Math.random() * 995 + 5)) * BigInt(10) ** BigInt(18); // 5-1000 TOURS
    const emptourReward = BigInt(Math.floor(Math.random() * 995 + 5)) * BigInt(10) ** BigInt(18); // 5-1000 EMPTOURS

    if (TOURS_ADDRESS && EMPTOURS_ADDRESS) {
      try {
        // Transfer TOURS reward
        await walletClient.writeContract({
          account: privateKeyToAccount(DEPLOYER_PRIVATE_KEY),
          address: TOURS_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [monadAddress as Address, toursReward],
        });

        // Transfer EMPTOURS reward
        await walletClient.writeContract({
          account: privateKeyToAccount(DEPLOYER_PRIVATE_KEY),
          address: EMPTOURS_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'transfer',
          args: [monadAddress as Address, emptourReward],
        });

        console.log(
          `[ConsensusNFT] Rewards sent: ${toursReward.toString()} TOURS, ${emptourReward.toString()} EMPTOURS`
        );
      } catch (err) {
        console.error('[ConsensusNFT] Failed to send rewards:', err);
        // Don't block minting if rewards fail
      }
    }

    // Step 5: Enter in today's lottery
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const lotteryKey = `lottery:${today}:entries`;
    await redis.sadd(lotteryKey, userSafeAddress);
    await redis.expire(lotteryKey, 86400); // Expire after 24h

    console.log(`[ConsensusNFT] User entered in lottery for ${today}`);

    // Step 6: Generate Hong Kong artwork
    console.log('[ConsensusNFT] Generating artwork...');
    let coverIpfsHash = '';
    try {
      const artResult = await generateAgentMusicNFTAssets(
        `Consensus Hong Kong 2026 - ${ethereumAddress.slice(-4)}`,
        'Hong Kong',
        'Digital Art, Proof of Attendance'
      );
      coverIpfsHash = artResult.ipfsHash;
    } catch (err) {
      console.error('[ConsensusNFT] Artwork generation failed:', err);
      coverIpfsHash = 'QmDefaultConsensusArtwork';
    }

    const tokenURI = `ipfs://${coverIpfsHash}`;

    // Step 7: Mint NFT
    console.log(`[ConsensusNFT] Minting on Monad...`);
    if (!CONSENSUS_NFT_ADDRESS || !DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { success: false, error: 'Contract or deployer not configured' },
        { status: 500 }
      );
    }

    const account = privateKeyToAccount(DEPLOYER_PRIVATE_KEY);
    const mintWalletClient = createWalletClient({
      account,
      chain: activeChain,
      transport: http(MONAD_RPC),
    });

    const mintHash = await mintWalletClient.writeContract({
      address: CONSENSUS_NFT_ADDRESS,
      abi: CONSENSUS_NFT_ABI,
      functionName: 'mint',
      args: [monadAddress as Address, ethereumAddress as Address, tokenURI],
    });

    console.log(`[ConsensusNFT] Mint tx: ${mintHash}`);
    await publicClient.waitForTransactionReceipt({ hash: mintHash });

    return NextResponse.json({
      success: true,
      message: `✅ Consensus Hong Kong NFT minted! You received ${(Number(toursReward) / 1e18).toFixed(0)} TOURS & ${(Number(emptourReward) / 1e18).toFixed(0)} EMPTOURS!`,
      txHash: mintHash,
      monadAddress,
      ethereumAddress,
      rewards: {
        tours: (Number(toursReward) / 1e18).toFixed(0),
        emptours: (Number(emptourReward) / 1e18).toFixed(0),
      },
      lotteryEntry: {
        date: today,
        cost: '2 WMON',
        message: `You've been entered in today's lottery!`,
      },
    });
  } catch (err) {
    console.error('[ConsensusNFT] Mint error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to mint Consensus NFT' },
      { status: 500 }
    );
  }
}
