import { NextRequest, NextResponse } from 'next/server';

/**
 * Oracle Purchase Experience Route
 *
 * Purchases an experience/itinerary from the ItineraryNFT contract.
 * - 70% goes to the creator
 * - 30% goes to the platform
 * - Buyer receives access to tips and can check-in for a stamp
 */

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { buyer, itineraryId, price } = body;

    // Validate required fields
    if (!buyer) {
      return NextResponse.json(
        { success: false, error: 'Buyer wallet address is required' },
        { status: 400 }
      );
    }

    if (!itineraryId) {
      return NextResponse.json(
        { success: false, error: 'Itinerary ID is required' },
        { status: 400 }
      );
    }

    console.log('[PurchaseExperience] Purchasing:', {
      buyer,
      itineraryId,
      price,
    });

    // Build the base URL for execute-delegated
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    // Call execute-delegated with purchase_itinerary action
    const executeRes = await fetch(`${baseUrl}/api/execute-delegated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress: buyer,
        action: 'purchase_itinerary',
        params: {
          itineraryId: itineraryId.toString(),
        },
      }),
    });

    const executeData = await executeRes.json();

    if (!executeData.success) {
      console.error('[PurchaseExperience] Execute failed:', executeData.error);
      return NextResponse.json(
        { success: false, error: executeData.error || 'Failed to purchase experience' },
        { status: 500 }
      );
    }

    console.log('[PurchaseExperience] Success:', {
      txHash: executeData.txHash,
    });

    return NextResponse.json({
      success: true,
      txHash: executeData.txHash,
      itineraryId,
      message: 'Experience purchased! Visit the location to check-in and earn your stamp.',
    });

  } catch (error: any) {
    console.error('[PurchaseExperience] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to purchase experience' },
      { status: 500 }
    );
  }
}
