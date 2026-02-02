import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { encodeFunctionData, parseEther, type Address } from 'viem';
import { sendUserSafeTransaction } from '@/lib/user-safe';
import { fetchArtistStreamingStats } from '@/lib/epk/utils';
import { DEFAULT_TECHNICAL_RIDER, DEFAULT_HOSPITALITY_RIDER } from '@/lib/epk/defaults';
import { EPK_VERSION, DEFAULT_MINIMUM_DEPOSIT } from '@/lib/epk/constants';
import type { EPKMetadata } from '@/lib/epk/types';
import ERC20ABI from '@/lib/abis/ERC20.json';

const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;
const PLATFORM_SAFE = (process.env.NEXT_PUBLIC_SAFE_ACCOUNT || process.env.NEXT_PUBLIC_PLATFORM_SAFE) as Address;
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || '';
const EPK_GENERATION_FEE = '5'; // 5 WMON

/**
 * POST /api/epk/generate - AI-assisted EPK auto-generation
 * Input: { userAddress, userFid }
 * Output: { success: true, draft: EPKMetadata }
 */
export async function POST(req: NextRequest) {
  try {
    const { userAddress, userFid } = await req.json();

    if (!userAddress) {
      return NextResponse.json({ error: 'userAddress is required' }, { status: 400 });
    }

    // Step 1: Collect 5 WMON payment via User Safe
    console.log('[EPK Generate] Collecting', EPK_GENERATION_FEE, 'WMON from', userAddress);

    if (!WMON_ADDRESS || !PLATFORM_SAFE) {
      console.error('[EPK Generate] WMON_ADDRESS or PLATFORM_SAFE not configured');
      return NextResponse.json({ error: 'Payment configuration missing' }, { status: 500 });
    }

    try {
      const transferData = encodeFunctionData({
        abi: ERC20ABI,
        functionName: 'transfer',
        args: [PLATFORM_SAFE, parseEther(EPK_GENERATION_FEE)],
      });

      await sendUserSafeTransaction(userAddress, [
        { to: WMON_ADDRESS, value: 0n, data: transferData },
      ]);

      console.log('[EPK Generate] Payment collected successfully');
    } catch (paymentError: any) {
      console.error('[EPK Generate] Payment failed:', paymentError.message);
      return NextResponse.json({
        error: `Payment failed: ${paymentError.message}. Ensure you have at least 5 WMON in your Safe.`,
      }, { status: 402 });
    }

    // Step 2: Fetch data in parallel
    console.log('[EPK Generate] Fetching artist data...');

    const [farcasterProfile, streamingStats, genreData] = await Promise.all([
      fetchFarcasterProfile(userFid),
      fetchArtistStreamingStats(userAddress, ENVIO_ENDPOINT),
      fetchGenresFromChain(userAddress),
    ]);

    console.log('[EPK Generate] Data fetched:', {
      hasFarcaster: !!farcasterProfile,
      totalPlays: streamingStats.totalPlays,
      topSongs: streamingStats.topSongs.length,
      genres: genreData.length,
    });

    // Step 3: Generate EPK via Gemini
    const draft = await generateEPKWithGemini(
      farcasterProfile,
      streamingStats,
      genreData,
      userAddress,
      userFid,
    );

    console.log('[EPK Generate] Draft generated for:', draft.artist.name);

    return NextResponse.json({ success: true, draft });
  } catch (error: any) {
    console.error('[EPK Generate] Error:', error);
    return NextResponse.json({ error: error.message || 'EPK generation failed' }, { status: 500 });
  }
}

// --- Data fetching helpers ---

interface FarcasterProfile {
  displayName: string;
  username: string;
  bio: string;
  pfpUrl: string;
}

