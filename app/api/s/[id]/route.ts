import { redis } from '@/lib/redis';
import { NextRequest } from 'next/server';

/**
 * Short URL redirect endpoint
 * GET /api/s/[id] - Redirects to the full URL stored in Redis
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // Retrieve full URL from Redis
    const fullUrl = await redis.get<string>(`shorturl:${id}`);

    if (!fullUrl) {
      return new Response('Short URL not found or expired', { status: 404 });
    }

    // Redirect to the full URL
    return Response.redirect(fullUrl, 302);
  } catch (error) {
    console.error('❌ Short URL redirect error:', error);
    return new Response('Internal server error', { status: 500 });
  }
}
