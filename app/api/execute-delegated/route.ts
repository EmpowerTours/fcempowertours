import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { encodeFunctionData, parseEther, parseUnits, Address, Hex, parseAbi } from 'viem';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

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
      // ==================== MINT PASSPORT (WITH CAST + FRAME) ====================
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

        // ✅ POST CAST WITH FRAME
        if (params?.fid) {
          try {
            const tokenId = params.tokenId || 0;
            const frameUrl = `${APP_URL}/api/frames/passport/${tokenId}`;
            const castText = `🎫 New Travel Passport NFT Minted!

${params.countryCode || 'US'} ${params.countryName || 'United States'}

⚡ Gasless minting powered by @empowertours
🌍 Collect all 195 countries

@empowertours`;

            console.log('📢 Posting passport cast with frame...');
            console.log('🎬 Frame URL:', frameUrl);

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const client = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            const castResult = await client.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: castText,
              embeds: [{ url: frameUrl }]
            });

            console.log('✅ Passport cast posted with frame:', {
              hash: castResult.cast?.hash,
              countryCode: params.countryCode,
              frameUrl
            });
          } catch (castError: any) {
            console.error('❌ Passport cast posting failed:', {
              message: castError.message,
              status: castError.response?.status,
              statusText: castError.response?.statusText,
              errorData: castError.response?.data,
            });
            // Don't fail the transaction if cast fails
          }
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: mintTxHash,
          action,
          userAddress,
          message: `Passport minted successfully`,
        });

      // ==================== MINT MUSIC (WITH CAST + FRAME) ====================
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
          tokenURI: params.tokenURI,
          songTitle: params.songTitle,
          imageUrl: params.imageUrl ? 'provided' : 'none'
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

        // ✅ EXTRACT TOKEN ID FROM TX RECEIPT
        let extractedTokenId = '0';
        try {
          const { createPublicClient, http } = await import('viem');
          const client = createPublicClient({
            chain: {
              id: 20143,
              name: 'Monad Testnet',
              network: 'monad-testnet',
              nativeCurrency: { name: 'MON', symbol: 'MON', decimals: 18 },
              rpcUrls: {
                default: {
                  http: [process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'],
                },
                public: {
                  http: [process.env.MONAD_RPC_URL || 'https://testnet-rpc.monad.xyz'],
                },
              },
            },
            transport: http(),
          });

          const receipt = await client.getTransactionReceipt({
            hash: musicTxHash as Hex,
          });

          if (receipt?.logs && receipt.logs.length > 0) {
            // Look for Transfer event (ERC721 mint)
            const transferLog = receipt.logs.find(
              log => log.topics[0] === '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
            );
            if (transferLog && transferLog.topics[3]) {
              extractedTokenId = BigInt(transferLog.topics[3]).toString();
              console.log('🎫 Extracted token ID from receipt:', extractedTokenId);
            }
          }
        } catch (extractError: any) {
          console.warn('⚠️ Could not extract token ID, using indexer fallback:', extractError.message);
        }

        // ✅ POST CAST WITH FRAME - SIMPLIFIED: ONLY tokenId (OG route queries Envio for metadata)
        let frameUrl = '';
        if (params?.fid) {
          try {
            // ✅ SIMPLIFIED: Just pass tokenId, OG route will fetch metadata from Envio
            frameUrl = `${APP_URL}/api/frames/music/${extractedTokenId}`;
            const miniAppUrl = `${APP_URL}/music/${extractedTokenId}`;

            const castText = `🎵 New Music Master NFT Minted!

"${params.songTitle || 'Untitled'}"
💰 License Price: ${params.price} TOURS

⚡ Gasless minting powered by @empowertours
🎶 Purchase license to stream full track

@empowertours`;

            console.log('📢 Posting music cast with frame...');
            console.log('🎬 Frame URL length:', frameUrl.length, 'bytes (Neynar limit: 256)');
            console.log('🎬 Frame URL:', frameUrl);
            console.log('🎬 Mini App URL:', miniAppUrl);
            console.log('🎬 Bot Signer UUID:', process.env.BOT_SIGNER_UUID ? 'set' : 'NOT SET');
            console.log('🎬 Neynar API Key:', process.env.NEXT_PUBLIC_NEYNAR_API_KEY ? 'set' : 'NOT SET');

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const client = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            console.log('📤 Calling Neynar publishCast...');
            const castResult = await client.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: castText,
              embeds: [{ url: frameUrl }]
            });

            console.log('✅ Music cast posted with frame:', {
              hash: castResult.cast?.hash,
              songTitle: params.songTitle,
              tokenId: extractedTokenId,
              frameUrl
            });
          } catch (castError: any) {
            console.error('❌ Music cast posting FAILED:', {
              errorMessage: castError.message,
              httpStatus: castError.response?.status,
              statusText: castError.response?.statusText,
              responseData: castError.response?.data,
              responseText: castError.response?.text,
              tokenId: extractedTokenId,
              songTitle: params.songTitle,
              frameUrlLength: frameUrl?.length,
            });
            // Don't fail the transaction if cast fails
          }
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: musicTxHash,
          tokenId: extractedTokenId,
          action,
          userAddress,
          songTitle: params.songTitle || 'Untitled',
          price: params.price,
          message: `Music NFT minted successfully: ${params.songTitle || 'Untitled'} at ${params.price} TOURS (Token #${extractedTokenId})`,
        });

      // ==================== BUY MUSIC (WITH CAST + FRAME) - FIXED ====================
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

        // ✅ POST CAST WITH FRAME - FETCH MUSIC DATA FROM ENVIO
        if (params?.fid) {
          try {
            let songTitle = params.songTitle || 'Track';
            let songPrice = '?';
            let songArtist = 'Artist';

            // 🔍 Fetch music metadata from Envio
            console.log('🔍 Fetching music metadata from Envio for token:', tokenId.toString());
            const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
            
            try {
              const query = `
                query GetMusicNFT($tokenId: String!) {
                  MusicLicenseNFTs(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
                    items {
                      tokenId
                      songTitle
                      price
                      artist
                    }
                  }
                }
              `;

              const envioRes = await fetch(ENVIO_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query,
                  variables: { tokenId: tokenId.toString() }
                })
              });

              if (envioRes.ok) {
                const envioData = await envioRes.json();
                const musicNFT = envioData.data?.MusicLicenseNFTs?.items?.[0];
                
                if (musicNFT) {
                  songTitle = musicNFT.songTitle || 'Track';
                  songPrice = musicNFT.price || '?';
                  songArtist = musicNFT.artist || 'Artist';
                  console.log('✅ Got music metadata from Envio:', { songTitle, songPrice, songArtist });
                } else {
                  console.warn('⚠️ Music NFT not found in Envio');
                }
              }
            } catch (envioErr: any) {
              console.warn('⚠️ Failed to fetch from Envio:', envioErr.message);
            }

            const frameUrl = `${APP_URL}/api/frames/music/${tokenId.toString()}`;
            const castText = `💎 Music License Purchased!

"${songTitle}" #${tokenId}
🎤 ${songArtist}
💰 ${songPrice} TOURS

⚡ Gasless transaction powered by @empowertours
🎧 Enjoy streaming!

@empowertours`;

            console.log('📢 Posting purchase cast with frame...');
            console.log('🎬 Frame URL:', frameUrl);
            console.log('🎬 Cast text:', castText);

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const client = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            const castResult = await client.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: castText,
              embeds: [{ url: frameUrl }]
            });

            console.log('✅ Purchase cast posted with frame:', {
              hash: castResult.cast?.hash,
              tokenId: tokenId.toString(),
              songTitle,
              songPrice,
              songArtist,
              frameUrl
            });
          } catch (castError: any) {
            console.error('❌ Purchase cast posting failed:', {
              message: castError.message,
              status: castError.response?.status,
              statusText: castError.response?.statusText,
              errorData: castError.response?.data,
            });
            // Don't fail the transaction if cast fails
          }
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
