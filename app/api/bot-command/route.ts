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

🎰 **Lottery:**
- "lottery" - Check current lottery status
- "buy lottery ticket" - Buy 1 ticket (2 MON)
- "buy 5 lottery tickets" - Buy multiple tickets
- "draw lottery" - Trigger draw (when round ended)
- "force draw" - Force draw/rollover

🪙 **Flip Coin Game:**
- "flip coin" - Flip a coin (0.1 MON bet)
- "flip coin heads 0.5" - Bet 0.5 MON on heads
- "flip coin tails 1" - Bet 1 MON on tails

💰 **Balance & Wallet:**
- "link wallet" - Link your wallet (required first)
- "deposit" - Get deposit address
- "confirm deposit 0xTxHash" - Confirm deposit
- "my balance" - Check lottery balance
- "withdraw 5 mon to 0x..." - Withdraw MON
- "my safe" - View your User Safe address
- "fund safe" - Get Safe funding instructions

🌍 **Agent World:**
- "world status" - View world state & stats
- "world leaderboard" - Top agents
- "dao proposals" - View DAO proposals
- "dao vote <id> yes/no" - Vote on proposal

🎵 **Music & Radio:**
- "tip artist <address> <amount>" - Tip artist
- "queue song <tokenId>" - Queue song
- "buy music <tokenId>" - Buy music NFT

🎫 **NFTs (Gasless):**
- "mint passport" - Mint passport NFT
- "check balance" - Check MON/TOURS

