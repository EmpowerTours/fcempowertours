import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID || '';

export async function POST(req: NextRequest) {
  try {
    const {
      type,           // 'passport' | 'music_mint' | 'music_purchase' | 'stake_tours' | 'experience_created' | 'experience_purchased' | 'lottery_winner'
      fid,            // Farcaster ID
      tokenId,        // NFT token ID
      txHash,         // Transaction hash
      countryCode,    // For passport
      countryName,    // For passport
      songTitle,      // For music
      price,          // For music
      artist,         // For music purchase
      amount,         // For staking
      positionId,     // For staking
      // Experience fields
      experienceId,   // For experiences
      title,          // Experience title
      city,           // Experience city
      country,        // Experience country
      creatorAddress, // Experience creator
      buyerAddress,   // Experience buyer
      // Lottery fields
      roundId,        // Lottery round ID
      winnerAddress,  // Lottery winner address
      monPrize,       // MON prize amount
      shMonPrize,     // shMON prize amount
      participantCount, // Number of participants
    } = await req.json();

    console.log('🎵 [CAST] Posting cast:', { type, fid, tokenId, countryCode, songTitle });

    if (!fid) {
      console.log('ℹ️ No FID provided, skipping cast');
      return NextResponse.json({ success: true, message: 'No FID provided' });
    }

    if (!BOT_SIGNER_UUID || !NEYNAR_API_KEY) {
      console.error('❌ Missing BOT_SIGNER_UUID or NEYNAR_API_KEY');
      return NextResponse.json(
        { success: false, error: 'Server configuration error' },
        { status: 500 }
      );
    }

    const client = new NeynarAPIClient({
      apiKey: NEYNAR_API_KEY,
    });

    let castText = '';
    let embeds: Array<{ url: string }> = [];

    // ==================== PASSPORT CAST ====================
    if (type === 'passport') {
      // Use frame URL that links to owner's profile in mini-app
      const frameUrl = `${APP_URL}/api/frames/passport/${tokenId}`;
      castText = `🎫 New EmpowerTours Passport Minted!

${countryCode} ${countryName}

Token #${tokenId}

View: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: frameUrl }];
      console.log('📢 Passport cast text:', castText);
    }

    // ==================== MUSIC MINT CAST (Artist) ====================
    else if (type === 'music_mint') {
      // Link to artist's profile page (they minted it)
      const artistProfileUrl = `${APP_URL}/profile?fid=${fid}`;
      castText = `🎵 New Music Master NFT Minted!

"${songTitle || 'Untitled'}" - Token #${tokenId}
💰 License Price: ${price || '1'} TOURS

⚡ Gasless minting powered by @empowertours
🎶 Purchase license to stream full track

View: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: artistProfileUrl }];
      console.log('📢 Music mint cast text:', castText);
    }

    // ==================== MUSIC PURCHASE CAST (Buyer) ====================
    else if (type === 'music_purchase') {
      // Link to buyer's profile page (they purchased it)
      const buyerProfileUrl = `${APP_URL}/profile?fid=${fid}`;
      castText = `🎶 Just Purchased a Music License on @empowertours!

Now I can stream "${songTitle || 'Untitled'}" 🎵

TX: https://testnet.monadscan.com/tx/${txHash}

Gasless - they paid the gas! 🚀

@empowertours`;

      embeds = [{ url: buyerProfileUrl }];
      console.log('📢 Music purchase cast text:', castText);
    }

    // ==================== STAKING CAST ====================
    else if (type === 'stake_tours') {
      // Use frame URL so clicking opens mini-app in Warpcast, not browser
      const stakingUrl = `${APP_URL}/api/frames/staking`;

      // Try to get username from FID
      let username = '';
      if (fid && NEYNAR_API_KEY) {
        try {
          const userResponse = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData.users && userData.users.length > 0) {
              username = userData.users[0].username;
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch username from FID:', err);
        }
      }

      const userMention = username ? `@${username} just staked` : 'Just staked';
      castText = `💎 ${userMention} ${amount} TOURS on @empowertours!

📈 Earning yield + building credit score
🎫 Collateral: Passport NFT #${tokenId}
🏦 Position #${positionId}

TX: https://testnet.monadscan.com/tx/${txHash}

⚡ Gasless staking - they paid the gas!

@empowertours`;

      embeds = [{ url: stakingUrl }];
      console.log('📢 Staking cast text:', castText);
    }

    // ==================== EXPERIENCE CREATED CAST ====================
    else if (type === 'experience_created') {
      const experienceUrl = `${APP_URL}/experiences/${experienceId}`;
      castText = `🗺️ New Experience Created on @empowertours!

"${title || 'Untitled Experience'}"
📍 ${city}, ${country}
💰 Price: ${price} WMON

✨ GPS-revealed travel experience
🎁 Earn rewards for completing

View: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: experienceUrl }];
      console.log('📢 Experience created cast text:', castText);
    }

    // ==================== EXPERIENCE PURCHASED CAST ====================
    else if (type === 'experience_purchased') {
      const experienceUrl = `${APP_URL}/experiences/${experienceId}`;
      castText = `🎉 Experience Purchased on @empowertours!

"${title || 'Untitled Experience'}"
📍 ${city}, ${country}
💰 ${price} WMON

🗺️ Location unlocked! Time to explore!

TX: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: experienceUrl }];
      console.log('📢 Experience purchased cast text:', castText);
    }

    // ==================== LOTTERY WINNER CAST ====================
    else if (type === 'lottery_winner') {
      const lotteryUrl = `${APP_URL}/lottery`;

      // Calculate total prize
      const totalMonPrize = parseFloat(monPrize || '0');
      const totalShMonPrize = parseFloat(shMonPrize || '0');
      const totalPrize = (totalMonPrize + totalShMonPrize).toFixed(4);

      // Try to get winner's Farcaster username
      let winnerDisplay = winnerAddress ? `${winnerAddress.slice(0, 6)}...${winnerAddress.slice(-4)}` : 'Unknown';
      let winnerUsername = '';

      if (winnerAddress && NEYNAR_API_KEY) {
        try {
          const userResponse = await fetch(
            `https://api.neynar.com/v2/farcaster/user/bulk-by-address?addresses=${winnerAddress}`,
            {
              headers: {
                'Accept': 'application/json',
                'x-api-key': NEYNAR_API_KEY,
              },
            }
          );
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData && userData[winnerAddress.toLowerCase()]?.[0]) {
              winnerUsername = userData[winnerAddress.toLowerCase()][0].username;
              winnerDisplay = `@${winnerUsername}`;
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch winner username:', err);
        }
      }

      castText = `🎰 LOTTERY WINNER - Round #${roundId}!

🏆 Congratulations ${winnerDisplay}!
💰 Prize: ${totalPrize} MON${totalShMonPrize > 0 ? ` (${totalMonPrize.toFixed(4)} MON + ${totalShMonPrize.toFixed(4)} shMON)` : ''}
👥 ${participantCount || 0} participants

🎫 Enter the next round at fcempowertours.xyz/lottery

TX: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: lotteryUrl }];
      console.log('📢 Lottery winner cast text:', castText);
    }

    if (!castText) {
      return NextResponse.json(
        { success: false, error: `Unknown cast type: ${type}` },
        { status: 400 }
      );
    }

    // ==================== POST TO FARCASTER ====================
    console.log('📤 Publishing cast with Neynar SDK...');
    const result = await client.publishCast({
      signerUuid: BOT_SIGNER_UUID,
      text: castText,
      embeds: embeds.length > 0 ? embeds : undefined,
    });

    console.log('✅ Cast posted successfully:', {
      hash: result.cast?.hash,
      type,
      tokenId,
    });

    return NextResponse.json({
      success: true,
      castHash: result.cast?.hash,
      type,
      tokenId,
    });

  } catch (error: any) {
    console.error('❌ [CAST] Error:', error.message);
    // Don't return error status - casting failures shouldn't block mints
    return NextResponse.json({
      success: false,
      error: error.message,
      message: 'Cast posting failed but mint succeeded'
    }, { status: 200 }); // Return 200 so client doesn't treat it as a failure
  }
}
