import { NextRequest, NextResponse } from 'next/server';
import { getDelegation, getDelegationStats } from '@/lib/delegation-system';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      // Return global stats
      const stats = await getDelegationStats();
      return NextResponse.json({ 
        success: true, 
        stats,
        message: '📈 Global Delegation Statistics'
      });
    }

    // Return user-specific delegation
    const delegation = await getDelegation(userAddress);

    if (!delegation) {
      return NextResponse.json({
        success: false,
        message: 'No active delegation',
        address: userAddress,
      });
    }

    const hoursLeft = Math.round((delegation.expiresAt - Date.now()) / (1000 * 60 * 60));
    const minutesLeft = Math.round(((delegation.expiresAt - Date.now()) % (1000 * 60 * 60)) / (1000 * 60));
    const transactionsLeft = delegation.config.maxTransactions - delegation.transactionsExecuted;

    return NextResponse.json({
      success: true,
      delegation: {
        user: delegation.user,
        bot: delegation.bot,
        hoursLeft,
        minutesLeft,
        totalTimeLeft: `${hoursLeft}h ${minutesLeft}m`,
        transactionsUsed: delegation.transactionsExecuted,
        transactionsLeft,
        maxTransactions: delegation.config.maxTransactions,
        permissions: delegation.config.permissions,
        createdAt: new Date(delegation.createdAt).toISOString(),
        expiresAt: new Date(delegation.expiresAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('❌ Error getting delegation status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      // Return global stats
      const stats = await getDelegationStats();
      return NextResponse.json({ 
        success: true, 
        stats,
        message: '📈 Global Delegation Statistics'
      });
    }

    // Return user-specific delegation
    const delegation = await getDelegation(userAddress);

    if (!delegation) {
      return NextResponse.json({
        success: false,
        message: 'No active delegation',
        address: userAddress,
      });
    }

    const hoursLeft = Math.round((delegation.expiresAt - Date.now()) / (1000 * 60 * 60));
    const minutesLeft = Math.round(((delegation.expiresAt - Date.now()) % (1000 * 60 * 60)) / (1000 * 60));
    const transactionsLeft = delegation.config.maxTransactions - delegation.transactionsExecuted;

    return NextResponse.json({
      success: true,
      delegation: {
        user: delegation.user,
        bot: delegation.bot,
        hoursLeft,
        minutesLeft,
        totalTimeLeft: `${hoursLeft}h ${minutesLeft}m`,
        transactionsUsed: delegation.transactionsExecuted,
        transactionsLeft,
        maxTransactions: delegation.config.maxTransactions,
        permissions: delegation.config.permissions,
        createdAt: new Date(delegation.createdAt).toISOString(),
        expiresAt: new Date(delegation.expiresAt).toISOString(),
      },
    });
  } catch (error: any) {
    console.error('❌ Error getting delegation status:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
