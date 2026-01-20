import { NextRequest, NextResponse } from 'next/server';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

// Maximum JSON size: 1MB
const MAX_JSON_SIZE = 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Rate limiting
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(RateLimiters.ipfsUpload, ip);

    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${rateLimit.resetIn} seconds.`,
        },
        { status: 429 }
      );
    }

    if (!PINATA_JWT) {
      return NextResponse.json(
        { success: false, error: 'Pinata configuration missing' },
        { status: 500 }
      );
    }

    // SECURITY: Check content length before parsing
    const contentLength = req.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > MAX_JSON_SIZE) {
      return NextResponse.json(
        { success: false, error: 'JSON too large. Maximum size is 1MB.' },
        { status: 413 }
      );
    }

    const body = await req.json();
    const { json, name } = body;

    if (!json) {
      return NextResponse.json(
        { success: false, error: 'No JSON data provided' },
        { status: 400 }
      );
    }

    // SECURITY: Validate JSON size after parsing
    const jsonString = JSON.stringify(json);
    if (jsonString.length > MAX_JSON_SIZE) {
      return NextResponse.json(
        { success: false, error: 'JSON too large. Maximum size is 1MB.' },
        { status: 413 }
      );
    }

    console.log('[UploadJSON] Uploading metadata to Pinata:', { name });

    const res = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: JSON.stringify({
        pinataContent: json,
        pinataMetadata: {
          name: name || 'metadata.json',
        },
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('[UploadJSON] Pinata upload failed:', errorText);
      return NextResponse.json(
        { success: false, error: 'Failed to upload JSON to IPFS' },
        { status: 500 }
      );
    }

    const data = await res.json();
    const ipfsHash = data.IpfsHash;
    const url = `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;

    console.log('[UploadJSON] Upload successful:', { ipfsHash, url });

    return NextResponse.json({
      success: true,
      ipfsHash,
      url,
    });
  } catch (error: any) {
    console.error('[UploadJSON] Error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
