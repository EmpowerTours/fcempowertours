import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { encodeFunctionData, parseEther, parseUnits, Address, Hex, parseAbi } from 'viem';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const SAFE_ACCOUNT = process.env.NEXT_PUBLIC_SAFE_ACCOUNT as Address;

// ✅ Helper: Convert price from wei (18 decimals) to readable TOURS
function convertPriceFromWei(price: string | number | bigint): string {
  try {
    const priceBI = BigInt(price);
    const priceNum = Number(priceBI) / 1e18;
    return priceNum.toString();
  } catch (e) {
    console.warn('Failed to convert price:', price);
    return String(price);
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
    // Note: Passport minting uses 0.01 MON (native token), not TOURS tokens

    // DeFi contract addresses
    const YIELD_STRATEGY = '0xe3d8E4358aD401F857100aB05747Ed91e78D6913' as Address; // V4 deployed with Foundry
    const TANDA_YIELD_GROUP = '0xE0983Cd98f5852AD6BF56648B4724979B75E9fC8' as Address;
    const SMART_EVENT_MANIFEST = '0x5cfe8379058cA460aA60ef15051Be57dab4A651C' as Address;
    const DEMAND_SIGNAL_ENGINE = '0xC2Eb75ddf31cd481765D550A91C5A63363B36817' as Address;

    switch (action) {
      // ==================== MINT PASSPORT (WITH CAST + FRAME) ====================
      case 'mint_passport':
        console.log('🎫 Action: mint_passport (batched approve + mint)');

        // ✅ VALIDATION: Check if contracts are deployed
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          console.log('🔍 Validating contract deployments...');

          // Check TOURS token
          const toursCode = await client.getCode({ address: TOURS_TOKEN });
          if (!toursCode || toursCode === '0x') {
            throw new Error(`TOURS token at ${TOURS_TOKEN} is not deployed!`);
          }
          console.log('✅ TOURS token is deployed');

          // Check Passport NFT
          const passportCode = await client.getCode({ address: PASSPORT_NFT });
          if (!passportCode || passportCode === '0x') {
            throw new Error(`Passport NFT at ${PASSPORT_NFT} is not deployed!`);
          }
          console.log('✅ Passport NFT is deployed');

          // Check Safe account
          const safeCode = await client.getCode({ address: SAFE_ACCOUNT });
          if (!safeCode || safeCode === '0x') {
            throw new Error(`Safe account at ${SAFE_ACCOUNT} is not deployed!`);
          }
          console.log('✅ Safe account is deployed');
        } catch (validationErr: any) {
          console.error('❌ Contract validation failed:', validationErr.message);
          return NextResponse.json(
            {
              success: false,
              error: `Contract validation failed: ${validationErr.message}. Please ensure all contracts are deployed on chain 10143 (Monad Testnet).`
            },
            { status: 500 }
          );
        }

        // ✅ Check Safe's MON balance - Passport minting requires MON, not TOURS
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          // ✅ CRITICAL: Check Safe's MON balance for MINT PRICE (0.01 MON) + gas
          const monBalance = await client.getBalance({
            address: SAFE_ACCOUNT,
          });

          console.log('⛽ Safe MON balance:', monBalance.toString());

          // Need 0.01 MON for mint + ~0.001 MON for gas = 0.011 MON minimum
          const MIN_MON_REQUIRED = parseEther('0.011');
          if (monBalance < MIN_MON_REQUIRED) {
            const currentMon = Number(monBalance) / 1e18;
            const requiredMon = Number(MIN_MON_REQUIRED) / 1e18;
            return NextResponse.json(
              {
                success: false,
                error: `Insufficient MON in Safe account. The Safe needs ${requiredMon} MON (0.01 for mint + 0.001 for gas), but only has ${currentMon.toFixed(4)} MON. Please contact support to fund the Safe account.`
              },
              { status: 400 }
            );
          }
        } catch (balanceErr: any) {
          console.error('❌ Failed to check MON balance:', balanceErr);
          // Continue with mint attempt - don't block on balance check failure
        }

        // 🔍 DEBUG: Log the actual addresses and amounts involved
        console.log('🔍 [MINT-DEBUG] Transaction details:', {
          safeAccount: SAFE_ACCOUNT,
          userAddress: userAddress,
          passportNFT: PASSPORT_NFT,
          mintPriceMON: '0.01 MON',
          countryCode: params?.countryCode || 'US',
        });

        // ✅ CRITICAL FIX: Passport contract requires 0.01 MON payment (not TOURS tokens)
        // The contract checks: require(msg.value >= MINT_PRICE, "Insufficient payment")
        // where MINT_PRICE = 0.01 ether
        const PASSPORT_MINT_PRICE_MON = parseEther('0.01');

        const mintCalls = [
          {
            to: PASSPORT_NFT,
            value: PASSPORT_MINT_PRICE_MON,  // ✅ Send 0.01 MON as required by contract
            data: encodeFunctionData({
              abi: parseAbi([
                'function mint(address to, string countryCode, string countryName, string region, string continent, string uri) external payable returns (uint256)'
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

        console.log('💳 Executing batched mint transaction (Safe pays, NFT goes to user)...');
        const mintTxHash = await sendSafeTransaction(mintCalls);
        console.log('✅ Mint successful, TX:', mintTxHash);

        // ✅ POST CAST WITH MINIAPP LINK (to minter's profile, not frame)
        if (params?.fid) {
          try {
            const tokenId = params.tokenId || 0;
            const miniAppUrl = `${APP_URL}/profile?address=${userAddress}`;
            const castText = `🎫 New Travel Passport NFT Minted!

${params.countryCode || 'US'} ${params.countryName || 'United States'}

⚡ Gasless minting powered by @empowertours
🌍 Collect all 195 countries

View profile and collection!

@empowertours`;

            console.log('📢 Posting passport cast with miniapp link...');
            console.log('🎬 MiniApp URL:', miniAppUrl);

            const { NeynarAPIClient } = await import("@neynar/nodejs-sdk");
            const client = new NeynarAPIClient({
              apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY as string,
            });

            const castResult = await client.publishCast({
              signerUuid: process.env.BOT_SIGNER_UUID || '',
              text: castText,
              embeds: [{ url: miniAppUrl }]
            });

            console.log('✅ Passport cast posted with miniapp link:', {
              hash: castResult.cast?.hash,
              countryCode: params.countryCode,
              miniAppUrl
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
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
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

        // ✅ POST CAST WITH FRAME - FETCH MUSIC DATA FROM ENVIO (IMPROVED)
        if (params?.fid) {
          try {
            let songTitle = params.songTitle || 'Track';
            let songPrice = '0';  // ✅ Default to 0 not ?
            let songArtist = 'Unknown Artist';  // ✅ Better default

            console.log('🔍 Fetching music metadata from Envio for token:', tokenId.toString());

            try {
              const query = `
                query GetMusicNFT($tokenId: String!) {
                  MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
                    tokenId
                    name
                    price
                    artist
                  }
                }
              `;

              console.log('📤 Envio query variables:', { tokenId: tokenId.toString() });

              const envioRes = await fetch(ENVIO_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  query,
                  variables: { tokenId: tokenId.toString() }
                })
              });

              console.log('📥 Envio response status:', envioRes.status);

              if (envioRes.ok) {
                const envioData = await envioRes.json();
                console.log('📥 Envio data:', JSON.stringify(envioData).substring(0, 200));

                const musicNFT = envioData.data?.MusicNFT?.[0];
                console.log('🎵 Found MusicNFT:', musicNFT);

                if (musicNFT) {
                  songTitle = musicNFT.name || 'Track';

                  // ✅ Convert price from wei (inline to ensure it works)
                  if (musicNFT.price) {
                    try {
                      const priceBI = BigInt(musicNFT.price);
                      const priceNum = Number(priceBI) / 1e18;
                      songPrice = priceNum.toString();
                      console.log('💰 Converted price:', { raw: musicNFT.price, converted: songPrice });
                    } catch (priceErr) {
                      console.warn('⚠️ Price conversion failed:', priceErr);
                      songPrice = String(musicNFT.price);
                    }
                  }

                  // ✅ Get artist and try FID lookup
                  if (musicNFT.artist) {
                    songArtist = musicNFT.artist;

                    // Try to resolve to FID if it's a wallet
                    if (musicNFT.artist.startsWith('0x')) {
                      try {
                        const neynarRes = await fetch(
                          `https://api.neynar.com/v2/farcaster/user/by_verification?address=${musicNFT.artist}`,
                          {
                            headers: {
                              'api_key': process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
                            }
                          }
                        );

                        if (neynarRes.ok) {
                          const neynarData: any = await neynarRes.json();
                          if (neynarData.users && neynarData.users.length > 0) {
                            const username = neynarData.users[0].username;
                            if (username) {
                              songArtist = `@${username}`;
                              console.log('✅ Resolved FID:', username);
                            }
                          }
                        }
                      } catch (fidErr) {
                        console.warn('⚠️ FID lookup failed:', fidErr);
                      }
                    }
                  }

                  console.log('✅ Music data resolved:', { songTitle, songPrice, songArtist });
                } else {
                  console.warn('⚠️ MusicNFT array empty or not found');
                }
              } else {
                console.warn('⚠️ Envio not ok:', envioRes.status);
                const text = await envioRes.text();
                console.warn('⚠️ Response:', text.substring(0, 200));
              }
            } catch (envioErr: any) {
              console.error('❌ Envio fetch failed:', envioErr.message);
              console.error('❌ Stack:', envioErr.stack);
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

      // ==================== APPROVE YIELD STRATEGY (ONE-TIME SETUP) ====================
      case 'approve_yield_strategy':
        console.log('🔓 Action: approve_yield_strategy (one-time max approval)');

        // Approve max uint256 so we never need to approve again
        const { maxUint256 } = await import('viem');

        const approveCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [YIELD_STRATEGY, maxUint256],
            }) as Hex,
          },
        ];

        console.log('💳 Executing max approval for YieldStrategy...');
        console.log('   Amount: max uint256 (unlimited)');
        const approveTxHash = await sendSafeTransaction(approveCalls);
        console.log('✅ Approval successful, TX:', approveTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: approveTxHash,
          action,
          userAddress,
          message: `YieldStrategy approved for unlimited TOURS tokens. You can now stake without approval!`,
        });

      // ==================== STAKE TOURS ====================
      case 'stake_tours':
        console.log('💰 Action: stake_tours');
        if (!params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing amount for stake_tours' },
            { status: 400 }
          );
        }

        const stakeAmount = parseUnits(params.amount.toString(), 18);
        console.log('💰 Staking:', stakeAmount.toString(), 'TOURS');

        // ✅ CHECK: Verify Safe has enough TOURS tokens
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const toursBalance = await client.readContract({
            address: TOURS_TOKEN,
            abi: parseAbi(['function balanceOf(address) external view returns (uint256)']),
            functionName: 'balanceOf',
            args: [SAFE_ACCOUNT],
          });

          console.log('💰 Safe TOURS balance:', toursBalance.toString());

          if (toursBalance < stakeAmount) {
            const currentTours = Number(toursBalance) / 1e18;
            const requiredTours = Number(stakeAmount) / 1e18;
            return NextResponse.json(
              {
                success: false,
                error: `Insufficient TOURS tokens in Safe. Required: ${requiredTours} TOURS, but Safe only has ${currentTours.toFixed(4)} TOURS. Use "swap" to get more TOURS.`
              },
              { status: 400 }
            );
          }
        } catch (balanceErr: any) {
          console.error('❌ Failed to check TOURS balance:', balanceErr);
          return NextResponse.json(
            { success: false, error: `Failed to verify TOURS balance: ${balanceErr.message}` },
            { status: 500 }
          );
        }

        // ✅ Query user's passport NFTs to use as collateral (from NEW contract only)
        let nftTokenId = '0';
        try {
          console.log('🔍 Fetching user passport NFTs for collateral...');
          const passportQuery = `
            query GetUserPassports($owner: String!, $contract: String!) {
              PassportNFT(
                where: {
                  owner: { _eq: $owner }
                  contract: { _eq: $contract }
                },
                limit: 1,
                order_by: { mintedAt: desc }
              ) {
                tokenId
                countryCode
                countryName
                contract
              }
            }
          `;

          const passportRes = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: passportQuery,
              variables: {
                owner: userAddress.toLowerCase(),
                contract: PASSPORT_NFT.toLowerCase()
              }
            })
          });

          if (passportRes.ok) {
            const passportData = await passportRes.json();
            const passport = passportData.data?.PassportNFT?.[0];

            if (!passport) {
              return NextResponse.json(
                { success: false, error: 'No passport NFT found on the new contract. Mint a passport first with "mint passport"' },
                { status: 400 }
              );
            }

            nftTokenId = passport.tokenId;
            console.log('✅ Using passport NFT as collateral:', {
              tokenId: nftTokenId,
              country: passport.countryCode,
              contract: passport.contract
            });
          } else {
            throw new Error('Failed to fetch passport NFTs');
          }
        } catch (nftErr: any) {
          console.error('❌ Failed to fetch passport NFT:', nftErr);
          return NextResponse.json(
            { success: false, error: 'Failed to fetch passport NFT for collateral. Please try again.' },
            { status: 500 }
          );
        }

        // ✅ CHECK: Verify YieldStrategy contract is deployed
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          console.log('🔍 Checking if YieldStrategy is deployed...');
          const yieldStrategyCode = await client.getCode({ address: YIELD_STRATEGY });
          if (!yieldStrategyCode || yieldStrategyCode === '0x') {
            return NextResponse.json(
              {
                success: false,
                error: `YieldStrategy contract at ${YIELD_STRATEGY} is not deployed on Monad Testnet. Staking is currently unavailable. Please contact support.`
              },
              { status: 500 }
            );
          }
          console.log('✅ YieldStrategy is deployed (code length: ' + yieldStrategyCode.length + ')');
        } catch (deployCheckErr: any) {
          console.error('❌ Failed to check YieldStrategy deployment:', deployCheckErr);
          return NextResponse.json(
            { success: false, error: `Failed to verify YieldStrategy contract: ${deployCheckErr.message}` },
            { status: 500 }
          );
        }

        // ✅ V2 CONTRACT: Simplified staking with beneficiary parameter
        // The new V2 contract accepts a beneficiary parameter, so no NFT transfer is needed!
        // The user keeps their NFT and the Safe stakes on their behalf.
        //
        // Flow:
        // 1. Approve TOURS: Safe → YieldStrategy
        // 2. Stake: Safe calls stakeWithNFT with beneficiary=user
        // On unstake: TOURS + yield go to beneficiary
        console.log('💎 Preparing stakeWithNFT with beneficiary:', {
          nftAddress: PASSPORT_NFT,
          nftTokenId: nftTokenId,
          toursAmount: stakeAmount.toString(),
          beneficiary: userAddress,
          safe: SAFE_ACCOUNT
        });

        // ✅ CRITICAL: Check allowance first, only include approve if needed
        // This avoids the approve + spend pattern that causes bundler to drop the UserOp
        let currentAllowance = 0n;
        let stakeCalls: any[] = [];

        // ✅ TRY: Simulate the calls to catch errors early
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          console.log('🔍 Simulating staking preconditions...');

          // Only simulate NFT ownership check - can't simulate the full stake because
          // the approve simulation doesn't actually set allowance
          const nftOwner = await client.readContract({
            address: PASSPORT_NFT,
            abi: parseAbi(['function ownerOf(uint256 tokenId) external view returns (address)']),
            functionName: 'ownerOf',
            args: [BigInt(nftTokenId)],
          });

          if (nftOwner.toLowerCase() !== userAddress.toLowerCase()) {
            throw new Error(`Beneficiary must own NFT #${nftTokenId}`);
          }

          console.log('✅ NFT ownership verified - user owns passport #' + nftTokenId);

          // ✅ ENHANCED: Verify YieldStrategy can accept the stake
          try {
            console.log('🔍 Checking YieldStrategy contract state...');

            // Check if contract is paused (if it has a paused state)
            const yieldStrategyCode = await client.getCode({ address: YIELD_STRATEGY });
            console.log('   YieldStrategy code size:', yieldStrategyCode?.length || 0);

            // Verify the Safe's current allowance
            currentAllowance = await client.readContract({
              address: TOURS_TOKEN,
              abi: parseAbi(['function allowance(address owner, address spender) external view returns (uint256)']),
              functionName: 'allowance',
              args: [SAFE_ACCOUNT, YIELD_STRATEGY],
            }) as bigint;
            console.log('   Current TOURS allowance for YieldStrategy:', currentAllowance.toString());
            console.log('   Stake amount needed:', stakeAmount.toString());

            // Double-check TOURS balance one more time before proceeding
            const currentToursBalance = await client.readContract({
              address: TOURS_TOKEN,
              abi: parseAbi(['function balanceOf(address) external view returns (uint256)']),
              functionName: 'balanceOf',
              args: [SAFE_ACCOUNT],
            });
            console.log('   Current TOURS balance:', currentToursBalance.toString());
            console.log('   Required for stake:', stakeAmount.toString());

            if (currentToursBalance < stakeAmount) {
              throw new Error(`Insufficient TOURS balance: has ${currentToursBalance}, needs ${stakeAmount}`);
            }

            console.log('✅ All preconditions verified for staking');
          } catch (contractCheckErr: any) {
            console.warn('⚠️ Contract state check warning:', contractCheckErr.message);
            // Don't fail here, let the actual transaction attempt proceed
          }
        } catch (simErr: any) {
          console.error('❌ Stake simulation failed:', simErr);
          const errorMsg = simErr.shortMessage || simErr.message || 'Unknown error';

          // Check if it's an NFT ownership issue
          if (errorMsg.includes('Beneficiary must own NFT') || errorMsg.includes('ERC721') || errorMsg.includes('not owner')) {
            return NextResponse.json(
              {
                success: false,
                error: `You must own passport #${nftTokenId} to stake with it. Please ensure you own the NFT and try again.`
              },
              { status: 400 }
            );
          }

          // Check for balance issues
          if (errorMsg.includes('Insufficient TOURS balance')) {
            return NextResponse.json(
              {
                success: false,
                error: errorMsg
              },
              { status: 400 }
            );
          }

          return NextResponse.json(
            {
              success: false,
              error: `Staking would fail: ${errorMsg}. Please try again or contact support.`
            },
            { status: 400 }
          );
        }

        // ✅ CRITICAL FIX: Auto-approve if allowance is insufficient
        // This is done as a SEPARATE transaction to prevent bundler from dropping the UserOp
        if (currentAllowance < stakeAmount) {
          console.log('⚠️  Insufficient allowance, will approve first as separate transaction');
          console.log('   Current allowance:', currentAllowance.toString());
          console.log('   Required allowance:', stakeAmount.toString());
          console.log('   Deficit:', (stakeAmount - currentAllowance).toString());

          // ✅ SOLUTION: Call approve_yield_strategy as a SEPARATE transaction first
          // This prevents the approve + spend pattern that causes bundler to drop the UserOp
          console.log('🔓 Auto-approving YieldStrategy with max allowance...');

          const { maxUint256 } = await import('viem');
          const approveCalls = [
            {
              to: TOURS_TOKEN,
              value: 0n,
              data: encodeFunctionData({
                abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
                functionName: 'approve',
                args: [YIELD_STRATEGY, maxUint256],
              }) as Hex,
            },
          ];

          console.log('💳 Executing approval transaction (max uint256 for unlimited approval)...');
          const approveTxHash = await sendSafeTransaction(approveCalls);
          console.log('✅ Approval successful, TX:', approveTxHash);
          console.log('   YieldStrategy now has unlimited approval to spend TOURS');
          console.log('   Proceeding with stake transaction...');
        } else {
          console.log('✅ Sufficient allowance exists, skipping approve call');
          console.log('   Current allowance:', currentAllowance.toString());
          console.log('   Required amount:', stakeAmount.toString());
        }

        // Build stakeCalls with ONLY the stakeWithNFT call (no approve)
        stakeCalls = [
          {
            to: YIELD_STRATEGY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function stakeWithNFT(address nftAddress, uint256 nftTokenId, uint256 toursAmount, address beneficiary) external returns (uint256)']),
              functionName: 'stakeWithNFT',
              args: [PASSPORT_NFT, BigInt(nftTokenId), stakeAmount, userAddress as Address],
            }) as Hex,
          },
        ];

        const stakeTxHash = await sendSafeTransaction(stakeCalls);
        console.log('✅ Stake successful, TX:', stakeTxHash);

        // ✅ NOTE: YieldStrategy's stakeWithNFT returns a position ID
        // The contract tracks:
        // - NFT address and tokenId (collateral)
        // - Owner (original staker)
        // - Amount staked
        // - Deposit time
        // We generate a client-side ID for tracking, but the real positionId
        // is returned by the contract (starts at 0 and increments)
        const positionId = `${userAddress.slice(2, 10)}-${nftTokenId}`; // Client-side tracking ID
        console.log('🎫 Generated client position ID:', positionId);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: stakeTxHash,
          action,
          userAddress,
          amount: params.amount,
          positionId: positionId,
          nftTokenId: nftTokenId,
          message: `Staked ${params.amount} TOURS successfully`,
        });

      // ==================== UNSTAKE TOURS ====================
      case 'unstake_tours':
        console.log('💰 Action: unstake_tours');
        if (!params?.positionId) {
          return NextResponse.json(
            { success: false, error: 'Missing positionId for unstake_tours. You need to provide the position ID from your staking position.' },
            { status: 400 }
          );
        }

        const unstakePositionId = BigInt(params.positionId);
        console.log('💰 Unstaking position:', unstakePositionId.toString());

        // ✅ QUERY: Get position details to know which NFT to return
        let unstakeNftTokenId = '0';
        let unstakeAmount = 0n;
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          console.log('🔍 Fetching position details for unstake...');
          const position = await client.readContract({
            address: YIELD_STRATEGY,
            abi: parseAbi(['function stakingPositions(uint256) external view returns (address nftAddress, uint256 nftTokenId, address owner, uint256 depositTime, uint256 toursStaked, uint256 monDeployed, bool active)']),
            functionName: 'stakingPositions',
            args: [unstakePositionId],
          });

          // position is a tuple: [nftAddress, nftTokenId, owner, depositTime, toursStaked, monDeployed, active]
          unstakeNftTokenId = position[1].toString();
          unstakeAmount = position[4];
          console.log('✅ Position found:', {
            nftTokenId: unstakeNftTokenId,
            owner: position[2],
            toursStaked: unstakeAmount.toString(),
            active: position[6]
          });

          if (!position[6]) {
            return NextResponse.json(
              { success: false, error: `Position #${params.positionId} is not active. It may have already been unstaked.` },
              { status: 400 }
            );
          }

          // Note: position[2] (owner) will be the Safe account since Safe executed stakeWithNFT
          // The delegation system ensures only the original user can trigger this unstake
          console.log('💡 Position owner is Safe (expected):', position[2]);
        } catch (posErr: any) {
          console.error('❌ Failed to fetch position details:', posErr);
          return NextResponse.json(
            { success: false, error: `Failed to fetch position details: ${posErr.message}` },
            { status: 500 }
          );
        }

        // ✅ V2 CONTRACT: Simplified unstake with beneficiary
        // Since the NFT never left the user's wallet and staking was done with beneficiary,
        // unstake automatically returns TOURS + yield to the beneficiary.
        // No NFT transfer needed!
        console.log('💎 Preparing unstake (beneficiary receives rewards):', {
          positionId: unstakePositionId.toString(),
          nftTokenId: unstakeNftTokenId,
          beneficiary: userAddress
        });

        const unstakeCalls = [
          // Unstake position (TOURS + yield automatically go to beneficiary)
          {
            to: YIELD_STRATEGY,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function unstake(uint256 positionId) external returns (uint256)']),
              functionName: 'unstake',
              args: [unstakePositionId],
            }) as Hex,
          },
        ];

        const unstakeTxHash = await sendSafeTransaction(unstakeCalls);
        console.log('✅ Unstake successful, TX:', unstakeTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: unstakeTxHash,
          action,
          userAddress,
          positionId: params.positionId,
          nftTokenId: unstakeNftTokenId,
          message: `Unstaked position #${params.positionId} successfully. Your TOURS (+ yield) have been returned to your wallet.`,
        });

      // ==================== CLAIM REWARDS ====================
      // ⚠️ NOTE: The EmpowerToursYieldStrategy contract doesn't have a separate
      // claimRewards() function. Rewards are automatically distributed when you
      // call unstake(positionId). The unstake function calculates your yield share
      // and returns it along with your original stake.
      case 'claim_rewards':
        console.log('💰 Action: claim_rewards (not supported by current contract)');
        return NextResponse.json({
          success: false,
          error: 'Claim rewards is not available. Rewards are automatically distributed when you unstake your position. Use "unstake <positionId>" to withdraw your stake and claim rewards.',
        }, { status: 400 });

      // ==================== CREATE TANDA GROUP ====================
      case 'create_tanda_group':
        console.log('🤝 Action: create_tanda_group');
        if (!params?.name || !params?.contributionAmount || !params?.frequency || !params?.maxMembers) {
          return NextResponse.json(
            { success: false, error: 'Missing parameters for create_tanda_group' },
            { status: 400 }
          );
        }

        const tandaContribution = parseUnits(params.contributionAmount.toString(), 18);
        console.log('🤝 Creating Tanda group:', params.name);

        const createTandaCalls = [
          {
            to: TANDA_YIELD_GROUP,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function createGroup(string name, uint256 contributionAmount, uint256 frequency, uint256 maxMembers) external']),
              functionName: 'createGroup',
              args: [params.name, tandaContribution, BigInt(params.frequency), BigInt(params.maxMembers)],
            }) as Hex,
          },
        ];

        const createTandaTxHash = await sendSafeTransaction(createTandaCalls);
        console.log('✅ Tanda group created, TX:', createTandaTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: createTandaTxHash,
          action,
          userAddress,
          message: `Tanda group "${params.name}" created successfully`,
        });

      // ==================== JOIN TANDA GROUP ====================
      case 'join_tanda_group':
        console.log('🤝 Action: join_tanda_group');
        if (!params?.groupId) {
          return NextResponse.json(
            { success: false, error: 'Missing groupId for join_tanda_group' },
            { status: 400 }
          );
        }

        const joinTandaCalls = [
          {
            to: TANDA_YIELD_GROUP,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function joinGroup(uint256 groupId) external']),
              functionName: 'joinGroup',
              args: [BigInt(params.groupId)],
            }) as Hex,
          },
        ];

        const joinTandaTxHash = await sendSafeTransaction(joinTandaCalls);
        console.log('✅ Joined Tanda group, TX:', joinTandaTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: joinTandaTxHash,
          action,
          userAddress,
          groupId: params.groupId,
          message: `Joined Tanda group #${params.groupId} successfully`,
        });

      // ==================== CONTRIBUTE TO TANDA ====================
      case 'contribute_tanda':
        console.log('🤝 Action: contribute_tanda');
        if (!params?.groupId) {
          return NextResponse.json(
            { success: false, error: 'Missing groupId for contribute_tanda' },
            { status: 400 }
          );
        }

        const contributeCalls = [
          {
            to: TANDA_YIELD_GROUP,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function contribute(uint256 groupId) external']),
              functionName: 'contribute',
              args: [BigInt(params.groupId)],
            }) as Hex,
          },
        ];

        const contributeTxHash = await sendSafeTransaction(contributeCalls);
        console.log('✅ Contributed to Tanda, TX:', contributeTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: contributeTxHash,
          action,
          userAddress,
          groupId: params.groupId,
          message: `Contributed to Tanda group #${params.groupId} successfully`,
        });

      // ==================== CLAIM TANDA PAYOUT ====================
      case 'claim_tanda_payout':
        console.log('🤝 Action: claim_tanda_payout');
        if (!params?.groupId) {
          return NextResponse.json(
            { success: false, error: 'Missing groupId for claim_tanda_payout' },
            { status: 400 }
          );
        }

        const claimTandaCalls = [
          {
            to: TANDA_YIELD_GROUP,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function claimPayout(uint256 groupId) external']),
              functionName: 'claimPayout',
              args: [BigInt(params.groupId)],
            }) as Hex,
          },
        ];

        const claimTandaTxHash = await sendSafeTransaction(claimTandaCalls);
        console.log('✅ Tanda payout claimed, TX:', claimTandaTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: claimTandaTxHash,
          action,
          userAddress,
          groupId: params.groupId,
          message: `Claimed payout from Tanda group #${params.groupId} successfully`,
        });

      // ==================== PURCHASE EVENT TICKET ====================
      case 'purchase_event_ticket':
        console.log('🎉 Action: purchase_event_ticket');
        if (!params?.eventId || !params?.quantity) {
          return NextResponse.json(
            { success: false, error: 'Missing eventId or quantity for purchase_event_ticket' },
            { status: 400 }
          );
        }

        const ticketCalls = [
          {
            to: SMART_EVENT_MANIFEST,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function purchaseTicket(uint256 eventId, uint256 quantity) external']),
              functionName: 'purchaseTicket',
              args: [BigInt(params.eventId), BigInt(params.quantity)],
            }) as Hex,
          },
        ];

        const ticketTxHash = await sendSafeTransaction(ticketCalls);
        console.log('✅ Event ticket purchased, TX:', ticketTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: ticketTxHash,
          action,
          userAddress,
          eventId: params.eventId,
          quantity: params.quantity,
          message: `Purchased ${params.quantity} ticket(s) for event #${params.eventId} successfully`,
        });

      // ==================== SUBMIT DEMAND SIGNAL ====================
      case 'submit_demand_signal':
        console.log('📊 Action: submit_demand_signal');
        if (!params?.eventId || !params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing eventId or amount for submit_demand_signal' },
            { status: 400 }
          );
        }

        const demandAmount = parseUnits(params.amount.toString(), 18);
        console.log('📊 Submitting demand signal:', demandAmount.toString(), 'TOURS for event', params.eventId);

        const demandCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [DEMAND_SIGNAL_ENGINE, demandAmount],
            }) as Hex,
          },
          {
            to: DEMAND_SIGNAL_ENGINE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function submitDemand(uint256 eventId, uint256 amount) external']),
              functionName: 'submitDemand',
              args: [BigInt(params.eventId), demandAmount],
            }) as Hex,
          },
        ];

        const demandTxHash = await sendSafeTransaction(demandCalls);
        console.log('✅ Demand signal submitted, TX:', demandTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: demandTxHash,
          action,
          userAddress,
          eventId: params.eventId,
          amount: params.amount,
          message: `Demand signal of ${params.amount} TOURS submitted for event #${params.eventId}`,
        });

      // ==================== WITHDRAW DEMAND SIGNAL ====================
      case 'withdraw_demand_signal':
        console.log('📊 Action: withdraw_demand_signal');
        if (!params?.eventId) {
          return NextResponse.json(
            { success: false, error: 'Missing eventId for withdraw_demand_signal' },
            { status: 400 }
          );
        }

        const withdrawDemandCalls = [
          {
            to: DEMAND_SIGNAL_ENGINE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function withdrawDemand(uint256 eventId) external']),
              functionName: 'withdrawDemand',
              args: [BigInt(params.eventId)],
            }) as Hex,
          },
        ];

        const withdrawDemandTxHash = await sendSafeTransaction(withdrawDemandCalls);
        console.log('✅ Demand signal withdrawn, TX:', withdrawDemandTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: withdrawDemandTxHash,
          action,
          userAddress,
          eventId: params.eventId,
          message: `Demand signal withdrawn for event #${params.eventId}`,
        });

      default:
        return NextResponse.json(
          { success: false, error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('❌ [DELEGATED] Execution error:', error.message);

    // ✅ Enhanced error handling for common AA/bundler errors
    let userFriendlyError = error.message || 'Failed to execute action';
    let statusCode = 500;

    // ✅ Extract UserOperation hash if available (from timeout or other errors)
    const userOpHash = error.userOpHash;

    // Check for Pimlico reserve balance errors
    if (error.message?.includes('reserve balance') || error.message?.includes('Insufficient MON balance')) {
      statusCode = 503; // Service Unavailable - Safe needs funding
      userFriendlyError = error.message; // Already user-friendly
    }
    // Check for gas estimation errors
    else if (error.message?.includes('Gas estimation failed')) {
      statusCode = 400; // Bad Request - likely an invalid operation
      userFriendlyError = error.message; // Already detailed
    }
    // Check for insufficient token balance
    else if (error.message?.includes('Insufficient token balance') || error.message?.includes('Insufficient TOURS')) {
      statusCode = 400;
      userFriendlyError = error.message; // Already user-friendly
    }
    // Check for NFT ownership/whitelist errors
    else if (error.message?.includes('not whitelisted') || error.message?.includes('does not own NFT')) {
      statusCode = 400;
      userFriendlyError = error.message; // Already user-friendly
    }
    // ✅ Check for transaction timeout with UserOp hash
    else if (error.message?.includes('taking longer than expected') && userOpHash) {
      statusCode = 202; // Accepted - transaction is processing
      userFriendlyError = error.message; // Already includes userOpHash
    }

    const errorResponse: any = {
      success: false,
      error: userFriendlyError,
      action: 'execute_delegated',
    };

    // ✅ Include UserOp hash in response if available so users can track their transaction
    if (userOpHash) {
      errorResponse.userOpHash = userOpHash;
      console.log('📋 Including UserOperation hash in error response:', userOpHash);
    }

    return NextResponse.json(errorResponse, { status: statusCode });
  }
}
