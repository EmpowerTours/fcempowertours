import { NextRequest, NextResponse } from 'next/server';
import { registerUserSafeOnV2Contracts } from '@/lib/user-safe';

export async function POST(req: NextRequest) {
  try {
    const { userAddress } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress' },
        { status: 400 }
      );
    }

    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    console.log('[RegisterUserSafe] Registering:', userAddress);

    const result = await registerUserSafeOnV2Contracts(userAddress);

    return NextResponse.json({
      success: result.success,
      status: result.status,
      txHash: result.txHash || null,
    });
  } catch (error: any) {
    console.error('[RegisterUserSafe] Error:', error.message);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
