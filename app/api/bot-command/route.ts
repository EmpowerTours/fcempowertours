import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

// Command patterns - ENHANCED with delegation
const COMMANDS = {
  // Navigation (existing)
  passport: /passport|travel|mint passport|get passport/i,
  music: /music|mint music|upload music|song/i,
  market: /market|marketplace|buy|sell|shop/i,
  profile: /profile|my nfts|my tokens|my wallet/i,
  admin: /admin|dashboard|settings/i,
  itinerary: /itinerary|trip|plan|schedule/i,

  // Actions (existing)
  mintPassport: /mint passport|create passport|new passport/i,
  mintMusic: /mint music|upload music|create music nft/i,
  swap: /swap|exchange|trade tokens|swap tokens/i,

  // NEW: Delegation commands
  delegate: /delegate|delegation|spending limit|auto mint|automated/i,
  setLimit: /set (\d+\.?\d*)\s*(eth|monad)?\s*(limit|spending|delegation)/i,
  enableAuto: /enable auto|auto mint|automatic minting/i,
  disableAuto: /disable auto|stop auto|cancel delegation/i,
  checkDelegation: /check delegation|delegation status|auto status/i,
  
  // NEW: Moment/Video commands
  shareMoment: /share moment|share video|post video|share this/i,
  recordVideo: /record|video|capture moment/i,

  // Info
  help: /help|commands|what can you do/i,
  balance: /balance|how much|my tokens/i,
};

// Helper to extract amounts
function extractAmount(text: string): string {
  const match = text.match(/(\d+\.?\d*)\s*(eth|monad)?/i);
  return match ? match[1] : '0.1';
}

function extractMintCount(text: string): number {
  const match = text.match(/(\d+)\s*(mints?|songs?|times?)/i);
  return match ? parseInt(match[1]) : 5;
}

export async function POST(req: NextRequest) {
  try {
    const { command, userId, fid, videoUrl } = await req.json();
    const cmd = (command || '').toLowerCase().trim();

    console.log('🤖 Bot command received:', cmd);
    console.log('User ID:', userId, 'FID:', fid);

    if (!cmd) {
      return NextResponse.json({
        success: false,
        message: 'Please enter a command',
      });
    }

    // NEW: Check delegation commands first
    if (COMMANDS.delegate.test(cmd) || COMMANDS.setLimit.test(cmd)) {
      const amount = extractAmount(cmd);
      const maxMints = extractMintCount(cmd);
      
      return NextResponse.json({
        success: true,
        action: 'setup_delegation',
        params: {
          spendingLimit: amount,
          maxMints,
          durationHours: 24
        },
        message: `⚡ Setting up delegation:\n• Spending limit: ${amount} ETH\n• Max mints: ${maxMints}\n• Duration: 24 hours\n\nPlease approve in your wallet...`,
      });
    }

    if (COMMANDS.enableAuto.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'enable_delegation',
        message: '✅ Enabling auto-minting with your delegation settings...',
      });
    }

    if (COMMANDS.disableAuto.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'disable_delegation',
        message: '🛑 Disabling auto-minting...',
      });
    }

    if (COMMANDS.checkDelegation.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'check_delegation',
        message: '🔍 Checking delegation status...',
      });
    }

    // NEW: Moment sharing
    if (COMMANDS.shareMoment.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'share_moment',
        videoUrl,
        message: '📸 Sharing your moment to Farcaster...',
      });
    }

    if (COMMANDS.recordVideo.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'start_recording',
        message: '🎥 Starting video recording...',
      });
    }

    // EXISTING: Action commands
    if (COMMANDS.mintPassport.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/passport',
        message: '🎫 Opening passport minting page...',
      });
    }

    if (COMMANDS.mintMusic.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/music',
        message: '🎵 Opening music NFT minting page...',
      });
    }

    if (COMMANDS.swap.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/market',
        message: '💱 Opening token swap...',
      });
    }

    // ENHANCED: Help command with delegation info
    if (COMMANDS.help.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🤖 Available Commands:

Navigation:
- "passport" → Mint travel passport
- "music" → Mint music NFT
- "market" → Token marketplace
- "profile" → View your NFTs
- "admin" → Admin dashboard
- "itinerary" → Trip planner

Actions:
- "mint passport" → Start passport minting
- "mint music" → Start music upload
- "swap tokens" → Swap TOURS tokens

⚡ NEW - Delegation:
- "set 1 eth limit" → Set spending limit
- "delegate 0.5 eth for 10 mints" → Setup delegation
- "enable auto minting" → Turn on automation
- "check delegation" → View status

📸 Moments:
- "share moment" → Post to Farcaster
- "record video" → Capture video command

Info:
- "balance" → Check token balance
- "help" → Show this message`,
      });
    }

    // EXISTING: Navigation commands
    if (COMMANDS.passport.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/passport',
        message: '🎫 Taking you to passports...',
      });
    }

    if (COMMANDS.music.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/music',
        message: '🎵 Taking you to music...',
      });
    }

    if (COMMANDS.market.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/market',
        message: '🏪 Opening marketplace...',
      });
    }

    if (COMMANDS.profile.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/profile',
        message: '👤 Opening your profile...',
      });
    }

    if (COMMANDS.admin.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/admin',
        message: '⚙️ Opening admin...',
      });
    }

    if (COMMANDS.itinerary.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/itinerary',
        message: '📋 Opening itinerary...',
      });
    }

    // Default: unclear command
    return NextResponse.json({
      success: false,
      message: `❓ I didn't understand "${cmd}"\n\nTry:\n• "mint passport"\n• "set 1 eth limit"\n• "share moment"\n• "help" for all commands`,
    });

  } catch (error: any) {
    console.error('❌ Bot command error:', error);
    return NextResponse.json(
      {
        success: false,
        message: 'Error processing command',
        error: error.message,
      },
      { status: 500 }
    );
  }
}
