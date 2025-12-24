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
  { name: 'getPassportByFid', type: 'function', inputs: [{ name: 'fid', type: 'uint256' }, { name: 'countryCode', type: 'string' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
  { name: 'getCreditScore', type: 'function', inputs: [{ name: 'tokenId', type: 'uint256' }], outputs: [{ type: 'uint256' }], stateMutability: 'view' },
] as const;

// TourGuideRegistry ABI - uses registerGuideFor for AA wallet support
const registryAbi = [
  { name: 'isRegisteredGuide', type: 'function', inputs: [{ name: 'fid', type: 'uint256' }], outputs: [{ type: 'bool' }], stateMutability: 'view' },
  {
    name: 'registerGuideFor',
    type: 'function',
    inputs: [
      { name: 'passportOwner', type: 'address' },
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

// Common country codes to try when looking up passport
const COMMON_COUNTRY_CODES = ['US', 'GB', 'CA', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'JP', 'KR', 'SG', 'IN', 'BR', 'MX', 'NG', 'ZA', 'AE'];

export async function POST(req: NextRequest) {
  try {
    const { fid, username, displayName, pfpUrl, location, walletAddress, countryCode } = await req.json();

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

    // Find passport by FID - try provided country code first, then common codes
    let tokenId: bigint = 0n;
    let creditScore: bigint = 0n;
    let foundCountry: string = '';

    // Build list of country codes to try
    const codesToTry = countryCode
      ? [countryCode, ...COMMON_COUNTRY_CODES.filter(c => c !== countryCode)]
      : COMMON_COUNTRY_CODES;

    console.log('[MirrorMate] Looking for passport with FID:', fid, 'trying codes:', codesToTry.slice(0, 5), '...');

    for (const code of codesToTry) {
      try {
        const passportTokenId = await publicClient.readContract({
          address: PASSPORT_ADDRESS,
          abi: passportAbi,
          functionName: 'getPassportByFid',
          args: [BigInt(fid), code],
        });

        if (passportTokenId > 0n) {
          tokenId = passportTokenId;
          foundCountry = code;
          console.log('[MirrorMate] Found passport:', { tokenId: tokenId.toString(), country: code });
          break;
        }
      } catch (err) {
        // Token not found for this country, continue trying
      }
    }

    if (tokenId === 0n) {
      console.log('[MirrorMate] No passport found for FID:', fid);
      return NextResponse.json(
        { error: 'You need a Passport NFT to register as a guide. Mint one at /passport first!' },
        { status: 400 }
      );
    }

    // Get credit score
    try {
      creditScore = await publicClient.readContract({
        address: PASSPORT_ADDRESS,
        abi: passportAbi,
        functionName: 'getCreditScore',
        args: [tokenId],
      });
    } catch (err) {
      console.log('[MirrorMate] Credit score lookup failed:', err);
      return NextResponse.json(
        { error: 'Could not verify your Passport credit score. Please try again.' },
        { status: 400 }
      );
    }

    console.log('[MirrorMate] Passport found:', { tokenId: tokenId.toString(), creditScore: creditScore.toString() });

    // No credit score requirement for testnet - anyone with a passport can register
    // Register on-chain via Safe using registerGuideFor (AA wallet support)
    // walletAddress = user's wallet that owns the passport
    // Safe account sends the tx but we pass user's wallet as passportOwner
    const tx = await sendSafeTransaction([{
      to: REGISTRY_ADDRESS,
      value: 0n,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'registerGuideFor',
        args: [
          walletAddress as Address,  // passportOwner - user's wallet that owns the passport
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
