import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT!;

// ✅ Helper to extract FID from Farcaster context
function extractFidFromRequest(req: NextRequest): string | null {
  // Try to get FID from request headers or body context
  const farcasterContext = req.headers.get('x-farcaster-context');
  if (farcasterContext) {
    try {
      const context = JSON.parse(farcasterContext);
      return context.user?.fid?.toString() || null;
    } catch (e) {
      // Ignore parsing errors
    }
  }
  return null;
}

export async function POST(req: NextRequest) {
  try {
    // ✅ EXTRACT: imageUrl, title, tokenURI, is_art from request body
    const { command, userAddress, location, fid: bodyFid, imageUrl: imageUrlFromRequest, title: titleFromRequest, tokenURI: tokenURIFromRequest, is_art } = await req.json();

    // ✅ Get FID from body or request context
    const fid = bodyFid || extractFidFromRequest(req);

    console.log('Bot command received:', { command, userAddress, fid, imageUrl: imageUrlFromRequest });

    // ✅ CRITICAL: Preserve original command for IPFS CIDs (case-sensitive)
    const originalCommand = command.trim();
    let lowerCommand = command.toLowerCase().trim().replace(/_/g, ' ');

    // ==================== HELP COMMAND ====================
    if (lowerCommand === 'help') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `EmpowerTours AI Agent
Navigation:
- "go to passport" - Mint travel passport
- "go to music" - Mint music NFT
- "go to discover" - Browse all music
- "go to staking" - Passport staking page
- "go to events" - View & buy event tickets
- "go to tanda" - Join savings groups
- "go to credit score" - View your score
- "go to profile" - View your NFTs
- "go to market" - Browse marketplace
- "go to dashboard" - View analytics
Basic Transactions (Gasless):
- "swap 0.1 mon" - Swap MON for TOURS
- "mint passport" - Mint passport NFT (FREE)
- "mint music <Song> <ipfs://...> <price>" - Mint music NFT
- "send <amount> tours to @user" - Send TOURS
- "send <amount> mon to 0x..." - Send MON
- "buy music <tokenId>" - Buy music license
- "buy art <tokenId>" - Buy art NFT
- "check balance" - Check balances
DeFi Actions (Gasless):
- "stake 10" - Stake TOURS (yield + credit boost)
- "unstake 10" - Unstake TOURS
- "claim rewards" - Claim staking rewards
- "create tanda <name>" - Create savings group
- "join tanda <id>" - Join savings group
- "buy ticket <eventId>" - Purchase event ticket
- "signal demand <eventId>" - Show interest in event
Info:
- "help" - Show this message
- "status" - Check wallet connection
- "about" - Learn about EmpowerTours
All transactions are FREE - we pay gas!`
      });
    }

    // ==================== STATUS COMMAND ====================
    if (lowerCommand === 'status' || lowerCommand === 'check status') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: userAddress
          ? `Wallet Connected
Address: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}
You can execute gasless transactions via our bot!
Try: "swap 0.1 mon" or "mint passport"`
          : `Wallet Not Connected
Please connect your wallet first by visiting your profile.
Try: "go to profile"`
      });
    }

    // ==================== ABOUT COMMAND ====================
    if (lowerCommand === 'about' || lowerCommand === 'info') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `EmpowerTours
A Farcaster Mini App for:
- Travel passport NFTs (195 countries!)
- Music NFTs with royalties
- TOURS token staking for rewards
- Tanda (rotating savings groups)
- Event tickets & demand signals
- Credit scoring system
- Passport staking for benefits
- Marketplace trading
- MON ↔ TOURS token swaps
Built on Monad Testnet
Powered by Envio Indexer
All transactions are FREE - we pay gas!
Try "help" to see all commands!`
      });
    }

    // ==================== BALANCE CHECK ====================
    if (lowerCommand.includes('balance') || lowerCommand === 'check balance') {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Please connect your wallet first. Try: "go to profile"'
        });
      }
      try {
        const response = await fetch(`${APP_URL}/api/get-balances`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ address: userAddress }),
        });
        const data = await response.json();
        return NextResponse.json({
          success: true,
          action: 'info',
          message: `Your Balances
MON: ${data.mon || '0.0000'} MON
TOURS: ${data.tours || '0'} TOURS
NFTs: ${data.nfts?.totalNFTs || 0} total
Address: ${userAddress.slice(0, 10)}...`
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to check balance: ${err.message}`
        });
      }
    }

    // ==================== BUY NFT COMMAND (GASLESS VIA DELEGATION + CAST) ====================
    // Supports: buy music, buy song, buy art
    if (lowerCommand.includes('buy music') || lowerCommand.includes('buy song') || lowerCommand.includes('buy art')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }

      // Try to match tokenId first (e.g., "buy music 1", "buy art 4")
      const tokenIdMatch = lowerCommand.match(/buy (?:music|song|art) (\d+)/);
      let tokenId = tokenIdMatch ? parseInt(tokenIdMatch[1]) : null;
      let songTitle = null;
      let isArtNFT = lowerCommand.includes('buy art'); // Pre-set if command explicitly says "buy art"

      // ✅ If no tokenId, try to match song name
      if (!tokenId) {
        const songNameMatch = originalCommand.match(/buy song (.+)/i);
        if (songNameMatch) {
          const searchSongName = songNameMatch[1].trim();
          console.log(`[BOT] Searching for NFT: "${searchSongName}"`);

          try {
            // ✅ CORRECTED: Query MusicNFT (singular) with correct field names including isArt
            const searchQuery = `
              query SearchMusicByName($name: String!) {
                MusicNFT(
                  where: {name: {_ilike: $name}}
                  limit: 1
                  order_by: {mintedAt: desc}
                ) {
                  tokenId
                  name
                  price
                  artist
                  isArt
                }
              }
            `;

            const searchRes = await fetch(ENVIO_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: searchQuery,
                variables: { name: `%${searchSongName}%` }
              })
            });

            if (!searchRes.ok) {
              throw new Error(`GraphQL query failed with status ${searchRes.status}`);
            }

            const searchData = await searchRes.json();
            console.log('[BOT] Envio search response:', searchData);

            // ✅ CORRECTED: Direct array access, not nested in items
            const musicNFT = searchData.data?.MusicNFT?.[0];

            if (!musicNFT) {
              return NextResponse.json({
                success: false,
                message: `NFT "${searchSongName}" not found. Try: "buy music <tokenId>" or browse on /discover`
              });
            }

            tokenId = parseInt(musicNFT.tokenId);
            songTitle = musicNFT.name;
            isArtNFT = musicNFT.isArt === true;  // ✅ Check if it's art
            console.log(`[BOT] Found "${songTitle}" with tokenId: ${tokenId} (isArt: ${isArtNFT})`);
          } catch (searchErr: any) {
            console.error('[BOT] NFT search error:', searchErr);
            return NextResponse.json({
              success: false,
              message: `Failed to search for NFT: ${searchErr.message}`
            });
          }
        }
      }

      if (!tokenId) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "buy music <tokenId>", "buy art <tokenId>", or "buy song <Song Name>"'
        });
      }

      try {
        // ✅ Query Envio to check if it's an art NFT before logging
        if (!isArtNFT) {  // Only query if we haven't already checked
          try {
            const checkQuery = `
              query CheckNFTType($tokenId: String!) {
                MusicNFT(where: { tokenId: { _eq: $tokenId } }, limit: 1) {
                  tokenId
                  isArt
                }
              }
            `;

            const checkRes = await fetch(ENVIO_ENDPOINT, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                query: checkQuery,
                variables: { tokenId: tokenId.toString() }
              })
            });

            if (checkRes.ok) {
              const checkData = await checkRes.json();
              const nft = checkData.data?.MusicNFT?.[0];
              if (nft) {
                isArtNFT = nft.isArt === true;
              }
            }
          } catch (err) {
            console.warn('Could not check NFT type, assuming music');
          }
        }

        const nftType = isArtNFT ? 'Art NFT' : 'Music License';
        console.log(`Action: buy_${isArtNFT ? 'art' : 'music'}`);
        console.log(`[BOT] Buying ${nftType} for token ${tokenId}`);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        const hasValidDelegation = delegationData.success &&
                                  delegationData.delegation &&
                                  Array.isArray(delegationData.delegation.permissions) &&
                                  delegationData.delegation.permissions.includes('buy_music');
        if (!hasValidDelegation) {
          console.warn('[BOT] No delegation with buy_music permission - creating one...');
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['buy_music', 'swap_mon_for_tours', 'send_tours', 'mint_passport', 'wrap_mon', 'mint_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          console.log('[BOT] Delegation created with buy_music permission');
        }

        const buyRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'buy_music',
            params: {
              tokenId: tokenId.toString(),
              songTitle: songTitle,
              fid // ✅ PASS FID FOR CASTING
            }
          })
        });

        const buyData = await buyRes.json();
        if (!buyData.success) {
          throw new Error(buyData.error || 'Purchase failed');
        }

        console.log('Music purchased:', buyData.txHash);
        return NextResponse.json({
          success: true,
          txHash: buyData.txHash,
          action: 'buy_music',
          message: `Music License Purchased (FREE)!
Track #${tokenId} is now yours!
TX: ${buyData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${buyData.txHash}`
        });
      } catch (error: any) {
        console.error('Buy music failed:', error);
        return NextResponse.json({
          success: false,
          message: `Purchase failed: ${error.message}`
        });
      }
    }

    // ==================== SWAP COMMAND (GASLESS VIA DELEGATION) ====================
    if (lowerCommand.includes('swap') && lowerCommand.includes('mon')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      const match = lowerCommand.match(/([\d.]+)\s*mon/);
      const amount = match ? parseFloat(match[1]) : 0.1;
      if (amount <= 0 || amount > 10) {
        return NextResponse.json({
          success: false,
          message: 'Invalid amount. Please use 0.01 - 10 MON'
        });
      }
      try {
        console.log(`Executing swap via delegation: ${amount} MON for user ${userAddress}`);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        const hasValidDelegation = delegationData.success &&
                                  delegationData.delegation &&
                                  Array.isArray(delegationData.delegation.permissions) &&
                                  delegationData.delegation.permissions.includes('swap_mon_for_tours');
        if (!hasValidDelegation) {
          console.warn('[BOT] No delegation with swap_mon_for_tours permission - creating one...');
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['swap_mon_for_tours', 'send_tours', 'mint_passport', 'wrap_mon', 'mint_music', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          console.log('[BOT] Delegation created with swap_mon_for_tours permission');
        }
        const swapRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'swap_mon_for_tours',
            params: {
              amount: amount.toString()
            }
          })
        });
        const swapData = await swapRes.json();
        if (!swapData.success) {
          throw new Error(swapData.error || 'Swap failed');
        }
        console.log('Swap successful:', swapData.txHash);
        return NextResponse.json({
          success: true,
          txHash: swapData.txHash,
          action: 'transaction',
          message: `Swap Complete (FREE)!
${amount} MON → ${amount} TOURS tokens
TX: ${swapData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${swapData.txHash}`
        });
      } catch (error: any) {
        console.error('Swap failed:', error);
        return NextResponse.json({
          success: false,
          message: `Swap failed: ${error.message || 'Unknown error'}`
        });
      }
    }

    // ==================== SEND TOURS COMMAND ====================
    if (lowerCommand.includes('send') && lowerCommand.includes('tours')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        const amountMatch = lowerCommand.match(/send\s+([\d.]+)\s+tours/);
        const recipientMatch = lowerCommand.match(/to\s+(@[\w]+|0x[a-fA-F0-9]{40})/);
        if (!amountMatch || !recipientMatch) {
          return NextResponse.json({
            success: false,
            message: 'Invalid format. Use: "send 10 tours to @username" or "send 10 tours to 0x..."'
          });
        }
        const amount = parseFloat(amountMatch[1]);
        let recipient = recipientMatch[1];
        if (amount <= 0 || amount > 10000) {
          return NextResponse.json({
            success: false,
            message: 'Invalid amount. Please use 0.01 - 10000 TOURS'
          });
        }
        if (recipient.startsWith('@')) {
          console.log('Resolving Farcaster username:', recipient);
          try {
            const username = recipient.slice(1);
            const neynarRes = await fetch(
              `https://api.neynar.com/v2/farcaster/user/by_username?username=${username}`,
              {
                headers: {
                  'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
                },
              }
            );
            if (!neynarRes.ok) {
              throw new Error(`User @${username} not found on Farcaster (HTTP ${neynarRes.status})`);
            }
            const neynarData = await neynarRes.json();
            const userData = neynarData.result?.user || neynarData.user || neynarData;
            let ethAddresses = null;
            if (userData.verified_addresses?.eth_addresses) {
              ethAddresses = userData.verified_addresses.eth_addresses;
            } else if (userData.verifiedAddresses?.eth_addresses) {
              ethAddresses = userData.verifiedAddresses.eth_addresses;
            } else if (userData.verifiedAddresses?.ethAddresses) {
              ethAddresses = userData.verifiedAddresses.ethAddresses;
            } else if (userData.custody_address) {
              ethAddresses = [userData.custody_address];
            } else if (userData.custodyAddress) {
              ethAddresses = [userData.custodyAddress];
            }
            if (ethAddresses && ethAddresses.length > 0) {
              recipient = ethAddresses[0];
              console.log('Resolved @' + username + ' to:', recipient);
            } else {
              throw new Error(`No verified address for @${username}`);
            }
          } catch (resolveErr: any) {
            return NextResponse.json({
              success: false,
              message: `Failed to find user ${recipient}: ${resolveErr.message}`
            });
          }
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
          return NextResponse.json({
            success: false,
            message: 'Invalid recipient address format'
          });
        }
        console.log(`Sending ${amount} TOURS to ${recipient}`);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        const hasValidDelegation = delegationData.success &&
                                  delegationData.delegation &&
                                  Array.isArray(delegationData.delegation.permissions) &&
                                  delegationData.delegation.permissions.includes('send_tours');
        if (!hasValidDelegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['send_tours', 'mint_passport', 'wrap_mon', 'mint_music', 'swap_mon_for_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }
        const sendRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'send_tours',
            params: {
              recipient,
              amount: amount.toString()
            }
          })
        });
        const sendData = await sendRes.json();
        if (!sendData.success) {
          throw new Error(sendData.error || 'Send failed');
        }
        console.log('TOURS sent:', sendData.txHash);
        return NextResponse.json({
          success: true,
          txHash: sendData.txHash,
          action: 'transaction',
          message: `Sent ${amount} TOURS! (FREE)
To: ${recipient.slice(0, 6)}...${recipient.slice(-4)}
TX: ${sendData.txHash?.slice(0, 10)}...
Gasless - we paid the fees!
View: https://testnet.monadscan.com/tx/${sendData.txHash}`
        });
      } catch (error: any) {
        console.error('Send TOURS failed:', error);
        return NextResponse.json({
          success: false,
          message: `Send failed: ${error.message}`
        });
      }
    }

    // ==================== SEND MON COMMAND ====================
    if (lowerCommand.includes('send') && lowerCommand.includes('mon') && !lowerCommand.includes('tours')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        const amountMatch = lowerCommand.match(/send\s+([\d.]+)\s+mon/);
        const recipientMatch = lowerCommand.match(/to\s+(0x[a-fA-F0-9]{40})/);
        if (!amountMatch || !recipientMatch) {
          return NextResponse.json({
            success: false,
            message: 'Invalid format. Use: "send 1.5 mon to 0x..." (MON transfers require exact address)'
          });
        }
        const amount = parseFloat(amountMatch[1]);
        const recipient = recipientMatch[1].toLowerCase();
        if (amount <= 0 || amount > 1000) {
          return NextResponse.json({
            success: false,
            message: 'Invalid amount. Please use 0.01 - 1000 MON'
          });
        }
        if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
          return NextResponse.json({
            success: false,
            message: 'Invalid recipient address format'
          });
        }

        // ✅ MON transfers come from USER's wallet via Privy connection
        // Redirect to /send-mon page where user can connect with Farcaster and send
        console.log(`Preparing MON transfer: ${amount} MON to ${recipient}`);

        const sendMonUrl = `${APP_URL}/send-mon?amount=${amount}&to=${recipient}&from=${userAddress}`;

        return NextResponse.json({
          success: true,
          action: 'redirect',
          url: sendMonUrl,
          message: `📤 Send ${amount} MON

From your wallet to:
${recipient.slice(0, 6)}...${recipient.slice(-4)}

Click below to open the transaction page and connect your Farcaster wallet with Privy.`,
        });
      } catch (error: any) {
        console.error('Send MON failed:', error);
        return NextResponse.json({
          success: false,
          message: `Send failed: ${error.message}`
        });
      }
    }

    // ==================== MINT PASSPORT COMMAND (WITH DUPLICATE CHECK + CAST) ====================
    if (lowerCommand.includes('mint passport')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        console.log('[BOT] Minting passport for:', userAddress);

        // 🔥 CRITICAL: Detect country FIRST
        let countryCode = 'US';
        let countryName = 'United States';
        try {
          const geoRes = await fetch(`${APP_URL}/api/geo`, {
            headers: {
              'x-forwarded-for': req.headers.get('x-forwarded-for') || '',
              'x-real-ip': req.headers.get('x-real-ip') || '',
              'cf-connecting-ip': req.headers.get('cf-connecting-ip') || '',
            }
          });
          const geoData = await geoRes.json();
          countryCode = geoData.country || 'US';
          countryName = geoData.country_name || 'United States';
          console.log(`📍 Detected country: ${countryCode} ${countryName}`);
        } catch (geoErr) {
          console.warn('Location detection failed, using default');
        }

        // ✅ QUERY INDEXER: Check if user already owns a passport for this country
        console.log(`🔍 Checking if user has existing passport for ${countryCode}...`);
        try {
          const checkQuery = `
            query CheckPassport($owner: String!, $countryCode: String!, $contract: String!) {
              PassportNFT(
                where: {
                  owner: { _eq: $owner }
                  countryCode: { _eq: $countryCode }
                  contract: { _eq: $contract }
                }
                limit: 1
              ) {
                tokenId
                countryCode
                countryName
                contract
              }
            }
          `;

          const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as string;

          const checkRes = await fetch(ENVIO_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: checkQuery,
              variables: {
                owner: userAddress.toLowerCase(),
                countryCode: countryCode.toUpperCase(),
                contract: PASSPORT_NFT_ADDRESS.toLowerCase()
              }
            })
          });

          if (checkRes.ok) {
            const checkData = await checkRes.json();
            const existingPassport = checkData.data?.PassportNFT?.[0];

            if (existingPassport) {
              console.warn(`⚠️ User already owns passport for ${countryCode}:`, existingPassport);
              return NextResponse.json({
                success: false,
                message: `You already own a passport for ${countryCode} ${countryName}!
Token #${existingPassport.tokenId}
You can only mint one passport per country.
Try "mint passport" from a different location or "help" for other commands.`
              });
            }

            console.log(`✅ No existing passport found for ${countryCode} - proceeding with mint`);
          }
        } catch (checkErr: any) {
          console.warn('⚠️ Passport duplicate check failed:', checkErr.message);
          // Don't block on check failure - continue with mint
        }

        // ✅ PROCEED: User doesn't have passport for this country
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['mint_passport', 'wrap_mon', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }

        let mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'mint_passport',
            params: {
              countryCode,
              countryName,
              fid // ✅ PASS FID FOR CASTING
            }
          })
        });
        let mintData = await mintRes.json();

        // ✅ AUTO-WRAP: If needs WMON, wrap MON first then retry mint
        if (!mintData.success && mintData.needsWrap) {
          console.log('[BOT] Need to wrap MON first, amount:', mintData.wmonNeeded);

          const wrapRes = await fetch(`${APP_URL}/api/execute-delegated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              action: 'wrap_mon',
              params: { amount: mintData.wmonNeeded }
            })
          });

          const wrapData = await wrapRes.json();
          if (!wrapData.success) {
            throw new Error(wrapData.error || 'Failed to wrap MON');
          }
          console.log('[BOT] Wrapped MON, now minting...');

          // Retry mint after wrap
          mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              action: 'mint_passport',
              params: {
                countryCode,
                countryName,
                fid
              }
            })
          });
          mintData = await mintRes.json();
        }

        if (!mintData.success) {
          throw new Error(mintData.error || 'Mint failed');
        }
        console.log('[BOT] Passport minted:', mintData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintData.txHash,
          action: 'transaction',
          message: `Passport Minted Successfully! 🎫

${countryCode} ${countryName}

Gasless transaction - we paid the gas!

View on Monadscan:
https://testnet.monadscan.com/tx/${mintData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Passport mint error:', error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`
        });
      }
    }

    // ==================== SIMPLE STAKE COMMAND ====================
    // Handle "stake <amount>" - automatically uses passport (everyone has one!)
    // This matches: "stake 10", "stake 100", etc.
    if (lowerCommand.includes('stake') && !lowerCommand.includes('passport') && !lowerCommand.includes('tours')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      const match = lowerCommand.match(/stake\s+([\d.]+)/);
      const amount = match ? parseFloat(match[1]) : 0;
      if (amount <= 0 || amount > 100000) {
        return NextResponse.json({
          success: false,
          message: 'Invalid amount. Use: "stake 10" to stake 10 TOURS'
        });
      }
      try {
        console.log(`[BOT] Staking ${amount} TOURS (with passport collateral) for user ${userAddress}`);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        const hasValidDelegation = delegationData.success &&
                                  delegationData.delegation &&
                                  Array.isArray(delegationData.delegation.permissions) &&
                                  delegationData.delegation.permissions.includes('stake_tours');
        if (!hasValidDelegation) {
          console.warn('[BOT] No delegation with stake_tours permission - creating one...');
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['stake_tours', 'unstake_tours', 'claim_rewards', 'swap_mon_for_tours', 'send_tours', 'mint_passport', 'wrap_mon', 'mint_music', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          console.log('[BOT] Delegation created with stake_tours permission');
        }
        const stakeRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'stake_tours',
            params: {
              amount: amount.toString()
            }
          })
        });
        const stakeData = await stakeRes.json();
        if (!stakeData.success) {
          throw new Error(stakeData.error || 'Stake failed');
        }
        console.log('[BOT] Stake successful:', stakeData.txHash);
        return NextResponse.json({
          success: true,
          txHash: stakeData.txHash,
          action: 'transaction',
          message: `Staking Complete (FREE)!
${amount} TOURS staked with your passport
Earning yield + building credit score!
Position ID: ${stakeData.positionId || 'pending'}
TX: ${stakeData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${stakeData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Stake failed:', error);
        return NextResponse.json({
          success: false,
          message: `Stake failed: ${error.message || 'Unknown error'}`
        });
      }
    }

    // ==================== STAKE PASSPORT COMMAND (STAKE TOURS WITH PASSPORT) ====================
    // Handle "stake passport" separately - it stakes TOURS using passport as collateral
    if (lowerCommand.includes('stake') && lowerCommand.includes('passport')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      const match = lowerCommand.match(/([\d.]+)/);
      const amount = match ? parseFloat(match[1]) : 0;
      if (amount <= 0 || amount > 100000) {
        return NextResponse.json({
          success: false,
          message: 'Invalid amount. Use: "stake passport 10" to stake 10 TOURS'
        });
      }
      try {
        console.log(`[BOT] Staking ${amount} TOURS with passport as collateral for user ${userAddress}`);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        const hasValidDelegation = delegationData.success &&
                                  delegationData.delegation &&
                                  Array.isArray(delegationData.delegation.permissions) &&
                                  delegationData.delegation.permissions.includes('stake_tours');
        if (!hasValidDelegation) {
          console.warn('[BOT] No delegation with stake_tours permission - creating one...');
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['stake_tours', 'unstake_tours', 'claim_rewards', 'swap_mon_for_tours', 'send_tours', 'mint_passport', 'wrap_mon', 'mint_music', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          console.log('[BOT] Delegation created with stake_tours permission');
        }
        const stakeRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'stake_tours',
            params: {
              amount: amount.toString()
            }
          })
        });
        const stakeData = await stakeRes.json();
        if (!stakeData.success) {
          throw new Error(stakeData.error || 'Stake failed');
        }
        console.log('[BOT] Passport stake successful:', stakeData.txHash);
        return NextResponse.json({
          success: true,
          txHash: stakeData.txHash,
          action: 'transaction',
          message: `Passport Staking Complete (FREE)!
${amount} TOURS staked with passport as collateral
Position ID: ${stakeData.positionId || 'pending'}
TX: ${stakeData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${stakeData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Passport stake failed:', error);
        return NextResponse.json({
          success: false,
          message: `Stake failed: ${error.message || 'Unknown error'}`
        });
      }
    }

    // ==================== STAKE TOURS COMMAND (GASLESS VIA DELEGATION) ====================
    if (lowerCommand.includes('stake') && lowerCommand.includes('tours')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      const match = lowerCommand.match(/([\d.]+)\s*tours/);
      const amount = match ? parseFloat(match[1]) : 0;
      if (amount <= 0 || amount > 100000) {
        return NextResponse.json({
          success: false,
          message: 'Invalid amount. Please use 1 - 100000 TOURS'
        });
      }
      try {
        console.log(`Executing stake via delegation: ${amount} TOURS for user ${userAddress}`);
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        const hasValidDelegation = delegationData.success &&
                                  delegationData.delegation &&
                                  Array.isArray(delegationData.delegation.permissions) &&
                                  delegationData.delegation.permissions.includes('stake_tours');
        if (!hasValidDelegation) {
          console.warn('[BOT] No delegation with stake_tours permission - creating one...');
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['stake_tours', 'unstake_tours', 'claim_rewards', 'swap_mon_for_tours', 'send_tours', 'mint_passport', 'wrap_mon', 'mint_music', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          console.log('[BOT] Delegation created with stake_tours permission');
        }
        const stakeRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'stake_tours',
            params: {
              amount: amount.toString()
            }
          })
        });
        const stakeData = await stakeRes.json();
        if (!stakeData.success) {
          throw new Error(stakeData.error || 'Stake failed');
        }
        console.log('Stake successful:', stakeData.txHash);
        return NextResponse.json({
          success: true,
          txHash: stakeData.txHash,
          action: 'transaction',
          message: `Staking Complete (FREE)!
${amount} TOURS staked for yield
Position ID: ${stakeData.positionId || 'pending'}
TX: ${stakeData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${stakeData.txHash}`
        });
      } catch (error: any) {
        console.error('Stake failed:', error);
        return NextResponse.json({
          success: false,
          message: `Stake failed: ${error.message || 'Unknown error'}`
        });
      }
    }

    // ==================== MINT MUSIC COMMAND (WITH CAST) ====================
    if (lowerCommand.includes('mint music')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        const regex = /mint[_ ]music\s+(.+?)\s+(ipfs:\/\/[a-zA-Z0-9]{46,})\s+([\d.]+)/i;
        const match = originalCommand.match(regex);

        if (!match) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `Music NFT Minting
To mint music, use:
"mint music <Song Name> <ipfs://metadata> <price>"
Example:
"mint music My First Song ipfs://QmXXX... 1"
Or go to the Music page to upload files.`
          });
        }

        const songTitle = match[1].trim();
        const tokenURI = match[2];
        const price = parseFloat(match[3]);

        const cid = tokenURI.replace('ipfs://', '');
        if (!cid.startsWith('Qm') && !cid.startsWith('bafy')) {
          return NextResponse.json({
            success: false,
            message: `Invalid IPFS CID format: ${cid}. Must start with Qm or bafy`
          });
        }

        console.log(`[BOT] Minting ${is_art ? 'ART' : 'MUSIC'} NFT with CASE-PRESERVED CID:`, {
          title: songTitle,
          tokenURI,
          price,
          imageUrl: imageUrlFromRequest,
          isArt: is_art,
        });

        if (price <= 0 || price > 1000) {
          return NextResponse.json({
            success: false,
            message: 'Invalid price. Use: 0.001 - 1000 TOURS'
          });
        }

        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['mint_music', 'mint_passport', 'wrap_mon', 'swap_mon_for_tours', 'send_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }

        const mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'mint_music',
            params: {
              songTitle,
              tokenURI,
              imageUrl: imageUrlFromRequest,  // ✅ PASS: Direct cover image URL from upload
              price: price.toString(),
              fid, // ✅ PASS FID FOR CASTING
              is_art, // ✅ PASS: NFT type for conditional cast
            }
          })
        });
        const mintData = await mintRes.json();
        if (!mintData.success) {
          throw new Error(mintData.error || 'Mint failed');
        }
        console.log('[BOT] Music NFT minted:', mintData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintData.txHash,
          action: 'transaction',
          message: `Music NFT Minted (FREE)!
Song: ${songTitle}
Price: ${price} TOURS per license
TX: ${mintData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://testnet.monadscan.com/tx/${mintData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Music mint error:', error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`
        });
      }
    }

    // ==================== STAKE MUSIC YIELD COMMAND ====================
    if (lowerCommand.includes('stake music yield') || lowerCommand.includes('stake_music_yield')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        const regex = /stake[_ ]music[_ ]yield\s+(\d+)\s+([\d.]+)/i;
        const match = originalCommand.match(regex);

        if (!match) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `Music NFT Yield Staking
Stake your Music NFT with MON capital to earn Kintsu vault yields!

Usage:
"stake music yield <tokenId> <MON amount>"

Example:
"stake music yield 1 50"

This will:
✅ Stake Music NFT #1 with 50 MON
✅ Earn variable yield from Kintsu DeFi vault
✅ Keep your NFT in your wallet (never transferred!)
✅ Yield can be allocated to DragonRouter locations

Note: Requires MON capital deposit`
          });
        }

        const tokenId = match[1].trim();
        const monAmount = parseFloat(match[2]);

        if (monAmount <= 0) {
          return NextResponse.json({
            success: false,
            message: 'Invalid MON amount. Must be greater than 0.'
          });
        }

        console.log('[BOT] Staking Music NFT with YieldStrategy:', {
          tokenId,
          monAmount,
          userAddress
        });

        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['stake_music_yield', 'unstake_music_yield', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }

        const stakeRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'stake_music_yield',
            params: {
              tokenId,
              monAmount: monAmount.toString()
            }
          })
        });
        const stakeData = await stakeRes.json();
        if (!stakeData.success) {
          throw new Error(stakeData.error || 'Stake failed');
        }

        console.log('[BOT] Music NFT staked in YieldStrategy:', stakeData.txHash);
        return NextResponse.json({
          success: true,
          txHash: stakeData.txHash,
          positionId: stakeData.positionId,
          action: 'transaction',
          message: `Music NFT #${tokenId} Staked with YieldStrategy!
💎 Capital: ${monAmount} MON
📊 Position ID: ${stakeData.positionId || 'Pending'}
⛽ Gasless - we paid the gas!
TX: ${stakeData.txHash?.slice(0, 10)}...

Your NFT stays in your wallet while earning Kintsu vault yields!
View: https://testnet.monadscan.com/tx/${stakeData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Music yield stake error:', error);
        return NextResponse.json({
          success: false,
          message: `Stake failed: ${error.message}`
        });
      }
    }

    // ==================== UNSTAKE MUSIC YIELD COMMAND ====================
    if (lowerCommand.includes('unstake music yield') || lowerCommand.includes('unstake_music_yield')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        const regex = /unstake[_ ]music[_ ]yield\s+(\d+)/i;
        const match = originalCommand.match(regex);

        if (!match) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `Music NFT Yield Unstaking
Unstake your Music NFT position and claim accumulated yield!

Usage:
"unstake music yield <positionId>"

Example:
"unstake music yield 0"

This will:
✅ Unstake your position from YieldStrategy
✅ Withdraw principal MON + accumulated yield
✅ Pay 0.5% withdrawal fee
✅ Receive MON to your wallet

Note: You need the position ID from when you staked`
          });
        }

        const positionId = match[1].trim();

        console.log('[BOT] Unstaking Music NFT from YieldStrategy:', {
          positionId,
          userAddress
        });

        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['stake_music_yield', 'unstake_music_yield', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }

        const unstakeRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'unstake_music_yield',
            params: {
              positionId
            }
          })
        });
        const unstakeData = await unstakeRes.json();
        if (!unstakeData.success) {
          throw new Error(unstakeData.error || 'Unstake failed');
        }

        console.log('[BOT] Music NFT position unstaked:', unstakeData.txHash);
        return NextResponse.json({
          success: true,
          txHash: unstakeData.txHash,
          action: 'transaction',
          message: `Music NFT Position Unstaked!
📤 Position #${positionId} closed
💰 MON principal + yield sent to your wallet
⛽ Gasless - we paid the gas!
TX: ${unstakeData.txHash?.slice(0, 10)}...

Check your wallet for the refund!
View: https://testnet.monadscan.com/tx/${unstakeData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Music yield unstake error:', error);
        return NextResponse.json({
          success: false,
          message: `Unstake failed: ${error.message}`
        });
      }
    }

    // ==================== BURN MUSIC COMMAND ====================
    if (lowerCommand.includes('burn music') || lowerCommand.includes('burn song')) {
      const tokenIdMatch = lowerCommand.match(/burn (?:music|song) (\d+)/);
      if (!tokenIdMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "burn music <tokenId>"'
        });
      }

      const tokenId = tokenIdMatch[1];
      console.log('[BOT] Redirecting to burn page for token:', tokenId);

      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: `/burn-music?tokenId=${tokenId}`,
        message: `🔥 Burn NFT #${tokenId}

Opening burn page where you can burn your NFT and receive 5 TOURS reward.

Note: You'll pay a small gas fee to burn the NFT.`
      });
    }

    // ==================== NAVIGATION COMMANDS ====================
    const navCommands: Record<string, string> = {
      'go to passport': '/passport',
      'passport': '/passport',
      'go to music': '/music',
      'music': '/music',
      'go to discover': '/discover',
      'discover': '/discover',
      'browse music': '/discover',
      'go to staking': '/passport-staking',
      'staking': '/passport-staking',
      'go to events': '/events',
      'events': '/events',
      'go to tanda': '/tanda',
      'tanda': '/tanda',
      'savings': '/tanda',
      'go to credit score': '/credit-score',
      'credit score': '/credit-score',
      'score': '/credit-score',
      'go to passport staking': '/passport-staking',
      'passport staking': '/passport-staking',
      'go to profile': '/profile',
      'profile': '/profile',
      'my profile': '/profile',
      'go to market': '/market',
      'market': '/market',
      'marketplace': '/market',
      'go to dashboard': '/dashboard',
      'dashboard': '/dashboard',
      'stats': '/dashboard',
      'go home': '/',
      'home': '/',
    };
    for (const [cmd, path] of Object.entries(navCommands)) {
      if (lowerCommand.includes(cmd)) {
        return NextResponse.json({
          success: true,
          action: 'navigate',
          path,
          message: `Navigating to ${path}...`
        });
      }
    }

    // ==================== UNKNOWN COMMAND ====================
    return NextResponse.json({
      success: false,
      message: `Command not recognized: "${command}"
Try "help" to see all available commands!`
    });
  } catch (error: any) {
    console.error('Bot command error:', error);
    return NextResponse.json({
      success: false,
      message: 'Error processing command. Please try again.'
    }, { status: 500 });
  }
}
