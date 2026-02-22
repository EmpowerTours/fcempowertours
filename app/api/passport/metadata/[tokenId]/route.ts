import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi } from 'viem';
import { activeChain } from '@/app/chains';
import { getCountryByCode } from '@/lib/passport/countries';

const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as `0x${string}`;
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(),
});

const PASSPORT_ABI = parseAbi([
  'function getPassportData(uint256 tokenId) view returns (string countryCode, string countryName, string region, string continent, uint256 fid, uint256 mintedAt, bool verified, uint256 creditScore)',
  'function ownerOf(uint256 tokenId) view returns (address)',
  'function tokenURI(uint256 tokenId) view returns (string)',
]);

/**
 * ERC-721 Metadata Fallback API
 *
 * Returns standard ERC-721 JSON metadata for any passport token.
 * MonadVision and other NFT platforms can use this as a fallback
 * when the on-chain tokenURI is empty.
 *
 * The image field points to the dynamic SVG endpoint which renders
 * the passport with stamps from the Envio indexer.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    const { tokenId } = await params;
    const tokenIdNum = parseInt(tokenId);

    if (isNaN(tokenIdNum) || tokenIdNum < 1) {
      return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
    }

    // Fetch on-chain passport data
    const [passportData, owner] = await Promise.all([
      publicClient.readContract({
        address: PASSPORT_NFT_ADDRESS,
        abi: PASSPORT_ABI,
        functionName: 'getPassportData',
        args: [BigInt(tokenIdNum)],
      }),
      publicClient.readContract({
        address: PASSPORT_NFT_ADDRESS,
        abi: PASSPORT_ABI,
        functionName: 'ownerOf',
        args: [BigInt(tokenIdNum)],
      }),
    ]);

    const [countryCode, countryName, region, continent, fid, mintedAt, verified] = passportData;
    const country = getCountryByCode(countryCode);

    // Dynamic SVG image URL (renders with live stamp data)
    const imageUrl = `${APP_URL}/api/passport/image/${tokenIdNum}`;

    const metadata = {
      name: `EmpowerTours Passport - ${countryName}`,
      description: `Digital passport NFT for ${countryName}. Collect venue stamps as you explore events and climbing locations. Unlock exclusive benefits. Part of a collection representing all 195 countries on Monad.`,
      image: imageUrl,
      external_url: `${APP_URL}/passport/${tokenIdNum}`,
      attributes: [
        { trait_type: 'Country', value: countryName },
        { trait_type: 'Country Code', value: countryCode },
        { trait_type: 'Continent', value: continent || country?.continent || 'Unknown' },
        { trait_type: 'Region', value: region || country?.region || 'Unknown' },
        { trait_type: 'Type', value: 'Passport NFT' },
        { trait_type: 'Verified', value: verified ? 'Yes' : 'No' },
        { trait_type: 'Token ID', value: tokenIdNum.toString() },
        { trait_type: 'Farcaster FID', value: Number(fid).toString() },
        { trait_type: 'Minted', value: new Date(Number(mintedAt) * 1000).toISOString().split('T')[0] },
        { trait_type: 'Network', value: 'Monad' },
        { trait_type: 'Collection', value: '195 Countries' },
        { trait_type: 'Owner', value: owner },
      ],
    };

    return NextResponse.json(metadata, {
      headers: {
        'Cache-Control': 'public, max-age=300',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (error: any) {
    console.error('[PassportMetadata] Error:', error.message);
    return NextResponse.json(
      { error: 'Token not found or invalid' },
      { status: 404 }
    );
  }
}
