import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@privy-io/server-auth';

export async function GET(req: NextRequest) {
  try {
    const user = await getUser(req, { appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID });
    return NextResponse.json({ user });
  } catch (err: any) {
    console.error('Debug Privy error:', err.message || err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
