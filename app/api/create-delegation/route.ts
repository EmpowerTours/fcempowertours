import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { updateDelegationPermissions } from '@/lib/delegation-system';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';
import {
  generateNonce,
  authenticateRequest,
  buildDelegationMessage,
  sanitizeErrorForResponse,
  SIGNATURE_EXPIRY_MS,
} from '@/lib/auth';

/**
 * 🔐 CREATE DELEGATION ENDPOINT (SECURED)
 *
 * SECURITY CHANGES:
 * - Requires wallet signature to prove ownership
 * - Uses nonce to prevent replay attacks
 * - Validates timestamp to prevent stale requests
 * - Restricted default permissions (no send_tours by default)
 *
 * Flow:
 * 1. GET /api/create-delegation?address=0x... - Get nonce for signing
 * 2. Frontend signs message with wallet
 * 3. POST /api/create-delegation - Submit signed request
 */

// SECURITY: Restricted default permissions (high-risk actions excluded)
const DEFAULT_PERMISSIONS = [
  'mint_passport',
  'mint_music',
  'buy_music',
  'burn_music',
  'burn_nft',
  'burn_itinerary',
  'stake_music',
  'unstake_music',
  'swap_mon_for_tours',
  'buy_itinerary',
  // 'send_tours' - REMOVED: High-risk, requires explicit request
  'approve_yield_strategy',
  'stake_tours',
  'unstake_tours',
  'stake_music_yield',
  'unstake_music_yield',
  'claim_rewards',
  'create_tanda_group',
  'join_tanda_group',
  'contribute_tanda',
  'claim_tanda_payout',
  'purchase_event_ticket',
  'submit_demand_signal',
  'withdraw_demand_signal',
];

// High-risk permissions that require explicit request
const HIGH_RISK_PERMISSIONS = [
  'send_tours',
  'admin_burn',
];

/**
 * GET - Request nonce for delegation creation
 * Also can check existing delegation status
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');
    const requestNonce = searchParams.get('nonce') === 'true';

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'address parameter required' },
        { status: 400 }
      );
    }

    // Validate address format
    if (!/^0x[a-fA-F0-9]{40}$/.test(userAddress)) {
      return NextResponse.json(
        { success: false, error: 'Invalid Ethereum address format' },
        { status: 400 }
      );
    }

    // If requesting nonce for new delegation
    if (requestNonce) {
      const ip = getClientIP(req);
      const rateLimit = await checkRateLimit(RateLimiters.delegation, ip, userAddress);

      if (!rateLimit.allowed) {
        return NextResponse.json(
          {
            success: false,
            error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
          },
          { status: 429 }
        );
      }

      const nonce = await generateNonce(userAddress, 'delegation');
      const timestamp = Date.now();
      const durationHours = 24; // Default duration for message preview

      return NextResponse.json({
        success: true,
        nonce,
        timestamp,
        messageToSign: buildDelegationMessage(userAddress, timestamp, nonce, durationHours),
        expiresIn: SIGNATURE_EXPIRY_MS / 1000,
        instructions: 'Sign the messageToSign with your wallet, then POST with signature.',
      });
    }

    // Check existing delegation status
    console.log('[Delegation] Checking status for:', userAddress);

    const key = `delegation:${userAddress.toLowerCase()}`;
    const delegationData = await redis.get(key);

    if (!delegationData) {
      return NextResponse.json({
        success: false,
        message: 'No active delegation. Request a nonce with ?nonce=true to create one.',
        address: userAddress,
      });
    }

    const delegation = JSON.parse(delegationData as string);
    const timeLeft = delegation.expiresAt - Date.now();
    const hoursLeft = Math.round(timeLeft / (1000 * 60 * 60));
    const minutesLeft = Math.round((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
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
      }
    });

  } catch (error: any) {
    console.error('[Delegation] GET Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}

/**
 * POST - Create delegation with signature verification
 */