ℹ️ "about" for more info | All transactions FREE!`
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
Try: "mint passport" or "check balance"`
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
        message: `EmpowerTours - Agent World on Monad

🌍 An AI Agent ecosystem featuring:
- Agent World with 15+ on-chain actions
- Travel passport NFTs (195 countries!)
- Music NFTs with artist royalties
- Community radio with TOURS rewards
- DAO governance with vTOURS voting

💎 Tokens:
- TOURS: Ecosystem rewards & governance
- EMPTOURS: Community token on nad.fun

Built on Monad Mainnet | Gasless transactions
Try "help" to see all commands!`
      });
    }

    // ==================== WORLD STATUS COMMAND ====================
    if (lowerCommand === 'world status' || lowerCommand === 'world state' || lowerCommand === 'world') {
      try {
        const worldRes = await fetch(`${APP_URL}/api/world/state`);
        const worldData = await worldRes.json();

        if (!worldData.success) {
          return NextResponse.json({
            success: false,
            message: 'Failed to fetch world state'
          });
        }

        const state = worldData.state;
        return NextResponse.json({
          success: true,
          action: 'info',
          message: `🌍 **EmpowerTours Agent World**

📊 **Stats:**
• Agents: ${state.agents.total} registered (${state.agents.active} active)
• Music NFTs: ${state.economy.totalMusicNFTs}
• Passports: ${state.economy.totalPassports}
• Total Users: ${state.economy.totalUsers}

💎 **Tokens:**
• TOURS: ${state.tokens.tours.address.slice(0, 10)}...
• EMPTOURS: ${state.tokens.emptours?.price || 'N/A'} MON

🎵 Radio: ${state.economy.radioActive ? 'LIVE' : 'Offline'}

🔗 Explore: https://fcempowertours.vercel.app/agent-world`
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to fetch world status: ${err.message}`
        });
      }
    }

    // ==================== WORLD LEADERBOARD COMMAND ====================
    if (lowerCommand === 'world leaderboard' || lowerCommand === 'leaderboard' || lowerCommand === 'top agents') {
      try {
        const worldRes = await fetch(`${APP_URL}/api/world/state`);
        const worldData = await worldRes.json();

        if (!worldData.success) {
          return NextResponse.json({
            success: false,
            message: 'Failed to fetch leaderboard'
          });
        }

        const leaderboard = worldData.leaderboard || [];
        const top5 = leaderboard.slice(0, 5);

        if (top5.length === 0) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `🏆 **Agent World Leaderboard**

No agents registered yet! Be the first to enter the world.

Entry fee: 1 MON
🔗 https://fcempowertours.vercel.app/agent-world`
          });
        }

        const rankings = top5.map((agent: any, i: number) =>
          `${i + 1}. ${agent.name} - ${agent.toursEarned} TOURS`
        ).join('\n');

        return NextResponse.json({
          success: true,
          action: 'info',
          message: `🏆 **Agent World Leaderboard**

${rankings}

Total Agents: ${worldData.state.agents.total}
🔗 https://fcempowertours.vercel.app/agent-world`
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to fetch leaderboard: ${err.message}`
        });
      }
    }

    // ==================== WORLD ACTIONS LIST ====================
    if (lowerCommand === 'world actions' || lowerCommand === 'actions') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🎮 **Available World Actions**

**Music & Radio:**
• buy_music - Buy a music license
• buy_art - Buy art NFT
• radio_queue_song - Queue song on radio
• tip_artist - Tip an artist TOURS
• music_subscribe - Subscribe to artist

**DAO Governance:**
• dao_vote_proposal - Vote on proposals
• dao_wrap - Wrap TOURS → vTOURS
• dao_unwrap - Unwrap vTOURS → TOURS
• dao_delegate - Delegate voting power

**NFTs:**
• mint_passport - Mint travel passport

**Radio Rewards:**
• radio_claim_rewards - Claim listener rewards

All actions earn TOURS rewards! 💎`
      });
    }

    // ==================== DAO PROPOSALS COMMAND ====================
    if (lowerCommand === 'dao proposals' || lowerCommand === 'proposals' || lowerCommand === 'dao') {
      try {
        const daoRes = await fetch(`${APP_URL}/api/world/dao`);
        const daoData = await daoRes.json();

        if (!daoData.success) {
          return NextResponse.json({
            success: false,
            message: 'Failed to fetch proposals'
          });
        }

        const proposals = daoData.proposals || [];
        const active = proposals.filter((p: any) => p.status === 'active');

        if (active.length === 0) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `🗳️ **DAO Proposals**

No active proposals at the moment.

To create a proposal, you need ${daoData.minEmptoursToPropose} EMPTOURS.

🔗 https://fcempowertours.vercel.app/dao`
          });
        }

        const proposalList = active.slice(0, 3).map((p: any) =>
          `**#${p.id}** ${p.title}\n   👍 ${p.forVotes} | 👎 ${p.againstVotes}`
        ).join('\n\n');

        return NextResponse.json({
          success: true,
          action: 'info',
          message: `🗳️ **Active DAO Proposals**

${proposalList}

Vote: "dao vote <id> yes" or "dao vote <id> no"
🔗 https://fcempowertours.vercel.app/dao`
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to fetch proposals: ${err.message}`
        });
      }
    }

    // ==================== DAO VOTE COMMAND ====================
    if (lowerCommand.startsWith('dao vote')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Visit the app to connect your wallet first.'
        });
      }

      // Parse: "dao vote 1 yes" or "dao vote 1 no"
      const voteMatch = lowerCommand.match(/dao vote\s+(\d+)\s+(yes|no|for|against)/i);
      if (!voteMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "dao vote <proposal_id> yes" or "dao vote <proposal_id> no"'
        });
      }

      const proposalId = voteMatch[1];
      const support = ['yes', 'for'].includes(voteMatch[2].toLowerCase());

      try {
        const voteRes = await fetch(`${APP_URL}/api/world/dao`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'vote',
            userAddress,
            proposalId,
            support,
          }),
        });

        const voteData = await voteRes.json();

        if (!voteData.success) {
          return NextResponse.json({
            success: false,
            message: `Vote failed: ${voteData.error}`
          });
        }

        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `🗳️ **Vote Recorded!**

Proposal #${proposalId}: ${support ? '👍 FOR' : '👎 AGAINST'}
Vote Weight: ${voteData.weight}
${voteData.reward ? `💎 Earned: ${voteData.reward}` : ''}
${voteData.txHash ? `TX: ${voteData.txHash.slice(0, 14)}...` : ''}`,
          txHash: voteData.txHash,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Vote failed: ${err.message}`
        });
      }
    }

    // ==================== TIP ARTIST COMMAND ====================
    if (lowerCommand.startsWith('tip artist') || lowerCommand.startsWith('tip ')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Visit the app to connect your wallet first.'
        });
      }

      // Parse: "tip artist 0x... 10" or "tip 0x... 5"
      const tipMatch = originalCommand.match(/tip\s+(?:artist\s+)?(0x[a-fA-F0-9]{40})\s+([\d.]+)/i);
      if (!tipMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "tip artist 0xArtistAddress 10" (amount in TOURS)'
        });
      }

      const artistAddress = tipMatch[1];
      const tipAmount = tipMatch[2];

      try {
        const tipRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'tip-artist',
            params: {
              artistAddress,
              amount: tipAmount,
            },
          }),
        });

        const tipData = await tipRes.json();

        if (!tipData.success) {
          return NextResponse.json({
            success: false,
            message: `Tip failed: ${tipData.error}`
          });
        }

        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `🎵 **Artist Tipped!**

Sent ${tipAmount} TOURS to ${artistAddress.slice(0, 6)}...${artistAddress.slice(-4)}
TX: ${tipData.txHash?.slice(0, 14)}...

Thanks for supporting artists! 💎`,
          txHash: tipData.txHash,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Tip failed: ${err.message}`
        });
      }
    }

    // ==================== QUEUE SONG COMMAND ====================
    if (lowerCommand.startsWith('queue song') || lowerCommand.startsWith('queue ')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: 'Wallet not connected. Visit the app to connect your wallet first.'
        });
      }

      // Parse: "queue song 5" or "queue 5"
      const queueMatch = lowerCommand.match(/queue\s+(?:song\s+)?(\d+)/i);
      if (!queueMatch) {
        return NextResponse.json({
          success: false,
          message: 'Invalid format. Use: "queue song <tokenId>"'
        });
      }

      const tokenId = queueMatch[1];

      try {
        const queueRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'radio_queue_song',
            params: { tokenId },
          }),
        });

        const queueData = await queueRes.json();

        if (!queueData.success) {
          return NextResponse.json({
            success: false,
            message: `Queue failed: ${queueData.error}`
          });
        }

        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `🎵 **Song Queued!**

