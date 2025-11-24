import { NextRequest, NextResponse } from 'next/server';
import {
  runLotteryDrawing,
  recordWinnerPayout,
  getLotteryPool,
  getTodayKey,
  getDateKey,
  LOTTERY_CONFIG,
  LotteryWinner,
} from '@/lib/lottery';

const NEYNAR_API_KEY = process.env.NEYNAR_API_KEY;
const BOT_SIGNER_UUID = process.env.NEYNAR_SIGNER_UUID; // EmpowerTours bot signer

// Create a Neynar transaction pay frame for the winner
async function createPayoutFrame(winner: LotteryWinner): Promise<{
  frameUrl?: string;
  frameId?: string;
  error?: string;
}> {
  if (!NEYNAR_API_KEY) {
    return { error: 'NEYNAR_API_KEY not configured' };
  }

  try {
    const response = await fetch('https://api.neynar.com/v2/farcaster/frame/transaction/pay', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        transaction: {
          to: {
            network: 'base',
            address: winner.winnerAddress,
            // Native ETH transfer (no token contract for native)
            amount: winner.amount,
          },
        },
        config: {
          line_items: [
            {
              name: 'EmpowerTours Daily Lottery Winner!',
              description: `Congratulations! You won ${winner.amount.toFixed(6)} ETH from the ${winner.day} lottery pool!`,
              image: 'https://empowertours.xyz/lottery-winner.png',
            },
          ],
          action: {
            text: 'Claim Winnings',
            text_color: '#FFFFFF',
            button_color: '#8B5CF6',
          },
        },
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: `Neynar API error: ${errorData.message || response.statusText}` };
    }

    const data = await response.json();
    return {
      frameUrl: data.transaction_frame?.url,
      frameId: data.transaction_frame?.id,
    };
  } catch (error: any) {
    return { error: `Failed to create payout frame: ${error.message}` };
  }
}

// Publish announcement cast via Neynar
async function publishWinnerAnnouncement(
  winner: LotteryWinner,
  frameUrl?: string
): Promise<{ castHash?: string; error?: string }> {
  if (!NEYNAR_API_KEY || !BOT_SIGNER_UUID) {
    return { error: 'NEYNAR_API_KEY or BOT_SIGNER_UUID not configured' };
  }

  try {
    const winnerDisplay = winner.winnerUsername
      ? `@${winner.winnerUsername}`
      : `${winner.winnerAddress.slice(0, 6)}...${winner.winnerAddress.slice(-4)}`;

    let castText = `Daily Lottery Winner!

Congratulations to ${winnerDisplay}!

You won ${winner.amount.toFixed(6)} ETH from today's EmpowerTours lottery pool!

${winner.winnerFid ? `FID: ${winner.winnerFid}` : ''}

Thanks to all ${winner.day} participants! Tomorrow's pool is already building...

#EmpowerTours #Lottery #Farcaster`;

    const embeds = frameUrl ? [{ url: frameUrl }] : [];

    const response = await fetch('https://api.neynar.com/v2/farcaster/cast', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        signer_uuid: BOT_SIGNER_UUID,
        text: castText,
        embeds,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: `Failed to publish cast: ${errorData.message || response.statusText}` };
    }

    const data = await response.json();
    return { castHash: data.cast?.hash };
  } catch (error: any) {
    return { error: `Failed to publish announcement: ${error.message}` };
  }
}

