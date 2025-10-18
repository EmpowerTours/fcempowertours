import { NextRequest, NextResponse } from 'next/server';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    // Query balances from Envio
    const query = `
      query GetUserBalances($address: String!) {
        UserStats(where: {address: {_eq: $address}}) {
          id
          address
          musicNFTCount
          passportNFTCount
          totalNFTs
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { address: address.toLowerCase() }
      }),
    });

    if (!response.ok) {
      console.error('Envio error:', response.status, response.statusText);
      throw new Error(`Envio returned ${response.status}`);
    }

    const result = await response.json();
    
    // Return dummy balances for MON/TOURS
    // TODO: Track these by indexing ERC20 Transfer events in Envio
    return NextResponse.json({
      mon: '0.0000',
      tours: '0',
      nfts: result.data?.UserStats?.[0] || { 
        musicNFTCount: 0, 
        passportNFTCount: 0, 
        totalNFTs: 0 
      }
    });
    
  } catch (error: any) {
    console.error('Balance fetch error:', error);
    return NextResponse.json(
      { mon: '0.0000', tours: '0', error: error.message },
      { status: 500 }
    );
  }
}
