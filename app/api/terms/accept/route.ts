// app/api/terms/accept/route.ts
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { address, timestamp, version } = await request.json();

    if (!address || !timestamp) {
      return NextResponse.json(
        { error: 'Address and timestamp required' },
        { status: 400 }
      );
    }

    // Get user's IP address
    const ip = request.headers.get('x-forwarded-for') || 
               request.headers.get('x-real-ip') || 
               'unknown';

    // Get user agent
    const userAgent = request.headers.get('user-agent') || 'unknown';

    // Log acceptance (you should store this in a database)
    const acceptanceRecord = {
      address: address.toLowerCase(),
      timestamp,
      version: version || '1.0',
      ip,
      userAgent,
      acceptedAt: new Date().toISOString(),
    };

    console.log('📝 Terms Accepted:', acceptanceRecord);

    // TODO: Store in database
    // await db.termsAcceptance.create({ data: acceptanceRecord });

    // Optional: Store on-chain for legal proof
    // await recordOnChain(address, timestamp);

    return NextResponse.json({
      success: true,
      message: 'Terms acceptance recorded',
      record: acceptanceRecord,
    });
  } catch (error: any) {
    console.error('Failed to record terms acceptance:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to record acceptance' },
      { status: 500 }
    );
  }
}

// Optional: Endpoint to check if user has accepted
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const address = searchParams.get('address');

    if (!address) {
      return NextResponse.json(
        { error: 'Address required' },
        { status: 400 }
      );
    }

    // TODO: Check database
    // const hasAccepted = await db.termsAcceptance.findFirst({
    //   where: { address: address.toLowerCase() }
    // });

    return NextResponse.json({
      hasAccepted: false, // Update with actual database check
      address,
    });
  } catch (error: any) {
    console.error('Failed to check terms acceptance:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
