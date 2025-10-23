import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

/**
 * 🔐 CREATE DELEGATION ENDPOINT
 * 
 * Sets up a gasless delegation for a user via Pimlico
 * Allows the user to execute transactions without paying gas
 * 
 * Usage:
 * POST /api/create-delegation
 * {
 *   userAddress: "0x...",
 *   durationHours: 24,
 *   maxTransactions: 100,
 *   permissions: ["mint_passport", "mint_music", "swap", "buy_itinerary"]
 * }
 */

export async function POST(req: NextRequest) {
  try {
    const { userAddress, durationHours = 24, maxTransactions = 100, permissions = [] } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'userAddress required' },
        { status: 400 }
      );
    }

    console.log('🔐 Creating delegation for:', userAddress);
    console.log('   Duration:', durationHours, 'hours');
    console.log('   Max transactions:', maxTransactions);
    console.log('   Permissions:', permissions);

    // Create delegation object
    const delegation = {
      user: userAddress,
      bot: process.env.BOT_SIGNER_ADDRESS || 'empowertoursbot',
      createdAt: Date.now(),
      expiresAt: Date.now() + (durationHours * 60 * 60 * 1000),
      transactionsExecuted: 0,
      config: {
        durationHours,
        maxTransactions,
        permissions: permissions.length > 0 ? permissions : ['mint_passport', 'mint_music', 'swap', 'buy_itinerary'],
      }
    };

    // Store in Redis with TTL
    const key = `delegation:${userAddress.toLowerCase()}`;
    const ttl = durationHours * 3600; // Convert to seconds

    await redis.setex(
      key,
      ttl,
      JSON.stringify(delegation)
    );

    console.log('✅ Delegation created and stored in Redis');
    console.log('   Key:', key);
    console.log('   TTL:', ttl, 'seconds');

    return NextResponse.json({
      success: true,
      delegation: {
        user: userAddress,
        createdAt: new Date(delegation.createdAt).toISOString(),
        expiresAt: new Date(delegation.expiresAt).toISOString(),
        durationHours,
        maxTransactions,
        permissions: delegation.config.permissions,
        message: '✅ Delegation created! You can now execute gasless transactions.'
      }
    });

  } catch (error: any) {
    console.error('❌ Error creating delegation:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to create delegation' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'address parameter required' },
        { status: 400 }
      );
    }

    console.log('🔍 Checking delegation for:', userAddress);

    const key = `delegation:${userAddress.toLowerCase()}`;
    const delegationData = await redis.get(key);

    if (!delegationData) {
      console.log('⚠️ No delegation found for:', userAddress);
      return NextResponse.json({
        success: false,
        message: 'No active delegation. Create one with POST /api/create-delegation',
        address: userAddress,
      });
    }

    const delegation = JSON.parse(delegationData as string);
    const timeLeft = delegation.expiresAt - Date.now();
    const hoursLeft = Math.round(timeLeft / (1000 * 60 * 60));
    const minutesLeft = Math.round((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const transactionsLeft = delegation.config.maxTransactions - delegation.transactionsExecuted;

    console.log('✅ Delegation found:', {
      hoursLeft,
      transactionsLeft,
      permissions: delegation.config.permissions
    });

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
      }
    });

  } catch (error: any) {
    console.error('❌ Error checking delegation:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
