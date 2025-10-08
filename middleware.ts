import { NextRequest, NextResponse } from 'next/server';

export function middleware(req: NextRequest) {
  const country = req.geo?.country || 'US'; // Fallback to 'US' if geo unavailable
  const res = NextResponse.next();
  res.cookies.set('country', country);
  return res;
}

export const config = {
  matcher: ['/passport', '/api/mint-passport'], // Apply to relevant routes
};
