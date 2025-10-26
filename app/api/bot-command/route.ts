import { NextRequest, NextResponse } from 'next/server';

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

export async function POST(req: NextRequest) {
  try {
    const { command, userAddress, location } = await req.json();
    
    console.log('🤖 Bot command received:', { command, userAddress, location });
    
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
- "mint music <price>" - Mint a music NFT (requires upload first)
- "send <amount> tours to @username" - Send TOURS to another user
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
    
    // ==================== SWAP COMMAND (GASLESS VIA DELEGATION) ====================
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
        console.log(`💱 Executing swap via delegation: ${amount} MON for user ${userAddress}`);
        
        // Step 1: Check/create delegation with swap permission
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        
        // ✅ Check if delegation exists AND has swap_mon_for_tours permission
        const hasValidDelegation = delegationData.success && 
                                   delegationData.delegation &&
                                   Array.isArray(delegationData.delegation.permissions) &&
                                   delegationData.delegation.permissions.includes('swap_mon_for_tours');
        
        if (!hasValidDelegation) {
          console.warn('⚠️ [BOT] No delegation with swap_mon_for_tours permission - creating one...');
          
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              // ✅ Use correct permission name
              permissions: ['swap_mon_for_tours', 'send_tours', 'mint_passport', 'mint_music']
            })
          });
          
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          
          console.log('✅ [BOT] Delegation created with swap_mon_for_tours permission');
        } else {
          console.log('✅ [BOT] Delegation has swap_mon_for_tours permission:', {
            hoursLeft: delegationData.delegation.hoursLeft,
            transactionsLeft: delegationData.delegation.transactionsLeft,
            permissions: delegationData.delegation.permissions
          });
        }
        
        // Step 2: Execute swap via delegation
        const swapRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'swap_mon_for_tours',  // ✅ MUST match the case in execute-delegated
            params: {
              amount: amount.toString()
            }
          })
        });
        
        const swapData = await swapRes.json();
        
        if (!swapData.success) {
          throw new Error(swapData.error || 'Swap failed');
        }
        
        console.log('✅ Swap successful:', swapData.txHash);
        
        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `✅ Swap Complete (FREE)!

${amount} MON → ? TOURS tokens

TX: ${swapData.txHash?.slice(0, 10)}...

⚡ Gasless - we paid the gas!

View: https://testnet.monadscan.com/tx/${swapData.txHash}`
        });
      } catch (error: any) {
        console.error('❌ Swap failed:', error);
        return NextResponse.json({
          success: false,
          message: `❌ Swap failed: ${error.message || 'Unknown error'}`
        });
      }
    }
    
    // ==================== SEND TOURS COMMAND (GASLESS VIA DELEGATION) ====================
    if (lowerCommand.includes('send') && lowerCommand.includes('tours')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Wallet not connected. Try: "go to profile"'
        });
      }
      
      try {
        // Parse: "send 10 tours to @username" or "send 10 tours to 0x..."
        const amountMatch = lowerCommand.match(/send\s+([\d.]+)\s+tours/);
        const recipientMatch = lowerCommand.match(/to\s+(@[\w]+|0x[a-fA-F0-9]{40})/);
        
        if (!amountMatch || !recipientMatch) {
          return NextResponse.json({
            success: false,
            message: '❌ Invalid format. Use: "send 10 tours to @username" or "send 10 tours to 0x..."'
          });
        }
        
        const amount = parseFloat(amountMatch[1]);
        let recipient = recipientMatch[1];
        
        if (amount <= 0 || amount > 10000) {
          return NextResponse.json({
            success: false,
            message: '❌ Invalid amount. Please use 0.01 - 10000 TOURS'
          });
        }
        
        // If recipient is a Farcaster username, resolve it to address
        if (recipient.startsWith('@')) {
          console.log('🔍 Resolving Farcaster username:', recipient);
          try {
            const username = recipient.slice(1); // Remove @
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
            console.log('📦 Neynar API response structure:', Object.keys(neynarData));
            
            // Handle different Neynar API response formats
            const userData = neynarData.result?.user || neynarData.user || neynarData;
            
            console.log('👤 User data keys:', Object.keys(userData));
            console.log('🔐 Checking for addresses...');
            
            // Try ALL possible field locations (Neynar API is inconsistent!)
            let ethAddresses = null;
            
            // Try verified_addresses (snake_case)
            if (userData.verified_addresses?.eth_addresses) {
              ethAddresses = userData.verified_addresses.eth_addresses;
              console.log('✅ Found in verified_addresses.eth_addresses');
            }
            // Try verifiedAddresses (camelCase)
            else if (userData.verifiedAddresses?.eth_addresses) {
              ethAddresses = userData.verifiedAddresses.eth_addresses;
              console.log('✅ Found in verifiedAddresses.eth_addresses');
            }
            // Try verifiedAddresses.ethAddresses (mixed case)
            else if (userData.verifiedAddresses?.ethAddresses) {
              ethAddresses = userData.verifiedAddresses.ethAddresses;
              console.log('✅ Found in verifiedAddresses.ethAddresses');
            }
            // Fallback to custody_address
            else if (userData.custody_address) {
              ethAddresses = [userData.custody_address];
              console.log('✅ Using custody_address as fallback');
            }
            // Last resort: custodyAddress (camelCase)
            else if (userData.custodyAddress) {
              ethAddresses = [userData.custodyAddress];
              console.log('✅ Using custodyAddress as fallback');
            }
            
            if (ethAddresses && ethAddresses.length > 0) {
              recipient = ethAddresses[0];
              console.log('✅ Resolved @' + username + ' to:', recipient);
            } else {
              console.error('❌ No addresses found. Full userData:', JSON.stringify(userData, null, 2));
              throw new Error(`No verified address for @${username}. User data available but no ETH address found.`);
            }
          } catch (resolveErr: any) {
            return NextResponse.json({
              success: false,
              message: `❌ Failed to find user ${recipient}: ${resolveErr.message}`
            });
          }
        }
        
        // Validate recipient address
        if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
          return NextResponse.json({
            success: false,
            message: '❌ Invalid recipient address format'
          });
        }
        
        console.log(`💸 Sending ${amount} TOURS to ${recipient}`);
        
        // ✅ CRITICAL FIX: Check/create delegation WITH send_tours permission
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        
        // ✅ Check if delegation exists AND has send_tours permission
        const hasValidDelegation = delegationData.success && 
                                   delegationData.delegation &&
                                   Array.isArray(delegationData.delegation.permissions) &&
                                   delegationData.delegation.permissions.includes('send_tours');
        
        if (!hasValidDelegation) {
          console.warn('⚠️ [BOT] No delegation with send_tours permission - creating one...');
          
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              // ✅ EXPLICITLY include send_tours permission
              permissions: ['send_tours', 'mint_passport', 'mint_music', 'swap_mon_for_tours']
            })
          });
          
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          
          console.log('✅ [BOT] Delegation created with send_tours permission');
        } else {
          console.log('✅ [BOT] Delegation has send_tours permission:', {
            hoursLeft: delegationData.delegation.hoursLeft,
            transactionsLeft: delegationData.delegation.transactionsLeft,
            permissions: delegationData.delegation.permissions
          });
        }
        
        // Execute send via delegation
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
        
        console.log('✅ TOURS sent:', sendData.txHash);
        
        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `💸 Sent ${amount} TOURS! (FREE)

To: ${recipient.slice(0, 6)}...${recipient.slice(-4)}

TX: ${sendData.txHash?.slice(0, 10)}...

⚡ Gasless - we paid the fees!

View: https://testnet.monadscan.com/tx/${sendData.txHash}`
        });
        
      } catch (error: any) {
        console.error('❌ Send TOURS failed:', error);
        return NextResponse.json({
          success: false,
          message: `❌ Send failed: ${error.message}`
        });
      }
    }
    
    // ==================== MINT PASSPORT COMMAND (GASLESS VIA DELEGATION) ====================
    if (lowerCommand.includes('mint passport')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Wallet not connected. Try: "go to profile"'
        });
      }
      
      try {
        console.log('🎫 [BOT] Minting passport for:', userAddress);
        
        // Step 1: Check if user has active delegation
        console.log('🔐 [BOT] Checking delegation...');
        const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
        const delegationData = await delegationRes.json();
        
        if (!delegationData.success || !delegationData.delegation) {
          console.warn('⚠️ [BOT] No active delegation - creating one...');
          
          // Create delegation
          const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress,
              durationHours: 24,
              maxTransactions: 100,
              permissions: ['mint_passport', 'mint_music', 'swap_mon_for_tours', 'send_tours']
            })
          });
          
          const createData = await createRes.json();
          if (!createData.success) {
            throw new Error('Failed to create delegation: ' + createData.error);
          }
          
          console.log('✅ [BOT] Delegation created');
        } else {
          console.log('✅ [BOT] Delegation active:', {
            hoursLeft: delegationData.delegation.hoursLeft,
            transactionsLeft: delegationData.delegation.transactionsLeft
          });
        }
        
        // Step 2: ALWAYS use server-side geolocation detection (IP-based)
        let countryCode = 'US';
        let countryName = 'United States';
        
        console.log('🌍 [BOT] Detecting location via server-side IP lookup...');
        try {
          const geoRes = await fetch(`${APP_URL}/api/geo`);
          const geoData = await geoRes.json();
          countryCode = geoData.country || 'US';
          countryName = geoData.country_name || 'United States';
          console.log('📍 [BOT] Detected location:', countryCode, countryName);
        } catch (geoErr) {
          console.warn('⚠️ [BOT] Location detection failed, using default:', geoErr);
        }
        
        // Step 3: Execute mint via delegation
        console.log('💳 [BOT] Executing mint via delegated transaction...');
        const mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress,
            action: 'mint_passport',
            params: {
              countryCode,
              countryName
            }
          })
        });
        
        const mintData = await mintRes.json();
        
        if (!mintData.success) {
          throw new Error(mintData.error || 'Mint failed');
        }
        
        console.log('✅ [BOT] Passport minted:', mintData.txHash);
        
        return NextResponse.json({
          success: true,
          action: 'transaction',
          message: `🎫 Passport Minted (FREE)!

${countryCode} ${countryName}

TX: ${mintData.txHash?.slice(0, 10)}...

⚡ Gasless transaction - we paid the gas!

View: https://testnet.monadscan.com/tx/${mintData.txHash}`
        });
        
      } catch (error: any) {
        console.error('❌ [BOT] Passport mint error:', error);
        return NextResponse.json({
          success: false,
          message: `❌ Mint failed: ${error.message}`
        });
      }
    }
    
    // ==================== MINT MUSIC COMMAND ====================
    if (lowerCommand.includes('mint music')) {
      if (!userAddress) {
        return NextResponse.json({
          success: false,
          message: '❌ Wallet not connected. Try: "go to profile"'
        });
      }
      
      try {
        // Parse price from command: "mint music 0.05" or "mint music for 0.05 tours"
        const priceMatch = lowerCommand.match(/(\d+\.?\d*)\s*(tours|mon)?/);
        const price = priceMatch ? parseFloat(priceMatch[1]) : 0.01;
        
        if (price <= 0 || price > 10) {
          return NextResponse.json({
            success: false,
            message: '❌ Invalid price. Use: 0.001 - 10 TOURS'
          });
        }
        
        console.log(`🎵 [BOT] Preparing to mint music NFT with price: ${price} TOURS`);
        
        return NextResponse.json({
          success: true,
          action: 'info',
          message: `🎵 Music NFT Minting

To mint music, you need to:
1. Go to the Music page
2. Upload your audio files (preview + full track)
3. Upload cover art
4. Set title and price

We'll handle the minting for FREE!

Price you specified: ${price} TOURS

Ready? Try: "go to music"`
        });
        
      } catch (error: any) {
        console.error('❌ [BOT] Music mint info error:', error);
        return NextResponse.json({
          success: false,
          message: `❌ Error: ${error.message}`
        });
      }
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
