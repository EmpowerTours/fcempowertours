// app/api/bot-command/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, parseEther } from 'ethers';

// Contract addresses
const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA';
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_MUSICNFT_ADDRESS || '0xaD849874B0111131A30D7D2185Cc1519A83dd3D0';
const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
const SAFE_ACCOUNT = '0xDdaE200DBc2874BAd4FdB5e39F227215386c7533';

// ABIs (minimal)
const TOKEN_SWAP_ABI = [
  {
    inputs: [],
    name: 'swap',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  },
  {
    inputs: [],
    name: 'exchangeRate',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  }
];

const MUSIC_NFT_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'string', name: 'tokenURI', type: 'string' },
      { internalType: 'uint256', name: 'price', type: 'uint256' }
    ],
    name: 'mintMaster',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  }
];

const PASSPORT_ABI = [
  {
    inputs: [{ internalType: 'address', name: 'to', type: 'address' }],
    name: 'mint',
    outputs: [],
    stateMutability: 'payable',
    type: 'function',
  }
];

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

💰 Transactions (Delegated via Safe Account):
- "swap 0.1 mon" - Swap MON for TOURS tokens
- "mint passport" - Mint a passport NFT (FREE)
- "mint music" - Mint a music NFT (requires upload)
- "check balance" - Check your MON/TOURS balance

💬 Info:
- "help" - Show this message
- "status" - Check wallet connection
- "about" - Learn about EmpowerTours

🔐 All transactions are gasless and executed via our Safe smart account!`
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
Safe Account: ${SAFE_ACCOUNT.slice(0, 6)}...${SAFE_ACCOUNT.slice(-4)}

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
Gasless transactions via Pimlico + Safe

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
        const provider = new JsonRpcProvider('https://testnet-rpc.monad.xyz');
        
        // Get MON balance
        const monBalance = await provider.getBalance(userAddress);
        const monFormatted = (Number(monBalance) / 1e18).toFixed(4);
        
        // TODO: Get TOURS balance from token contract
        
        return NextResponse.json({
          success: true,
          action: 'info',
          message: `💰 Your Balances

MON: ${monFormatted} MON
TOURS: (coming soon)

Address: ${userAddress.slice(0, 10)}...`
        });
      } catch (error: any) {
        return NextResponse.json({
          success: false,
          message: `❌ Failed to check balance: ${error.message}`
        });
      }
    }
    
    // ==================== SWAP COMMAND ====================
    if (lowerCommand.includes('swap') && lowerCommand.includes('mon')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Wallet not connected. Try: "go to profile"'
        });
      }
      
      // Extract amount
      const match = lowerCommand.match(/([\d.]+)\s*mon/);
      const amount = match ? parseFloat(match[1]) : 0.1;
      
      if (amount <= 0 || amount > 10) {
        return NextResponse.json({
          success: false,
          message: '❌ Invalid amount. Please use 0.01 - 10 MON'
        });
      }
      
      try {
        // Execute swap via Safe account
        const provider = new JsonRpcProvider('https://testnet-rpc.monad.xyz');
        const deployer = new Wallet(process.env.DEPLOYER_PRIVATE_KEY!, provider);
        const swapContract = new Contract(TOKEN_SWAP_ADDRESS, TOKEN_SWAP_ABI, deployer);
        
        console.log(`💱 Swapping ${amount} MON for TOURS...`);
        
        const tx = await swapContract.swap({ value: parseEther(amount.toString()) });
        await tx.wait();
        
        console.log('✅ Swap successful:', tx.hash);
        
        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `✅ Swap Successful!

${amount} MON → TOURS tokens

Transaction: ${tx.hash.slice(0, 10)}...
View: https://testnet.monadscan.com/tx/${tx.hash}

Your TOURS balance has been updated!`
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
