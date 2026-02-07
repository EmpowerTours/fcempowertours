import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http } from 'viem';

// EmpowerTweaks API - List and query tweaks
// GET /api/tweaks - List all tweaks
// GET /api/tweaks?category=themes - Filter by category
// GET /api/tweaks?developer=0x... - Filter by developer
// GET /api/tweaks?search=snowboard - Search by name

const EMPOWERTWEAKS_ADDRESS = process.env.NEXT_PUBLIC_EMPOWERTWEAKS_CONTRACT || '';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://mainnet.monad.xyz';

// For now, use mock data until contract is deployed
// In production, this would read from the contract + Envio indexer
const mockTweaks = [
  {
    id: 1,
    name: 'Snowboard',
    description: 'Modern theming engine for iOS. Apply themes, icons, and more with ease.',
    developer: '0x1234567890123456789012345678901234567890',
    developerName: 'SparkDev',
    ipfsHash: 'QmXxx...snowboard',
    iconHash: 'QmXxx...icon1',
    priceInTours: '50000000000000000000', // 50 TOURS (18 decimals)
    priceInMon: '500000000000000000', // 0.5 MON
    category: 'themes',
    totalSales: 1542,
    totalRevenue: '77100000000000000000000',
    createdAt: Date.now() - 86400000 * 30,
    updatedAt: Date.now() - 86400000 * 2,
    isActive: true,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1', '18.2'],
    rating: 4.8,
    reviewCount: 234,
  },
  {
    id: 2,
    name: 'Filza File Manager',
    description: 'Full-featured file manager with root access. Browse, edit, and manage all files on your device.',
    developer: '0xabcdef0123456789abcdef0123456789abcdef01',
    developerName: 'TIGI Software',
    ipfsHash: 'QmXxx...filza',
    iconHash: 'QmXxx...icon2',
    priceInTours: '100000000000000000000', // 100 TOURS
    priceInMon: '1000000000000000000', // 1 MON
    category: 'utilities',
    totalSales: 3211,
    totalRevenue: '321100000000000000000000',
    createdAt: Date.now() - 86400000 * 60,
    updatedAt: Date.now() - 86400000 * 5,
    isActive: true,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1'],
    rating: 4.9,
    reviewCount: 567,
  },
  {
    id: 3,
    name: 'LocationFaker',
    description: 'Fake your GPS location in any app. Perfect for Pokemon GO, dating apps, or location-locked content.',
    developer: '0x9876543210987654321098765432109876543210',
    developerName: 'Nepeta',
    ipfsHash: 'QmXxx...locationfaker',
    iconHash: 'QmXxx...icon3',
    priceInTours: '75000000000000000000', // 75 TOURS
    priceInMon: '750000000000000000', // 0.75 MON
    category: 'tweaks',
    totalSales: 892,
    totalRevenue: '66900000000000000000000',
    createdAt: Date.now() - 86400000 * 45,
    updatedAt: Date.now() - 86400000 * 10,
    isActive: true,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1', '18.2'],
    rating: 4.5,
    reviewCount: 123,
  },
  {
    id: 4,
    name: 'Prysm',
    description: 'Complete control center replacement with customizable toggles, modules, and animations.',
    developer: '0x1111222233334444555566667777888899990000',
    developerName: 'LaughingQuoll',
    ipfsHash: 'QmXxx...prysm',
    iconHash: 'QmXxx...icon4',
    priceInTours: '150000000000000000000', // 150 TOURS
    priceInMon: '1500000000000000000', // 1.5 MON
    category: 'tweaks',
    totalSales: 2156,
    totalRevenue: '323400000000000000000000',
    createdAt: Date.now() - 86400000 * 90,
    updatedAt: Date.now() - 86400000 * 7,
    isActive: true,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1'],
    rating: 4.7,
    reviewCount: 345,
  },
  {
    id: 5,
    name: 'Velvet',
    description: 'Beautiful notification banners with blur effects, custom colors, and smooth animations.',
    developer: '0x3333444455556666777788889999aaaabbbbcccc',
    developerName: 'Chariz',
    ipfsHash: 'QmXxx...velvet',
    iconHash: 'QmXxx...icon5',
    priceInTours: '25000000000000000000', // 25 TOURS
    priceInMon: '250000000000000000', // 0.25 MON
    category: 'tweaks',
    totalSales: 445,
    totalRevenue: '11125000000000000000000',
    createdAt: Date.now() - 86400000 * 15,
    updatedAt: Date.now() - 86400000 * 3,
    isActive: true,
    isVerified: false,
    compatibleVersions: ['18.1', '18.2'],
    rating: 4.3,
    reviewCount: 67,
  },
  {
    id: 6,
    name: 'PokeGo++',
    description: 'Enhanced Pokemon GO with joystick, teleport, IV checker, and auto-walking features.',
    developer: '0x5555666677778888999900001111222233334444',
    developerName: 'Global++',
    ipfsHash: 'QmXxx...pokego',
    iconHash: 'QmXxx...icon6',
    priceInTours: '200000000000000000000', // 200 TOURS
    priceInMon: '2000000000000000000', // 2 MON
    category: 'apps',
    totalSales: 5678,
    totalRevenue: '1135600000000000000000000',
    createdAt: Date.now() - 86400000 * 120,
    updatedAt: Date.now() - 86400000 * 1,
    isActive: true,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1'],
    rating: 4.6,
    reviewCount: 890,
  },
  {
    id: 7,
    name: 'Cylinder Reborn',
    description: 'Page curl and 3D effects for your home screen. Over 100 animation styles.',
    developer: '0x7777888899990000aaaabbbbccccddddeeeeffff',
    developerName: 'r_plus',
    ipfsHash: 'QmXxx...cylinder',
    iconHash: 'QmXxx...icon7',
    priceInTours: '30000000000000000000', // 30 TOURS
    priceInMon: '300000000000000000', // 0.3 MON
    category: 'tweaks',
    totalSales: 1234,
    totalRevenue: '37020000000000000000000',
    createdAt: Date.now() - 86400000 * 75,
    updatedAt: Date.now() - 86400000 * 20,
    isActive: true,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1', '18.2'],
    rating: 4.4,
    reviewCount: 189,
  },
  {
    id: 8,
    name: 'Watusi',
    description: 'WhatsApp enhancement with anti-revoke, custom themes, passcode lock, and more.',
    developer: '0x8888999900001111222233334444555566667777',
    developerName: 'FouadRaheb',
    ipfsHash: 'QmXxx...watusi',
    iconHash: 'QmXxx...icon8',
    priceInTours: '80000000000000000000', // 80 TOURS
    priceInMon: '800000000000000000', // 0.8 MON
    category: 'apps',
    totalSales: 4521,
    totalRevenue: '361680000000000000000000',
    createdAt: Date.now() - 86400000 * 200,
    updatedAt: Date.now() - 86400000 * 4,
    isActive: true,
    isVerified: true,
    compatibleVersions: ['18.0', '18.1'],
    rating: 4.8,
    reviewCount: 678,
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category');
    const developer = searchParams.get('developer');
    const search = searchParams.get('search');
    const tweakId = searchParams.get('id');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    let results = [...mockTweaks];

    // Single tweak by ID
    if (tweakId) {
      const tweak = results.find(t => t.id === parseInt(tweakId));
      if (!tweak) {
        return NextResponse.json({ error: 'Tweak not found' }, { status: 404 });
      }
      return NextResponse.json({ tweak });
    }

    // Filter by category
    if (category && category !== 'all') {
      results = results.filter(t => t.category === category);
    }

    // Filter by developer
    if (developer) {
      results = results.filter(t => t.developer.toLowerCase() === developer.toLowerCase());
    }

    // Search by name or description
    if (search) {
      const query = search.toLowerCase();
      results = results.filter(t =>
        t.name.toLowerCase().includes(query) ||
        t.description.toLowerCase().includes(query) ||
        t.developerName.toLowerCase().includes(query)
      );
    }

    // Sort by popularity (total sales)
    results.sort((a, b) => b.totalSales - a.totalSales);

    // Pagination
    const total = results.length;
    results = results.slice(offset, offset + limit);

    // Format for frontend
    const formattedTweaks = results.map(t => ({
      ...t,
      priceInTours: (BigInt(t.priceInTours) / BigInt(10 ** 18)).toString(),
      priceInMon: (parseFloat(t.priceInMon) / 10 ** 18).toFixed(2),
    }));

    return NextResponse.json({
      tweaks: formattedTweaks,
      total,
      limit,
      offset,
      hasMore: offset + limit < total,
    });

  } catch (error: any) {
    console.error('[Tweaks API] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/tweaks - Create new tweak (upload metadata)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, category, priceInTours, priceInMon, compatibleVersions, developer } = body;

    // Validate required fields
    if (!name || !description || !developer) {
      return NextResponse.json(
        { error: 'Missing required fields: name, description, developer' },
        { status: 400 }
      );
    }

    // In production, this would:
    // 1. Verify the developer's signature
    // 2. Upload metadata to IPFS
    // 3. Return the IPFS hash for the developer to use in the contract call

    // For now, return mock response
    const mockMetadata = {
      name,
      description,
      category: category || 'tweaks',
      priceInTours: priceInTours || '50',
      priceInMon: priceInMon || '0.5',
      compatibleVersions: compatibleVersions || ['18.1'],
      developer,
      createdAt: Date.now(),
    };

    // Mock IPFS hash
    const metadataHash = `Qm${Buffer.from(JSON.stringify(mockMetadata)).toString('base64').slice(0, 44)}`;

    return NextResponse.json({
      success: true,
      metadataHash,
      metadata: mockMetadata,
      message: 'Metadata prepared. Call createTweak on the contract with this metadataHash.',
    });

  } catch (error: any) {
    console.error('[Tweaks API] POST Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
