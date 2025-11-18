import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { updateDelegationPermissions } from '@/lib/delegation-system';

/**
 * 🔄 MIGRATION ENDPOINT
 *
 * Adds missing 'burn_music' permission to all existing delegations
 * This is needed because older delegations were created before this permission was added
 *
 * Usage:
 * POST /api/migrate-delegations
 * {
 *   "adminKey": "your-admin-key"  // Optional security check
 * }
 */

export async function POST(req: NextRequest) {
  try {
    const { adminKey } = await req.json();

    // Optional: Add admin key check for production
    // if (adminKey !== process.env.ADMIN_KEY) {
    //   return NextResponse.json(
    //     { success: false, error: 'Unauthorized' },
    //     { status: 401 }
    //   );
    // }

    console.log('🔄 Starting delegation migration...');
    console.log('   Adding missing burn_music permission');

    const keys = await redis.keys('delegation:*');
    console.log(`   Found ${keys.length} delegation(s)`);

    let updatedCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    for (const key of keys) {
      try {
        const data = await redis.get(key);
        if (!data) {
          skippedCount++;
          continue;
        }

        const delegation = typeof data === 'string' ? JSON.parse(data) : data;

        // Check if delegation already has the permission
        if (delegation.config?.permissions?.includes('burn_music')) {
          console.log(`   ✓ ${delegation.user} already has burn_music`);
          skippedCount++;
          continue;
        }

        // Check if delegation is expired
        if (delegation.expiresAt < Date.now()) {
          console.log(`   ⚠️ ${delegation.user} delegation expired, skipping`);
          skippedCount++;
          continue;
        }

        // Update the delegation
        const userAddress = delegation.user;
        const updated = await updateDelegationPermissions(userAddress, ['burn_music']);

        if (updated) {
          console.log(`   ✅ Updated ${userAddress}`);
          updatedCount++;
        } else {
          console.log(`   ❌ Failed to update ${userAddress}`);
          errorCount++;
        }
      } catch (err: any) {
        console.error(`   ❌ Error processing key ${key}:`, err.message);
        errorCount++;
      }
    }

    console.log('✅ Migration complete!');
    console.log(`   Updated: ${updatedCount}`);
    console.log(`   Skipped: ${skippedCount}`);
    console.log(`   Errors: ${errorCount}`);

    return NextResponse.json({
      success: true,
      migration: {
        total: keys.length,
        updated: updatedCount,
        skipped: skippedCount,
        errors: errorCount,
        message: `Migration complete! Updated ${updatedCount} delegation(s) with burn_music permission.`
      }
    });

  } catch (error: any) {
    console.error('❌ Migration error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Migration failed' },
      { status: 500 }
    );
  }
}
