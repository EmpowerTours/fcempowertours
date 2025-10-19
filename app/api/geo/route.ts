import { NextRequest, NextResponse } from 'next/server';
import { getCountryByCode } from '@/lib/passport/countries';

const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

export async function GET(request: NextRequest) {
  try {
    // Get the user's IP from the request
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded ? forwarded.split(',')[0] : request.headers.get('x-real-ip') || 'me';

    console.log('🌍 Detecting location for IP:', ip);

    if (!IPINFO_TOKEN) {
      console.error('❌ IPINFO_TOKEN not configured');
      return NextResponse.json({
        country: 'US',
        country_name: 'United States'
      }, { status: 200 });
    }

    // Call IPInfo API
    const response = await fetch(
      `https://ipinfo.io/${ip === 'me' ? '' : ip}?token=${IPINFO_TOKEN}`,
      {
        headers: { 'Accept': 'application/json' },
        cache: 'no-store'
      }
    );

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
