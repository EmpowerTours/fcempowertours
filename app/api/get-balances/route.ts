import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, Address } from 'viem';
import { monadTestnet } from '@/app/chains';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const TOURS_TOKEN_ADDRESS = '0xa123600c82E69cB311B0e068B06Bfa9F787699B7' as Address;
const BOT_SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address; // ✅ Bot's Safe account

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

    const userAddress = address.toLowerCase() as Address;
    console.log(`📊 [GET-BALANCES] Fetching balances for user address: ${userAddress}`);

    const publicClient = createPublicClient({
      chain: monadTestnet,
      transport: http('https://testnet-rpc.monad.xyz'),
    });

    // =============================================
    // STEP 1: Get MON balance (native currency)
    // ✅ CRITICAL FIX: Check BOTH user wallet AND bot Safe
    // =============================================
    console.log('⏳ Fetching MON balance from user wallet...');
    let monBalanceUser = 0n;
    try {
      monBalanceUser = await publicClient.getBalance({ 
        address: userAddress 
      });
      console.log(`✅ User MON balance: ${monBalanceUser.toString()} wei`);
    } catch (error) {
      console.error('❌ Error fetching user MON balance:', error);
    }

    // Check bot Safe account MON balance too
    let monBalanceSafe = 0n;
    if (BOT_SAFE_ACCOUNT) {
      try {
        monBalanceSafe = await publicClient.getBalance({ 
          address: BOT_SAFE_ACCOUNT 
        });
        console.log(`✅ Safe MON balance: ${monBalanceSafe.toString()} wei`);
      } catch (error) {
        console.error('❌ Error fetching Safe MON balance:', error);
      }
    }

    // Total MON = user wallet + safe
    const totalMonBalance = monBalanceUser + monBalanceSafe;
    const monFormatted = parseFloat(formatEther(totalMonBalance)).toFixed(4);
    console.log(`✅ TOTAL MON balance (user + safe): ${totalMonBalance.toString()} wei = ${monFormatted} MON`);

    // =============================================
    // STEP 2: Get TOURS balance (ERC-20 token)
    // ✅ CRITICAL FIX: Check BOTH user wallet AND bot Safe
    // =============================================
    console.log(`⏳ Fetching TOURS balance from token: ${TOURS_TOKEN_ADDRESS}`);
    let toursBalanceUser = 0n;
    let toursBalanceSafe = 0n;

    try {
      // User's TOURS balance
      toursBalanceUser = await publicClient.readContract({
        address: TOURS_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      }) as bigint;
      console.log(`✅ User TOURS balance (raw): ${toursBalanceUser.toString()}`);

      // Bot Safe's TOURS balance (where delegated transactions send tokens)
      if (BOT_SAFE_ACCOUNT) {
        toursBalanceSafe = await publicClient.readContract({
          address: TOURS_TOKEN_ADDRESS,
          abi: ERC20_ABI,
          functionName: 'balanceOf',
          args: [BOT_SAFE_ACCOUNT],
        }) as bigint;
        console.log(`✅ Safe TOURS balance (raw): ${toursBalanceSafe.toString()}`);
      }
    } catch (error) {
      console.error('❌ Error fetching TOURS balance:', error);
    }

    // ✅ CRITICAL: Total TOURS = user wallet + safe
    // This reflects BOTH direct holdings AND delegated holdings
    const totalToursBalance = toursBalanceUser + toursBalanceSafe;
    const toursFormatted = parseFloat(formatEther(totalToursBalance)).toFixed(2);
    console.log(`✅ TOTAL TOURS balance (user + safe): ${totalToursBalance.toString()} wei = ${toursFormatted} TOURS`);

    // =============================================
    // STEP 3: Get NFT balances from Envio indexer
    // =============================================
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

    console.log('⏳ Fetching NFT balances from indexer...');
    let nftData = { 
      id: userAddress,
      address: userAddress,
      musicNFTCount: 0, 
      passportNFTCount: 0, 
      totalNFTs: 0 
    };
    
    try {
      const response = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: { address: userAddress }
        }),
      });

      if (response.ok) {
        const result = await response.json();
        const stats = result.data?.UserStats?.[0];
        if (stats) {
          nftData = stats;
          console.log(`✅ NFT data retrieved:`, nftData);
        } else {
          console.warn('⚠️ No NFT stats found for user');
        }
      } else {
        console.warn('⚠️ Failed to fetch NFT balances from indexer');
      }
    } catch (error) {
      console.error('❌ Error fetching NFT data:', error);
    }

    // =============================================
    // STEP 4: Return aggregated balances
    // =============================================
    const finalResponse = {
      mon: monFormatted,
      tours: toursFormatted,
      nfts: nftData,
      // ✅ ADDED: Breakdown for debugging
      breakdown: {
        mon: {
          user: parseFloat(formatEther(monBalanceUser)).toFixed(4),
          safe: parseFloat(formatEther(monBalanceSafe)).toFixed(4),
          total: monFormatted,
        },
        tours: {
          user: parseFloat(formatEther(toursBalanceUser)).toFixed(2),
          safe: parseFloat(formatEther(toursBalanceSafe)).toFixed(2),
          total: toursFormatted,
        },
      },
    };

    console.log(`✅ [GET-BALANCES] Final response:`, finalResponse);
    return NextResponse.json(finalResponse);
    
  } catch (error: any) {
    console.error('❌ [GET-BALANCES] Fatal error:', error);
    return NextResponse.json(
      { 
        mon: '0.0000', 
        tours: '0.00', 
        nfts: { musicNFTCount: 0, passportNFTCount: 0, totalNFTs: 0 },
        error: error.message 
      },
      { status: 500 }
    );
  }
}
