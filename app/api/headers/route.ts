import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
  const headersList = await headers();  // Await fixed
  const cookie = headersList.get('cookie') || '';
  return NextResponse.json({ cookie });
}
