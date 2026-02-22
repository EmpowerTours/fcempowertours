import { NextRequest, NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { name, email, twitter, bybit, why, tier } = await req.json();

    // Validate required fields
    if (!name || !email || !bybit || !why || !tier) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: name, email, bybit, why, tier' },
        { status: 400 }
      );
    }

    // Validate tier
    if (!['explorer', 'builder', 'founder'].includes(tier)) {
      return NextResponse.json(
        { success: false, error: 'Invalid tier. Must be explorer, builder, or founder' },
        { status: 400 }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { success: false, error: 'Invalid email address' },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const key = `turbo:app:${normalizedEmail}`;

    // Check for duplicate application
    const existing = await redis.get(key);
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An application with this email already exists' },
        { status: 409 }
      );
    }

    const application = {
      name: name.trim(),
      email: normalizedEmail,
      twitter: twitter?.trim() || '',
      bybit: bybit.trim(),
      why: why.trim(),
      tier,
      appliedAt: new Date().toISOString(),
      status: 'pending',
    };

    // Store application data
    await redis.set(key, JSON.stringify(application));

    // Add email to the applications set for listing
    await redis.sadd('turbo:applications', normalizedEmail);

    console.log(`[TurboApply] New application from ${normalizedEmail} (${tier})`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[TurboApply] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to submit application' },
      { status: 500 }
    );
  }
}
