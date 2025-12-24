import { NextRequest, NextResponse } from 'next/server';
import { Address, encodeFunctionData, createPublicClient, http, parseEther } from 'viem';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
const PASSPORT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com';

const monadTestnet = {
  id: 10143,
  name: 'Monad Testnet',
  nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
  rpcUrls: { default: { http: [MONAD_RPC] } },
};

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(MONAD_RPC),
});

// Passport NFT ABI
const passportAbi = [
  { name: 'balanceOf', type: 'function', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'tokenOfOwnerByIndex', type: 'function', inputs: [{ name: 'owner', type: 'address' }, { name: 'index', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getCreditScore', type: 'function', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

// TourGuideRegistry ABI
const registryAbi = [
  { name: 'isRegisteredGuide', type: 'function', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  {
    name: 'registerGuide',
    type: 'function',
    inputs: [
      { name: 'guideFid', type: 'uint256' },
      { name: 'passportTokenId', type: 'uint256' },
      { name: 'countries', type: 'string[]' },
      { name: 'hourlyRateWMON', type: 'uint256' },
      { name: 'hourlyRateTOURS', type: 'uint256' },
      { name: 'bio', type: 'string' },
      { name: 'profileImageIPFS', type: 'string' },
    ],
    outputs: [],
    stateMutability: 'nonpayable'
  },
] as const;

export async function POST(req: NextRequest) {
  try {
    const { fid, username, displayName, pfpUrl, location, walletAddress } = await req.json();

    if (!fid || !username) {
      return NextResponse.json(
        { error: 'FID and username required' },
        { status: 400 }
      );
    }

    if (!walletAddress) {
      return NextResponse.json(
        { error: 'Wallet address required for guide registration' },
        { status: 400 }
      );
    }

    console.log('[MirrorMate] Registering guide:', { fid, username, displayName, walletAddress });

    // Check if already registered on-chain
    const isRegistered = await publicClient.readContract({
      address: REGISTRY_ADDRESS,
      abi: registryAbi,
      functionName: 'isRegisteredGuide',
      args: [BigInt(fid)],
    });

    if (isRegistered) {
      console.log('[MirrorMate] Guide already registered on-chain:', fid);
      return NextResponse.json({
        success: true,
        message: 'Already registered as guide',
      });
    }

    // Check for passport ownership
    const passportBalance = await publicClient.readContract({
      address: PASSPORT_ADDRESS,
      abi: passportAbi,
      functionName: 'balanceOf',
      args: [walletAddress as Address],
    });

    if (passportBalance === 0n) {
      return NextResponse.json(
        { error: 'You need a Passport NFT to register as a guide. Mint one first!' },
        { status: 400 }
      );
    }

    // Get passport token ID and credit score
    const tokenId = await publicClient.readContract({
      address: PASSPORT_ADDRESS,
      abi: passportAbi,
      functionName: 'tokenOfOwnerByIndex',
      args: [walletAddress as Address, 0n],
    });

    const creditScore = await publicClient.readContract({
      address: PASSPORT_ADDRESS,
      abi: passportAbi,
      functionName: 'getCreditScore',
      args: [tokenId],
    });

    console.log('[MirrorMate] Passport found:', { tokenId: tokenId.toString(), creditScore: creditScore.toString() });

    if (creditScore < 200n) {
      return NextResponse.json(
        { error: `Credit score too low (${creditScore}). Need 200+ for auto-approval, or 100+ to apply for manual approval.` },
        { status: 400 }
      );
    }

    // Register on-chain via Safe
    const tx = await sendSafeTransaction([{
      to: REGISTRY_ADDRESS,
      value: 0n,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'registerGuide',
        args: [
          BigInt(fid),
          tokenId,
          [location || 'Global'],
          parseEther('10'),  // 10 WMON minimum hourly rate
          0n,                // TOURS rate (optional)
          `${displayName || username} - Travel Guide`,
          pfpUrl || '',
        ],
      }) as `0x${string}`,
    }]);

    console.log('[MirrorMate] Guide registered on-chain:', tx);

    return NextResponse.json({
      success: true,
      txHash: tx,
      explorer: `https://testnet.monadscan.com/tx/${tx}`,
    });

  } catch (error: any) {
    console.error('[MirrorMate] Registration failed:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Registration failed',
      },
      { status: 500 }
    );
  }
}
