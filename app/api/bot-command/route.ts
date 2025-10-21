import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function POST(req: NextRequest) {
  try {
    const { command, userAddress } = await req.json();
    
    console.log('🤖 Bot command received:', { command, userAddress });
    
    const lowerCommand = command.toLowerCase().trim();
    
    // ==================== HELP COMMAND ====================
    if (lowerCommand === 'help') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🤖 EmpowerTours AI Agent

📍 Navigation:
- "go to passport" - Mint travel passport
- "go to music" - Mint music NFT
- "go to profile" - View your NFTs
- "go to market" - Browse marketplace
- "go to dashboard" - View analytics

💰 Transactions (Gasless - We Pay!):
- "swap 0.1 mon" - Swap MON for TOURS tokens
- "mint passport" - Mint a passport NFT (FREE)
- "mint music" - Mint a music NFT (requires upload)
- "check balance" - Check your MON/TOURS balance

💬 Info:
- "help" - Show this message
- "status" - Check wallet connection
- "about" - Learn about EmpowerTours

✨ All transactions are FREE - we pay the gas!`
      });
    }
    
    // ==================== STATUS COMMAND ====================
    if (lowerCommand === 'status' || lowerCommand === 'check status') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: userAddress 
          ? `✅ Wallet Connected
          
Address: ${userAddress.slice(0, 6)}...${userAddress.slice(-4)}

💡 You can execute gasless transactions via our bot!
Try: "swap 0.1 mon" or "mint passport"`
          : `❌ Wallet Not Connected

Please connect your wallet first by visiting your profile.
Try: "go to profile"`
      });
    }
    
    // ==================== ABOUT COMMAND ====================
    if (lowerCommand === 'about' || lowerCommand === 'info') {
      return NextResponse.json({
        success: true,
        action: 'info',
        message: `🌍 EmpowerTours

A Farcaster Mini App for:
- 🎫 Minting travel passport NFTs (195 countries!)
- 🎵 Minting music NFTs (with royalties)
- 🛒 Trading itineraries on marketplace
- 💱 Swapping MON ↔ TOURS tokens

Built on Monad Testnet
Powered by Envio Indexer
✨ All minting is FREE - we pay gas!

Try "help" to see all commands!`
      });
    }
    
    // ==================== BALANCE CHECK ====================
    if (lowerCommand.includes('balance') || lowerCommand === 'check balance') {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Please connect your wallet first. Try: "go to profile"'
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
          message: `💰 Your Balances

MON: ${data.mon || '0.0000'} MON
TOURS: ${data.tours || '0'} TOURS
NFTs: ${data.nfts?.totalNFTs || 0} total

Address: ${userAddress.slice(0, 10)}...`
        });
      } catch (err: any) {
        return NextResponse.json({
          success: false,
          message: `❌ Failed to check balance: ${err.message}`
        });
      }
    }
    
    // ==================== SWAP COMMAND (SERVER-SIDE, NO DELEGATION) ====================
    if (lowerCommand.includes('swap') && lowerCommand.includes('mon')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Wallet not connected. Try: "go to profile"'
        });
      }
      
      const match = lowerCommand.match(/([\d.]+)\s*mon/);
      const amount = match ? parseFloat(match[1]) : 0.1;
      
      if (amount <= 0 || amount > 10) {
        return NextResponse.json({
          success: false,
          message: '❌ Invalid amount. Please use 0.01 - 10 MON'
        });
      }
      
      try {
        console.log(`💱 Executing swap via backend (no delegation needed): ${amount} MON`);
        
        // 🔥 FIX: Call backend to execute swap directly (we pay gas)
        const response = await fetch(`${APP_URL}/api/execute-swap`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            amount: amount.toString()
          })
        });
        
        const result = await response.json();
        
        if (!result.success) {
          throw new Error(result.error || 'Swap failed');
        }
        
        console.log('✅ Swap successful:', result.txHash);
        
        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `✅ Swap Complete (FREE)!

${amount} MON → ${result.toursReceived || '?'} TOURS tokens

TX: ${result.txHash?.slice(0, 10)}...

⚡ We paid the gas - completely FREE for you!

View: https://testnet.monadscan.com/tx/${result.txHash}`
        });
      } catch (error: any) {
        console.error('❌ Swap failed:', error);
        return NextResponse.json({
          success: false,
          message: `❌ Swap failed: ${error.message || 'Unknown error'}`
        });
      }
    }
    
    // ==================== MINT PASSPORT COMMAND ====================
    if (lowerCommand.includes('mint passport')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Wallet not connected. Try: "go to profile"'
        });
      }
      
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/passport',
        message: `🎫 Redirecting to Passport Minting...

⚡ FREE minting - we pay gas!
🌍 Choose from 195 countries
✨ Each passport is a unique NFT

Loading passport page...`
      });
    }
    
    // ==================== MINT MUSIC COMMAND ====================
    if (lowerCommand.includes('mint music')) {
      return NextResponse.json({
        success: true,
        action: 'navigate',
        path: '/music',
        message: `🎵 Redirecting to Music Minting...

Upload your track to mint as an NFT:
- Preview clip (30s)
- Full track (for buyers)
- Cover art

⚡ FREE minting - we pay gas!
💰 Set your own price!

Loading music page...`
      });
    }
    
    // ==================== NAVIGATION COMMANDS ====================
    const navCommands: Record<string, string> = {
      'go to passport': '/passport',
      'passport': '/passport',
      'go to music': '/music',
      'music': '/music',
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
          message: `✅ Navigating to ${path}...`
        });
      }
    }
    
    // ==================== UNKNOWN COMMAND ====================
    return NextResponse.json({
      success: false,
      message: `❌ Command not recognized: "${command}"

Try "help" to see all available commands!`
    });
    
  } catch (error: any) {
    console.error('❌ Bot command error:', error);
    return NextResponse.json({
      success: false,
      message: '❌ Error processing command. Please try again.'
    }, { status: 500 });
  }
}
