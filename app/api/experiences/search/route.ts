import { NextRequest, NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

interface Experience {
  id: string;
  itineraryId: string;
  title: string;
  description: string;
  creator: string;
  creatorFid?: string;
  creatorUsername?: string;
  creatorDisplayName?: string;
  creatorPfpUrl?: string;
  photoUrl?: string;
  price: string;
  priceWMON: string;
  averageRating: number;
  ratingCount: number;
  totalPurchases: number;
  createdAt: string;
}

// Sanitize input to prevent GraphQL injection
function sanitizeGraphQLInput(input: string): string {
  if (!input) return '';
  return input
    .replace(/[{}\[\]():,\\"`]/g, '')
    .replace(/\$/g, '')
    .slice(0, 100)
    .trim();
}

// Resolve IPFS hash to a gateway URL
function resolveIPFS(hash: string | null | undefined): string | undefined {
  if (!hash) return undefined;
  if (hash.startsWith('http')) return hash;
  const cleanHash = hash.replace('ipfs://', '');
  return `https://gateway.pinata.cloud/ipfs/${cleanHash}`;
}

// Search experiences from Envio indexer
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const query = sanitizeGraphQLInput(searchParams.get('q') || '');
    const city = sanitizeGraphQLInput(searchParams.get('city') || '');
    const country = sanitizeGraphQLInput(searchParams.get('country') || '');
    const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '10') || 10, 1), 50);

    console.log('[Experience Search] Query:', { query, city, country });

    // Build where clause for Itinerary entity
    let whereClause = '{ active: { _eq: true }';
    if (query) {
      whereClause += `, _or: [{ title: { _ilike: "%${query}%" } }, { description: { _ilike: "%${query}%" } }]`;
    }
    whereClause += ' }';

    // Simple where clause (no text search) as fallback
    const simpleWhereClause = '{ active: { _eq: true } }';

    // Query variants: try Itinerary entity with enriched fields first
    const queries = [
      // Primary: Itinerary entity with new enriched fields
      `query SearchExperiences {
        Itinerary(
          where: ${whereClause}
          order_by: { createdAt: desc }
          limit: ${limit}
        ) {
          id
          itineraryId
          creator
          creatorFid
          title
          description
          photoProofIPFS
          price
          averageRating
          ratingCount
          totalPurchases
          createdAt
        }
      }`,
      // Fallback: Itinerary entity without new fields (pre-migration)
      `query SearchExperiences {
        Itinerary(
          where: ${simpleWhereClause}
          order_by: { createdAt: desc }
          limit: ${limit}
        ) {
          id
          itineraryId
          creator
          description
          price
          createdAt
        }
      }`,
      // Fallback: Experience entity (older schema)
      `query SearchExperiences {
        Experience(
          where: ${simpleWhereClause}
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
          createdAt
        }
      }`,
    ];

    let experiences: Experience[] = [];

    for (const graphqlQuery of queries) {
      try {
        const response = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: graphqlQuery })
        });

        const data = await response.json();
        console.log('[Experience Search] Envio response:', JSON.stringify(data).substring(0, 500));

        const items = data?.data?.Itinerary || data?.data?.Experience || [];

        if (items.length > 0) {
          experiences = items.map((item: any) => ({
            id: item.itineraryId || item.experienceId || item.id,
            itineraryId: item.itineraryId || item.experienceId || item.id,
            title: item.title || item.description || `Experience #${item.itineraryId || item.experienceId}`,
            description: item.description || '',
            creator: item.creator || '',
            creatorFid: item.creatorFid || undefined,
            photoUrl: resolveIPFS(item.photoProofIPFS),
            price: item.price?.toString() || '0',
            priceWMON: (Number(item.price || 0) / 1e18).toFixed(2),
            averageRating: item.averageRating ? Number(item.averageRating) / 100 : 0,
            ratingCount: item.ratingCount || 0,
            totalPurchases: item.totalPurchases || 0,
            createdAt: item.createdAt || '',
          }));

          // Client-side text filter if the query used simple where
          if (query && !graphqlQuery.includes('_ilike')) {
            const lowerQuery = query.toLowerCase();
            experiences = experiences.filter(exp =>
              exp.title.toLowerCase().includes(lowerQuery) ||
              exp.description.toLowerCase().includes(lowerQuery)
            );
          }
          break;
        }
      } catch (queryError) {
        console.log('[Experience Search] Query variant failed:', queryError);
        continue;
      }
    }

    // Enrich with Farcaster profile data from Neynar
    if (experiences.length > 0) {
      const creatorAddresses = [...new Set(experiences.map(e => e.creator).filter(Boolean))];
      const neynarApiKey = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

      if (creatorAddresses.length > 0 && neynarApiKey) {
        try {
          const neynarRes = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${creatorAddresses.join(',')}`,
            { headers: { 'api_key': neynarApiKey } }
          );

          if (neynarRes.ok) {
            const neynarData = await neynarRes.json();
            for (const exp of experiences) {
              const users = neynarData[exp.creator.toLowerCase()];
              if (Array.isArray(users) && users.length > 0) {
                const user = users[0];
                exp.creatorUsername = user.username;
                exp.creatorDisplayName = user.display_name;
                exp.creatorPfpUrl = user.pfp_url;
              }
            }
          }
        } catch (neynarError) {
          console.log('[Experience Search] Neynar lookup failed:', neynarError);
        }
      }

      // Fallback: if we have creatorFid but no username, try FID-based lookup
      const missingProfiles = experiences.filter(e => !e.creatorUsername && e.creatorFid);
      if (missingProfiles.length > 0 && neynarApiKey) {
        try {
          const fids = [...new Set(missingProfiles.map(e => e.creatorFid).filter(Boolean))];
          const neynarRes = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fids.join(',')}`,
            { headers: { 'api_key': neynarApiKey } }
          );

          if (neynarRes.ok) {
            const neynarData = await neynarRes.json();
            const usersByFid: Record<string, any> = {};
            for (const user of neynarData.users || []) {
              usersByFid[user.fid.toString()] = user;
            }
            for (const exp of missingProfiles) {
              const user = usersByFid[exp.creatorFid!];
              if (user) {
                exp.creatorUsername = user.username;
                exp.creatorDisplayName = user.display_name;
                exp.creatorPfpUrl = user.pfp_url;
              }
            }
          }
        } catch (fidError) {
          console.log('[Experience Search] FID lookup failed:', fidError);
        }
      }
    }

    console.log('[Experience Search] Found', experiences.length, 'experiences');

    return NextResponse.json({
      success: true,
      experiences,
      count: experiences.length,
      query: { q: query, city, country }
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