// Direct payout from bot wallet using Neynar wallet API
async function sendDirectPayout(winner: LotteryWinner): Promise<{
  txHash?: string;
  error?: string;
}> {
  // Note: This requires the Neynar managed wallet to have sufficient funds
  // The bot wallet is: 0x2d5dd9aa1dc42949d203d1946d599ba47f0b6d1c
  // Wallet ID: n8frpzpxeq7lbfkciap1cnr5

  if (!NEYNAR_API_KEY) {
    return { error: 'NEYNAR_API_KEY not configured' };
  }

  try {
    // Using Neynar's wallet transfer API
    const response = await fetch('https://api.neynar.com/v2/wallet/transfer', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'x-api-key': NEYNAR_API_KEY,
      },
      body: JSON.stringify({
        wallet_id: LOTTERY_CONFIG.BOT_WALLET_ID,
        to: winner.winnerAddress,
        amount: winner.amount.toString(),
        network: 'base',
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      return { error: `Wallet transfer failed: ${errorData.message || response.statusText}` };
    }

    const data = await response.json();
    return { txHash: data.transaction_hash || data.tx_hash };
  } catch (error: any) {
    return { error: `Failed to send payout: ${error.message}` };
  }
}

export async function POST(req: NextRequest) {
  try {
    // Check if lottery is enabled
    if (!LOTTERY_CONFIG.ENABLED) {
      return NextResponse.json(
        { success: false, error: 'Lottery feature is currently disabled' },
        { status: 503 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { day, adminKey, skipPayout } = body;

    // Optional admin key protection
    const expectedAdminKey = process.env.LOTTERY_ADMIN_KEY;
    if (expectedAdminKey && adminKey !== expectedAdminKey) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Default to yesterday if no day specified (typical cron behavior)
    const targetDay = day || (() => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      return getDateKey(yesterday);
    })();

    console.log(`[LOTTERY] Running drawing for ${targetDay}`);

    // Check if already drawn
    const existingPool = await getLotteryPool(targetDay);
    if (existingPool?.status === 'completed') {
      return NextResponse.json({
        success: true,
        alreadyCompleted: true,
        winner: existingPool.winner,
        amount: existingPool.winningAmount,
        message: `Lottery for ${targetDay} was already completed`,
      });
    }

    // Run the drawing
    const winner = await runLotteryDrawing(targetDay);

    if (!winner) {
      return NextResponse.json({
        success: false,
        error: `No participants or pool found for ${targetDay}`,
      });
    }

    console.log(`[LOTTERY] Winner selected: ${winner.winnerAddress}`);
    console.log(`[LOTTERY] Winning amount: ${winner.amount} ETH`);

    let payoutResult: { txHash?: string; error?: string } = {};
    let frameResult: { frameUrl?: string; frameId?: string; error?: string } = {};
    let castResult: { castHash?: string; error?: string } = {};

    if (!skipPayout) {
      // Step 1: Create payout frame
      console.log(`[LOTTERY] Creating payout frame...`);
      frameResult = await createPayoutFrame(winner);
      if (frameResult.error) {
        console.log(`[LOTTERY] Frame creation warning: ${frameResult.error}`);
      }

      // Step 2: Send direct payout
      console.log(`[LOTTERY] Sending direct payout...`);
      payoutResult = await sendDirectPayout(winner);
      if (payoutResult.error) {
        console.log(`[LOTTERY] Payout warning: ${payoutResult.error}`);
      }

      // Step 3: Publish announcement
      console.log(`[LOTTERY] Publishing winner announcement...`);
      castResult = await publishWinnerAnnouncement(winner, frameResult.frameUrl);
      if (castResult.error) {
        console.log(`[LOTTERY] Announcement warning: ${castResult.error}`);
      }

      // Record payout info
      if (payoutResult.txHash || castResult.castHash) {
        await recordWinnerPayout(targetDay, payoutResult.txHash || '', castResult.castHash);
      }
    }

    return NextResponse.json({
      success: true,
      day: targetDay,
      winner: {
        address: winner.winnerAddress,
        fid: winner.winnerFid,
        username: winner.winnerUsername,
        amount: winner.amount,
      },
      payout: {
        txHash: payoutResult.txHash,
        error: payoutResult.error,
      },
      announcement: {
        castHash: castResult.castHash,
        frameUrl: frameResult.frameUrl,
        error: castResult.error || frameResult.error,
      },
      message: `Lottery complete! ${winner.winnerUsername || winner.winnerAddress} wins ${winner.amount} ETH!`,
    });

  } catch (error: any) {
    console.error('[LOTTERY] Drawing error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

// GET: Check if drawing is needed
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const day = searchParams.get('day');

  const targetDay = day || (() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    return getDateKey(yesterday);
  })();

  const pool = await getLotteryPool(targetDay);

  return NextResponse.json({
    day: targetDay,
    needsDrawing: pool && pool.status !== 'completed' && pool.participantCount > 0,
    pool: pool ? {
      totalPool: pool.totalPool,
      participantCount: pool.participantCount,
      status: pool.status,
      winner: pool.winner,
    } : null,
  });
}
