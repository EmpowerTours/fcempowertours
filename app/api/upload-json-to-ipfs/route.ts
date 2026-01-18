import { NextRequest, NextResponse } from 'next/server';

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

export async function POST(req: NextRequest) {
  try {
    if (!PINATA_JWT) {
      return NextResponse.json(
        { success: false, error: 'Pinata configuration missing' },
        { status: 500 }
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
