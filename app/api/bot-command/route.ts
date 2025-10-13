import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const { command } = await request.json();
  // Process command, e.g., send to Farcaster bot
  console.log('Bot command:', command);
  return NextResponse.json({ success: true, response: 'Command processed' });
}
