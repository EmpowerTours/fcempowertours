import { NextRequest, NextResponse } from 'next/server';
import { getCountryByCode } from '@/lib/passport/countries';

const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

export async function GET(request: NextRequest) {
  try {
    // Get the user's IP from the request - check multiple header sources
    let ip = '';
    
    // Priority order for IP detection
    const xForwardedFor = request.headers.get('x-forwarded-for');
    const xRealIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');
    
    if (xForwardedFor) {
      // x-forwarded-for can have multiple IPs, get the first (client IP)
      ip = xForwardedFor.split(',')[0].trim();
    } else if (xRealIp) {
      ip = xRealIp.trim();
    } else if (cfConnectingIp) {
      ip = cfConnectingIp.trim();
    } else {
      // Last resort: let IPInfo auto-detect from request source
      ip = 'auto';
    }

    console.log('🌍 Detecting location for IP:', ip);
    console.log('📋 Request headers:', {
      'x-forwarded-for': xForwardedFor,
      'x-real-ip': xRealIp,
      'cf-connecting-ip': cfConnectingIp,
    });

    if (!IPINFO_TOKEN) {
      console.error('❌ IPINFO_TOKEN not configured');
      return NextResponse.json({
        country: 'US',
        country_name: 'United States'
      }, { status: 200 });
    }

    // Call IPInfo API
    // SECURITY: Build URL without logging token
    const ipinfoUrl = ip === 'auto'
      ? `https://ipinfo.io/?token=${IPINFO_TOKEN}`
      : `https://ipinfo.io/${ip}?token=${IPINFO_TOKEN}`;

    // Note: IPInfo only supports token via query param, not Authorization header
    // We don't log the URL to avoid exposing the token in logs
    console.log('📡 Fetching geo data for IP:', ip === 'auto' ? 'auto-detect' : ip);

    const response = await fetch(ipinfoUrl, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      throw new Error(`IPInfo API returned ${response.status}`);
    }

    const data = await response.json();
    
    console.log('✅ IPInfo detected:', {
      ip: data.ip,
      city: data.city,
      region: data.region,
      country: data.country,
    });

    // Get full country info from our 195 countries database
    const countryInfo = getCountryByCode(data.country);
    const countryName = countryInfo?.name || 'United States';

    console.log('🌍 Country:', countryInfo?.flag, countryName);

    // Return in the format the passport page expects
    return NextResponse.json({
      country: data.country || 'US',
      country_name: countryName,
      city: data.city,
      region: data.region,
    });

  } catch (error) {
    console.error('❌ Geolocation error:', error);
    
    // Fallback to US
    return NextResponse.json({
      country: 'US',
      country_name: 'United States'
    }, { status: 200 });
  }
}
