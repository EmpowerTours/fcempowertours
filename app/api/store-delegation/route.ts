import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export async function POST(req: NextRequest) {
  try {
    const { userAddress, delegation, config } = await req.json();
    
    // Store delegation in Redis with expiry
    const key = `delegation:${userAddress}`;
    const ttl = config.durationHours * 3600; // Convert hours to seconds
    
    await redis.setex(
      key,
      ttl,
      JSON.stringify({
        delegation,
        config,
        createdAt: Date.now(),
        expiresAt: Date.now() + (ttl * 1000)
      })
    );
    
    return NextResponse.json({ 
      success: true,
      message: 'Delegation stored successfully'
    });
    
  } catch (error) {
    console.error('Store delegation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to store delegation' },
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
        { success: false, error: 'Address required' },
        { status: 400 }
      );
    }
    
    const delegation = await redis.get(`delegation:${userAddress}`);
    
    if (!delegation) {
      return NextResponse.json({ 
        success: false,
        message: 'No active delegation found'
      });
    }
    
    return NextResponse.json({
      success: true,
      delegation: JSON.parse(delegation as string)
    });
    
  } catch (error) {
    console.error('Get delegation error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to get delegation' },
      { status: 500 }
    );
  }
}
