import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, Address } from 'viem';
import { activeChain } from '@/app/chains';

const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;
const TOURS_TOKEN_ADDRESS = (process.env.NEXT_PUBLIC_TOURS_TOKEN || '0x46d048EB424b0A95d5185f39C760c5FA754491d0') as Address;
const WMON_ADDRESS = (process.env.NEXT_PUBLIC_WMON || '0xC3852efFa2D1291f4224151f5F1Bc8C72051C5Fd') as Address;
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
      chain: activeChain,
      transport: http(process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc.monad.xyz'),
    });

    // =============================================
    // STEP 1: Get MON balance (native currency)
    // ✅ Only check user wallet (hiding old bot Safe for now)
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

    // Get Platform Safe balance (for delegation transparency)
    console.log('⏳ Fetching Platform Safe balance...');
    let platformSafeBalance = 0n;
    try {
      if (BOT_SAFE_ACCOUNT) {
        platformSafeBalance = await publicClient.getBalance({
          address: BOT_SAFE_ACCOUNT
        });
        console.log(`✅ Platform Safe MON balance: ${platformSafeBalance.toString()} wei`);
      }
    } catch (error) {
      console.error('❌ Error fetching Platform Safe balance:', error);
    }

    // Format for display
    const monFormattedUser = parseFloat(formatEther(monBalanceUser)).toFixed(4);
    const monFormattedSafe = parseFloat(formatEther(platformSafeBalance)).toFixed(4); // Platform Safe (delegation account)
    const monFormatted = monFormattedUser; // Show wallet balance in main field
    console.log(`✅ MON balance - User wallet: ${monFormattedUser}, Platform Safe: ${monFormattedSafe}`);

    // =============================================
    // STEP 2: Get TOURS balance (ERC-20 token)
    // ✅ Only check user wallet (hiding old bot Safe for now)
    // =============================================
    console.log(`⏳ Fetching TOURS balance from token: ${TOURS_TOKEN_ADDRESS}`);
    let toursBalanceUser = 0n;

    try {
      // User's TOURS balance
      toursBalanceUser = await publicClient.readContract({
        address: TOURS_TOKEN_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      }) as bigint;
      console.log(`✅ User TOURS balance (raw): ${toursBalanceUser.toString()}`);
    } catch (error) {
      console.error('❌ Error fetching TOURS balance:', error);
    }

    // Only show wallet balance (hiding old Safe)
    const toursFormatted = parseFloat(formatEther(toursBalanceUser)).toFixed(2);
    console.log(`✅ TOURS balance (user wallet): ${toursBalanceUser.toString()} wei = ${toursFormatted} TOURS`);

    // =============================================
    // STEP 2.5: Get WMON balance (ERC-20 wrapped MON)
    // ✅ Only check user wallet (hiding old bot Safe for now)
    // =============================================
    console.log(`⏳ Fetching WMON balance from token: ${WMON_ADDRESS}`);
    let wmonBalanceUser = 0n;

    try {
      // User's WMON balance
      wmonBalanceUser = await publicClient.readContract({
        address: WMON_ADDRESS,
        abi: ERC20_ABI,
        functionName: 'balanceOf',
        args: [userAddress],
      }) as bigint;
      console.log(`✅ User WMON balance (raw): ${wmonBalanceUser.toString()}`);
    } catch (error) {
      console.error('❌ Error fetching WMON balance:', error);
    }

    const wmonFormatted = parseFloat(formatEther(wmonBalanceUser)).toFixed(4);
    const wmonFormattedSafe = '0.0000'; // Hidden - old delegation system
    console.log(`✅ WMON balance formatted: ${wmonFormatted} WMON (user wallet only)`);

    // =============================================
    // STEP 3: Get NFT balances from Envio indexer
    // ✅ FIXED: Query actual NFTs and filter out burned ones
    // =============================================
    const query = `
      query GetUserNFTs($address: String!) {
        MusicNFT(where: {owner: {_eq: $address}, isBurned: {_eq: false}}) {
          id
          isArt
        }
        PassportNFT(where: {owner: {_eq: $address}}) {
          id
        }
      }
    `;

    console.log('⏳ Fetching NFT balances from indexer (excluding burned)...');
    let nftData = {
      id: userAddress,
      address: userAddress,
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 0,
      totalNFTs: 0
    };

    // Retry logic with timeout for intermittent failures
    const maxRetries = 3;
    const timeoutMs = 5000;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const response = await fetch(ENVIO_ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            query,
            variables: { address: userAddress }
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (response.ok) {
          const result = await response.json();
          const musicNFTs = result.data?.MusicNFT || [];
          const passportNFTs = result.data?.PassportNFT || [];

          // Count music vs art NFTs (both are in MusicNFT table)
          const musicCount = musicNFTs.filter((nft: any) => !nft.isArt).length;
          const artCount = musicNFTs.filter((nft: any) => nft.isArt).length;
          const passportCount = passportNFTs.length;

          nftData = {
            id: userAddress,
            address: userAddress,
            musicNFTCount: musicCount,
            artNFTCount: artCount,
            passportNFTCount: passportCount,
            totalNFTs: musicCount + artCount + passportCount
          };
          console.log(`✅ NFT data retrieved (attempt ${attempt}):`, nftData);
          break; // Success, exit retry loop
        } else {
          console.warn(`⚠️ Indexer returned ${response.status} (attempt ${attempt}/${maxRetries})`);
          if (attempt < maxRetries) {
            await new Promise(r => setTimeout(r, 500 * attempt)); // Backoff
          }
        }
      } catch (error: any) {
        const isTimeout = error.name === 'AbortError';
        console.error(`❌ Error fetching NFT data (attempt ${attempt}/${maxRetries}): ${isTimeout ? 'TIMEOUT' : error.message}`);
        if (attempt < maxRetries) {
          await new Promise(r => setTimeout(r, 500 * attempt)); // Backoff
        }
      }
    }

    // =============================================
    // STEP 4: Return aggregated balances with breakdown
    // =============================================
    const wmonFormattedUser = parseFloat(formatEther(wmonBalanceUser)).toFixed(4);

    const finalResponse = {
      mon: monFormatted,
      monWallet: monFormattedUser,  // ✅ User's personal wallet MON
      monSafe: monFormattedSafe,     // ✅ Platform Safe (delegation account)
      tours: toursFormatted,
      wmon: wmonFormatted,           // ✅ Wrapped MON balance
      wmonWallet: wmonFormattedUser, // ✅ User's WMON
      wmonSafe: wmonFormattedSafe,   // Hidden (old bot Safe)
      nfts: nftData,
      // ✅ ADDED: Breakdown for debugging
      breakdown: {
        mon: {
          user: monFormattedUser,
          safe: monFormattedSafe, // Platform Safe for delegation
          total: monFormatted,
        },
        tours: {
          user: parseFloat(formatEther(toursBalanceUser)).toFixed(2),
          safe: '0.00', // Hidden
          total: toursFormatted,
        },
        wmon: {
          user: wmonFormattedUser,
          safe: '0.0000', // Hidden
          total: wmonFormatted,
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
