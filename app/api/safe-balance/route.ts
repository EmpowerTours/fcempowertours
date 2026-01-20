import { NextRequest, NextResponse } from 'next/server';
import { getSafeInfo, checkSafeBalance } from '@/lib/safe';
import { parseEther } from 'viem';

export async function GET(req: NextRequest) {
  try {
    const info = await getSafeInfo();
    
    // Check if Safe has enough for common operations
    const canMintPassport = await checkSafeBalance(parseEther('0.01'));
    const canMintMusic = await checkSafeBalance(parseEther('0.01'));
    const canSwap = await checkSafeBalance(parseEther('0.1'));
    
    return NextResponse.json({
      success: true,
      safe: info,
      capabilities: {
        canMintPassport,
        canMintMusic,
        canSwap,
      },
      needsFunding: info.balanceFormatted < 1, // Alert if below 1 MON
    });
  } catch (error: any) {
    console.error('Error getting Safe balance:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