async function fetchFarcasterProfile(fid?: number): Promise<FarcasterProfile | null> {
  if (!fid) return null;

  const apiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || process.env.NEYNAR_API_KEY;
  if (!apiKey) {
    console.warn('[EPK Generate] Neynar API key not configured');
    return null;
  }

  try {
    const config = new Configuration({
      apiKey,
      baseOptions: {
        headers: { 'x-neynar-experimental': 'false' },
      },
    });
    const neynar = new NeynarAPIClient(config);
    const result = await neynar.fetchBulkUsers({ fids: [fid] });
    const user = result.users[0];

    if (!user) return null;

    return {
      displayName: user.display_name || user.username || '',
      username: user.username || '',
      bio: (user as any).profile?.bio?.text || '',
      pfpUrl: user.pfp_url || '',
    };
  } catch (error) {
    console.error('[EPK Generate] Neynar fetch failed:', error);
    return null;
  }
}

async function fetchGenresFromChain(artistAddress: string): Promise<string[]> {
  if (!ENVIO_ENDPOINT) return [];

  try {
    // Query MusicNFT for this artist's songs with tokenURIs
    const query = `
      query ArtistNFTs($artist: String!) {
        MusicNFT(
          where: { artist: { _eq: $artist }, isArt: { _eq: false } }
          limit: 3
        ) {
          tokenId
          tokenURI
          title
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { artist: artistAddress.toLowerCase() } }),
    });

    const data = await response.json();
    const nfts = data?.data?.MusicNFT || [];

    if (nfts.length === 0) return [];

    // Fetch up to 3 IPFS metadata files to detect genres
    const genres = new Set<string>();
    const gateway = process.env.PINATA_GATEWAY || 'harlequin-used-hare-224.mypinata.cloud';

    for (const nft of nfts.slice(0, 3)) {
      if (!nft.tokenURI) continue;

      try {
        // Convert ipfs:// to gateway URL
        let metadataUrl = nft.tokenURI;
        if (metadataUrl.startsWith('ipfs://')) {
          metadataUrl = `https://${gateway}/ipfs/${metadataUrl.replace('ipfs://', '')}`;
        }

        const metaRes = await fetch(metadataUrl, {
          signal: AbortSignal.timeout(5000),
        });

        if (metaRes.ok) {
          const metadata = await metaRes.json();
          // Look for genre in attributes or properties
          if (metadata.genre) {
            (Array.isArray(metadata.genre) ? metadata.genre : [metadata.genre]).forEach((g: string) => genres.add(g));
          }
          if (metadata.attributes) {
            for (const attr of metadata.attributes) {
              if (attr.trait_type?.toLowerCase() === 'genre' && attr.value) {
                genres.add(attr.value);
              }
            }
          }
        }
      } catch {
        // Skip failed metadata fetches
      }
    }

    return Array.from(genres);
  } catch (error) {
    console.error('[EPK Generate] Genre fetch failed:', error);
    return [];
  }
}

// --- Gemini generation ---

