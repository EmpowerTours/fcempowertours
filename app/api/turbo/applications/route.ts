import { NextResponse } from 'next/server';
import { redis } from '@/lib/redis';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Get all email addresses from the set
    const emails = await redis.smembers('turbo:applications');

    if (!emails || emails.length === 0) {
      return NextResponse.json({ success: true, applications: [] });
    }

    // Fetch each application record
    const applications = await Promise.all(
      emails.map(async (email) => {
        const data = await redis.get(`turbo:app:${email}`);
        if (!data) return null;
        return typeof data === 'string' ? JSON.parse(data) : data;
      })
    );

    // Filter nulls and sort by appliedAt descending
    const valid = applications
      .filter(Boolean)
      .sort((a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime());

    return NextResponse.json({ success: true, applications: valid });
  } catch (error) {
    console.error('[TurboApplications] Error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch applications' },
      { status: 500 }
    );
  }
}
