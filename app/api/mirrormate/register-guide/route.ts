import { NextRequest, NextResponse } from 'next/server';
import { Address, encodeFunctionData } from 'viem';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';

const REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_TOUR_GUIDE_REGISTRY as Address;

export async function POST(req: NextRequest) {
  try {
    const { fid, username, displayName, pfpUrl, location } = await req.json();

    if (!fid || !username) {
      return NextResponse.json(
        { error: 'FID and username required' },
        { status: 400 }
      );
    }

    console.log('[MirrorMate] Registering guide:', { fid, username, displayName });

    // Import Registry ABI
    const { default: registryAbiJson } = await import('@/lib/abis/EmpowerToursRegistry.json');
    const registryAbi = registryAbiJson.abi;

    // Register user as guide via Safe
    const tx = await sendSafeTransaction([{
      to: REGISTRY_ADDRESS,
      value: 0n,
      data: encodeFunctionData({
        abi: registryAbi,
        functionName: 'registerUser',
        args: [
          BigInt(fid),
          username,
          displayName || username,
          pfpUrl || '',
          true, // isGuide
          '', // bio (can be updated later)
          location || '',
          '', // languages (can be updated later)
          '', // transport (can be updated later)
        ],
      }) as `0x${string}`,
    }]);

    console.log('[MirrorMate] Guide registered successfully:', tx);

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
