import { NextRequest, NextResponse } from 'next/server';
import { requireUserProof } from '@/lib/require-user-proof';
import { encodeFunctionData, type Address } from 'viem';
import { sendUserSafeTransaction } from '@/lib/user-safe';
import { EPK_REGISTRY_ADDRESS } from '@/lib/epk/constants';
import EPKRegistryABI from '@/lib/abis/EPKRegistry.json';

/**
 * POST /api/epk/booking/[bookingId] - Perform booking actions
 * Body: { action: 'confirm' | 'complete' | 'refund' | 'cancel', userAddress: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ bookingId: string }> }
) {
  try {
    const { bookingId } = await params;
    const { action, userAddress } = await req.json();

    if (!action || !userAddress) {
      return NextResponse.json({ error: 'action and userAddress required' }, { status: 400 });
    }

    const proof = await requireUserProof(req, userAddress, "epk-booking-action");
    if (!proof.ok) return proof.response;
    const actor = proof.address;

    if (!EPK_REGISTRY_ADDRESS) {
      return NextResponse.json({ error: 'EPK Registry not configured' }, { status: 500 });
    }

    const functionMap: Record<string, string> = {
      confirm: 'confirmBooking',
      complete: 'completeBooking',
      refund: 'requestRefund',
      cancel: 'cancelBooking',
    };

    const functionName = functionMap[action];
    if (!functionName) {
      return NextResponse.json({ error: 'Invalid action. Must be: confirm, complete, refund, or cancel' }, { status: 400 });
    }

    const data = encodeFunctionData({
      abi: EPKRegistryABI,
      functionName,
      args: [BigInt(bookingId)],
    });

    const result = await sendUserSafeTransaction(actor, [
      { to: EPK_REGISTRY_ADDRESS as Address, value: 0n, data },
    ]);

    console.log(`[EPK Booking] ${action} booking #${bookingId}:`, result.txHash);

    return NextResponse.json({
      success: true,
      action,
      bookingId: Number(bookingId),
      txHash: result.txHash,
      explorer: `https://monadscan.com/tx/${result.txHash}`,
    });
  } catch (error: any) {
    console.error('[EPK Booking] Action error:', error);
    return NextResponse.json({ error: error.message || 'Booking action failed' }, { status: 500 });
  }
}
