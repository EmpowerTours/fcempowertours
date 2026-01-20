import { NextRequest, NextResponse } from 'next/server';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;

interface Guide {
  id: string;
  fid: number;
  name: string;
  username: string;
  location: string;
  bio: string;
  languages: string[];
  imageUrl: string;
  verifiedAddress: string;
}

export async function GET(request: NextRequest) {
  try {
    if (!NEYNAR_API_KEY) {
      return NextResponse.json(
        {
          success: false,
          error: 'Neynar API key not configured',
        },
        { status: 500 }
      );
    }

    const { searchParams } = new URL(request.url);
    const latitude = searchParams.get('latitude') || '37.77'; // Default: San Francisco
    const longitude = searchParams.get('longitude') || '-122.41';
    const limit = searchParams.get('limit') || '50';

    // Fetch users by location from Neynar
    const response = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_location/?latitude=${latitude}&longitude=${longitude}&limit=${limit}`,
      {
        headers: {
          'accept': 'application/json',
          'x-api-key': NEYNAR_API_KEY,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Neynar API error: ${response.status}`);
    }

    const data = await response.json();
    const users = data.users || [];

    // Filter and map users to guides
    const guides: Guide[] = users
      .filter((user: any) => {
        // Only include users with verified Ethereum addresses
        const ethAddresses = user.verified_addresses?.eth_addresses || [];
        return ethAddresses.length > 0 && ethAddresses[0] !== '0x0000000000000000000000000000000000000000';
      })
      .map((user: any) => {
        const ethAddress = user.verified_addresses.eth_addresses[0];
        const bioText = user.profile?.bio?.text || '';

        return {
          id: `fc-${user.fid}`,
          fid: user.fid,
          name: user.display_name || user.username,
          username: user.username,
          location: user.profile?.location?.address?.city
            ? `${user.profile.location.address.city}, ${user.profile.location.address.country}`
            : 'Remote',
          bio: bioText || 'Farcaster community member.',
          languages: extractLanguagesFromBio(bioText),
          imageUrl: user.pfp_url || `https://avatar.vercel.sh/${user.username}`,
          verifiedAddress: ethAddress,
        };
      });

    // Shuffle guides for variety
    const shuffled = guides.sort(() => Math.random() - 0.5);

    return NextResponse.json({
      success: true,
      guides: shuffled,
    });
  } catch (error: any) {
    console.error('Get guides error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to fetch guides',
      },
      { status: 500 }
    );
  }
}

// Helper function to extract languages from bio
function extractLanguagesFromBio(bio: string): string[] {
  const defaultLanguages = ['English'];

  const languagePatterns: Record<string, string> = {
    '🇪🇸': 'Spanish',
    '🇫🇷': 'French',
    '🇩🇪': 'German',
    '🇯🇵': 'Japanese',
    '🇨🇳': 'Chinese',
    '🇰🇷': 'Korean',
    '🇮🇹': 'Italian',
    '🇵🇹': 'Portuguese',
  };

  const detectedLanguages: string[] = [];

  for (const [emoji, language] of Object.entries(languagePatterns)) {
    if (bio.includes(emoji)) {
      detectedLanguages.push(language);
    }
  }

  // Check for explicit language mentions
  const languageKeywords = ['spanish', 'french', 'german', 'japanese', 'chinese', 'korean', 'italian', 'portuguese'];
  const bioLower = bio.toLowerCase();

  for (const lang of languageKeywords) {
    if (bioLower.includes(lang) && !detectedLanguages.includes(lang.charAt(0).toUpperCase() + lang.slice(1))) {
      detectedLanguages.push(lang.charAt(0).toUpperCase() + lang.slice(1));
    }
  }

  return detectedLanguages.length > 0 ? [...new Set([...defaultLanguages, ...detectedLanguages])] : defaultLanguages;
}
