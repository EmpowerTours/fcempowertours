import { NextRequest, NextResponse } from 'next/server';
import { generatePassportSVG, PassportStamp } from '@/lib/passport/generatePassportSVG';
import { getCountryByCode } from '@/lib/passport/countries';
import { getStampImages } from '@/lib/stamp-images';
import { createPublicClient, http } from 'viem';
import { activeChain } from '@/app/chains';
import {
  getPassportDetails,
  getItineraryStamps,
  getVenueStamps,
} from '@/lib/passport-lookup';

const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as `0x${string}`;

/**
 * Dynamic Passport Image Generator
 *
 * Generates an SVG passport image with stamps read from the contract.
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

    let countryCode = 'XX';
    let countryName = 'Unknown';

    // Read the contract directly. This used to try the indexer first and fall back to chain,
    // but the indexer's passport entry is two contract generations behind — it never saw V4 — so
    // the "more reliable" path was the one that returned nothing. The contract stores stamps
    // rather than only emitting them, so even the stamp lists come from a plain read; the events
    // are out of reach anyway, with eth_getLogs capped at 100 blocks on the public RPC and 10 on
    // the current key.
    let stamps: PassportStamp[] = [];

    try {
      const publicClient = createPublicClient({
        chain: activeChain,
        transport: http(),
      });

      const [passport] = await getPassportDetails(publicClient, PASSPORT_NFT_ADDRESS, [
        { tokenId, countryCode: '' },
      ]);

      if (passport?.countryCode) {
        countryCode = passport.countryCode;
        countryName =
          passport.countryName || getCountryByCode(countryCode)?.name || countryCode;
      }

      const itinerary = await getItineraryStamps(
        publicClient,
        PASSPORT_NFT_ADDRESS,
        tokenIdNum,
      );

      if (itinerary.length > 0) {
        const stampImages = await getStampImages(BigInt(tokenIdNum));
        stamps = itinerary.map((s) => ({
          locationName: s.locationName,
          city: s.city,
          country: s.country,
          stampedAt: s.stampedAt,
          stampImageIPFS:
            stampImages[`${tokenIdNum}_${s.itineraryId}`] || undefined,
        }));
      } else {
        // Venue stamps are the older mechanism, and only worth reading when there are no
        // itinerary stamps — matching what the two indexer queries did in sequence.
        const venue = await getVenueStamps(
          publicClient,
          PASSPORT_NFT_ADDRESS,
          tokenIdNum,
        );
        stamps = venue.map((s) => ({
          locationName: s.location,
          city: 'Unknown',
          country: 'Unknown',
          stampedAt: s.timestamp,
        }));
      }

      console.log('[PassportImage] token', tokenId, countryCode, stamps.length, 'stamps');
    } catch (err) {
      // A read failure must still produce an image: the SVG generator handles the 'XX' default,
      // and a broken picture is worse than a generic one.
      console.error('[PassportImage] chain read failed:', err);
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
