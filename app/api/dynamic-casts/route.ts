import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categories = searchParams.get('categories')?.split(',') || [];
 
  const apiKey = process.env.NEXT_PUBLIC_NEYNAR_API_KEY;

  if (!apiKey) {
    return NextResponse.json({ success: false, error: 'API key not found' }, { status: 500 });
  }

  try {
    const headers = { 'x-api-key': apiKey };
    let formattedCasts: any[] = [];

    if (categories.length === 0) {
      // Fetch trending casts if no categories provided
      const response = await fetch('https://api.neynar.com/v2/farcaster/feed?feed_type=filter&filter_type=global_trending&limit=10', { headers });
      if (!response.ok) {
        throw new Error('Failed to fetch trending casts');
      }
      const data = await response.json();
      const casts = data.casts || [];
      formattedCasts = casts.map((cast: any) => ({
        id: cast.hash,
        text: cast.text,
        author: {
          username: cast.author.username,
          pfp_url: cast.author.pfp_url
        },
        embeds: cast.embeds.filter((embed: any) => embed.url).map((embed: any) => ({ url: embed.url })),
        timestamp: new Date(cast.timestamp).getTime(),
        category: 'trending'
      }));
    } else {
      // Fetch casts for each category using search
      for (const category of categories) {
        const response = await fetch(`https://api.neynar.com/v2/farcaster/cast/search?q=${encodeURIComponent(category)}&limit=5`, { headers });
        if (!response.ok) {
          console.error(`Failed to fetch for category ${category}`);
          continue;
        }
        const data = await response.json();
        const casts = data.result?.casts || [];
        const categoryCasts = casts.map((cast: any) => ({
          id: cast.hash,
          text: cast.text,
          author: {
            username: cast.author.username,
            pfp_url: cast.author.pfp_url
          },
          embeds: cast.embeds.filter((embed: any) => embed.url).map((embed: any) => ({ url: embed.url })),
          timestamp: new Date(cast.timestamp).getTime(),
          category: category
        }));
        formattedCasts.push(...categoryCasts);
      }
    }
   
    return NextResponse.json({
      success: true,
      casts: formattedCasts
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch casts' },
      { status: 500 }
    );
  }
}
