import { NextRequest, NextResponse } from 'next/server';

const PINATA_JWT = process.env.PINATA_JWT;
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

// App Router config - use nodejs runtime with extended timeout
export const runtime = 'nodejs';
export const maxDuration = 60;
// Force dynamic to avoid caching issues
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!PINATA_JWT) {
      return NextResponse.json(
        { success: false, error: 'Pinata configuration missing' },
        { status: 500 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No file provided' },
        { status: 400 }
      );
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'audio/mpeg', 'audio/wav', 'audio/mp3'];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json(
        { success: false, error: `Invalid file type: ${file.type}. Allowed: images and audio.` },
        { status: 400 }
      );
    }

    // Check file size (max 10MB)
    const maxSize = 10 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json(
        { success: false, error: 'File too large. Maximum 10MB.' },
        { status: 400 }
      );
    }

    console.log('📤 Uploading to Pinata:', {
      name: file.name,
      type: file.type,
      size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
    });

    // Upload to Pinata
    const pinataFormData = new FormData();
    pinataFormData.append('file', file);

    const metadata = JSON.stringify({
      name: file.name || 'upload',
      keyvalues: {
        source: 'empowertours',
        uploadedAt: new Date().toISOString(),
      }
    });
    pinataFormData.append('pinataMetadata', metadata);

    const res = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
      },
      body: pinataFormData,
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error('❌ Pinata upload failed:', res.status, errorText);
      return NextResponse.json(
        { success: false, error: `Pinata error: ${res.status}` },
        { status: 500 }
      );
    }

    const data = await res.json();
    const ipfsHash = data.IpfsHash;
    const url = `https://${PINATA_GATEWAY}/ipfs/${ipfsHash}`;

    console.log('✅ Pinata upload successful:', { ipfsHash, url });

    return NextResponse.json({
      success: true,
      ipfsHash,
      url,
      gateway: PINATA_GATEWAY,
    });
  } catch (error: any) {
    console.error('❌ Upload error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}
