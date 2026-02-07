import { NextRequest, NextResponse } from 'next/server';

// EmpowerTweaks Upload API
// POST /api/tweaks/upload - Upload .deb file and icon to IPFS
// Requires multipart form data with:
// - debFile: The .deb package file
// - iconFile: Icon/cover image (optional)
// - metadata: JSON string with tweak details

const PINATA_JWT = process.env.PINATA_JWT || '';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';

interface UploadResult {
  debHash?: string;
  iconHash?: string;
  metadataHash?: string;
  debUrl?: string;
  iconUrl?: string;
  metadataUrl?: string;
}

async function uploadToPinata(file: File, name: string): Promise<string> {
  if (!PINATA_JWT) {
    // Mock for development
    console.log(`[Upload] Mock uploading ${name}: ${file.name} (${file.size} bytes)`);
    return `Qm${Buffer.from(name + Date.now()).toString('base64').slice(0, 44)}`;
  }

  const formData = new FormData();
  formData.append('file', file);
  formData.append('pinataMetadata', JSON.stringify({ name }));
  formData.append('pinataOptions', JSON.stringify({ cidVersion: 1 }));

  const response = await fetch('https://api.pinata.cloud/pinning/pinFileToIPFS', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinata upload failed: ${error}`);
  }

  const data = await response.json();
  return data.IpfsHash;
}

async function uploadJsonToPinata(json: object, name: string): Promise<string> {
  if (!PINATA_JWT) {
    // Mock for development
    console.log(`[Upload] Mock uploading JSON ${name}`);
    return `Qm${Buffer.from(JSON.stringify(json)).toString('base64').slice(0, 44)}`;
  }

  const response = await fetch('https://api.pinata.cloud/pinning/pinJSONToIPFS', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent: json,
      pinataMetadata: { name },
      pinataOptions: { cidVersion: 1 },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Pinata JSON upload failed: ${error}`);
  }

  const data = await response.json();
  return data.IpfsHash;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const debFile = formData.get('debFile') as File | null;
    const iconFile = formData.get('iconFile') as File | null;
    const metadataStr = formData.get('metadata') as string | null;

    // Validate .deb file
    if (!debFile) {
      return NextResponse.json(
        { error: 'Missing required .deb file' },
        { status: 400 }
      );
    }

    // Validate file size (max 50MB for .deb)
    if (debFile.size > 50 * 1024 * 1024) {
      return NextResponse.json(
        { error: '.deb file too large (max 50MB)' },
        { status: 400 }
      );
    }

    // Validate file extension
    if (!debFile.name.endsWith('.deb')) {
      return NextResponse.json(
        { error: 'Invalid file type. Must be .deb package' },
        { status: 400 }
      );
    }

    const result: UploadResult = {};

    // Upload .deb file to IPFS
    console.log(`[Upload] Uploading .deb: ${debFile.name} (${(debFile.size / 1024).toFixed(0)} KB)`);
    result.debHash = await uploadToPinata(debFile, `tweak-${debFile.name}`);
    result.debUrl = `ipfs://${result.debHash}`;
    console.log(`[Upload] .deb uploaded: ${result.debHash}`);

    // Upload icon if provided
    if (iconFile) {
      // Validate icon size (max 5MB)
      if (iconFile.size > 5 * 1024 * 1024) {
        return NextResponse.json(
          { error: 'Icon file too large (max 5MB)' },
          { status: 400 }
        );
      }

      console.log(`[Upload] Uploading icon: ${iconFile.name}`);
      result.iconHash = await uploadToPinata(iconFile, `tweak-icon-${iconFile.name}`);
      result.iconUrl = `ipfs://${result.iconHash}`;
      console.log(`[Upload] Icon uploaded: ${result.iconHash}`);
    }

    // Parse and upload metadata
    let metadata: any = {};
    if (metadataStr) {
      try {
        metadata = JSON.parse(metadataStr);
      } catch {
        return NextResponse.json(
          { error: 'Invalid metadata JSON' },
          { status: 400 }
        );
      }
    }

    // Build full metadata for NFT
    const fullMetadata = {
      name: metadata.name || debFile.name.replace('.deb', ''),
      description: metadata.description || '',
      category: metadata.category || 'tweaks',
      developer: metadata.developer || '',
      priceInTours: metadata.priceInTours || '50',
      priceInMon: metadata.priceInMon || '0.5',
      compatibleVersions: metadata.compatibleVersions || ['18.1'],
      version: metadata.version || '1.0.0',
      changelog: metadata.changelog || 'Initial release',
      // IPFS references
      debFile: result.debUrl,
      debHash: result.debHash,
      icon: result.iconUrl || '',
      iconHash: result.iconHash || '',
      // NFT metadata standard fields
      image: result.iconUrl || '',
      external_url: `https://fcempowertours-production-6551.up.railway.app/tweaks`,
      attributes: [
        { trait_type: 'Category', value: metadata.category || 'tweaks' },
        { trait_type: 'Version', value: metadata.version || '1.0.0' },
        { trait_type: 'Developer', value: metadata.developerName || 'Unknown' },
        ...(metadata.compatibleVersions || ['18.1']).map((v: string) => ({
          trait_type: 'iOS Version',
          value: v,
        })),
      ],
      // Timestamps
      createdAt: Date.now(),
      uploadedAt: new Date().toISOString(),
    };

    // Upload metadata JSON
    console.log(`[Upload] Uploading metadata...`);
    result.metadataHash = await uploadJsonToPinata(fullMetadata, `tweak-metadata-${metadata.name || 'unknown'}`);
    result.metadataUrl = `ipfs://${result.metadataHash}`;
    console.log(`[Upload] Metadata uploaded: ${result.metadataHash}`);

    return NextResponse.json({
      success: true,
      ...result,
      metadata: fullMetadata,
      gateway: {
        debUrl: `${PINATA_GATEWAY}/ipfs/${result.debHash}`,
        iconUrl: result.iconHash ? `${PINATA_GATEWAY}/ipfs/${result.iconHash}` : null,
        metadataUrl: `${PINATA_GATEWAY}/ipfs/${result.metadataHash}`,
      },
      message: 'Files uploaded to IPFS. Use these hashes to call createTweak on the contract.',
      contractCall: {
        function: 'createTweak',
        args: {
          name: fullMetadata.name,
          description: fullMetadata.description,
          ipfsHash: result.debHash,
          metadataHash: result.metadataHash,
          iconHash: result.iconHash || '',
          priceInTours: `${parseFloat(fullMetadata.priceInTours) * 10 ** 18}`,
          priceInMon: `${parseFloat(fullMetadata.priceInMon) * 10 ** 18}`,
          compatibleVersions: fullMetadata.compatibleVersions,
          category: fullMetadata.category,
        },
      },
    });

  } catch (error: any) {
    console.error('[Upload] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Upload failed' },
      { status: 500 }
    );
  }
}

// GET - Check upload status or get file info
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const hash = searchParams.get('hash');

  if (!hash) {
    return NextResponse.json({
      service: 'EmpowerTweaks Upload API',
      endpoints: {
        'POST /api/tweaks/upload': 'Upload .deb and icon to IPFS',
        'GET /api/tweaks/upload?hash=Qm...': 'Check if file exists on IPFS',
      },
      maxDebSize: '50MB',
      maxIconSize: '5MB',
      supportedFormats: ['.deb'],
    });
  }

  // Check if hash exists on IPFS
  try {
    const gatewayUrl = `${PINATA_GATEWAY}/ipfs/${hash}`;
    const response = await fetch(gatewayUrl, { method: 'HEAD' });

    return NextResponse.json({
      hash,
      exists: response.ok,
      gatewayUrl: response.ok ? gatewayUrl : null,
    });
  } catch {
    return NextResponse.json({
      hash,
      exists: false,
      error: 'Could not verify hash',
    });
  }
}