Token #${tokenId} added to the radio queue.
TX: ${queueData.txHash?.slice(0, 14)}...

🎧 Listen: https://fcempowertours.vercel.app/radio`,
          txHash: queueData.txHash,
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Queue failed: ${err.message}`
        });
      }
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

    // ==================== MY SAFE / SAFE INFO COMMAND ====================
    if (lowerCommand === 'my safe' || lowerCommand === 'safe' || lowerCommand === 'safe info' || lowerCommand === 'safe balance') {
      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again.'
        });
      }

      try {
        const response = await fetch(`${APP_URL}/api/discord/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_safe_info',
            discordId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const statusEmoji = result.isFunded ? '✅' : '⚠️';
          const fundingStatus = result.isFunded
            ? 'Funded and ready for gasless transactions!'
            : `Needs funding (min ${result.minRequired} MON for gas)`;

          return NextResponse.json({
            success: true,
            action: 'info',
            message: `🔐 **Your User Safe**

📍 Safe Address:
\`${result.safeAddress}\`

💰 Balance: ${result.balance} MON
${statusEmoji} Status: ${fundingStatus}
🔗 Linked Wallet: ${result.linkedWallet.slice(0, 6)}...${result.linkedWallet.slice(-4)}

**Send MON to your Safe address above to fund gasless transactions!**

Commands:
• \`fund safe\` - Get funding instructions
• \`my balance\` - Check lottery balance`
          });
        } else {
          // User needs to link wallet first
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `🔐 **User Safe Not Available**

${result.error || 'You need to link your wallet first.'}

Use \`link wallet\` to connect your wallet and get your Safe address.`
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to get Safe info: ${err.message}`
        });
      }
    }

    // ==================== FUND SAFE COMMAND ====================
    if (lowerCommand === 'fund safe' || lowerCommand === 'fund my safe' || lowerCommand === 'safe funding') {
      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again.'
        });
      }

      try {
        const response = await fetch(`${APP_URL}/api/discord/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_safe_info',
            discordId,
          }),
        });

        const result = await response.json();

        if (result.success) {
          const currentBalance = parseFloat(result.balance);
          const minRequired = parseFloat(result.minRequired);
          const needsMore = currentBalance < minRequired;
          const suggestedAmount = needsMore ? Math.max(0.5, minRequired - currentBalance).toFixed(2) : '0.5';

          return NextResponse.json({
            success: true,
            action: 'info',
            message: `💰 **Fund Your Safe for Gasless Transactions**

📍 Your Safe Address:
\`${result.safeAddress}\`

**Current Balance:** ${result.balance} MON
**Minimum Required:** ${result.minRequired} MON

${needsMore ? `⚠️ **Action Required:** Send at least ${suggestedAmount} MON to enable gasless transactions.` : '✅ Your Safe is funded and ready!'}

**How to Fund:**
1. Copy your Safe address above
2. Send MON from any wallet (exchange, MetaMask, etc.)
3. Wait for confirmation (~2 seconds on Monad)
4. Use \`my safe\` to check your updated balance

💡 **Tip:** We recommend keeping 0.5+ MON in your Safe for smooth operations.`
          });
        } else {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `🔐 **Link Wallet First**

${result.error || 'You need to link your wallet to get a Safe address.'}

Use \`link wallet\` to connect your wallet first.`
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to get Safe info: ${err.message}`
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

    // ==================== LOTTERY STATUS COMMAND ====================
    if (lowerCommand === 'lottery' || lowerCommand === 'lottery status') {
      try {
        const lotteryRes = await fetch(`${APP_URL}/api/lottery`);
        const lotteryData = await lotteryRes.json();

        if (lotteryData.success && lotteryData.currentRound) {
          const round = lotteryData.currentRound;
          const config = lotteryData.config;
          // timeRemaining is in seconds
          const hoursLeft = Math.floor(round.timeRemaining / 3600);
          const minsLeft = Math.floor((round.timeRemaining % 3600) / 60);

          return NextResponse.json({
            success: true,
            action: 'info',
            message: `🎰 **Daily Lottery - Round #${round.roundId}**

💰 Prize Pool: ${round.prizePool} WMON
🎟️ Tickets Sold: ${round.ticketCount}
⏰ Time Left: ${hoursLeft}h ${minsLeft}m
🎫 Ticket Price: ${config.ticketPrice} WMON

**Your Options:**
• \`buy lottery ticket\` - Buy 1 ticket
• \`buy 5 lottery tickets\` - Buy multiple
• \`my balance\` - Check your balance

Minimum ${config.minEntries} tickets needed for draw!`
          });
        } else {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `🎰 **Daily Lottery**

No active round found. A new round may be starting soon!

• \`buy lottery ticket\` - Buy tickets when available
• \`my balance\` - Check your balance`
          });
        }
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `Failed to get lottery status: ${err.message}`
        });
      }
    }

    // ==================== BUY LOTTERY TICKETS COMMAND (CUSTODIAL) ====================
    if (lowerCommand.includes('buy') && lowerCommand.includes('lottery')) {
      console.log('[BOT-LOTTERY] Buy lottery command received:', { command: lowerCommand, discordId });

      if (!discordId) {
        console.warn('[BOT-LOTTERY] No discordId provided');
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
      console.log('[BOT-LOTTERY] Parsed ticket count:', ticketCount);

      try {
        // Get current round ID
        let roundId = '1';
        try {
          console.log('[BOT-LOTTERY] Fetching lottery round info from:', `${APP_URL}/api/lottery`);
          const lotteryRes = await fetch(`${APP_URL}/api/lottery`);
          const lotteryData = await lotteryRes.json();
          console.log('[BOT-LOTTERY] Lottery API response:', { success: lotteryData.success, roundId: lotteryData.currentRound?.roundId });
          if (lotteryData.success) {
            roundId = lotteryData.currentRound.roundId.toString();
          }
        } catch (e: any) {
          console.error('[BOT-LOTTERY] Failed to fetch lottery round:', e.message);
        }

        console.log(`[BOT-LOTTERY] Discord user ${discordId} buying ${ticketCount} lottery tickets for round ${roundId}`);

        const balanceApiUrl = `${APP_URL}/api/discord/balance`;
        console.log('[BOT-LOTTERY] Calling balance API:', balanceApiUrl);

        const response = await fetch(balanceApiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'buy_lottery',
            discordId,
            ticketCount,
            roundId,
          }),
        });

        console.log('[BOT-LOTTERY] Balance API response status:', response.status);
        const result = await response.json();
        console.log('[BOT-LOTTERY] Balance API result:', { success: result.success, error: result.error, txHash: result.txHash?.slice(0, 10) });

        if (result.success) {
          const txLink = result.txHash ? `https://monadscan.com/tx/${result.txHash}` : '';
          return NextResponse.json({
            success: true,
            action: 'transaction',
            message: `🎟️ **Lottery Tickets Purchased!**

🎫 Tickets: ${result.ticketCount}
💵 Cost: ${result.cost} MON
💳 Balance: ${result.newBalance} MON
${txLink ? `🔗 [View on Monadscan](${txLink})` : ''}

Good luck! 🍀 Use \`lottery\` to check status`,
            txHash: result.txHash,
          });
        } else {
          console.warn('[BOT-LOTTERY] Purchase failed:', result.error);
          return NextResponse.json({
            success: false,
            message: `❌ ${result.error}`
          });
        }
      } catch (err: any) {
        console.error('[BOT-LOTTERY] Lottery buy error:', err.message, err.stack);
        return NextResponse.json({
          success: false,
          message: `Failed to buy tickets: ${err.message}`
        });
      }
    }

    // ==================== DRAW LOTTERY COMMAND ====================
    if (lowerCommand === 'draw lottery' || lowerCommand === 'trigger draw' || lowerCommand === 'lottery draw') {
      console.log('[BOT-LOTTERY] Draw lottery command received:', { discordId });

      try {
        // Check lottery status first
        const lotteryRes = await fetch(`${APP_URL}/api/lottery`);
        const lotteryData = await lotteryRes.json();

        if (!lotteryData.success) {
          return NextResponse.json({
            success: false,
            message: 'Failed to check lottery status'
          });
        }

        const round = lotteryData.currentRound;
        const config = lotteryData.config;

        // Check if round has ended
        if (round.timeRemaining > 0) {
          const hoursLeft = Math.floor(round.timeRemaining / 3600);
          const minsLeft = Math.floor((round.timeRemaining % 3600) / 60);
          return NextResponse.json({
            success: false,
            message: `⏰ Round not ended yet!\n\nTime remaining: ${hoursLeft}h ${minsLeft}m\n\nWait for the timer to reach 0 before triggering the draw.`
          });
        }

        // Check minimum entries
        if (round.ticketCount < config.minEntries) {
          return NextResponse.json({
            success: true,
            action: 'info',
            message: `⚠️ **Not Enough Tickets**

Current: ${round.ticketCount} tickets
Minimum: ${config.minEntries} tickets

If you trigger the draw now, the **${round.prizePool} WMON prize pool will roll over** to the next round.

Do you want to proceed? Use \`force draw\` to trigger rollover.`
          });
        }

        // Trigger the draw
        console.log('[BOT-LOTTERY] Triggering lottery draw...');
        const drawRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: '0x868469E5D124f81cf63e1A3808795649cA6c3D77', // Agent wallet as beneficiary for TOURS reward
            action: 'daily_lottery_draw',
            params: {},
            fid: '1',
          }),
        });

        const drawResult = await drawRes.json();

        if (drawResult.success) {
          const txLink = drawResult.txHash ? `https://monadscan.com/tx/${drawResult.txHash}` : '';
          return NextResponse.json({
            success: true,
            action: 'transaction',
            message: `🎲 **Lottery Draw Triggered!**

The draw has been requested. Pyth Entropy will select a random winner.

💰 Prize Pool: ${round.prizePool} WMON
🎟️ Total Entries: ${round.ticketCount}
🎁 You earned: 5-50 TOURS (trigger reward)
${txLink ? `🔗 [View on Monadscan](${txLink})` : ''}

Winner will be announced shortly!`,
            txHash: drawResult.txHash,
          });
        } else {
          return NextResponse.json({
            success: false,
            message: `❌ Draw failed: ${drawResult.error}`
          });
        }
      } catch (err: any) {
        console.error('[BOT-LOTTERY] Draw error:', err);
        return NextResponse.json({
          success: false,
          message: `Failed to trigger draw: ${err.message}`
        });
      }
    }

    // ==================== FORCE DRAW (ROLLOVER) COMMAND ====================
    if (lowerCommand === 'force draw' || lowerCommand === 'rollover') {
      console.log('[BOT-LOTTERY] Force draw command received:', { discordId });

      try {
        // Trigger the draw regardless of minimum
        const drawRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: '0x868469E5D124f81cf63e1A3808795649cA6c3D77',
            action: 'daily_lottery_draw',
            params: {},
            fid: '1',
          }),
        });

        const drawResult = await drawRes.json();

        if (drawResult.success) {
          const txLink = drawResult.txHash ? `https://monadscan.com/tx/${drawResult.txHash}` : '';
          return NextResponse.json({
            success: true,
            action: 'transaction',
            message: `🔄 **Lottery Rollover Triggered!**

Prize pool will roll over to the next round.
${txLink ? `🔗 [View on Monadscan](${txLink})` : ''}

A new round will start shortly!`,
            txHash: drawResult.txHash,
          });
        } else {
          return NextResponse.json({
            success: false,
            message: `❌ Rollover failed: ${drawResult.error}`
          });
        }
      } catch (err: any) {
        console.error('[BOT-LOTTERY] Rollover error:', err);
        return NextResponse.json({
          success: false,
          message: `Failed to trigger rollover: ${err.message}`
        });
      }
    }

    // ==================== FLIP COIN COMMAND ====================
    if (lowerCommand.startsWith('flip coin') || lowerCommand.startsWith('flip ')) {
      console.log('[BOT-FLIP] Flip coin command received:', { command: lowerCommand, discordId });

      if (!discordId) {
        return NextResponse.json({
          success: false,
          message: 'Discord ID not found. Please try again.'
        });
      }

      // Parse: "flip coin", "flip coin heads", "flip coin tails 0.5", "flip heads 1"
      let choice = Math.random() > 0.5; // Random if not specified
      let betAmount = '0.1'; // Default 0.1 MON

      // Check for heads/tails choice
      if (lowerCommand.includes('heads')) {
        choice = true;
      } else if (lowerCommand.includes('tails')) {
        choice = false;
      }

      // Check for bet amount
      const amountMatch = lowerCommand.match(/(\d+\.?\d*)\s*(?:mon)?$/i);
      if (amountMatch) {
        betAmount = amountMatch[1];
      }

      // Validate bet amount
      const betNum = parseFloat(betAmount);
      if (betNum < 0.0001 || betNum > 100) {
        return NextResponse.json({
          success: false,
          message: `Invalid bet amount. Must be between 0.0001 and 100 MON. You tried: ${betAmount} MON`
        });
      }

      try {
        // First check if user has a linked wallet with a Safe
        const safeInfoRes = await fetch(`${APP_URL}/api/discord/balance`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'get_safe_info',
            discordId,
          }),
        });

        const safeInfo = await safeInfoRes.json();

        if (!safeInfo.success || !safeInfo.safeAddress) {
          return NextResponse.json({
            success: false,
            message: `🪙 **Flip Coin - Wallet Required**

You need to link your wallet first to play.

1️⃣ \`link wallet\` - Get wallet linking page
2️⃣ Fund your Safe with MON
3️⃣ Come back and \`flip coin\`!`
          });
        }

        // Check Safe balance
        const safeBalance = parseFloat(safeInfo.balance || '0');
        if (safeBalance < betNum + 0.01) { // Need bet + small gas buffer
          return NextResponse.json({
            success: false,
            message: `🪙 **Insufficient Balance**

Your Safe has ${safeBalance.toFixed(4)} MON.
You need at least ${(betNum + 0.01).toFixed(4)} MON to bet ${betAmount} MON.

Use \`fund safe\` to add more MON.`
          });
        }

        console.log('[BOT-FLIP] Executing flip coin:', {
          choice: choice ? 'HEADS' : 'TAILS',
          betAmount,
          userAddress: safeInfo.linkedWallet,
        });

        // Execute the flip coin action
        const flipRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: safeInfo.linkedWallet,
            action: 'flip_coin',
            params: {
              choice: choice ? 'heads' : 'tails',
              betAmount,
            },
          }),
        });

        const flipResult = await flipRes.json();

        if (flipResult.success) {
          const txLink = `https://monadscan.com/tx/${flipResult.txHash}`;
          return NextResponse.json({
            success: true,
            action: 'transaction',
            message: `🪙 **Coin Flipped!**

🎲 Choice: ${choice ? 'HEADS' : 'TAILS'}
💰 Bet: ${betAmount} MON
📍 Contract: 0xfE2...9b4

🔗 [View result on Monadscan](${txLink})

Check the transaction to see if you won! Win = 2x payout minus house edge.`,
            txHash: flipResult.txHash,
          });
        } else {
          return NextResponse.json({
            success: false,
            message: `❌ Flip failed: ${flipResult.error}`
          });
        }
      } catch (err: any) {
        console.error('[BOT-FLIP] Error:', err);
        return NextResponse.json({
          success: false,
          message: `Failed to flip coin: ${err.message}`
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
              permissions: ['buy_music', 'send_tours', 'mint_passport', 'wrap_mon', 'mint_music']
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
              permissions: ['send_tours', 'mint_passport', 'wrap_mon', 'mint_music', 'buy_music']
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
              permissions: ['mint_passport', 'wrap_mon', 'mint_music', 'send_tours', 'buy_music']
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
              permissions: ['mint_music', 'mint_passport', 'wrap_mon', 'send_tours', 'buy_music']
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
              permissions: ['mint_music', 'mint_collector', 'mint_passport', 'wrap_mon', 'send_tours', 'buy_music']
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
      'go to profile': '/profile',
      'profile': '/profile',
      'my profile': '/profile',
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
