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

// Agent's wallet address for custodial deposits
const AGENT_WALLET = '0x868469E5D124f81cf63e1A3808795649cA6c3D77';

export async function POST(req: NextRequest) {
  try {
    // Extract all params from request body including collector edition fields
    const body = await req.json();
    const { command, userAddress, location, fid: bodyFid, imageUrl: imageUrlFromRequest, title: titleFromRequest, tokenURI: tokenURIFromRequest, is_art, discordId } = body;

    // ✅ Get FID from body or request context
    const fid = bodyFid || extractFidFromRequest(req);

    console.log('Bot command received:', { command, userAddress, discordId, fid, imageUrl: imageUrlFromRequest });

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
- "go to events" - View & buy event tickets
- "go to tanda" - Join savings groups
- "go to credit score" - View your score
- "go to profile" - View your NFTs
- "go to market" - Browse marketplace
- "go to dashboard" - View analytics
Basic Transactions (Gasless):
- "mint passport" - Mint passport NFT (FREE)
- "mint music <Song> <ipfs://...> <price>" - Mint music NFT
- "send <amount> tours to @user" - Send TOURS
- "send <amount> mon to 0x..." - Send MON
- "buy music <tokenId>" - Buy music license
- "buy art <tokenId>" - Buy art NFT
- "check balance" - Check balances
Tanda (Savings Groups):
- "create tanda <name>" - Create savings group
- "join tanda <id>" - Join savings group
- "buy ticket <eventId>" - Purchase event ticket
- "signal demand <eventId>" - Show interest in event
Daily Lottery (Discord Custodial):
- "lottery" - Check current lottery status
- "link wallet" - Get link to connect wallet (one-time)
- "deposit" - Get deposit address for MON
- "confirm deposit 0x..." - Confirm your deposit
- "my balance" - Check your deposited balance
- "buy lottery ticket" - Buy 1 ticket (2 MON)
- "buy 5 lottery tickets" - Buy multiple tickets
- "withdraw 5 mon to 0x..." - Withdraw your MON
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
- Tanda (rotating savings groups)
- Event tickets & demand signals
- Credit scoring system
- Marketplace trading
- Daily lottery
Built on Monad Mainnet
Powered by Envio Indexer
All transactions are FREE - we pay gas!
Try "help" to see all commands!`
      });
    }

    // ==================== BALANCE CHECK ====================
    // Skip if it's "my balance" (handled by Discord-specific handler below)
    if ((lowerCommand.includes('balance') || lowerCommand === 'check balance') &&
        !lowerCommand.startsWith('my balance') &&
        !lowerCommand.startsWith('discord balance') &&
        !lowerCommand.startsWith('lottery balance')) {
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

    // ==================== LOTTERY STATUS COMMAND ====================
    if (lowerCommand === 'lottery' || lowerCommand === 'lottery status' || lowerCommand === 'lottery info') {
      try {
        const lotteryRes = await fetch(`${APP_URL}/api/lottery`);
        const lotteryData = await lotteryRes.json();

        if (!lotteryData.success) {
          return NextResponse.json({
            success: false,
            message: 'Failed to fetch lottery status'
          });
        }

        const round = lotteryData.currentRound;
        const config = lotteryData.config;
        const hours = Math.floor(round.timeRemaining / 3600);
        const mins = Math.floor((round.timeRemaining % 3600) / 60);
        const poolFormatted = (Number(round.prizePool) / 1e18).toFixed(2);

        // Get user's balance if discordId provided
        let balanceInfo = '';
        if (discordId) {
          try {
            const balRes = await fetch(`${APP_URL}/api/discord/balance?discordId=${discordId}`);
            const balData = await balRes.json();
            if (balData.success) {
              balanceInfo = `\n💳 Your Balance: ${balData.balanceMon} MON`;
            }
          } catch (e) {}
        }

        return NextResponse.json({
          success: true,
          action: 'info',
          message: `🎰 Daily Lottery - Round #${round.roundId}

💰 Prize Pool: ${poolFormatted} WMON
🎟️ Tickets Sold: ${round.ticketCount}
⏰ Time Left: ${hours}h ${mins}m
💵 Ticket Price: ${config.ticketPriceWMON} MON${balanceInfo}

🏆 Winner gets 90% of pool + 10-100 TOURS bonus!

**How to Play:**
1️⃣ @EmpowerTours Agent link wallet (REQUIRED FIRST)
2️⃣ @EmpowerTours Agent deposit → send MON
3️⃣ @EmpowerTours Agent confirm deposit 0xTxHash
4️⃣ @EmpowerTours Agent buy lottery ticket`
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to check lottery: ${err.message}`
        });
      }
    }

    // ==================== LINK WALLET COMMAND ====================
    if (lowerCommand === 'link wallet' || lowerCommand === 'link' || lowerCommand.startsWith('link wallet')) {
      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again.'
        });
      }

      // Check if already linked
      try {
        const balRes = await fetch(`${APP_URL}/api/discord/balance?discordId=${discordId}`);
        const balData = await balRes.json();
        if (balData.linkedWallet) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `✅ **Wallet Already Linked!**

Wallet: \`${balData.linkedWallet.slice(0, 6)}...${balData.linkedWallet.slice(-4)}\`
Balance: ${balData.balanceMon} MON

You're ready to play! Use \`deposit\` to add funds.`
          });
        }
      } catch (e) {}

      // Generate link to website for wallet connection
      const linkUrl = `${APP_URL}/link-discord?discordId=${discordId}`;

      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🔗 **Link Your Wallet**

