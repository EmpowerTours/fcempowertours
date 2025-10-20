import { NextRequest, NextResponse } from 'next/server';

// Simple command patterns for navigation only
const COMMANDS = {
  // Navigation
  passport: /passport|travel|mint passport|get passport/i,
  music: /music|mint music|upload music|song/i,
  market: /market|marketplace|buy|sell|shop/i,
  profile: /profile|my nfts|my tokens|my wallet/i,
  admin: /admin|dashboard|settings/i,
  itinerary: /itinerary|trip|plan|schedule/i,
  home: /home|main|start/i,
  
  // Info
  help: /help|commands|what can you do/i,
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

    // Help command
    if (COMMANDS.help.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🤖 Available Commands:

📍 Navigation:
• "passport" → Mint travel passport
• "music" → Mint music NFT
• "market" → Token marketplace
• "profile" → View your NFTs
• "admin" → Admin dashboard
• "itinerary" → Trip planner
• "home" → Home page

ℹ️ Info:
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

    if (COMMANDS.home.test(cmd)) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/',
        message: '🏠 Going home...',
      });
    }

    // Default: unclear command
    return NextResponse.json({
      success: false,
      message: `❓ I didn't understand "${cmd}"\n\nTry: "passport", "music", "market", "profile", or "help"`,
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
