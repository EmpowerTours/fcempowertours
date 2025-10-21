import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther } from 'viem';
import { monadTestnet } from '@/app/chains';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const TOURS_TOKEN_ADDRESS = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7';

const ERC20_ABI = [
  {
    inputs: [{ name: 'account', type: 'address' }],
    name: 'balanceOf',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
] as const;

export async function POST(req: NextRequest) {
  try {
    const { address } = await req.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address required' }, { status: 400 });
    }

    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http('https://testnet-rpc.monad.xyz'),
    });

    // Get MON balance
    const monBalance = await publicClient.getBalance({ 
      address: address as `0x${string}` 
    });
    const monFormatted = parseFloat(formatEther(monBalance)).toFixed(4);

    // Get TOURS balance
    let toursFormatted = '0';
    try {
      const toursBalance = await publicClient.readContract({
        address: TOURS_TOKEN_ADDRESS as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [address as `0x${string}`],
      });
      toursFormatted = parseFloat(formatEther(toursBalance)).toFixed(2);
    } catch (error) {
      console.error('Error fetching TOURS balance:', error);
    }

    // Get NFT balances
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

    let nftData = { musicNFTCount: 0, passportNFTCount: 0, totalNFTs: 0 };
    
    if (response.ok) {
      const result = await response.json();
      nftData = result.data?.UserStats?.[0] || nftData;
    }

    return NextResponse.json({
      mon: monFormatted,
      tours: toursFormatted,
      nfts: nftData
    });
    
  } catch (error: any) {
    console.error('Balance fetch error:', error);
    return NextResponse.json(
      { mon: '0.0000', tours: '0', error: error.message },
      { status: 500 }
    );
  }
}
