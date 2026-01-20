import { NextRequest, NextResponse } from 'next/server';

// In production, this would save to a database
// For now, we'll just log matches
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { userFid, guideFid, guideId } = body;

    console.log('💕 New Match:', {
      userFid,
      guideFid,
      guideId,
      timestamp: new Date().toISOString(),
    });

    // TODO: Save to database
    // await db.matches.create({
    //   userFid,
    //   guideFid,
    //   guideId,
    //   matchedAt: new Date(),
    // });

    return NextResponse.json({
      success: true,
      message: 'Match saved successfully',
    });
  } catch (error: any) {
    console.error('Save match error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to save match',
      },
      { status: 500 }
    );
  }
}