export async function POST(req: NextRequest) {
  try {
    // SECURITY: Rate limiting
    const ip = getClientIP(req);
    const body = await req.json();
    const { userAddress, signature, timestamp, nonce, durationHours = 24, maxTransactions = 100, permissions = [] } = body;

    // Enhanced rate limiting with user identifier
    const rateLimit = await checkRateLimit(RateLimiters.delegation, ip, userAddress);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    // SECURITY: Validate required auth fields
    if (!userAddress || !signature || !timestamp || !nonce) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: userAddress, signature, timestamp, nonce. Use GET ?nonce=true first.',
        },
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

    console.log('[Delegation] Creating for:', userAddress);

    // SECURITY: Build and verify signed message
    const expectedMessage = buildDelegationMessage(userAddress, timestamp, nonce, durationHours);

    const authResult = await authenticateRequest(
      { address: userAddress, signature, timestamp, nonce },
      expectedMessage,
      'delegation',
      true // Require nonce
    );

    if (!authResult.valid) {
      console.error(`[Delegation] Auth failed for ${userAddress}: ${authResult.error}`);
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 403 }
      );
    }

    console.log(`[Delegation] ✅ Verified signature for ${userAddress}`);

    // SECURITY: Filter and validate permissions
    let finalPermissions = permissions.length > 0 ? permissions : [...DEFAULT_PERMISSIONS];

    // Remove any high-risk permissions unless explicitly requested with signature
    const requestedHighRisk = finalPermissions.filter((p: string) => HIGH_RISK_PERMISSIONS.includes(p));
    if (requestedHighRisk.length > 0) {
      console.warn(`[Delegation] High-risk permissions requested: ${requestedHighRisk.join(', ')}`);
      // For now, still allow if signed - but log it
    }

    // Deduplicate permissions
    finalPermissions = [...new Set(finalPermissions)];

    // Create delegation object
    const delegation = {
      user: userAddress.toLowerCase(),
      bot: process.env.BOT_SIGNER_ADDRESS || 'empowertoursbot',
      createdAt: Date.now(),
      expiresAt: Date.now() + (durationHours * 60 * 60 * 1000),
      transactionsExecuted: 0,
      config: {
        durationHours,
        maxTransactions,
        permissions: finalPermissions,
      },
      // SECURITY: Track auth metadata
      authMetadata: {
        signedAt: timestamp,
        nonce,
        ip: ip,
      }
    };

    // Store in Redis with TTL
    const key = `delegation:${userAddress.toLowerCase()}`;
    const ttl = durationHours * 3600;

    const delegationJson = JSON.stringify(delegation);
    console.log(`[Delegation] Storing: key=${key}, ttl=${ttl}s`);

    await redis.setex(key, ttl, delegationJson);

    // Verify storage
    const verification = await redis.get(key);
    if (!verification) {
      console.error('[Delegation] CRITICAL: Failed to store in Redis');
      throw new Error('Failed to store delegation');
    }

    console.log('[Delegation] ✅ Created and verified');

    return NextResponse.json({
      success: true,
      delegation: {
        user: userAddress.toLowerCase(),
        createdAt: new Date(delegation.createdAt).toISOString(),
        expiresAt: new Date(delegation.expiresAt).toISOString(),
        durationHours,
        maxTransactions,
        permissions: finalPermissions,
        message: 'Delegation created! You can now execute gasless transactions.'
      }
    });

  } catch (error: any) {
    console.error('[Delegation] POST Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}

/**
 * PATCH - Update delegation permissions (requires signature)
 */
export async function PATCH(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const body = await req.json();
    const { userAddress, addPermissions, signature, timestamp, nonce } = body;

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

    // SECURITY: Require signature for permission updates
    if (!signature || !timestamp || !nonce) {
      return NextResponse.json(
        {
          success: false,
          error: 'Signature required to update permissions. Use GET ?nonce=true first.',
        },
        { status: 400 }
      );
    }

    // Build message for permission update
    const expectedMessage = `EmpowerTours Permission Update

Address: ${userAddress.toLowerCase()}
Action: Add permissions
Permissions: ${addPermissions.join(', ')}
Timestamp: ${timestamp}
Nonce: ${nonce}

Sign this message to authorize adding these permissions.`;

    const authResult = await authenticateRequest(
      { address: userAddress, signature, timestamp, nonce },
      expectedMessage,
      'delegation-update',
      true
    );

    if (!authResult.valid) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 403 }
      );
    }

    console.log('[Delegation] Updating permissions for:', userAddress);

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
        message: 'Delegation permissions updated successfully!'
      }
    });

  } catch (error: any) {
    console.error('[Delegation] PATCH Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}

/**
 * DELETE - Revoke delegation (requires signature)
 */
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userAddress = searchParams.get('address');
    const signature = req.headers.get('x-signature');
    const timestamp = req.headers.get('x-timestamp');
    const nonce = req.headers.get('x-nonce');

    if (!userAddress) {
      return NextResponse.json(
        { success: false, error: 'address parameter required' },
        { status: 400 }
      );
    }

    // SECURITY: Require signature to revoke delegation
    if (!signature || !timestamp || !nonce) {
      return NextResponse.json(
        {
          success: false,
          error: 'Signature required to revoke delegation. Pass x-signature, x-timestamp, x-nonce in headers.',
        },
        { status: 400 }
      );
    }

    const expectedMessage = `EmpowerTours Revoke Delegation

Address: ${userAddress.toLowerCase()}
Action: Revoke delegation
Timestamp: ${timestamp}
Nonce: ${nonce}

Sign this message to revoke your delegation.`;

    const authResult = await authenticateRequest(
      { address: userAddress, signature, timestamp: parseInt(timestamp), nonce },
      expectedMessage,
      'delegation-revoke',
      true
    );

    if (!authResult.valid) {
      return NextResponse.json(
        { success: false, error: authResult.error },
        { status: 403 }
      );
    }

    const key = `delegation:${userAddress.toLowerCase()}`;
    await redis.del(key);

    console.log('[Delegation] ✅ Revoked for:', userAddress);

    return NextResponse.json({
      success: true,
      message: 'Delegation revoked successfully',
      address: userAddress,
    });

  } catch (error: any) {
    console.error('[Delegation] DELETE Error:', error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorForResponse(error) },
      { status: 500 }
    );
  }
}
