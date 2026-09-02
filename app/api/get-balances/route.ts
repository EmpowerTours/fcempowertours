import { NextRequest, NextResponse } from 'next/server';
import { createPublicClient, http, formatEther, Address } from 'viem';
import { activeChain } from '@/app/chains';
import { getPassportCount } from '@/lib/passport-lookup';
import { readCatalogueFromChain } from '@/lib/catalogue-source';

const TOURS_TOKEN_ADDRESS = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;
// The Platform Safe address used to be read here and reported as the
// caller's Safe balance. Balances now come from the user's own Safe.

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

    // THIS USER'S Safe, not the platform's.
    //
    // This read NEXT_PUBLIC_SAFE_ACCOUNT — the Platform Safe — and reported it
    // as the caller's safe balance, so every user was shown the platform's
    // money as their own. Under USE_USER_SAFES each user has their own Safe and
    // that is the one holding the funds a mint actually spends; showing the
    // platform's instead is both wrong and dangerous, because it invites
    // spending against a balance that is not yours.
    console.log('⏳ Fetching user Safe balance...');
    let platformSafeBalance = 0n;
    try {
      const { getUserSafeAddress } = await import('@/lib/user-safe');
      const userSafe = await getUserSafeAddress(address);
      platformSafeBalance = await publicClient.getBalance({ address: userSafe });
      console.log(`✅ User Safe ${userSafe} MON balance: ${platformSafeBalance.toString()} wei`);
    } catch (error) {
      console.error('❌ Error fetching user Safe balance:', error);
    }

    // Format for display
    const monFormattedUser = parseFloat(formatEther(monBalanceUser)).toFixed(4);
    const monFormattedSafe = parseFloat(formatEther(platformSafeBalance)).toFixed(4); // this user's Safe
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
    // STEP 3: Count NFTs from the contracts
    //
    // This was three retries with backoff against the indexer, because the indexer was flaky.
    // The contracts are not: passports come from the ERC-721 `balanceOf` in one read, and the
    // music counts from the master registry. No retry loop, because a contract read that fails
    // is a real failure rather than an intermittent one, and the counts degrade to 0 instead of
    // taking the whole balances response down with them.
    //
    // `owner` in the indexer's MusicNFT table meant the master's holder, which for a master is
    // the artist who minted it — so filtering the catalogue by artist reproduces that count.
    // =============================================
    let nftData = {
      id: userAddress,
      address: userAddress,
      musicNFTCount: 0,
      artNFTCount: 0,
      passportNFTCount: 0,
      totalNFTs: 0,
    };

    try {
      const nftClient = createPublicClient({
        chain: activeChain,
        transport: http(),
      });
      const passportAddress = process.env.NEXT_PUBLIC_PASSPORT_NFT as
        | Address
        | undefined;

      const [passportCount, catalogue] = await Promise.all([
        passportAddress
          ? getPassportCount(nftClient, passportAddress, userAddress as Address)
          : Promise.resolve(0),
        // Unbounded on purpose: this is a count, so a limit would silently under-report it.
        readCatalogueFromChain({ client: nftClient, limit: 1000 }),
      ]);

      const mine = catalogue.filter(
        (row) => row.artist.toLowerCase() === userAddress.toLowerCase(),
      );
      const musicCount = mine.filter((row) => !row.isArt).length;
      const artCount = mine.filter((row) => row.isArt).length;

      nftData = {
        id: userAddress,
        address: userAddress,
        musicNFTCount: musicCount,
        artNFTCount: artCount,
        passportNFTCount: passportCount,
        totalNFTs: musicCount + artCount + passportCount,
      };
      console.log('✅ NFT counts from chain:', nftData);
    } catch (error) {
      console.error('❌ Could not count NFTs from chain:', error);
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
