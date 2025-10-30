import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { encodeFunctionData, parseEther, parseUnits, Address, Hex, parseAbi } from 'viem';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

async function postCast(castData: any) {
  try {
    console.log('📢 Posting cast:', castData.type);
    const castRes = await fetch(`${APP_URL}/api/cast-nft`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(castData)
    });

    if (!castRes.ok) {
      const error = await castRes.text();
      console.warn('⚠️ Cast posting failed:', error);
      return;
    }

    const castData_ = await castRes.json();
    console.log('✅ Cast posted:', castData_.castHash);
  } catch (err: any) {
    console.warn('⚠️ Cast error (non-blocking):', err.message);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userAddress, action, params } = await req.json();
    if (!userAddress || !action) {
      return NextResponse.json(
        { success: false, error: 'Missing userAddress or action' },
        { status: 400 }
      );
    }

    console.log('🎫 [DELEGATED] Checking delegation for:', userAddress);
    const delegation = await getDelegation(userAddress);
    if (!delegation || delegation.expiresAt < Date.now()) {
      return NextResponse.json(
        { success: false, error: 'No active delegation' },
        { status: 403 }
      );
    }

    if (!(await hasPermission(userAddress, action))) {
      return NextResponse.json(
        { success: false, error: `No permission for ${action}` },
        { status: 403 }
      );
    }

    if (delegation.transactionsExecuted >= delegation.config.maxTransactions) {
      return NextResponse.json(
        { success: false, error: 'Transaction limit reached' },
        { status: 403 }
      );
    }

    console.log('✅ Delegation valid, transactions left:',
      delegation.config.maxTransactions - delegation.transactionsExecuted);

    const TOURS_TOKEN = process.env.NEXT_PUBLIC_TOURS_TOKEN as Address;
    const PASSPORT_NFT = process.env.NEXT_PUBLIC_PASSPORT as Address;
    const MUSIC_NFT_V4 = '0x5adb6c3Dc258f2730c488Ea81883dc222A7426B6' as Address;
    const TOKEN_SWAP = process.env.TOKEN_SWAP_ADDRESS as Address;
    const MINT_PRICE = parseEther('10'); // 10 TOURS for passport mint

    switch (action) {
      // ==================== MINT PASSPORT (WITH CAST) ====================
      case 'mint_passport':
        console.log('🎫 Action: mint_passport (batched approve + mint)');
        const mintCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [PASSPORT_NFT, MINT_PRICE],
            }) as Hex,
          },
          {
            to: PASSPORT_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function mint(address to, string countryCode, string countryName, string region, string continent, string uri) external returns (uint256)'
              ]),
              functionName: 'mint',
              args: [
                userAddress as Address,
                params?.countryCode || 'US',
                params?.countryName || 'United States',
                params?.region || 'Americas',
                params?.continent || 'North America',
                params?.uri || '',
              ],
            }) as Hex,
          },
        ];

        console.log('💳 Executing batched mint transaction...');
        const mintTxHash = await sendSafeTransaction(mintCalls);
        console.log('✅ Mint successful, TX:', mintTxHash);

        // ✅ POST CAST AFTER SUCCESSFUL MINT
        if (params?.fid) {
          await postCast({
            type: 'passport',
            fid: params.fid,
            tokenId: params.tokenId || 0, // We don't know the exact tokenId yet
            txHash: mintTxHash,
            countryCode: params.countryCode || 'US',
            countryName: params.countryName || 'United States',
          });
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: mintTxHash,
          action,
          userAddress,
          message: `Passport minted successfully`,
        });

      // ==================== MINT MUSIC (WITH CAST) ====================
      case 'mint_music':
        console.log('🎵 Action: mint_music');
        if (!params?.tokenURI || !params?.price) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenURI or price for music mint' },
            { status: 400 }
          );
        }

        const musicPrice = parseEther(params.price.toString());
        console.log('🎵 Minting music NFT:', {
          artist: userAddress,
          price: params.price,
          tokenURI: params.tokenURI
        });

        const musicCalls = [
          {
            to: MUSIC_NFT_V4,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function mintMaster(address artist, string tokenURI, string songTitle, uint256 price) external returns (uint256)'
              ]),
              functionName: 'mintMaster',
              args: [
                userAddress as Address,
                params.tokenURI,
                params.songTitle || 'Untitled',
                musicPrice,
              ],
            }) as Hex,
          },
        ];

        console.log('💳 Executing music mint transaction...');
        const musicTxHash = await sendSafeTransaction(musicCalls);
        console.log('✅ Music mint successful, TX:', musicTxHash);

        // ✅ POST CAST AFTER SUCCESSFUL MINT
        if (params?.fid) {
          await postCast({
            type: 'music_mint',
            fid: params.fid,
            tokenId: params.tokenId || 0,
            txHash: musicTxHash,
            songTitle: params.songTitle || 'Untitled',
            price: params.price,
          });
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: musicTxHash,
          action,
          userAddress,
          songTitle: params.songTitle || 'Untitled',
          price: params.price,
          message: `Music NFT minted successfully: ${params.songTitle || 'Untitled'} at ${params.price} TOURS`,
        });

      // ==================== BUY MUSIC (WITH CAST) ====================
      case 'buy_music':
        console.log('🎵 Action: buy_music (batched approve + purchaseLicenseFor)');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for buy_music' },
            { status: 400 }
          );
        }

        const tokenId = BigInt(params.tokenId);
        console.log('🎵 Token:', tokenId.toString());
        console.log('👤 Licensee:', userAddress);

        const buyCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [MUSIC_NFT_V4, parseEther('1000')],
            }) as Hex,
          },
          {
            to: MUSIC_NFT_V4,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function purchaseLicenseFor(uint256 masterTokenId, address licensee) external'
              ]),
              functionName: 'purchaseLicenseFor',
              args: [tokenId, userAddress as Address],
            }) as Hex,
          },
        ];

        console.log('💳 Executing batched music purchase transaction...');
        const buyTxHash = await sendSafeTransaction(buyCalls);
        console.log('✅ Music purchase successful, TX:', buyTxHash);

        // ✅ POST CAST AFTER SUCCESSFUL PURCHASE
        if (params?.fid) {
          await postCast({
            type: 'music_purchase',
            fid: params.fid,
            tokenId: tokenId.toString(),
            txHash: buyTxHash,
            songTitle: params.songTitle || 'Track',
          });
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: buyTxHash,
          action,
          userAddress,
          tokenId: tokenId.toString(),
          message: `Music license purchased for ${userAddress}`,
        });

      // ==================== SEND TOURS ====================
      case 'send_tours':
        console.log('💸 Action: send_tours');
        if (!params?.recipient || !params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing recipient or amount for send_tours' },
            { status: 400 }
          );
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(params.recipient)) {
          return NextResponse.json(
            { success: false, error: 'Invalid recipient address' },
            { status: 400 }
          );
        }

        const sendAmount = parseEther(params.amount.toString());
        console.log('💸 Sending:', sendAmount.toString(), 'TOURS to', params.recipient);

        const sendCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function transfer(address to, uint256 amount) external returns (bool)']),
              functionName: 'transfer',
              args: [params.recipient as Address, sendAmount],
            }) as Hex,
          },
        ];

        console.log('💳 Executing TOURS transfer transaction...');
        const sendTxHash = await sendSafeTransaction(sendCalls);
        console.log('✅ TOURS sent successfully, TX:', sendTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: sendTxHash,
          action,
          userAddress,
          recipient: params.recipient,
          amount: params.amount,
          message: `Sent ${params.amount} TOURS successfully`,
        });

      // ==================== SWAP MON FOR TOURS ====================
      case 'swap_mon_for_tours':
        console.log('💱 Action: swap_mon_for_tours');
        const monAmount = params?.amount ? parseEther(params.amount) : parseEther('0.1');
        console.log('💱 Swapping:', monAmount.toString(), 'wei MON');

        const swapCalls = [
          {
            to: TOKEN_SWAP,
            value: monAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function swap() external payable']),
              functionName: 'swap',
              args: [],
            }) as Hex,
          },
        ];

        console.log('💳 Executing swap transaction...');
        const swapTxHash = await sendSafeTransaction(swapCalls);
        console.log('✅ Swap successful, TX:', swapTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: swapTxHash,
          action,
          userAddress,
          monAmount: monAmount.toString(),
          message: `Swapped ${params?.amount || '0.1'} MON for TOURS successfully`,
        });

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('❌ [DELEGATED] Execution error:', error.message);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Failed to execute action',
        action: 'execute_delegated',
      },
      { status: 500 }
    );
  }
}
