import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categories = searchParams.get('categories')?.split(',') || [];
  
  try {
    // Fetch casts from Farcaster based on categories
    const mockCasts = [
      {
        id: Date.now().toString(),
        text: "Just tried the new restaurant downtown! Amazing pasta 🍝",
        author: { username: "foodie123", pfp_url: "/api/placeholder/40/40" },
        embeds: [{ url: "/api/placeholder/600/400" }],
        timestamp: Date.now(),
        category: "#food"
      },
      // Add more mock or real casts
    ];
    
    return NextResponse.json({ 
      success: true, 
      casts: mockCasts 
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Failed to fetch casts' },
      { status: 500 }
    );
  }
}
