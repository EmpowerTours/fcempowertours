import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const res = NextResponse.next();
  res.cookies.set('country', 'US'); // Hardcode fallback
  return res;
}

export const config = {
  matcher: ['/passport', '/profile', '/:path*'], // Include all paths for not-found
  runtime: 'nodejs',
};
