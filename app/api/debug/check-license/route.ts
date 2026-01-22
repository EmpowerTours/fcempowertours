import { NextRequest, NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

/**
 * Debug endpoint to check if a license exists in the Envio indexer
 * Usage: GET /api/debug/check-license?txHash=0x...&address=0x...&tokenId=123
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const txHash = searchParams.get('txHash');
    const address = searchParams.get('address');
    const tokenId = searchParams.get('tokenId');

    const results: Record<string, any> = {};

    // 1. Query GlobalStats to verify indexer is running
    const statsQuery = `
      query GetStats {
        GlobalStats(where: {id: {_eq: "global"}}) {
          totalMusicNFTs
          totalMusicLicensesPurchased
          lastUpdated
        }
      }
    `;
    const statsRes = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: statsQuery })
    });
    results.globalStats = (await statsRes.json())?.data?.GlobalStats?.[0] || null;

    // 2. Query recent licenses (last 10)
    const recentQuery = `
      query RecentLicenses {
        MusicLicense(limit: 10, order_by: {purchasedAt: desc}) {
          id
          licenseId
          masterTokenId
          licensee
          active
          purchasedAt
          txHash
          blockNumber
        }
      }
    `;
    const recentRes = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: recentQuery })
    });
    results.recentLicenses = (await recentRes.json())?.data?.MusicLicense || [];

    // 3. If txHash provided, search for it
    if (txHash) {
      const txQuery = `
        query FindByTxHash($txHash: String!) {
          MusicLicense(where: {txHash: {_eq: $txHash}}) {
            id
            licenseId
            masterTokenId
            licensee
            active
            purchasedAt
            txHash
            blockNumber
          }
          MusicNFT(where: {txHash: {_eq: $txHash}}) {
            id
            tokenId
            artist
            owner
            name
            mintedAt
            txHash
          }
        }
      `;
      const txRes = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: txQuery, variables: { txHash } })
      });
      const txData = await txRes.json();
      results.byTxHash = {
        licenses: txData?.data?.MusicLicense || [],
        musicNFTs: txData?.data?.MusicNFT || []
      };
    }

    // 4. If address provided, search for licenses
    if (address) {
      const addrQuery = `
        query FindByAddress($address: String!) {
          MusicLicense(where: {licensee: {_eq: $address}}, limit: 20) {
            id
            licenseId
            masterTokenId
            licensee
            active
            purchasedAt
            txHash
          }
          MusicNFT(where: {owner: {_eq: $address}}, limit: 20) {
            id
            tokenId
            artist
            owner
            name
            mintedAt
          }
        }
      `;
      const addrRes = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: addrQuery, variables: { address: address.toLowerCase() } })
      });
      const addrData = await addrRes.json();
      results.byAddress = {
        licenses: addrData?.data?.MusicLicense || [],
        ownedNFTs: addrData?.data?.MusicNFT || []
      };
    }

    // 5. If tokenId provided, search for that master token
    if (tokenId) {
      const tokenQuery = `
        query FindByTokenId($tokenId: String!) {
          MusicNFT(where: {tokenId: {_eq: $tokenId}}) {
            id
            tokenId
            artist
            owner
            name
            price
            totalSold
            mintedAt
            txHash
          }
          MusicLicense(where: {masterTokenId: {_eq: $tokenId}}, limit: 20) {
            id
            licenseId
            licensee
            active
            purchasedAt
            txHash
          }
        }
      `;
      const tokenRes = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: tokenQuery, variables: { tokenId } })
      });
      const tokenData = await tokenRes.json();
      results.byTokenId = {
        masterNFT: tokenData?.data?.MusicNFT?.[0] || null,
        licenses: tokenData?.data?.MusicLicense || []
      };
    }

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      envioEndpoint: ENVIO_ENDPOINT,
      results
    });

  } catch (error: any) {
    console.error('Debug check-license error:', error);
    return NextResponse.json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
}
