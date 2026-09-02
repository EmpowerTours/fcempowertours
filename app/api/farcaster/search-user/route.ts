import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, parseAbi } from 'viem';
import { activeChain } from '@/app/chains';

/**
 * Resolve an EmpowerTours display name to its owner.
 *
 * ProfileRegistry exists so someone with no Farcaster account can claim an
 * artist name, and `ownerOfName` is the exact reverse lookup a search needs —
 * but nothing used it for searching, only to check availability while claiming.
 * So an artist could register a name, watch it render on their own cards, and
 * still be unfindable by it. Searching "Earvin Gallardo" returned "User not
 * found" while that name sat on chain.
 *
 * Returns null on anything unexpected: no registry configured, no match, a
 * failed read. A miss here just falls through to the Farcaster answer.
 */
async function lookupRegisteredName(name: string) {
  const registry = process.env.NEXT_PUBLIC_PROFILE_REGISTRY as
    | `0x${string}`
    | undefined;
  if (!registry) return null;
  try {
    const client = createPublicClient({ chain: activeChain, transport: http() });
    const owner = (await client.readContract({
      address: registry,
      abi: parseAbi([
        'function ownerOfName(string displayName) view returns (address)',
        'function displayNameOf(address owner) view returns (string)',
      ]),
      functionName: 'ownerOfName',
      args: [name],
    })) as string;
    if (!owner || /^0x0{40}$/i.test(owner.replace(/^0x/, '0x'))) return null;
    if (owner === '0x0000000000000000000000000000000000000000') return null;
    // Read the name back so the reply carries its exact registered casing
    // rather than whatever the searcher typed.
    const canonical = (await client.readContract({
      address: registry,
      abi: parseAbi(['function displayNameOf(address owner) view returns (string)']),
      functionName: 'displayNameOf',
      args: [owner as `0x${string}`],
    })) as string;
    return { owner, displayName: canonical || name };
  } catch {
    return null;
  }
}

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

/**
 * Search for a Farcaster user by username
 * GET /api/farcaster/search-user?username=vitalik
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const username = searchParams.get('username');

    if (!username) {
      return NextResponse.json({
        success: false,
        error: 'Username is required'
      }, { status: 400 });
    }

    // Clean up username (remove @ if present)
    const cleanUsername = username.trim().replace(/^@/, '').toLowerCase();

    console.log('[SearchUser] Searching for:', cleanUsername);

    // Search for user by username using Neynar API
    const searchResponse = await fetch(
      `https://api.neynar.com/v2/farcaster/user/by_username?username=${encodeURIComponent(cleanUsername)}`,
      {
        headers: {
          'api_key': NEYNAR_API_KEY,
          'Accept': 'application/json'
        }
      }
    );

    if (!searchResponse.ok) {
      // Try search endpoint as fallback (per Neynar API spec: GET /v2/farcaster/user/search/)
      const fallbackResponse = await fetch(
        `https://api.neynar.com/v2/farcaster/user/search?q=${encodeURIComponent(cleanUsername)}&limit=5`,
        {
          headers: {
            'api_key': NEYNAR_API_KEY,
            'Accept': 'application/json'
          }
        }
      );

      if (!fallbackResponse.ok) {
        console.log('[SearchUser] User not found:', cleanUsername);
        return NextResponse.json({
          success: false,
          error: 'User not found'
        });
      }

      const fallbackData = await fallbackResponse.json();
      // Per API spec: response.result.users is the array
      const users = fallbackData.result?.users || [];

      if (users.length === 0) {
        // Farcaster's own search found nobody. This is the path a wallet-only
        // artist's registered name actually reaches.
        const registered = await lookupRegisteredName(username.trim());
        if (registered) {
          console.log('[SearchUser] Found via ProfileRegistry:', registered.displayName);
          return NextResponse.json({
            success: true,
            user: {
              fid: null,
              username: null,
              displayName: registered.displayName,
              pfpUrl: null,
              walletAddress: registered.owner,
              followerCount: 0,
              followingCount: 0,
              bio: '',
              source: 'profile-registry',
            },
          });
        }
        return NextResponse.json({
          success: false,
          error: 'User not found'
        });
      }

      // Find best match - exact username match first, then first result
      const exactMatch = users.find((u: any) => u.username.toLowerCase() === cleanUsername);
      const user = exactMatch || users[0];
      console.log('[SearchUser] Found via search:', user.username, 'FID:', user.fid);

      // Per API spec: verified_addresses.eth_addresses contains verified Ethereum addresses
      return NextResponse.json({
        success: true,
        user: {
          fid: user.fid,
          username: user.username,
          displayName: user.display_name,
          pfpUrl: user.pfp_url,
          walletAddress: user.verified_addresses?.eth_addresses?.[0] || user.custody_address || null,
          followerCount: user.follower_count,
          followingCount: user.following_count,
          bio: user.profile?.bio?.text || '',
        }
      });
    }

    const data = await searchResponse.json();
    const user = data.user;

    if (!user) {
      console.log('[SearchUser] User not found in response:', cleanUsername);
      // Not on Farcaster is the normal case for a wallet-only artist. Their
      // registered EmpowerTours name is the other place to look, and the one
      // ProfileRegistry was deployed for.
      const registered = await lookupRegisteredName(username.trim());
      if (registered) {
        console.log('[SearchUser] Found via ProfileRegistry:', registered.displayName);
        return NextResponse.json({
          success: true,
          user: {
            fid: null,
            username: null,
            displayName: registered.displayName,
            pfpUrl: null,
            walletAddress: registered.owner,
            followerCount: 0,
            followingCount: 0,
            bio: '',
            source: 'profile-registry',
          },
        });
      }
      return NextResponse.json({
        success: false,
        error: 'User not found'
      });
    }

    console.log('[SearchUser] Found:', user.username, 'FID:', user.fid);

    // Get wallet address from verifications
    const walletAddress = user.verified_addresses?.eth_addresses?.[0] ||
                         user.verifications?.[0] ||
                         user.custody_address ||
                         null;

    return NextResponse.json({
      success: true,
      user: {
        fid: user.fid,
        username: user.username,
        displayName: user.display_name,
        pfpUrl: user.pfp_url,
        walletAddress,
        followerCount: user.follower_count,
        followingCount: user.following_count,
        bio: user.profile?.bio?.text || '',
      }
    });

  } catch (error: any) {
    console.error('[SearchUser] Error:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to search user'
    }, { status: 500 });
  }
}
