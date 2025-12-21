import { NextRequest, NextResponse } from 'next/server';
import { IPinfoWrapper } from 'node-ipinfo';

const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  
  // Get IP from headers (x-forwarded-for or other sources)
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
    req.headers.get('x-real-ip') ||
    '127.0.0.1'; // Fallback to localhost

  if (!IPINFO_TOKEN) {
    console.warn('IPINFO_TOKEN is not set in environment variables');
    res.cookies.set('country', 'US'); // Fallback
    return res;
  }

  try {
    const ipinfoWrapper = new IPinfoWrapper(IPINFO_TOKEN);
    const data = await ipinfoWrapper.lookupIp(ip);
    const country = data.country || 'US';
    res.cookies.set('country', country);
  } catch (err) {
    console.error('IPInfo error:', err);
    res.cookies.set('country', 'US'); // Fallback
  }

  return res;
}

export const config = {
  matcher: ['/passport', '/profile'],
  runtime: 'nodejs',
};
