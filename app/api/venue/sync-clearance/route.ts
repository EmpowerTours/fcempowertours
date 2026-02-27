import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';
import { fetchClearedCatalog } from '@/lib/venue';

/**
 * POST /api/venue/sync-clearance — Sync rights clearance to VenueRegistry on-chain
 *
 * Scans Redis rights status for all music NFTs, compares with on-chain
 * clearance state, and batches batchSetClearance() calls.
 */

const KEEPER_SECRET = process.env.KEEPER_SECRET || '';
const VENUE_REGISTRY_ADDRESS = process.env.NEXT_PUBLIC_VENUE_REGISTRY;
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

export async function POST(req: NextRequest) {
  try {
    const { secret } = await req.json();
    if (secret !== KEEPER_SECRET && KEEPER_SECRET) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    if (!VENUE_REGISTRY_ADDRESS || !DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json({
        success: false,
        error: 'VenueRegistry not configured (NEXT_PUBLIC_VENUE_REGISTRY or DEPLOYER_PRIVATE_KEY missing)',
      }, { status: 500 });
    }

    // Get cleared catalog from Redis (rights-checked)
    const cleared = await fetchClearedCatalog(redis);
    const clearedTokenIds = cleared.map(s => BigInt(s.tokenId));

    if (clearedTokenIds.length === 0) {
      return NextResponse.json({ success: true, message: 'No cleared songs to sync', synced: 0 });
    }

    const { JsonRpcProvider, Wallet, Contract } = await import('ethers');
    const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz';
    const provider = new JsonRpcProvider(MONAD_RPC);
    const wallet = new Wallet(DEPLOYER_PRIVATE_KEY, provider);

    const registryAbi = [
      'function clearedForVenue(uint256 tokenId) external view returns (bool)',
      'function batchSetClearance(uint256[] calldata tokenIds, bool cleared) external',
    ];
    const registry = new Contract(VENUE_REGISTRY_ADDRESS, registryAbi, wallet);

    // Check which tokenIds need to be set to cleared
    const toSet: bigint[] = [];
    for (const tokenId of clearedTokenIds) {
      const isCleared = await registry.clearedForVenue(tokenId);
      if (!isCleared) {
        toSet.push(tokenId);
      }
    }

    if (toSet.length === 0) {
      return NextResponse.json({ success: true, message: 'All songs already synced', synced: 0 });
    }

    // Batch set clearance (50 at a time to match contract limit)
    let synced = 0;
    for (let i = 0; i < toSet.length; i += 50) {
      const batch = toSet.slice(i, i + 50);
      const tx = await registry.batchSetClearance(batch, true);
      await tx.wait();
      synced += batch.length;
      console.log(`[SyncClearance] Batch set ${batch.length} tokenIds to cleared`);
    }

    console.log(`[SyncClearance] Synced ${synced} tokenIds to on-chain clearance`);

    return NextResponse.json({
      success: true,
      message: `Synced ${synced} token clearances`,
      synced,
      totalCleared: clearedTokenIds.length,
    });
  } catch (error: any) {
    console.error('[SyncClearance] Error:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
