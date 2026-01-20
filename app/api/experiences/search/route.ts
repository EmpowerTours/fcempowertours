import { NextRequest, NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/314bd82/v1/graphql';

interface Experience {
  id: string;
  itineraryId: string;
  title: string;
  description: string;
  city: string;
  country: string;
  creator: string;
  creatorUsername?: string;
  price: string;
  priceWMON: string;
  averageRating: number;
  ratingCount: number;
  totalPurchases: number;
  createdAt: string;
  locations?: Array<{
    name: string;
    description: string;
  }>;
}

// Sanitize input to prevent GraphQL injection
function sanitizeGraphQLInput(input: string): string {
  if (!input) return '';
  // Remove GraphQL special characters and limit length
  return input
    .replace(/[{}\[\]():,\\"`]/g, '') // Remove GraphQL syntax chars
    .replace(/\$/g, '') // Remove variable prefix
    .slice(0, 100) // Limit length
    .trim();
}

// Search experiences from Envio indexer
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    // Sanitize all user inputs to prevent GraphQL injection
    const query = sanitizeGraphQLInput(searchParams.get('q') || '');
    const city = sanitizeGraphQLInput(searchParams.get('city') || '');
    const country = sanitizeGraphQLInput(searchParams.get('country') || '');
    const type = sanitizeGraphQLInput(searchParams.get('type') || '');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10') || 10, 1), 50); // Clamp 1-50

    console.log('[Experience Search] Query:', { query, city, country, type });

    // Build GraphQL query with sanitized filters
    let whereClause = '{ active: { _eq: true }';

    if (city) {
      whereClause += `, city: { _ilike: "%${city}%" }`;
    }
    if (country) {
      whereClause += `, country: { _ilike: "%${country}%" }`;
    }
    if (query) {
      // Search in title and description
      whereClause += `, _or: [{ title: { _ilike: "%${query}%" } }, { description: { _ilike: "%${query}%" } }]`;
    }
    whereClause += ' }';

    // Try multiple possible entity names (indexer schema may vary)
    const queries = [
      // Try ItineraryNFT entity first
      `query SearchExperiences {
        ItineraryNFT_ItineraryCreated(
          where: ${whereClause}
          order_by: { totalPurchases: desc }
          limit: ${limit}
        ) {
          itineraryId
          title
          description
          city
          country
          creator
          price
          averageRating
          ratingCount
          totalPurchases
          createdAt
        }
      }`,
      // Fallback: try Experience entity
      `query SearchExperiences {
        Experience(
          where: ${whereClause}
          order_by: { createdAt: desc }
          limit: ${limit}
        ) {
          experienceId
          title
          description
          city
          country
          creator
          price
          averageRating
          totalPurchases
          createdAt
        }
      }`,
      // Fallback: simple query without complex where
      `query SearchExperiences {
        ItineraryNFT_ItineraryCreated(
          order_by: { totalPurchases: desc }
          limit: ${limit}
        ) {
          itineraryId
          title
          description
          city
          country
          creator
          price
          averageRating
          ratingCount
          totalPurchases
          createdAt
        }
      }`
    ];

    let experiences: Experience[] = [];
    let querySuccess = false;

    for (const graphqlQuery of queries) {
      try {
        const response = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: graphqlQuery })
        });

        const data = await response.json();
        console.log('[Experience Search] Envio response:', JSON.stringify(data).substring(0, 500));

        // Check for itinerary data
        const itineraries = data?.data?.ItineraryNFT_ItineraryCreated || data?.data?.Experience || [];

        if (itineraries.length > 0) {
          experiences = itineraries.map((item: any) => ({
            id: item.itineraryId || item.experienceId || item.id,
            itineraryId: item.itineraryId || item.experienceId || item.id,
            title: item.title || `Experience #${item.itineraryId || item.experienceId}`,
            description: item.description || '',
            city: item.city || 'Unknown',
            country: item.country || '',
            creator: item.creator || '',
            price: item.price?.toString() || '0',
            priceWMON: (Number(item.price || 0) / 1e18).toFixed(2),
            averageRating: (item.averageRating || 0) / 100, // Convert from basis points
            ratingCount: item.ratingCount || 0,
            totalPurchases: item.totalPurchases || 0,
            createdAt: item.createdAt || '',
          }));

          // Filter by query if we used the simple query
          if (query && !whereClause.includes('_or')) {
            const lowerQuery = query.toLowerCase();
            experiences = experiences.filter(exp =>
              exp.title.toLowerCase().includes(lowerQuery) ||
              exp.description.toLowerCase().includes(lowerQuery) ||
              exp.city.toLowerCase().includes(lowerQuery)
            );
          }

          querySuccess = true;
          break;
        }
      } catch (queryError) {
        console.log('[Experience Search] Query variant failed:', queryError);
        continue;
      }
    }

    // Fetch creator usernames from Neynar
    if (experiences.length > 0) {
      const creatorAddresses = [...new Set(experiences.map(e => e.creator).filter(Boolean))];

      if (creatorAddresses.length > 0) {
        try {
          const neynarRes = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${creatorAddresses.join(',')}`,
            {
              headers: {
                'api_key': process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || ''
              }
            }
          );

          if (neynarRes.ok) {
            const neynarData = await neynarRes.json();
            for (const exp of experiences) {
              const users = neynarData[exp.creator.toLowerCase()];
              if (Array.isArray(users) && users.length > 0) {
                exp.creatorUsername = users[0].username;
              }
            }
          }
        } catch (neynarError) {
          console.log('[Experience Search] Neynar lookup failed:', neynarError);
        }
      }
    }

    console.log('[Experience Search] Found', experiences.length, 'experiences');

    return NextResponse.json({
      success: true,
      experiences,
      count: experiences.length,
      query: { q: query, city, country, type }
    });

  } catch (error: any) {
    console.error('[Experience Search] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Search failed',
      experiences: []
    }, { status: 500 });
  }
}
