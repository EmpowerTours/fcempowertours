import { NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function GET() {
  const headersList = headers();
  const cookie = headersList.get('cookie') || '';
  return NextResponse.json({ cookie });
}
