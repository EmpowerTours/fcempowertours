import { NextRequest, NextResponse } from 'next/server';

const BASE_URL = process.env.NEXT_PUBLIC_URL || 'http://localhost:3000';

// Command patterns
const COMMANDS = {
  // Navigation
  passport: /passport|travel|mint passport|get passport/i,
  music: /music|mint music|upload music|song/i,
  market: /market|marketplace|buy|sell|shop/i,
  profile: /profile|my nfts|my tokens|my wallet/i,
  admin: /admin|dashboard|settings/i,
  itinerary: /itinerary|trip|plan|schedule/i,
  
  // Actions
  mintPassport: /mint passport|create passport|new passport/i,
  mintMusic: /mint music|upload music|create music nft/i,
  swap: /swap|exchange|trade tokens|swap tokens/i,
  
  // Info
  help: /help|commands|what can you do/i,
  balance: /balance|how much|my tokens/i,
};

export async function POST(req: NextRequest) {
  try {
    const { command } = await req.json();
    const cmd = (command || '').toLowerCase().trim();
    
    console.log('🤖 Bot command received:', cmd);

    if (!cmd) {
      return NextResponse.json({
        success: false,
        message: 'Please enter a command',
      });
    }

    // Check for action commands first
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

    // Check for help
    if (COMMANDS.help.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🤖 Available Commands:

Navigation:
• "passport" or "travel" → Mint travel passport
• "music" → Mint music NFT
• "market" → Token marketplace
• "profile" → View your NFTs
• "admin" → Admin dashboard
• "itinerary" → Trip planner

Actions:
• "mint passport" → Start passport minting
• "mint music" → Start music upload
• "swap tokens" → Swap TOURS tokens

Info:
• "balance" → Check token balance
• "help" → Show this message`,
      });
    }

    // Navigation commands
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
      message: `❓ I didn't understand "${cmd}"\n\nTry:\n• "mint passport"\n• "upload music"\n• "swap tokens"\n• "help" for all commands`,
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
