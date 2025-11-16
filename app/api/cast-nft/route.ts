import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID || '';

export async function POST(req: NextRequest) {
  try {
    const {
      type,           // 'passport' | 'music_mint' | 'music_purchase' | 'stake_tours'
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
      const castUrl = `${APP_URL}/passport?tokenId=${tokenId}`;
      castText = `🎫 New EmpowerTours Passport Minted!

${countryCode} ${countryName}

Token #${tokenId}

View: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: castUrl }];
      console.log('📢 Passport cast text:', castText);
    }

    // ==================== MUSIC MINT CAST ====================
    else if (type === 'music_mint') {
      const musicUrl = `${APP_URL}/music?tokenId=${tokenId}`;
      castText = `🎵 New Music Master NFT Minted!

"${songTitle || 'Untitled'}" - Token #${tokenId}
💰 License Price: ${price || '1'} TOURS

⚡ Gasless minting powered by @empowertours
🎶 Purchase license to stream full track

View: https://testnet.monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: musicUrl }];
      console.log('📢 Music mint cast text:', castText);
    }

    // ==================== MUSIC PURCHASE CAST ====================
    else if (type === 'music_purchase') {
      castText = `🎶 Just Purchased a Music License on @empowertours!

Now I can stream "${songTitle || 'Untitled'}" 🎵

TX: https://testnet.monadscan.com/tx/${txHash}

Gasless - they paid the gas! 🚀

@empowertours`;

      console.log('📢 Music purchase cast text:', castText);
    }

    // ==================== STAKING CAST ====================
    else if (type === 'stake_tours') {
      const stakingUrl = `${APP_URL}/passport-staking`;

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
