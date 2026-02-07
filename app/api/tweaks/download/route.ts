import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';
import EmpowerTweaksABI from '@/lib/abi/EmpowerTweaks.json';

// EmpowerTweaks Download API
// GET /api/tweaks/download?tweakId=1&address=0x... - Download .deb file
// Verifies ownership before allowing download

const EMPOWERTWEAKS_ADDRESS = process.env.NEXT_PUBLIC_EMPOWERTWEAKS_CONTRACT || '';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://mainnet.monad.xyz';
const PINATA_GATEWAY = process.env.PINATA_GATEWAY || 'https://gateway.pinata.cloud';

// Mock tweak data (replace with contract reads in production)
const mockTweakData: Record<number, { name: string; ipfsHash: string; version: string }> = {
  1: { name: 'Snowboard', ipfsHash: 'QmSnowboardDebFileHash123456789', version: '3.0.1' },
  2: { name: 'Filza', ipfsHash: 'QmFilzaDebFileHash123456789', version: '4.0.0' },
  3: { name: 'LocationFaker', ipfsHash: 'QmLocationFakerDebFileHash123456789', version: '2.1.0' },
  4: { name: 'Prysm', ipfsHash: 'QmPrysmDebFileHash123456789', version: '2.0.5' },
  5: { name: 'Velvet', ipfsHash: 'QmVelvetDebFileHash123456789', version: '1.2.0' },
  6: { name: 'PokeGo++', ipfsHash: 'QmPokeGoDebFileHash123456789', version: '2.5.0' },
};

// Mock purchases (replace with contract reads in production)
const mockPurchases: Record<string, number[]> = {
  // address -> [tweakIds]
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const tweakIdStr = searchParams.get('tweakId');
    const address = searchParams.get('address');
    const purchaseId = searchParams.get('purchaseId');

    // Validate inputs
    if (!tweakIdStr) {
      return NextResponse.json(
        { error: 'Missing tweakId parameter' },
        { status: 400 }
      );
    }

    const tweakId = parseInt(tweakIdStr);

    // Get tweak data
    const tweakData = mockTweakData[tweakId];
    if (!tweakData) {
      return NextResponse.json(
        { error: 'Tweak not found' },
        { status: 404 }
      );
    }

    // In production, verify ownership via contract
    /*
    const publicClient = createPublicClient({
      transport: http(MONAD_RPC),
    });

    const canDownload = await publicClient.readContract({
      address: EMPOWERTWEAKS_ADDRESS as `0x${string}`,
      abi: EmpowerTweaksABI,
      functionName: 'canDownload',
      args: [BigInt(tweakId), address as `0x${string}`],
    });

    if (!canDownload) {
      return NextResponse.json(
        { error: 'You do not own this tweak. Please purchase first.' },
        { status: 403 }
      );
    }
    */

    // For development, allow all downloads
    // In production, uncomment the verification above

    console.log(`[Download] User ${address || 'unknown'} downloading tweak #${tweakId}: ${tweakData.name}`);

    // Generate download URL
    const downloadUrl = `${PINATA_GATEWAY}/ipfs/${tweakData.ipfsHash}`;

    // Option 1: Redirect to IPFS gateway
    // return NextResponse.redirect(downloadUrl);

    // Option 2: Return download info (preferred for tracking)
    return NextResponse.json({
      success: true,
      tweak: {
        id: tweakId,
        name: tweakData.name,
        version: tweakData.version,
      },
      download: {
        ipfsHash: tweakData.ipfsHash,
        url: downloadUrl,
        filename: `${tweakData.name.toLowerCase().replace(/\s+/g, '-')}_${tweakData.version}.deb`,
      },
      installation: {
        method: 'dpkg',
        command: `dpkg -i ${tweakData.name.toLowerCase().replace(/\s+/g, '-')}_${tweakData.version}.deb`,
        note: 'Requires jailbroken device with terminal access',
      },
    });

  } catch (error: any) {
    console.error('[Download] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Download failed' },
      { status: 500 }
    );
  }
}

// POST - Verify ownership and generate signed download URL
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tweakId, address, signature } = body;

    if (!tweakId || !address) {
      return NextResponse.json(
        { error: 'Missing tweakId or address' },
        { status: 400 }
      );
    }

    // In production:
    // 1. Verify the signature matches the address
    // 2. Check ownership on-chain
    // 3. Generate a time-limited signed URL

    const tweakData = mockTweakData[tweakId];
    if (!tweakData) {
      return NextResponse.json(
        { error: 'Tweak not found' },
        { status: 404 }
      );
    }

    // Generate time-limited token (mock)
    const expiresAt = Date.now() + 3600000; // 1 hour
    const token = Buffer.from(`${tweakId}:${address}:${expiresAt}`).toString('base64');

    return NextResponse.json({
      success: true,
      downloadUrl: `${PINATA_GATEWAY}/ipfs/${tweakData.ipfsHash}?token=${token}`,
      expiresAt,
      expiresIn: '1 hour',
    });

  } catch (error: any) {
    console.error('[Download POST] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate download URL' },
      { status: 500 }
    );
  }
}