async function generateEPKWithGemini(
  profile: FarcasterProfile | null,
  stats: Awaited<ReturnType<typeof fetchArtistStreamingStats>>,
  genres: string[],
  userAddress: string,
  userFid?: number,
): Promise<EPKMetadata> {
  const geminiKey = process.env.GEMINI_API_KEY;

  if (!geminiKey) {
    console.warn('[EPK Generate] GEMINI_API_KEY not set, using fallback');
    return buildFallbackDraft(profile, stats, genres, userAddress, userFid);
  }

  try {
    const ai = new GoogleGenAI({ apiKey: geminiKey });

    const artistName = profile?.displayName || `Artist ${userAddress.slice(0, 6)}`;
    const topSongTitles = stats.topSongs.slice(0, 5).map(s => `"${s.title}" (${s.plays} plays)`).join(', ');

    const prompt = `You are a professional music publicist creating an Electronic Press Kit (EPK) for a Web3 artist on EmpowerTours, a decentralized music platform on Monad blockchain.

ARTIST DATA (use these facts, do not invent):
- Name: ${artistName}
- Farcaster Username: ${profile?.username || 'N/A'}
- Farcaster Bio: ${profile?.bio || 'N/A'}
- Wallet: ${userAddress}
- Total Plays: ${stats.totalPlays}
- Unique Listeners: ${stats.uniqueListeners}
- Total Sales: ${stats.totalSales}
- Total Revenue: ${stats.totalRevenue} WMON
- Top Songs: ${topSongTitles || 'No songs yet'}
- Detected Genres: ${genres.length > 0 ? genres.join(', ') : 'Unknown'}

INSTRUCTIONS:
1. Write a professional bio (150-250 words) that highlights the artist's music career, on-chain achievements, and unique style. Use the Farcaster bio as inspiration but expand it professionally. If stats show activity, mention on-chain streaming numbers.
2. Suggest 2-4 genre tags based on detected genres and the artist's profile. If no genres detected, suggest based on the bio and platform context.
3. Parse location from the bio if possible, otherwise suggest "Web3 Native / Global".
4. Generate reasonable technical rider items for a solo performer/DJ.
5. Generate reasonable hospitality rider items.
6. Suggest booking configuration defaults.
7. If the artist has a Farcaster username, include it in socials.

Be professional and concise. Do not fabricate achievements not in the data.`;

    const config = {
      responseMimeType: 'application/json' as const,
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          bio: { type: Type.STRING, description: 'Professional artist bio, 150-250 words' },
          genre: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2-4 genre tags',
          },
          location: { type: Type.STRING, description: 'Artist location or "Web3 Native / Global"' },
          technicalRider: {
            type: Type.OBJECT,
            properties: {
              stage: { type: Type.ARRAY, items: { type: Type.STRING } },
              sound: { type: Type.ARRAY, items: { type: Type.STRING } },
              lighting: { type: Type.ARRAY, items: { type: Type.STRING } },
              video: { type: Type.ARRAY, items: { type: Type.STRING } },
              backline: { type: Type.ARRAY, items: { type: Type.STRING } },
              soundcheck: { type: Type.ARRAY, items: { type: Type.STRING } },
              crew: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          hospitalityRider: {
            type: Type.OBJECT,
            properties: {
              dressingRoom: { type: Type.ARRAY, items: { type: Type.STRING } },
              catering: { type: Type.ARRAY, items: { type: Type.STRING } },
              beverages: { type: Type.ARRAY, items: { type: Type.STRING } },
              transport: { type: Type.ARRAY, items: { type: Type.STRING } },
              hotel: { type: Type.ARRAY, items: { type: Type.STRING } },
              security: { type: Type.ARRAY, items: { type: Type.STRING } },
              guestList: { type: Type.ARRAY, items: { type: Type.STRING } },
              payment: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          booking: {
            type: Type.OBJECT,
            properties: {
              pricing: { type: Type.STRING },
              availableFor: { type: Type.ARRAY, items: { type: Type.STRING } },
              territories: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
          },
          farcasterUsername: { type: Type.STRING },
        },
        required: ['bio', 'genre', 'location'],
      },
    };

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config,
    });

    const text = response.text;
    if (!text) throw new Error('Empty Gemini response');

    const generated = JSON.parse(text);

    // Build full EPKMetadata from Gemini output
    const draft: EPKMetadata = {
      version: EPK_VERSION,
      artist: {
        name: artistName,
        slug: '',
        bio: generated.bio || profile?.bio || '',
        genre: generated.genre || genres || ['AI Music'],
        location: generated.location || 'Web3 Native / Global',
        profileImage: profile?.pfpUrl,
        farcasterFid: userFid,
        walletAddress: userAddress,
      },
      musicCatalog: { showCatalog: true },
      media: { videos: [], photos: [] },
      press: [],
      booking: {
        pricing: generated.booking?.pricing || 'Contact for rates',
        inquiryEnabled: true,
        availableFor: generated.booking?.availableFor || ['Crypto Conferences', 'Web3 Music Festivals', 'Private Events'],
        territories: generated.booking?.territories || ['Global'],
        targetEvents: [],
        minimumDeposit: DEFAULT_MINIMUM_DEPOSIT,
      },
      technicalRider: {
        stage: { title: 'Stage Requirements', items: generated.technicalRider?.stage || DEFAULT_TECHNICAL_RIDER.stage.items },
        sound: { title: 'Sound System', items: generated.technicalRider?.sound || DEFAULT_TECHNICAL_RIDER.sound.items },
        lighting: { title: 'Lighting', items: generated.technicalRider?.lighting || DEFAULT_TECHNICAL_RIDER.lighting.items },
        video: { title: 'Video / LED', items: generated.technicalRider?.video || [] },
        backline: { title: 'Backline', items: generated.technicalRider?.backline || DEFAULT_TECHNICAL_RIDER.backline.items },
        soundcheck: { title: 'Soundcheck', items: generated.technicalRider?.soundcheck || DEFAULT_TECHNICAL_RIDER.soundcheck.items },
        crew: { title: 'Crew Requirements', items: generated.technicalRider?.crew || DEFAULT_TECHNICAL_RIDER.crew.items },
      },
      hospitalityRider: {
        dressingRoom: { title: 'Dressing Room', items: generated.hospitalityRider?.dressingRoom || DEFAULT_HOSPITALITY_RIDER.dressingRoom.items },
        catering: { title: 'Catering', items: generated.hospitalityRider?.catering || DEFAULT_HOSPITALITY_RIDER.catering.items },
        beverages: { title: 'Beverages', items: generated.hospitalityRider?.beverages || DEFAULT_HOSPITALITY_RIDER.beverages.items },
        transport: { title: 'Transportation', items: generated.hospitalityRider?.transport || DEFAULT_HOSPITALITY_RIDER.transport.items },
        hotel: { title: 'Hotel', items: generated.hospitalityRider?.hotel || DEFAULT_HOSPITALITY_RIDER.hotel.items },
        security: { title: 'Security', items: generated.hospitalityRider?.security || DEFAULT_HOSPITALITY_RIDER.security.items },
        guestList: { title: 'Guest List', items: generated.hospitalityRider?.guestList || DEFAULT_HOSPITALITY_RIDER.guestList.items },
        payment: { title: 'Payment', items: generated.hospitalityRider?.payment || DEFAULT_HOSPITALITY_RIDER.payment.items },
      },
      socials: {
        farcaster: generated.farcasterUsername || profile?.username || undefined,
      },
      onChain: {},
    };

    return draft;
  } catch (error) {
    console.error('[EPK Generate] Gemini failed, using fallback:', error);
    return buildFallbackDraft(profile, stats, genres, userAddress, userFid);
  }
}

