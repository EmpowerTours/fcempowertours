import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { updateDelegationPermissions } from '@/lib/delegation-system';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';

/**
 * 🔐 CREATE DELEGATION ENDPOINT
 *
 * Sets up a gasless delegation for a user via Pimlico
 * Allows the user to execute transactions without paying gas
 *
 * SECURITY: Rate limited to prevent abuse
 *
 * Usage:
 * POST /api/create-delegation
 * {
 *   userAddress: "0x...",
 *   durationHours: 24,
 *   maxTransactions: 100,
 *   permissions: ["mint_passport", "mint_music", "swap_mon_for_tours", "buy_itinerary", "send_tours"]
 * }
 */

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Rate limiting to prevent delegation spam
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(RateLimiters.delegation, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    const { userAddress, durationHours = 24, maxTransactions = 100, permissions = [] } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'userAddress required' },
        { status: 400 }
      );
    }

    // SECURITY: Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
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
        // ✅ FIXED: Use correct permission names that match execute-delegated action names
        permissions: permissions.length > 0 ? permissions : [
          'mint_passport',
          'mint_music',
          'buy_music',
          'burn_music',
          'burn_nft',       // Delegated NFT burning (v7)
          'burn_itinerary', // Delegated Itinerary burning (ItineraryNFTv2)
          'stake_music',  // ✅ ADD: Internal staking for TOURS rewards
          'unstake_music', // ✅ ADD: Internal unstaking for TOURS rewards
          'swap_mon_for_tours',
          'buy_itinerary',
          'send_tours',
          // DeFi permissions
          'approve_yield_strategy', // One-time setup for staking
          'stake_tours',
          'unstake_tours',
          'stake_music_yield',   // YieldStrategy staking with MON
          'unstake_music_yield', // YieldStrategy unstaking
          'claim_rewards',
          'create_tanda_group',
          'join_tanda_group',
          'contribute_tanda',
          'claim_tanda_payout',
          'purchase_event_ticket',
          'submit_demand_signal',
          'withdraw_demand_signal',
        ],
      }
    };

    // Store in Redis with TTL
    const key = `delegation:${userAddress.toLowerCase()}`;
    const ttl = durationHours * 3600; // Convert to seconds

    const delegationJson = JSON.stringify(delegation);
    console.log(`📝 Storing delegation to Redis: key=${key}, ttl=${ttl}s, size=${delegationJson.length} bytes`);

    await redis.setex(
      key,
      ttl,
      delegationJson
    );

    // ✅ VERIFY: Immediately read back to confirm storage
    const verification = await redis.get(key);
    if (!verification) {
      console.error('❌ CRITICAL: Delegation was NOT stored in Redis!');
      throw new Error('Failed to store delegation in Redis');
    }

    console.log('✅ Delegation created and VERIFIED in Redis');
    console.log('   Key:', key);
    console.log('   TTL:', ttl, 'seconds');
    console.log('   Permissions:', delegation.config.permissions);
    console.log('   Verified:', !!verification);

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

export async function PATCH(req: NextRequest) {
  try {
    const { userAddress, addPermissions } = await req.json();

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'userAddress required' },
        { status: 400 }
      );
    }

    if (!addPermissions || !Array.isArray(addPermissions) || addPermissions.length === 0) {
      return NextResponse.json(
        { success: false, error: 'addPermissions array required' },
        { status: 400 }
      );
    }

    console.log('🔄 Updating delegation for:', userAddress);
    console.log('   Adding permissions:', addPermissions);

    const updatedDelegation = await updateDelegationPermissions(userAddress, addPermissions);

    if (!updatedDelegation) {
      return NextResponse.json(
        { success: false, error: 'No active delegation found to update' },
        { status: 404 }
      );
    }

    const timeLeft = updatedDelegation.expiresAt - Date.now();
    const hoursLeft = Math.round(timeLeft / (1000 * 60 * 60));
    const transactionsLeft = updatedDelegation.config.maxTransactions - updatedDelegation.transactionsExecuted;

    return NextResponse.json({
      success: true,
      delegation: {
        user: updatedDelegation.user,
        permissions: updatedDelegation.config.permissions,
        addedPermissions: addPermissions,
        hoursLeft,
        transactionsLeft,
        message: '✅ Delegation permissions updated successfully!'
      }
    });

  } catch (error: any) {
    console.error('❌ Error updating delegation:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update delegation' },
      { status: 500 }
    );
  }
}
