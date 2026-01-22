import { NextRequest, NextResponse } from 'next/server';
import { generatePassportSVG, PassportStamp } from '@/lib/passport/generatePassportSVG';
import { getCountryByCode } from '@/lib/passport/countries';
import { createPublicClient, http, parseAbi } from 'viem';
import { activeChain } from '@/app/chains';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as `0x${string}`;

/**
 * Dynamic Passport Image Generator
 *
 * Generates an SVG passport image with stamps fetched from the indexer.
 * This allows passports to display their collected stamps dynamically.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tokenId: string }> }
) {
  try {
    const { tokenId } = await params;
    const tokenIdNum = parseInt(tokenId);

    if (isNaN(tokenIdNum)) {
      return NextResponse.json({ error: 'Invalid token ID' }, { status: 400 });
    }

    // Fetch passport data from chain
    const publicClient = createPublicClient({
      chain: activeChain,
      transport: http(),
    });

    let countryCode = 'XX';
    let countryName = 'Unknown';

    try {
      // Try to get passport country from contract
      const result = await publicClient.readContract({
        address: PASSPORT_NFT_ADDRESS,
        abi: parseAbi(['function passportCountries(uint256 tokenId) view returns (string)']),
        functionName: 'passportCountries',
        args: [BigInt(tokenIdNum)],
      });

      if (result) {
        countryCode = result as string;
        const country = getCountryByCode(countryCode);
        countryName = country?.name || countryCode;
      }
    } catch (chainErr) {
      console.log('[PassportImage] Could not fetch from chain, using defaults');
    }

    // Fetch stamps from indexer
    let stamps: PassportStamp[] = [];

    try {
      // Query for itinerary stamps on this passport
      const stampsQuery = `
        query GetPassportStamps($tokenId: String!) {
          PassportNFT_ItineraryStampAdded(
            where: { passportId: { _eq: $tokenId } }
            order_by: { timestamp: desc }
            limit: 20
          ) {
            itineraryId
            locationName
            city
            country
            timestamp
            gpsVerified
          }
        }
      `;

      const envioRes = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: stampsQuery,
          variables: { tokenId: tokenId }
        }),
      });

      if (envioRes.ok) {
        const envioData = await envioRes.json();
        const rawStamps = envioData.data?.PassportNFT_ItineraryStampAdded || [];

        stamps = rawStamps.map((s: any) => ({
          locationName: s.locationName || 'Unknown',
          city: s.city || 'Unknown',
          country: s.country || 'Unknown',
          stampedAt: parseInt(s.timestamp) || Math.floor(Date.now() / 1000),
        }));

        console.log('[PassportImage] Found', stamps.length, 'stamps for passport', tokenId);
      }
    } catch (indexerErr) {
      console.log('[PassportImage] Indexer query failed, passport has no stamps');
    }

    // Also try legacy event stamps if no itinerary stamps found
    if (stamps.length === 0) {
      try {
        const legacyQuery = `
          query GetLegacyStamps($tokenId: String!) {
            PassportNFT_StampAdded(
              where: { tokenId: { _eq: $tokenId } }
              order_by: { timestamp: desc }
              limit: 20
            ) {
              venueName
              city
              country
              timestamp
            }
          }
        `;

        const legacyRes = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: legacyQuery,
            variables: { tokenId: tokenId }
          }),
        });

        if (legacyRes.ok) {
          const legacyData = await legacyRes.json();
          const legacyStamps = legacyData.data?.PassportNFT_StampAdded || [];

          stamps = legacyStamps.map((s: any) => ({
            locationName: s.venueName || 'Event',
            city: s.city || 'Unknown',
            country: s.country || 'Unknown',
            stampedAt: parseInt(s.timestamp) || Math.floor(Date.now() / 1000),
          }));
        }
      } catch {
        // No legacy stamps either
      }
    }

    // Generate the SVG
    const svg = generatePassportSVG(countryCode, countryName, tokenIdNum, stamps);

    // Return as SVG image
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    });

  } catch (error: any) {
    console.error('[PassportImage] Error:', error);

    // Return a fallback SVG
    const fallbackSvg = `<svg width="400" height="600" xmlns="http://www.w3.org/2000/svg">
      <rect width="400" height="600" fill="#1e3a8a"/>
      <text x="200" y="300" fill="white" text-anchor="middle" font-family="Arial">Passport Loading...</text>
    </svg>`;

    return new NextResponse(fallbackSvg, {
      status: 200,
      headers: {
        'Content-Type': 'image/svg+xml',
        'Cache-Control': 'no-cache',
      },
    });
  }
}