Click this link to connect and verify your wallet:
${linkUrl}

**What happens:**
1. Connect your wallet (MetaMask, Rainbow, etc.)
2. Sign a message to prove ownership (free, no gas!)
3. Come back here and type \`deposit\` to add funds

⚡ This is a one-time setup for security.`
      });
    }

    // ==================== DEPOSIT COMMAND (show deposit address) ====================
    if (lowerCommand === 'deposit' || lowerCommand === 'deposit mon') {
      // Check if wallet is linked first
      if (discordId) {
        try {
          const balRes = await fetch(`${APP_URL}/api/discord/balance?discordId=${discordId}`);
          const balData = await balRes.json();
          if (!balData.linkedWallet) {
            return NextResponse.json({
              success: true,
              action: 'info',
              message: `🔐 **Link Your Wallet First**

For security, you must link your wallet before depositing.

Type: \`link wallet 0xYourWalletAddress\`

This ensures only YOU can claim your deposits.`
            });
          }
        } catch (e) {}
      }

      return NextResponse.json({
        success: true,
        action: 'info',
        message: `💰 **Deposit MON to Play Lottery**

Send MON to this address:
\`${AGENT_WALLET}\`

⚠️ **Important:** Send from your linked wallet only!

After sending, confirm with:
\`@EmpowerTours Agent confirm deposit 0xYOUR_TX_HASH\`

Your MON will be credited to your Discord balance for buying lottery tickets!`
      });
    }

    // ==================== CONFIRM DEPOSIT COMMAND ====================
    if (lowerCommand.startsWith('confirm deposit')) {
      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again or contact support.'
        });
      }

      // Extract tx hash from command
      const txHashMatch = originalCommand.match(/confirm deposit\s+(0x[a-fA-F0-9]{64})/i);
      if (!txHashMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "confirm deposit 0xYOUR_TX_HASH"'
        });
      }

      const txHash = txHashMatch[1];

      try {
        const response = await fetch(`${APP_URL}/api/discord/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'deposit',
            discordId,
            txHash,
          }),
        });

        const result = await response.json();

        if (result.success) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `✅ Deposit Confirmed!

💰 Deposited: ${result.depositAmount} MON
💳 New Balance: ${result.newBalance} MON

Now you can buy lottery tickets:
"buy lottery ticket" or "buy 5 lottery tickets"`
          });
        } else {
          return NextResponse.json({
            success: false,
            message: `❌ Deposit failed: ${result.error}`
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to confirm deposit: ${err.message}`
        });
      }
    }

    // ==================== MY BALANCE COMMAND ====================
    if (lowerCommand === 'my balance' || lowerCommand === 'discord balance' || lowerCommand === 'lottery balance') {
      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again.'
        });
      }

      try {
        const response = await fetch(`${APP_URL}/api/discord/balance?discordId=${discordId}`);
        const result = await response.json();

        if (result.success) {
          const walletStatus = result.linkedWallet
            ? `🔗 Linked: ${result.linkedWallet.slice(0, 6)}...${result.linkedWallet.slice(-4)}`
            : `⚠️ No wallet linked - use "link wallet 0x..."`;

          return NextResponse.json({
            success: true,
            action: 'info',
            message: `💳 **Your Lottery Balance**

Balance: ${result.balanceMon} MON
${walletStatus}

Commands:
• \`deposit\` - Add more MON
• \`buy lottery ticket\` - Buy tickets (2 MON each)
• \`withdraw 5 mon to 0x...\` - Withdraw to wallet`
          });
        } else {
          return NextResponse.json({
            success: false,
            message: 'Failed to fetch balance'
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to check balance: ${err.message}`
        });
      }
    }

    // ==================== BUY LOTTERY TICKETS COMMAND (CUSTODIAL) ====================
    if (lowerCommand.includes('buy') && lowerCommand.includes('lottery')) {
      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again.'
        });
      }

      // Parse ticket count: "buy lottery ticket", "buy 5 lottery tickets", "buy lottery 3"
      let ticketCount = 1;
      const countMatch = lowerCommand.match(/buy (\d+) lottery|lottery (\d+)|(\d+) ticket/);
      if (countMatch) {
        ticketCount = parseInt(countMatch[1] || countMatch[2] || countMatch[3]);
      }

      // Cap at 50 tickets per transaction
      ticketCount = Math.min(ticketCount, 50);

      try {
        // Get current round ID
        let roundId = '1';
        try {
          const lotteryRes = await fetch(`${APP_URL}/api/lottery`);
          const lotteryData = await lotteryRes.json();
          if (lotteryData.success) {
            roundId = lotteryData.currentRound.roundId.toString();
          }
        } catch (e) {}

        console.log(`[BOT] Discord user ${discordId} buying ${ticketCount} lottery tickets`);

        const response = await fetch(`${APP_URL}/api/discord/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'buy_lottery',
            discordId,
            ticketCount,
            roundId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          return NextResponse.json({
            success: true,
            action: 'transaction',
            message: `🎟️ Lottery Tickets Purchased!

Tickets: ${result.ticketCount}
Cost: ${result.cost} MON
💳 Balance: ${result.newBalance} MON
Tx: ${result.txHash?.slice(0, 10)}...

Good luck! 🍀 Check "lottery" for status`,
            txHash: result.txHash,
          });
        } else {
          return NextResponse.json({
            success: false,
            message: `❌ ${result.error}`
          });
        }
      } catch (err: any) {
        console.error('[BOT] Lottery buy error:', err);
        return NextResponse.json({
          success: false,
          message: `Failed to buy tickets: ${err.message}`
        });
      }
    }

    // ==================== WITHDRAW COMMAND ====================
    if (lowerCommand.startsWith('withdraw')) {
      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again.'
        });
      }

      // Parse: "withdraw 5 mon to 0x..."
      const withdrawMatch = originalCommand.match(/withdraw\s+([\d.]+)\s*(?:mon)?\s*to\s+(0x[a-fA-F0-9]{40})/i);
      if (!withdrawMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "withdraw 5 mon to 0xYourWallet"'
        });
      }

      const amount = withdrawMatch[1];
      const toAddress = withdrawMatch[2];

      try {
        const response = await fetch(`${APP_URL}/api/discord/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'withdraw',
            discordId,
            amount,
            toAddress,
          }),
        });

        const result = await response.json();

        if (result.success) {
          return NextResponse.json({
            success: true,
            action: 'transaction',
            message: `✅ Withdrawal Sent!

Amount: ${result.amount} MON
To: ${result.toAddress.slice(0, 10)}...
💳 Remaining: ${result.newBalance} MON
Tx: ${result.txHash?.slice(0, 10)}...`
          });
        } else {
          return NextResponse.json({
            success: false,
            message: `❌ ${result.error}`
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Withdrawal failed: ${err.message}`
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
              authMethod: 'farcaster',
              fid,
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
View: https://monadscan.com/tx/${buyData.txHash}`
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
              authMethod: 'farcaster',
              fid,
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
View: https://monadscan.com/tx/${swapData.txHash}`
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
              authMethod: 'farcaster',
              fid,
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
View: https://monadscan.com/tx/${sendData.txHash}`
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
              authMethod: 'farcaster',
              fid,
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
https://monadscan.com/tx/${mintData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Passport mint error:', error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`
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

        if (price <= 0 || price > 100_000_000) {
          return NextResponse.json({
            success: false,
            message: 'Invalid price. Use: 0.001 - 100,000,000 WMON'
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
              authMethod: 'farcaster',
              fid,
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
Price: ${price} WMON per license
TX: ${mintData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://monadscan.com/tx/${mintData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Music mint error:', error);
        return NextResponse.json({
          success: false,
          message: `Mint failed: ${error.message}`
        });
      }
    }

    // ==================== MINT COLLECTOR EDITION COMMAND ====================
    if (lowerCommand.includes('mint collector') || lowerCommand.includes('mint_collector')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Try: "go to profile"'
        });
      }
      try {
        const collectorRegex = /mint[_ ]collector\s+(.+?)\s+(ipfs:\/\/[a-zA-Z0-9]{46,})\s+([\d.]+)/i;
        const collectorMatch = originalCommand.match(collectorRegex);

        if (!collectorMatch) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `Collector Edition NFT Minting
To mint a collector edition, use the NFT creation page with the collector toggle enabled.`
          });
        }

        const collectorTitle = collectorMatch[1].trim();
        const collectorTokenURIVal = collectorMatch[2];
        const collectorStdPrice = parseFloat(collectorMatch[3]);

        // Get collector-specific params from request body context
        const collectorTokenURI = body.collectorTokenURI || collectorTokenURIVal;
        const collectorPriceVal = body.collectorPrice || '500';
        const maxEditionsVal = body.maxEditions || '100';
        const imageUrlFromCollector = body.imageUrl || '';
        const is_collector_art = body.is_art;

        const cid = collectorTokenURIVal.replace('ipfs://', '');
        if (!cid.startsWith('Qm') && !cid.startsWith('bafy')) {
          return NextResponse.json({
            success: false,
            message: `Invalid IPFS CID format: ${cid}. Must start with Qm or bafy`
          });
        }

        if (collectorStdPrice <= 0 || collectorStdPrice > 100_000_000) {
          return NextResponse.json({
            success: false,
            message: 'Invalid price. Use: 0.001 - 100,000,000 WMON'
          });
        }

        const cPrice = parseFloat(collectorPriceVal);
        if (isNaN(cPrice) || cPrice < 500 || cPrice > 100_000_000) {
          return NextResponse.json({
            success: false,
            message: 'Collector price must be between 500 and 100,000,000 WMON'
          });
        }

        const cEditions = parseInt(maxEditionsVal);
        if (isNaN(cEditions) || cEditions < 1 || cEditions > 1000) {
          return NextResponse.json({
            success: false,
            message: 'Max editions must be between 1 and 1,000'
          });
        }

        console.log(`[BOT] Minting COLLECTOR EDITION NFT:`, {
          title: collectorTitle,
          tokenURI: collectorTokenURIVal,
          standardPrice: collectorStdPrice,
          collectorPrice: collectorPriceVal,
          maxEditions: maxEditionsVal,
        });

        // Create delegation if needed
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        if (!delegationData.success || !delegationData.delegation) {
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              authMethod: 'farcaster',
              fid,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['mint_music', 'mint_collector', 'mint_passport', 'wrap_mon', 'swap_mon_for_tours', 'send_tours', 'buy_music']
            })
          });
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
        }

        const mintCollectorRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'mint_collector',
            params: {
              songTitle: collectorTitle,
              tokenURI: collectorTokenURIVal,
              collectorTokenURI,
              imageUrl: imageUrlFromCollector,
              price: collectorStdPrice.toString(),
              collectorPrice: collectorPriceVal,
              maxEditions: maxEditionsVal,
              fid,
              is_art: is_collector_art,
            }
          })
        });
        const mintCollectorData = await mintCollectorRes.json();
        if (!mintCollectorData.success) {
          throw new Error(mintCollectorData.error || 'Collector mint failed');
        }
        console.log('[BOT] Collector NFT minted:', mintCollectorData.txHash);
        return NextResponse.json({
          success: true,
          txHash: mintCollectorData.txHash,
          tokenId: mintCollectorData.tokenId,
          action: 'transaction',
          message: `Collector Edition NFT Minted (FREE)!
Title: ${collectorTitle}
Standard: ${collectorStdPrice} WMON | Collector: ${collectorPriceVal} WMON (${maxEditionsVal} editions)
TX: ${mintCollectorData.txHash?.slice(0, 10)}...
Gasless - we paid the gas!
View: https://monadscan.com/tx/${mintCollectorData.txHash}`
        });
      } catch (error: any) {
        console.error('[BOT] Collector mint error:', error);
        return NextResponse.json({
          success: false,
          message: `Collector mint failed: ${error.message}`
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
      'go to events': '/events',
      'events': '/events',
      'go to tanda': '/tanda',
      'tanda': '/tanda',
      'savings': '/tanda',
      'go to credit score': '/credit-score',
      'credit score': '/credit-score',
      'score': '/credit-score',
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
// Deploy trigger Tue Feb  3 11:34:27 CST 2026