function buildFallbackDraft(
  profile: FarcasterProfile | null,
  stats: Awaited<ReturnType<typeof fetchArtistStreamingStats>>,
  genres: string[],
  userAddress: string,
  userFid?: number,
): EPKMetadata {
  const artistName = profile?.displayName || `Artist ${userAddress.slice(0, 6)}`;
  const bio = profile?.bio || `${artistName} is a Web3 music artist on EmpowerTours. With ${stats.totalPlays} on-chain plays and ${stats.totalSales} sales, they are building a decentralized music career on Monad blockchain.`;

  return {
    version: EPK_VERSION,
    artist: {
      name: artistName,
      slug: '',
      bio,
      genre: genres.length > 0 ? genres : ['AI Music'],
      location: 'Web3 Native / Global',
      profileImage: profile?.pfpUrl,
      farcasterFid: userFid,
      walletAddress: userAddress,
    },
    musicCatalog: { showCatalog: true },
    media: { videos: [], photos: [] },
    press: [],
    booking: {
      pricing: 'Contact for rates',
      inquiryEnabled: true,
      availableFor: ['Crypto Conferences', 'Web3 Music Festivals', 'Private Events'],
      territories: ['Global'],
      targetEvents: [],
      minimumDeposit: DEFAULT_MINIMUM_DEPOSIT,
    },
    technicalRider: DEFAULT_TECHNICAL_RIDER,
    hospitalityRider: DEFAULT_HOSPITALITY_RIDER,
    socials: {
      farcaster: profile?.username || undefined,
    },
    onChain: {},
  };
}
