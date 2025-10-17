import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function GET(req: NextRequest) {
  try {
    // Test if OG image is accessible
    const imageUrl = `${APP_URL}/images/og-image.png`;
    
    const response = await fetch(imageUrl, { method: 'HEAD' });
    
    return NextResponse.json({
      success: true,
      imageUrl,
      accessible: response.ok,
      status: response.status,
      headers: {
        'content-type': response.headers.get('content-type'),
        'content-length': response.headers.get('content-length'),
        'cache-control': response.headers.get('cache-control'),
      },
      ogTags: {
        'og:title': 'EmpowerTours - DigitalPassport',
        'og:description': 'Mint and share Travel and Music NFTs on EmpowerTours.',
        'og:image': imageUrl,
        'og:url': APP_URL,
        'og:type': 'website',
      },
    });
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
    }, { status: 500 });
  }
}
