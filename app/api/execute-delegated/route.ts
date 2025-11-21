import { NextRequest, NextResponse } from 'next/server';
import {
  getDelegation,
  hasPermission,
  incrementTransactionCount
} from '@/lib/delegation-system';
import { sendSafeTransaction } from '@/lib/pimlico-safe-aa';
import { encodeFunctionData, parseEther, parseUnits, Address, Hex, parseAbi, formatEther } from 'viem';

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
    const MUSIC_NFT_V5 = process.env.NEXT_PUBLIC_NFT_ADDRESS as Address;
    const TOKEN_SWAP = process.env.TOKEN_SWAP_ADDRESS as Address;
    // Note: Passport minting uses 0.01 MON (native token), not TOURS tokens

    // DeFi contract addresses
    const YIELD_STRATEGY = (process.env.NEXT_PUBLIC_YIELD_STRATEGY || '0x37aC86916Ae673bDFCc9c712057092E57b270f5f') as Address;
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
        // ✅ Determine if it's Art or Music NFT
        const isArtNFT = params.is_art === true || params.is_art === 1 || params.is_art === '1';
        const nftTypeValue = isArtNFT ? 1 : 0; // 0 = MUSIC, 1 = ART
        const nftTypeName = isArtNFT ? 'Art' : 'Music';

        console.log(`${isArtNFT ? '🎨' : '🎵'} Action: mint_${isArtNFT ? 'art' : 'music'} (nftType: ${nftTypeValue})`);
        if (!params?.tokenURI || !params?.price) {
          return NextResponse.json(
            { success: false, error: `Missing tokenURI or price for ${nftTypeName.toLowerCase()} mint` },
            { status: 400 }
          );
        }

        // ✅ CHECK IF SONG/ART ALREADY EXISTS
        const songTitle = params.songTitle || params.title || 'Untitled';
        console.log('🔍 Checking if NFT already exists:', { artist: userAddress, title: songTitle, isArt: isArtNFT });

        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const checkClient = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const songExists = await checkClient.readContract({
            address: MUSIC_NFT_V5 as Address,
            abi: parseAbi(['function hasSong(address artist, string songTitle) external view returns (bool)']),
            functionName: 'hasSong',
            args: [userAddress as Address, songTitle],
          });

          if (songExists) {
            console.log(`❌ ${nftTypeName} NFT already minted:`, songTitle);
            return NextResponse.json(
              {
                success: false,
                error: `"${songTitle}" has already been minted by this artist. Please use a different title.`
              },
              { status: 400 }
            );
          }
          console.log('✅ NFT title available');
        } catch (checkError: any) {
          console.warn('⚠️ Could not verify NFT existence, proceeding with mint:', checkError.message);
          // Continue with mint if check fails (backwards compatible)
        }

        const musicPrice = parseEther(params.price.toString());
        console.log(`${isArtNFT ? '🎨' : '🎵'} Minting ${nftTypeName} NFT:`, {
          artist: userAddress,
          price: params.price,
          tokenURI: params.tokenURI,
          title: songTitle,
          nftType: `${nftTypeValue} (${nftTypeName})`,
          imageUrl: params.imageUrl ? 'provided' : 'none'
        });

        const musicCalls = [
          {
            to: MUSIC_NFT_V5,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function mintMaster(address artist, string tokenURI, string title, uint256 price, uint8 nftType) external returns (uint256)'
              ]),
              functionName: 'mintMaster',
              args: [
                userAddress as Address,
                params.tokenURI,
                songTitle,
                musicPrice,
                nftTypeValue, // ✅ 0 = MUSIC, 1 = ART
              ],
            }) as Hex,
          },
        ];

        console.log(`💳 Executing ${nftTypeName} NFT mint transaction...`);
        const musicTxHash = await sendSafeTransaction(musicCalls);
        console.log(`✅ ${nftTypeName} NFT mint successful, TX:`, musicTxHash);

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

        // ✅ POST CAST WITH FRAME - Link to artist profile
        let frameUrl = '';
        let ogImageUrl = '';
        if (params?.fid) {
          try {
            // ✅ Determine if it's music or art (0 = MUSIC, 1 = ART)
            const isArt = params.is_art === true || params.is_art === 1 || params.is_art === '1';

            // ✅ OG image route based on NFT type with direct image URL
            const ogRoute = isArt ? 'art' : 'music';
            // Pass imageUrl and other data directly to avoid Envio indexing delay
            ogImageUrl = params.imageUrl
              ? `${APP_URL}/api/og/${ogRoute}?tokenId=${extractedTokenId}&imageUrl=${encodeURIComponent(params.imageUrl)}&title=${encodeURIComponent(songTitle)}&artist=${encodeURIComponent(userAddress)}&price=${encodeURIComponent(params.price)}`
              : `${APP_URL}/api/og/${ogRoute}?tokenId=${extractedTokenId}`;

            // ✅ Link to artist profile within mini app
            const artistProfileUrl = `${APP_URL}/artist/${userAddress}`;
            frameUrl = artistProfileUrl;

            // ✅ Conditional cast message based on NFT type
            const nftTypeEmoji = isArt ? '🎨' : '🎵';
            const nftTypeText = isArt ? 'Art NFT' : 'Music NFT';
            const actionText = isArt ? 'View Gallery' : 'Listen & Buy';

            const castText = `${nftTypeEmoji} New ${nftTypeText} Minted!

"${params.songTitle || params.title || 'Untitled'}"
💰 License Price: ${params.price} TOURS

🔗 Transaction: https://testnet.monadscan.com/tx/${musicTxHash}

⚡ Gasless minting powered by @empowertours
👀 ${actionText}

@empowertours`;

            console.log('📢 Posting NFT cast with artist profile link...');
            console.log('🎬 Artist Profile URL:', frameUrl);
            console.log('🎬 NFT Type:', isArt ? 'Art' : 'Music');
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
              embeds: [
                { url: ogImageUrl },  // OG preview image
                { url: frameUrl }     // Clickable link to artist profile
              ]
            });

            console.log(`✅ ${nftTypeName} NFT cast posted:`, {
              hash: castResult.cast?.hash,
              title: songTitle,
              tokenId: extractedTokenId,
              ogImageUrl,
              frameUrl
            });
          } catch (castError: any) {
            console.error(`❌ ${nftTypeName} NFT cast posting FAILED:`, {
              errorMessage: castError.message,
              httpStatus: castError.response?.status,
              statusText: castError.response?.statusText,
              responseData: castError.response?.data,
              responseText: castError.response?.text,
              tokenId: extractedTokenId,
              title: songTitle,
              isArt: isArtNFT,
              ogImageUrl,
              frameUrl,
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
          songTitle: songTitle,
          title: songTitle,
          isArt: isArtNFT,
          nftType: nftTypeValue,
          price: params.price,
          message: `${nftTypeName} NFT minted successfully: "${songTitle}" at ${params.price} TOURS (Token #${extractedTokenId})`,
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
              args: [MUSIC_NFT_V5, parseEther('1000')],
            }) as Hex,
          },
          {
            to: MUSIC_NFT_V5,
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

      // ==================== SEND MON ====================
      case 'send_mon':
        console.log('💸 Action: send_mon');
        if (!params?.recipient || !params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing recipient or amount for send_mon' },
            { status: 400 }
          );
        }

        if (!/^0x[a-fA-F0-9]{40}$/.test(params.recipient)) {
          return NextResponse.json(
            { success: false, error: 'Invalid recipient address' },
            { status: 400 }
          );
        }

        const sendMonAmount = parseEther(params.amount.toString());
        console.log('💸 Sending:', sendMonAmount.toString(), 'MON to', params.recipient);

        // Check Safe has enough MON
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const safeBalance = await client.getBalance({
            address: SAFE_ACCOUNT as Address,
          });

          console.log('💰 Safe MON balance:', safeBalance.toString());
          console.log('   Requested send amount:', sendMonAmount.toString());

          if (safeBalance < sendMonAmount) {
            const currentMON = (Number(safeBalance) / 1e18).toFixed(4);
            const requestedMON = (Number(sendMonAmount) / 1e18).toFixed(4);
            return NextResponse.json(
              {
                success: false,
                error: `Insufficient MON balance. Safe has ${currentMON} MON, but you're trying to send ${requestedMON} MON.`
              },
              { status: 400 }
            );
          }
        } catch (balanceErr: any) {
          console.error('❌ Failed to check MON balance:', balanceErr);
          return NextResponse.json(
            { success: false, error: `Failed to verify MON balance: ${balanceErr.message}` },
            { status: 500 }
          );
        }

        // Native MON transfer (plain value transfer)
        const sendMonCalls = [
          {
            to: params.recipient as Address,
            value: sendMonAmount,
            data: '0x' as Hex, // Empty data for plain transfer
          },
        ];

        console.log('💳 Executing MON transfer transaction...');
        const sendMonTxHash = await sendSafeTransaction(sendMonCalls);
        console.log('✅ MON sent successfully, TX:', sendMonTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: sendMonTxHash,
          action,
          userAddress,
          recipient: params.recipient,
          amount: params.amount,
          message: `Sent ${params.amount} MON successfully`,
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

      // ==================== SWAP TOURS FOR WMON (AMM) ====================
      case 'swap_tours_for_wmon':
        console.log('💱 Action: swap_tours_for_wmon (AMM)');
        if (!params?.toursAmount || !params?.minWMONOut) {
          return NextResponse.json(
            { success: false, error: 'Missing toursAmount or minWMONOut for swap_tours_for_wmon' },
            { status: 400 }
          );
        }

        const AMM_POOL = process.env.NEXT_PUBLIC_TOURS_WMON_POOL as Address;
        const toursSwapAmount = parseEther(params.toursAmount.toString());
        const minWMONOut = parseEther(params.minWMONOut.toString());

        console.log('💱 Swapping TOURS for WMON:', {
          toursAmount: params.toursAmount,
          minWMONOut: params.minWMONOut,
          ammPool: AMM_POOL,
        });

        const toursSwapCalls = [
          // Approve TOURS for AMM pool (use max to avoid allowance issues)
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [AMM_POOL, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')], // max uint256
            }) as Hex,
          },
          // Swap TOURS for WMON
          {
            to: AMM_POOL,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function swapToursForWMON(uint256 toursIn, uint256 minWMONOut) external returns (uint256)']),
              functionName: 'swapToursForWMON',
              args: [toursSwapAmount, minWMONOut],
            }) as Hex,
          },
        ];

        const toursSwapTxHash = await sendSafeTransaction(toursSwapCalls);
        console.log('✅ TOURS → WMON swap successful, TX:', toursSwapTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: toursSwapTxHash,
          action,
          userAddress,
          toursAmount: params.toursAmount,
          minWMONOut: params.minWMONOut,
          message: `Swapped ${params.toursAmount} TOURS for WMON successfully (gasless)`,
        });

      // ==================== SWAP WMON FOR TOURS (AMM) ====================
      case 'swap_wmon_for_tours':
        console.log('💱 Action: swap_wmon_for_tours (AMM)');
        if (!params?.wmonAmount || !params?.minToursOut) {
          return NextResponse.json(
            { success: false, error: 'Missing wmonAmount or minToursOut for swap_wmon_for_tours' },
            { status: 400 }
          );
        }

        const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as Address;
        const AMM_POOL_WMON = process.env.NEXT_PUBLIC_TOURS_WMON_POOL as Address;
        const wmonSwapAmount = parseEther(params.wmonAmount.toString());
        const minToursOut = parseEther(params.minToursOut.toString());

        console.log('💱 Swapping WMON for TOURS:', {
          wmonAmount: params.wmonAmount,
          minToursOut: params.minToursOut,
          ammPool: AMM_POOL_WMON,
        });

        const wmonSwapCalls = [
          // Approve WMON for AMM pool (use max to avoid allowance issues)
          {
            to: WMON_ADDRESS,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [AMM_POOL_WMON, BigInt('0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')], // max uint256
            }) as Hex,
          },
          // Swap WMON for TOURS
          {
            to: AMM_POOL_WMON,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function swapWMONForTours(uint256 wmonIn, uint256 minToursOut) external returns (uint256)']),
              functionName: 'swapWMONForTours',
              args: [wmonSwapAmount, minToursOut],
            }) as Hex,
          },
        ];

        const wmonSwapTxHash = await sendSafeTransaction(wmonSwapCalls);
        console.log('✅ WMON → TOURS swap successful, TX:', wmonSwapTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: wmonSwapTxHash,
          action,
          userAddress,
          wmonAmount: params.wmonAmount,
          minToursOut: params.minToursOut,
          message: `Swapped ${params.wmonAmount} WMON for TOURS successfully (gasless)`,
        });

      // ==================== WRAP MON TO WMON ====================
      case 'wrap_mon':
        console.log('🎁 Action: wrap_mon');
        if (!params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing amount for wrap_mon' },
            { status: 400 }
          );
        }

        const WMON_ADDRESS_WRAP = process.env.NEXT_PUBLIC_WMON as Address;
        const wrapMonAmount = parseEther(params.amount.toString());

        console.log('🎁 Wrapping MON to WMON:', {
          amount: params.amount,
          wmonAddress: WMON_ADDRESS_WRAP,
        });

        const wrapMonCalls = [
          {
            to: WMON_ADDRESS_WRAP,
            value: wrapMonAmount,
            data: encodeFunctionData({
              abi: parseAbi(['function deposit() external payable']),
              functionName: 'deposit',
              args: [],
            }) as Hex,
          },
        ];

        const wrapMonTxHash = await sendSafeTransaction(wrapMonCalls);
        console.log('✅ MON wrapped to WMON, TX:', wrapMonTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: wrapMonTxHash,
          action,
          userAddress,
          amount: params.amount,
          message: `Wrapped ${params.amount} MON to WMON successfully (gasless)`,
        });

      // ==================== UNWRAP WMON TO MON ====================
      case 'unwrap_wmon':
        console.log('🎁 Action: unwrap_wmon');
        if (!params?.amount) {
          return NextResponse.json(
            { success: false, error: 'Missing amount for unwrap_wmon' },
            { status: 400 }
          );
        }

        const WMON_ADDRESS_UNWRAP = process.env.NEXT_PUBLIC_WMON as Address;
        const unwrapWmonAmount = parseEther(params.amount.toString());

        console.log('🎁 Unwrapping WMON to MON:', {
          amount: params.amount,
          wmonAddress: WMON_ADDRESS_UNWRAP,
        });

        const unwrapWmonCalls = [
          {
            to: WMON_ADDRESS_UNWRAP,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function withdraw(uint256 amount) external']),
              functionName: 'withdraw',
              args: [unwrapWmonAmount],
            }) as Hex,
          },
        ];

        const unwrapWmonTxHash = await sendSafeTransaction(unwrapWmonCalls);
        console.log('✅ WMON unwrapped to MON, TX:', unwrapWmonTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: unwrapWmonTxHash,
          action,
          userAddress,
          amount: params.amount,
          message: `Unwrapped ${params.amount} WMON to MON successfully (gasless)`,
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
        console.log('💰 Staking:', stakeAmount.toString(), 'MON (V6)');

        // ✅ V6 CHECK: Verify Safe has enough MON (native currency)
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const monBalance = await client.getBalance({
            address: SAFE_ACCOUNT as Address,
          });

          console.log('💰 Safe MON balance:', monBalance.toString());

          if (monBalance < stakeAmount) {
            const currentMon = Number(monBalance) / 1e18;
            const requiredMon = Number(stakeAmount) / 1e18;
            return NextResponse.json(
              {
                success: false,
                error: `Insufficient MON in Safe. Required: ${requiredMon} MON, but Safe only has ${currentMon.toFixed(4)} MON.`
              },
              { status: 400 }
            );
          }
        } catch (balanceErr: any) {
          console.error('❌ Failed to check MON balance:', balanceErr);
          return NextResponse.json(
            { success: false, error: `Failed to verify MON balance: ${balanceErr.message}` },
            { status: 500 }
          );
        }

        // ✅ Query user's passport NFTs to use as collateral (from NEW contract only)
        // Find a passport that is NOT already being used in YieldStrategy
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
            const passports = passportData.data?.PassportNFT || [];

            if (passports.length === 0) {
              return NextResponse.json(
                { success: false, error: 'No passport NFT found. Mint a passport first!' },
                { status: 400 }
              );
            }

            // ✅ Check each passport to find one that's not already used as collateral
            const { createPublicClient, http } = await import('viem');
            const { monadTestnet } = await import('@/app/chains');
            const client = createPublicClient({
              chain: monadTestnet,
              transport: http(),
            });

            let availablePassport = null;
            for (const passport of passports) {
              const isUsed = await client.readContract({
                address: YIELD_STRATEGY,
                abi: parseAbi(['function nftCollateralUsed(address,uint256) external view returns (bool)']),
                functionName: 'nftCollateralUsed',
                args: [PASSPORT_NFT, BigInt(passport.tokenId)],
              });

              if (!isUsed) {
                availablePassport = passport;
                break;
              }
            }

            if (!availablePassport) {
              return NextResponse.json(
                {
                  success: false,
                  error: `All your ${passports.length} passport NFT${passports.length > 1 ? 's are' : ' is'} already being used as collateral in active staking positions. Please unstake a position first, or mint another passport to create a new staking position.`
                },
                { status: 400 }
              );
            }

            nftTokenId = availablePassport.tokenId;
            console.log('✅ Using available passport NFT as collateral:', {
              tokenId: nftTokenId,
              country: availablePassport.countryCode,
              contract: availablePassport.contract,
              totalPassports: passports.length
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

        // ✅ V6 CONTRACT: MON-based staking with beneficiary parameter
        // The V6 contract accepts MON directly (payable), no TOURS/TokenSwap needed!
        // The user keeps their NFT and the Safe stakes MON on their behalf.
        //
        // Flow:
        // 1. Safe calls stakeWithDeposit with MON sent as msg.value
        // 2. User receives MON + yield on unstake
        // No TOURS approval needed - MON is native currency
        console.log('💎 Preparing stakeWithDeposit with beneficiary (V6 - MON deposits):', {
          nftAddress: PASSPORT_NFT,
          nftTokenId: nftTokenId,
          monAmount: stakeAmount.toString(),
          beneficiary: userAddress,
          safe: SAFE_ACCOUNT
        });

        // ✅ V6: Check MON balance and NFT ownership
        let stakeCalls: any[] = [];

        // ✅ TRY: Simulate the calls to catch errors early
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          console.log('🔍 Simulating staking preconditions (V6 - MON based)...');

          // Check NFT ownership
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

          // ✅ V6: Check MON balance (native currency) + reserve for gas
          console.log('🔍 Checking Safe MON balance...');
          const safeMonBalance = await client.getBalance({
            address: SAFE_ACCOUNT as Address,
          });
          console.log('   Safe MON balance:', safeMonBalance.toString());
          console.log('   Required for stake:', stakeAmount.toString());

          // ✅ Require Safe to keep 1 MON reserve for gas costs
          const RESERVE_BALANCE = parseUnits('1', 18); // 1 MON reserve
          const totalRequired = stakeAmount + RESERVE_BALANCE;

          console.log('   Reserve balance requirement:', RESERVE_BALANCE.toString(), '(1 MON)');
          console.log('   Total required (stake + reserve):', totalRequired.toString());

          if (safeMonBalance < totalRequired) {
            const currentMON = (Number(safeMonBalance) / 1e18).toFixed(4);
            const requiredMON = (Number(totalRequired) / 1e18).toFixed(4);
            const stakeMON = (Number(stakeAmount) / 1e18).toFixed(4);
            throw new Error(
              `Insufficient MON balance. Safe has ${currentMON} MON but needs ${requiredMON} MON total ` +
              `(${stakeMON} MON for stake + 1 MON reserve for gas). ` +
              `Please reduce stake amount or add more MON to the Safe.`
            );
          }

          console.log('✅ All precondition checks passed - proceeding with stake');
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
          if (errorMsg.includes('Insufficient MON balance')) {
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

        // ✅ V6: Build stake call with MON sent as value (no approval needed)
        console.log('\n💎 Building V6 stake transaction (MON as native currency)...');
        console.log('   Sending', stakeAmount.toString(), 'MON to YieldStrategy');
        console.log('   No TOURS approval needed - using native MON');

        stakeCalls = [
          {
            to: YIELD_STRATEGY,
            value: stakeAmount, // ✅ V6: Send MON with transaction
            data: encodeFunctionData({
              abi: parseAbi(['function stakeWithDeposit(address nftAddress, uint256 nftTokenId, address beneficiary) external payable returns (uint256)']),
              functionName: 'stakeWithDeposit',
              args: [PASSPORT_NFT, BigInt(nftTokenId), userAddress as Address], // ✅ V6: No toursAmount parameter
            }) as Hex,
          },
        ];

        const stakeTxHash = await sendSafeTransaction(stakeCalls);
        console.log('✅ Stake successful, TX:', stakeTxHash);

        // ✅ NOTE: YieldStrategy's stakeWithDeposit returns a position ID
        // The contract tracks:
        // - NFT address and tokenId (collateral)
        // - Owner (Safe account that staked)
        // - Beneficiary (user who receives rewards)
        // - Amount staked
        // - Deposit time
        // We generate a client-side ID for tracking, but the real positionId
        // is returned by the contract (starts at 0 and increments)
        const positionId = `${userAddress.slice(2, 10)}-${nftTokenId}`; // Client-side tracking ID
        console.log('🎫 Generated client position ID:', positionId);

        await incrementTransactionCount(userAddress);

        // ✅ POST FARCASTER CAST: Announce the stake on Farcaster
        try {
          // Try to get FID from params, or lookup from wallet address
          let fid = params?.fid;

          if (!fid && process.env.NEXT_PUBLIC_NEYNAR_API_KEY) {
            // Try to get FID from wallet address using Neynar
            try {
              const url = `https://api.neynar.com/v2/farcaster/user/bulk_by_address?addresses=${userAddress}`;
              const response = await fetch(url, {
                headers: { 'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY }
              });

              if (response.ok) {
                const data: any = await response.json();
                const userData = data[userAddress.toLowerCase()];
                if (userData && userData.length > 0) {
                  fid = userData[0].fid?.toString();
                }
              }
            } catch (lookupErr) {
              console.log('ℹ️ Could not lookup FID from wallet:', lookupErr);
            }
          }

          if (fid) {
            console.log('📢 Posting staking cast to Farcaster...');
            const castResponse = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/cast-nft`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'stake_tours',
                fid: fid,
                tokenId: nftTokenId,
                txHash: stakeTxHash,
                amount: params.amount,
                positionId: positionId,
              }),
            });
            const castResult = await castResponse.json();
            console.log('✅ Staking cast posted:', castResult.castHash);
          } else {
            console.log('ℹ️ No FID found for user, skipping cast');
          }
        } catch (castErr: any) {
          console.error('⚠️ Failed to post staking cast (non-critical):', castErr.message);
          // Don't fail the stake if casting fails
        }

        return NextResponse.json({
          success: true,
          txHash: stakeTxHash,
          action,
          userAddress,
          amount: params.amount,
          positionId: positionId,
          nftTokenId: nftTokenId,
          message: `Staked ${params.amount} MON successfully`,
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

          console.log('🔍 Fetching V6 position details for unstake...');
          const position = await client.readContract({
            address: YIELD_STRATEGY,
            abi: parseAbi(['function stakingPositions(uint256) external view returns (address nftAddress, uint256 nftTokenId, address owner, address beneficiary, uint256 depositTime, uint256 monStaked, uint256 monDeployed, uint256 yieldDebt, bool active)']),
            functionName: 'stakingPositions',
            args: [unstakePositionId],
          });

          // V6 position tuple: [nftAddress, nftTokenId, owner, beneficiary, depositTime, monStaked, monDeployed, yieldDebt, active]
          unstakeNftTokenId = position[1].toString();
          unstakeAmount = position[5]; // monStaked at index 5
          console.log('✅ Position found:', {
            nftTokenId: unstakeNftTokenId,
            owner: position[2],
            beneficiary: position[3],
            monStaked: unstakeAmount.toString(),
            active: position[8] // active at index 8
          });

          if (!position[8]) { // V6: active field at index 8
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

      // ==================== MUSIC NFT V5: STAKING ====================
      case 'stake_music':
        console.log('🎵 Action: stake_music');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for stake_music' },
            { status: 400 }
          );
        }

        const stakeTokenId = BigInt(params.tokenId);

        // ✅ Check if NFT is already used as collateral in YieldStrategy (prevent dual staking)
        try {
          const YIELD_STRATEGY_CHECK = process.env.NEXT_PUBLIC_YIELD_STRATEGY as Address;
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const yieldClient = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const isCollateral = await yieldClient.readContract({
            address: YIELD_STRATEGY_CHECK,
            abi: parseAbi(['function nftCollateralUsed(address,uint256) external view returns (bool)']),
            functionName: 'nftCollateralUsed',
            args: [MUSIC_NFT_V5, stakeTokenId],
          });

          if (isCollateral) {
            return NextResponse.json(
              {
                success: false,
                error: `Music NFT #${params.tokenId} is already staked in YieldStrategy for Kintsu yields. Please unstake it first with "unstake music yield <positionId>" before staking internally.`
              },
              { status: 400 }
            );
          }
          console.log('✅ Music NFT is not used as YieldStrategy collateral');
        } catch (collateralCheckError: any) {
          console.warn('⚠️ Could not verify YieldStrategy collateral status:', collateralCheckError.message);
          // Continue - if check fails, proceed anyway (backwards compatible)
        }

        const stakeMusicCalls = [
          {
            to: MUSIC_NFT_V5,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function stakeMusicNFT(uint256 tokenId) external']),
              functionName: 'stakeMusicNFT',
              args: [stakeTokenId],
            }) as Hex,
          },
        ];

        const stakeMusicTxHash = await sendSafeTransaction(stakeMusicCalls);
        console.log('✅ Music NFT staked, TX:', stakeMusicTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: stakeMusicTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          message: `Music NFT #${params.tokenId} staked successfully`,
        });

      // ==================== MUSIC NFT V5: UNSTAKING ====================
      case 'unstake_music':
        console.log('🎵 Action: unstake_music');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for unstake_music' },
            { status: 400 }
          );
        }

        const unstakeTokenId = BigInt(params.tokenId);

        const unstakeMusicCalls = [
          {
            to: MUSIC_NFT_V5,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function unstakeMusicNFT(uint256 tokenId) external']),
              functionName: 'unstakeMusicNFT',
              args: [unstakeTokenId],
            }) as Hex,
          },
        ];

        const unstakeMusicTxHash = await sendSafeTransaction(unstakeMusicCalls);
        console.log('✅ Music NFT unstaked, TX:', unstakeMusicTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: unstakeMusicTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          message: `Music NFT #${params.tokenId} unstaked and rewards claimed`,
        });

      // ==================== APPROVE GASLESS ====================
      case 'approve_gasless':
        console.log('✅ Action: approve_gasless');

        const approveGaslessCalls = [
          {
            to: MUSIC_NFT_V5,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function setApprovalForAll(address operator, bool approved) external']),
              functionName: 'setApprovalForAll',
              args: [SAFE_ACCOUNT as Address, true],
            }) as Hex,
          },
        ];

        const approveGaslessTxHash = await sendSafeTransaction(approveGaslessCalls);
        console.log('✅ Gasless approved, TX:', approveGaslessTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: approveGaslessTxHash,
          action,
          userAddress,
          message: 'Gasless system approved for NFT management',
        });

      // ==================== MUSIC NFT V5: BURNING ====================
      case 'burn_music':
        console.log('🔥 Action: burn_music');
        if (!params?.tokenId) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId for burn_music' },
            { status: 400 }
          );
        }

        const burnTokenId = BigInt(params.tokenId);

        // Burn the NFT (contract will check authorization)
        const burnMusicCalls = [
          {
            to: MUSIC_NFT_V5,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function burnNFTFor(address owner, uint256 tokenId) external']),
              functionName: 'burnNFTFor',
              args: [userAddress as Address, burnTokenId],
            }) as Hex,
          },
        ];

        const burnMusicTxHash = await sendSafeTransaction(burnMusicCalls);
        console.log('✅ Music NFT burned, TX:', burnMusicTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: burnMusicTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          message: `Music NFT #${params.tokenId} burned for 5 TOURS reward`,
        });

      // ==================== MUSIC NFT YIELD STAKING (YieldStrategyV9) ====================
      case 'stake_music_yield':
        console.log('💎 Action: stake_music_yield (YieldStrategyV9)');
        if (!params?.tokenId || !params?.monAmount) {
          return NextResponse.json(
            { success: false, error: 'Missing tokenId or monAmount for stake_music_yield' },
            { status: 400 }
          );
        }

        const YIELD_STRATEGY_V8 = process.env.NEXT_PUBLIC_YIELD_STRATEGY as Address;
        const stakeMusicYieldTokenId = BigInt(params.tokenId);
        const stakeMusicMonAmount = parseEther(params.monAmount.toString());

        console.log('💎 Staking Music NFT with YieldStrategyV9:', {
          nftAddress: MUSIC_NFT_V5,
          tokenId: stakeMusicYieldTokenId.toString(),
          beneficiary: userAddress,
          monAmount: params.monAmount,
          yieldStrategy: YIELD_STRATEGY_V8
        });

        // ✅ Check if Music NFT is whitelisted
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const checkClient = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const isWhitelisted = await checkClient.readContract({
            address: YIELD_STRATEGY_V8,
            abi: parseAbi(['function acceptedNFTs(address) external view returns (bool)']),
            functionName: 'acceptedNFTs',
            args: [MUSIC_NFT_V5],
          });

          if (!isWhitelisted) {
            return NextResponse.json(
              {
                success: false,
                error: 'Music NFT is not whitelisted in YieldStrategy. Contact admin to whitelist.'
              },
              { status: 400 }
            );
          }
          console.log('✅ Music NFT is whitelisted in YieldStrategy');
        } catch (checkError: any) {
          console.warn('⚠️ Could not verify Music NFT whitelist status:', checkError.message);
        }

        // ✅ Verify user owns the Music NFT
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const nftClient = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const nftOwner = await nftClient.readContract({
            address: MUSIC_NFT_V5,
            abi: parseAbi(['function ownerOf(uint256) external view returns (address)']),
            functionName: 'ownerOf',
            args: [stakeMusicYieldTokenId],
          });

          if (nftOwner.toLowerCase() !== userAddress.toLowerCase()) {
            return NextResponse.json(
              {
                success: false,
                error: `You do not own Music NFT #${params.tokenId}. Owner: ${nftOwner}`
              },
              { status: 400 }
            );
          }
          console.log('✅ User owns Music NFT #' + params.tokenId);
        } catch (nftError: any) {
          return NextResponse.json(
            {
              success: false,
              error: `Failed to verify NFT ownership: ${nftError.message}`
            },
            { status: 400 }
          );
        }

        // ✅ Check if NFT is already staked internally (prevent dual staking)
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const stakingClient = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const stakingInfo = await stakingClient.readContract({
            address: MUSIC_NFT_V5,
            abi: parseAbi([
              'function stakingInfo(uint256) external view returns (tuple(address staker, uint256 stakedAt, uint256 lastClaimAt, bool isStaked))'
            ]),
            functionName: 'stakingInfo',
            args: [stakeMusicYieldTokenId],
          }) as { staker: Address; stakedAt: bigint; lastClaimAt: bigint; isStaked: boolean };

          if (stakingInfo.isStaked) {
            return NextResponse.json(
              {
                success: false,
                error: `Music NFT #${params.tokenId} is already staked internally for TOURS rewards. Please unstake it first with "unstake_music ${params.tokenId}" before staking with YieldStrategy.`
              },
              { status: 400 }
            );
          }
          console.log('✅ Music NFT is not staked internally');
        } catch (stakingCheckError: any) {
          console.warn('⚠️ Could not verify internal staking status:', stakingCheckError.message);
          // Continue - if check fails, proceed anyway (backwards compatible)
        }

        // ✅ Check Safe MON balance
        const { createPublicClient, http } = await import('viem');
        const { monadTestnet } = await import('@/app/chains');
        const publicClient = createPublicClient({
          chain: monadTestnet,
          transport: http(),
        });

        const safeMusicMonBalance = await publicClient.getBalance({
          address: SAFE_ACCOUNT,
        });

        console.log('💰 Safe MON balance:', formatEther(safeMusicMonBalance), 'MON');
        console.log('📊 Required MON:', params.monAmount, 'MON');

        if (safeMusicMonBalance < stakeMusicMonAmount) {
          return NextResponse.json(
            {
              success: false,
              error: `Insufficient MON balance in Safe. Has: ${formatEther(safeMusicMonBalance)} MON, needs: ${params.monAmount} MON`
            },
            { status: 400 }
          );
        }

        // ✅ Build stake call with MON as value
        const stakeMusicYieldCalls = [
          {
            to: YIELD_STRATEGY_V8,
            value: stakeMusicMonAmount, // Send MON with transaction
            data: encodeFunctionData({
              abi: parseAbi([
                'function stakeWithDeposit(address nftAddress, uint256 nftTokenId, address beneficiary) external payable returns (uint256)'
              ]),
              functionName: 'stakeWithDeposit',
              args: [MUSIC_NFT_V5, stakeMusicYieldTokenId, userAddress as Address],
            }) as Hex,
          },
        ];

        console.log('💳 Executing Music NFT yield stake transaction...');
        const stakeMusicYieldTxHash = await sendSafeTransaction(stakeMusicYieldCalls);
        console.log('✅ Music NFT staked in YieldStrategy, TX:', stakeMusicYieldTxHash);

        // ✅ Extract position ID from transaction receipt
        let musicYieldPositionId = '0';
        try {
          const receipt = await publicClient.getTransactionReceipt({
            hash: stakeMusicYieldTxHash as Hex,
          });

          if (receipt?.logs && receipt.logs.length > 0) {
            // Look for StakingPositionCreated event
            // event StakingPositionCreated(uint256 indexed positionId, address indexed nftAddress, uint256 indexed nftTokenId, ...)
            const positionLog = receipt.logs.find(
              log => log.topics[0] === '0x' + '...' // Event signature hash
            );
            if (positionLog && positionLog.topics[1]) {
              musicYieldPositionId = BigInt(positionLog.topics[1]).toString();
              console.log('🎫 Extracted position ID:', musicYieldPositionId);
            }
          }
        } catch (extractError: any) {
          console.warn('⚠️ Could not extract position ID:', extractError.message);
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: stakeMusicYieldTxHash,
          action,
          userAddress,
          tokenId: params.tokenId,
          monAmount: params.monAmount,
          positionId: musicYieldPositionId,
          message: `Music NFT #${params.tokenId} staked with ${params.monAmount} MON in YieldStrategy`,
        });

      // ==================== CREATE ITINERARY ====================
      case 'create_itinerary':
        console.log('🗺️ Action: create_itinerary');
        if (!params?.locationName || !params?.city || !params?.country || !params?.price || !params?.latitude || !params?.longitude) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters for create_itinerary' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;
        const createItineraryPrice = parseEther(params.price.toString());

        console.log('🗺️ Creating itinerary:', {
          creator: userAddress,
          locationName: params.locationName,
          city: params.city,
          country: params.country,
          price: params.price,
          coords: { lat: params.latitude, lon: params.longitude }
        });

        // Build metadata object
        const metadata = {
          locationName: params.locationName,
          city: params.city,
          country: params.country,
          description: params.description || '',
          experienceType: params.experienceType || 'general',
          latitude: params.latitude.toString(),
          longitude: params.longitude.toString(),
          proximityRadius: params.proximityRadius || 100,
          imageHash: params.imageHash || '',
        };

        const createItineraryCalls = [
          // Approve TOURS for the contract if needed
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [ITINERARY_NFT, createItineraryPrice],
            }) as Hex,
          },
          {
            to: ITINERARY_NFT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function createExperience(string locationName, string city, string country, string description, string experienceType, uint256 price, int256 latitude, int256 longitude, uint256 proximityRadius, string imageHash) external returns (uint256)'
              ]),
              functionName: 'createExperience',
              args: [
                params.locationName,
                params.city,
                params.country,
                params.description || '',
                params.experienceType || 'general',
                createItineraryPrice,
                BigInt(Math.floor(params.latitude * 1e6)), // Store as integers with 6 decimal precision
                BigInt(Math.floor(params.longitude * 1e6)),
                BigInt(params.proximityRadius || 100),
                params.imageHash || '',
              ],
            }) as Hex,
          },
        ];

        const createItineraryTxHash = await sendSafeTransaction(createItineraryCalls);
        console.log('✅ Itinerary created, TX:', createItineraryTxHash);

        // Extract itinerary ID from transaction receipt
        let itineraryId = '0';
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const client = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const receipt = await client.getTransactionReceipt({
            hash: createItineraryTxHash as Hex,
          });

          if (receipt?.logs && receipt.logs.length > 0) {
            // Look for ItineraryCreated or ExperienceCreated event
            const createdLog = receipt.logs.find(
              log => log.topics[0] === '0x' + '...' // Event signature hash
            );
            if (createdLog && createdLog.topics[1]) {
              itineraryId = BigInt(createdLog.topics[1]).toString();
              console.log('🎫 Extracted itinerary ID:', itineraryId);
            }
          }
        } catch (extractError: any) {
          console.warn('⚠️ Could not extract itinerary ID:', extractError.message);
        }

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: createItineraryTxHash,
          itineraryId,
          action,
          userAddress,
          message: `Itinerary created successfully: ${params.locationName} in ${params.city}`,
        });

      // ==================== MINT ITINERARY (SIMPLIFIED) ====================
      case 'mint_itinerary':
        console.log('🗺️ Action: mint_itinerary');
        if (!params?.destination || !params?.country) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters: destination and country' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_MINT = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;

        // Set sensible defaults
        const experienceType = 0; // ExperienceType.FOOD = 0
        const defaultPrice = parseEther('10'); // 10 TOURS default
        const defaultLat = 0; // Default coords (user can update later)
        const defaultLon = 0;
        const defaultRadius = 100; // 100 meters

        console.log('🗺️ Minting itinerary stamp:', {
          creator: userAddress,
          destination: params.destination,
          country: params.country,
          climbingGrade: params.climbingGrade || 'Not specified',
        });

        const mintItineraryCalls = [
          {
            to: ITINERARY_NFT_MINT,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function createExperience(string country, string city, string locationName, string description, uint8 experienceType, int256 latitude, int256 longitude, uint256 proximityRadius, uint256 price, string ipfsImageHash) external returns (uint256)'
              ]),
              functionName: 'createExperience',
              args: [
                params.country,
                params.city || params.destination, // Use destination as city if not provided
                params.destination,
                params.description || `${params.destination} - ${params.climbingGrade || 'Travel experience'}`,
                experienceType,
                BigInt(defaultLat),
                BigInt(defaultLon),
                BigInt(defaultRadius),
                defaultPrice,
                params.photoUri || '',
              ],
            }) as Hex,
          },
        ];

        const mintItineraryTxHash = await sendSafeTransaction(mintItineraryCalls);
        console.log('✅ Itinerary minted, TX:', mintItineraryTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: mintItineraryTxHash,
          action,
          userAddress,
          message: `Itinerary stamp minted successfully: ${params.destination}`,
        });

      // ==================== PURCHASE ITINERARY ====================
      case 'purchase_itinerary':
        console.log('🗺️ Action: purchase_itinerary');
        if (!params?.itineraryId) {
          return NextResponse.json(
            { success: false, error: 'Missing itineraryId for purchase_itinerary' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_PURCHASE = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;
        const purchaseItineraryId = BigInt(params.itineraryId);

        console.log('🗺️ Purchasing itinerary:', {
          buyer: userAddress,
          itineraryId: purchaseItineraryId.toString()
        });

        const purchaseItineraryCalls = [
          {
            to: TOURS_TOKEN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function approve(address spender, uint256 amount) external returns (bool)']),
              functionName: 'approve',
              args: [ITINERARY_NFT_PURCHASE, parseEther('1000')], // Approve enough for any itinerary
            }) as Hex,
          },
          {
            to: ITINERARY_NFT_PURCHASE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function purchaseExperience(uint256 itineraryId) external']),
              functionName: 'purchaseExperience',
              args: [purchaseItineraryId],
            }) as Hex,
          },
        ];

        const purchaseItineraryTxHash = await sendSafeTransaction(purchaseItineraryCalls);
        console.log('✅ Itinerary purchased, TX:', purchaseItineraryTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: purchaseItineraryTxHash,
          action,
          userAddress,
          itineraryId: params.itineraryId,
          message: `Itinerary #${params.itineraryId} purchased successfully`,
        });

      // ==================== CHECK-IN TO ITINERARY (STAMP PASSPORT) ====================
      case 'checkin_itinerary':
        console.log('📍 Action: checkin_itinerary');
        if (!params?.itineraryId || !params?.passportTokenId || !params?.userLatitude || !params?.userLongitude) {
          return NextResponse.json(
            { success: false, error: 'Missing required parameters for check-in' },
            { status: 400 }
          );
        }

        const ITINERARY_NFT_CHECKIN = process.env.NEXT_PUBLIC_ITINERARY_NFT as Address;
        const checkinItineraryId = BigInt(params.itineraryId);
        const passportTokenId = BigInt(params.passportTokenId);

        console.log('📍 Checking in to itinerary:', {
          user: userAddress,
          itineraryId: checkinItineraryId.toString(),
          passportTokenId: passportTokenId.toString(),
          userCoords: { lat: params.userLatitude, lon: params.userLongitude }
        });

        // Verify GPS proximity (calculate on server for security)
        const { calculateDistance } = await import('@/lib/utils/gps');

        // Get itinerary details from Envio to verify location
        try {
          const query = `
            query GetItinerary($itineraryId: String!) {
              ItineraryNFT_ItineraryCreated(where: { tokenId: { _eq: $itineraryId } }, limit: 1) {
                tokenId
                name
                latitude
                longitude
                proximityRadius
              }
            }
          `;

          const envioRes = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query,
              variables: { itineraryId: checkinItineraryId.toString() }
            })
          });

          if (envioRes.ok) {
            const envioData = await envioRes.json();
            const itinerary = envioData.data?.ItineraryNFT_ItineraryCreated?.[0];

            if (itinerary) {
              const targetLat = parseFloat(itinerary.latitude) / 1e6; // Convert back from integer storage
              const targetLon = parseFloat(itinerary.longitude) / 1e6;
              const radiusMeters = parseInt(itinerary.proximityRadius) || 100;

              const distance = calculateDistance(
                params.userLatitude,
                params.userLongitude,
                targetLat,
                targetLon
              );

              console.log('📏 Distance check:', {
                distance,
                radiusRequired: radiusMeters,
                isWithin: distance <= radiusMeters
              });

              if (distance > radiusMeters) {
                return NextResponse.json(
                  {
                    success: false,
                    error: `You are too far from the location. You are ${Math.round(distance)}m away, but need to be within ${radiusMeters}m.`
                  },
                  { status: 400 }
                );
              }
            }
          }
        } catch (gpsError: any) {
          console.warn('⚠️ GPS verification failed:', gpsError.message);
          // Continue anyway - contract will do its own validation
        }

        const checkinCalls = [
          {
            to: ITINERARY_NFT_CHECKIN,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi([
                'function checkIn(uint256 itineraryId, uint256 passportTokenId, int256 userLatitude, int256 userLongitude) external'
              ]),
              functionName: 'checkIn',
              args: [
                checkinItineraryId,
                passportTokenId,
                BigInt(Math.floor(params.userLatitude * 1e6)),
                BigInt(Math.floor(params.userLongitude * 1e6)),
              ],
            }) as Hex,
          },
        ];

        const checkinTxHash = await sendSafeTransaction(checkinCalls);
        console.log('✅ Check-in successful, TX:', checkinTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: checkinTxHash,
          action,
          userAddress,
          itineraryId: params.itineraryId,
          passportTokenId: params.passportTokenId,
          message: `Checked in successfully! Passport stamped.`,
        });

      // ==================== MUSIC NFT YIELD UNSTAKING (YieldStrategyV9) ====================
      case 'unstake_music_yield':
        console.log('💎 Action: unstake_music_yield (YieldStrategyV9)');
        if (!params?.positionId) {
          return NextResponse.json(
            { success: false, error: 'Missing positionId for unstake_music_yield' },
            { status: 400 }
          );
        }

        const YIELD_STRATEGY_V8_UNSTAKE = process.env.NEXT_PUBLIC_YIELD_STRATEGY as Address;
        const musicYieldUnstakePositionId = BigInt(params.positionId);

        console.log('💎 Unstaking position from YieldStrategyV9:', {
          positionId: musicYieldUnstakePositionId.toString(),
          yieldStrategy: YIELD_STRATEGY_V8_UNSTAKE,
          user: userAddress
        });

        // ✅ Verify position exists and belongs to user
        try {
          const { createPublicClient, http } = await import('viem');
          const { monadTestnet } = await import('@/app/chains');
          const posClient = createPublicClient({
            chain: monadTestnet,
            transport: http(),
          });

          const position = await posClient.readContract({
            address: YIELD_STRATEGY_V8_UNSTAKE,
            abi: parseAbi([
              'function getPosition(uint256) external view returns (tuple(address nftAddress, uint256 nftTokenId, address owner, address beneficiary, uint256 depositTime, uint256 monStaked, uint256 monDeployed, uint256 yieldDebt, bool active))'
            ]),
            functionName: 'getPosition',
            args: [musicYieldUnstakePositionId],
          }) as { nftAddress: Address; nftTokenId: bigint; owner: Address; beneficiary: Address; depositTime: bigint; monStaked: bigint; monDeployed: bigint; yieldDebt: bigint; active: boolean };

          console.log('📋 Position details:', position);

          if (!position.active) {
            return NextResponse.json(
              { success: false, error: 'Position is not active (already unstaked)' },
              { status: 400 }
            );
          }

          if (position.beneficiary.toLowerCase() !== userAddress.toLowerCase()) {
            return NextResponse.json(
              {
                success: false,
                error: `Position does not belong to you. Beneficiary: ${position.beneficiary}`
              },
              { status: 400 }
            );
          }

          console.log('✅ Position is valid and active');
        } catch (posError: any) {
          console.warn('⚠️ Could not verify position:', posError.message);
        }

        // ✅ Build unstake call
        const unstakeMusicYieldCalls = [
          {
            to: YIELD_STRATEGY_V8_UNSTAKE,
            value: 0n,
            data: encodeFunctionData({
              abi: parseAbi(['function unstake(uint256 positionId) external returns (uint256)']),
              functionName: 'unstake',
              args: [musicYieldUnstakePositionId],
            }) as Hex,
          },
        ];

        console.log('💳 Executing Music NFT yield unstake transaction...');
        const unstakeMusicYieldTxHash = await sendSafeTransaction(unstakeMusicYieldCalls);
        console.log('✅ Music NFT position unstaked, TX:', unstakeMusicYieldTxHash);

        await incrementTransactionCount(userAddress);
        return NextResponse.json({
          success: true,
          txHash: unstakeMusicYieldTxHash,
          action,
          userAddress,
          positionId: params.positionId,
          message: `Music NFT position #${params.positionId} unstaked from YieldStrategy with yield`,
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
