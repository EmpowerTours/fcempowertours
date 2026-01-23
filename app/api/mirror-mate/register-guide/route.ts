import { NextRequest, NextResponse } from 'next/server';
import { Address, encodeFunctionData, createPublicClient, http, parseEther, Hex } from 'viem';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { sendUserSafeTransaction, getUserSafeAddress, checkUserSafeBalance } from '@/lib/user-safe';
import { USE_USER_SAFES } from '@/lib/safe-mode';
import { activeChain } from '@/app/chains';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;
const PASSPORT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address;
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC;

const publicClient = createPublicClient({
  chain: activeChain,
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
    const {
      fid,
      username,
      displayName,
      pfpUrl,
      location,
      walletAddress,
      countryCode,
      bio,
      languages,
      transport,
      hourlyRate
    } = await req.json();

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

    if (!bio || bio.trim().length === 0) {
      return NextResponse.json(
        { error: 'Bio is required' },
        { status: 400 }
      );
    }

    console.log('[MirrorMate] Registering guide:', { fid, username, displayName, walletAddress, bio, languages, transport, hourlyRate });

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

    // Parse hourly rate - default to 10 WMON if not provided or invalid
    const hourlyRateWMON = hourlyRate && parseFloat(hourlyRate) >= 10
      ? parseEther(hourlyRate.toString())
      : parseEther('10');

    // Build bio with languages and transport info
    const fullBio = [
      bio,
      languages ? `Languages: ${languages}` : '',
      transport ? `Transport: ${transport}` : '',
    ].filter(Boolean).join(' | ');

    // Get the correct passportOwner address based on Safe mode
    let passportOwner: Address;
    let tx: string;

    const calls = [{
      to: REGISTRY_ADDRESS,
      value: 0n,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'registerGuideFor',
        args: [
          walletAddress as Address, // Will be updated for User Safe mode
          BigInt(fid),
          tokenId,
          [location || 'Global'],
          hourlyRateWMON,            // User-specified hourly rate in WMON
          0n,                        // TOURS rate (optional)
          fullBio,                   // User-specified bio with languages/transport
          pfpUrl || '',
        ],
      }) as Hex,
    }];

    if (USE_USER_SAFES) {
      // User Safe mode - passport is owned by user's Safe wallet
      const userSafeAddress = await getUserSafeAddress(walletAddress as Address);
      console.log('[MirrorMate] Using User Safe:', userSafeAddress);

      // Update the passportOwner in the call data to be the Safe address
      calls[0].data = encodeFunctionData({
        abi: registryAbi,
        functionName: 'registerGuideFor',
        args: [
          userSafeAddress,  // passportOwner is the User Safe (which owns the passport)
          BigInt(fid),
          tokenId,
          [location || 'Global'],
          hourlyRateWMON,
          0n,
          fullBio,
          pfpUrl || '',
        ],
      }) as Hex;

      const result = await sendUserSafeTransaction(walletAddress as Address, calls);
      tx = result.txHash;
    } else {
      // Platform Safe mode (original behavior)
      console.log('[MirrorMate] Using Platform Safe');
      tx = await sendSafeTransaction(calls);
    }

    console.log('[MirrorMate] Guide registered on-chain:', tx);

    return NextResponse.json({
      success: true,
      txHash: tx,
      explorer: `https://monadscan.com/tx/${tx}`,
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
