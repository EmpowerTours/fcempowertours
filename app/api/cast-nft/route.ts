import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient } from "@neynar/nodejs-sdk";

const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const NEYNAR_API_KEY = (process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY) || '';
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID || '';

export async function POST(req: NextRequest) {
  try {
    const {
      type,           // 'passport' | 'music_mint' | 'music_purchase' | 'play_recorded' | 'top_artist' | 'radio_skip_random' | 'voice_note'
      fid,            // Farcaster ID
      tokenId,        // NFT token ID
      txHash,         // Transaction hash
      countryCode,    // For passport
      countryName,    // For passport
      songTitle,      // For music
      price,          // For music
      _artist,         // For music purchase
      // Experience fields removed with their branches: the itinerary feature
      // has no handler and no caller ever sent an experience_* cast type.
      // Play recording / Top artist fields
      params,         // Additional params object for play_recorded and top_artist
      // Radio skip random fields
      _userAddress,    // User's wallet address
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

View: https://monadscan.com/tx/${txHash}

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

View: https://monadscan.com/tx/${txHash}

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

TX: https://monadscan.com/tx/${txHash}

Gasless - they paid the gas! 🚀

@empowertours`;

      embeds = [{ url: buyerProfileUrl }];
      console.log('📢 Music purchase cast text:', castText);
    }

    // ==================== EXPERIENCE CREATED CAST ====================
    // The experience_created and experience_purchased branches were removed on
    // 2026-09-01. Experiences are the itinerary feature, which has no handler,
    // and no caller ever sent either type — record-play, live-radio and
    // execute-delegated only send play_recorded, radio_skip_random and
    // voice_note. The created branch also promised "Earn rewards for
    // completing", which nothing in the app does.
    else if (type === 'play_recorded') {
      const { songName, artistName, duration, artistFid } = params || {};
      // Frame URL that opens mini app (not browser) when tapped in Warpcast
      const discoverUrl = `${APP_URL}/api/frames/discover`;

      // Get listener username
      let listenerDisplay = 'Someone';
      if (fid && NEYNAR_API_KEY) {
        try {
          const userResponse = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData.users && userData.users.length > 0) {
              listenerDisplay = `@${userData.users[0].username}`;
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch listener username:', err);
        }
      }

      // Get artist username if FID provided
      let artistDisplay = artistName || 'Unknown Artist';
      if (artistFid && NEYNAR_API_KEY) {
        try {
          const artistResponse = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${artistFid}`, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          if (artistResponse.ok) {
            const artistData = await artistResponse.json();
            if (artistData.users && artistData.users.length > 0) {
              artistDisplay = `@${artistData.users[0].username}`;
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch artist username:', err);
        }
      }

      const durationMins = Math.floor((duration || 0) / 60);
      const durationSecs = (duration || 0) % 60;
      const durationStr = durationMins > 0 ? `${durationMins}m ${durationSecs}s` : `${durationSecs}s`;

      castText = `🎵 ${listenerDisplay} just streamed on @empowertours!

"${songName || 'Untitled'}" by ${artistDisplay}
⏱️ ${durationStr} listened

🎶 Artists earn 70% of subscription revenue
📈 Each play counts towards artist payouts

@empowertours`;

      embeds = [{ url: discoverUrl }];
      console.log('📢 Play recorded cast text:', castText);
    }

    // ==================== VOICE NOTE CAST ====================
    else if (type === 'voice_note') {
      const { noteType, duration: noteDuration } = params || {};
      // Frame URL that opens mini app (not browser) when tapped in Warpcast
      const radioUrl = `${APP_URL}/api/frames/radio?action=voice_note`;

      // Get submitter username from FID
      let submitterDisplay = 'Someone';
      if (fid && NEYNAR_API_KEY) {
        try {
          const userResponse = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData.users && userData.users.length > 0) {
              submitterDisplay = `@${userData.users[0].username}`;
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch submitter username:', err);
        }
      }

      const isAd = noteType === 'ad';
      const priceDisplay = isAd ? '2 WMON' : '0.5 WMON';
      const typeEmoji = isAd ? '📢' : '🎤';
      const typeLabel = isAd ? 'Voice Ad (30s)' : 'Voice Shoutout';

      castText = `${typeEmoji} ${submitterDisplay} submitted a ${typeLabel} on @empowertours Live Radio!

💰 Paid: ${priceDisplay}
⏱️ Duration: ${noteDuration || (isAd ? 30 : 5)}s

🎵 Tune in to hear it play between songs!

TX: https://monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: radioUrl }];
      console.log('📢 Voice note cast text:', castText);
    }

    // ==================== TOP ARTIST CAST (Weekly/Daily Highlight) ====================
    else if (type === 'top_artist') {
      const { artistName, artistFid: topArtistFid, playCount, songCount, totalEarnings } = params || {};
      // Frame URL that opens mini app (not browser) when tapped in Warpcast
      const discoverUrl = `${APP_URL}/api/frames/discover`;

      // Get artist username if FID provided
      let artistDisplay = artistName || 'Unknown Artist';
      if (topArtistFid && NEYNAR_API_KEY) {
        try {
          const artistResponse = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${topArtistFid}`, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          if (artistResponse.ok) {
            const artistData = await artistResponse.json();
            if (artistData.users && artistData.users.length > 0) {
              artistDisplay = `@${artistData.users[0].username}`;
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch top artist username:', err);
        }
      }

      castText = `🔥 TRENDING ARTIST on @empowertours!

${artistDisplay} is making waves!
📊 ${playCount || 0} streams
🎵 ${songCount || 0} songs
💰 ${totalEarnings || '0'} WMON earned

🎶 Support independent artists - stream their music!

@empowertours`;

      embeds = [{ url: discoverUrl }];
      console.log('📢 Top artist cast text:', castText);
    }

    // ==================== RADIO SKIP TO RANDOM CAST ====================
    else if (type === 'radio_skip_random') {
      // Frame URL that opens mini app (not browser) when tapped in Warpcast
      const radioUrl = `${APP_URL}/api/frames/radio?action=skip_random`;

      // Get user's Farcaster username from FID
      let userDisplay = 'Someone';
      if (fid && NEYNAR_API_KEY) {
        try {
          const userResponse = await fetch(`https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`, {
            headers: { 'api_key': NEYNAR_API_KEY }
          });
          if (userResponse.ok) {
            const userData = await userResponse.json();
            if (userData.users && userData.users.length > 0) {
              userDisplay = `@${userData.users[0].username}`;
            }
          }
        } catch (err) {
          console.log('⚠️ Could not fetch user username:', err);
        }
      }

      castText = `🎲 ${userDisplay} just used Skip to Random on @empowertours Live Radio!

⚡ Powered by Pyth Entropy - Provably Fair Randomness
💰 Cost: 1 MON
🎵 Next song selected by verifiable on-chain randomness!

🎧 Tap to tune in!

TX: https://monadscan.com/tx/${txHash}

@empowertours`;

      embeds = [{ url: radioUrl }];
      console.log('📢 Radio skip random cast text:', castText);
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
