import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { GoogleGenAI } from '@google/genai';
import { encodeFunctionData, type Address, type Hex } from 'viem';
import { sendUserSafeTransaction } from '@/lib/user-safe';
import { publicClient } from '@/lib/pimlico-safe-aa';
import MusicNFTABI from '@/lib/abis/MusicNFT.json';
import PassportNFTABI from '@/lib/abis/PassportNFT.json';
import ItineraryMarketABI from '@/lib/abis/ItineraryMarket.json';
import ItineraryNFTABI from '@/lib/abis/ItineraryNFT.json';
import { checkRateLimit, getClientIP, RateLimiters } from '@/lib/rate-limit';
import { createHmac } from 'crypto';

/**
 * 🔐 FARCASTER WEBHOOK ENDPOINT (SECURED)
 *
 * SECURITY CHANGES:
 * - Verifies Neynar webhook signature
 * - Rate limited
 * - Input sanitization
 */

// Define the Cast interface based on Neynar webhook payload
interface CastData {
  hash: string;
  text: string;
  author: {
    fid: number;
    username: string;
  };
  replies?: {
    to_fid: number;
  };
  [key: string]: any;
}

const config = new Configuration({
  apiKey: process.env.NEXT_PUBLIC_NEYNAR_API_KEY!,
  baseOptions: {
    headers: {
      'x-neynar-experimental': 'true',
    },
  },
});

const neynar = new NeynarAPIClient(config);
const BOT_FID = process.env.BOT_FID!;
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID!;
const EXPLORER_URL = process.env.NEXT_PUBLIC_EXPLORER_URL || 'https://monadscan.com';
const WEBHOOK_SECRET = process.env.NEYNAR_WEBHOOK_SECRET;

// Contract addresses from env vars
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_CONTRACT as Address;
const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as Address;
const ITINERARY_MARKET_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY_MARKET as Address;
const ITINERARY_NFT_ADDRESS = process.env.NEXT_PUBLIC_ITINERARY as Address;

// Lazy AI initialization
let _ai: GoogleGenAI | null = null;

function getAI() {
  if (!_ai) {
    _ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  }
  return _ai;
}

/**
 * SECURITY: Verify Neynar webhook signature
 */
function verifyWebhookSignature(body: string, signature: string | null): boolean {
  if (!WEBHOOK_SECRET) {
    console.warn('[Webhook] NEYNAR_WEBHOOK_SECRET not configured - skipping signature verification');
    // SECURITY: In production, should fail closed
    // For now, allow if not configured but log warning
    return process.env.NODE_ENV !== 'production';
  }

  if (!signature) {
    console.error('[Webhook] Missing signature header');
    return false;
  }

  try {
    const hmac = createHmac('sha512', WEBHOOK_SECRET);
    hmac.update(body);
    const expectedSignature = hmac.digest('hex');

    // Neynar sends signature as hex
    const isValid = signature === expectedSignature;

    if (!isValid) {
      console.error('[Webhook] Invalid signature');
    }

    return isValid;
  } catch (error) {
    console.error('[Webhook] Signature verification error:', error);
    return false;
  }
}

export async function POST(req: NextRequest) {
  try {
    // SECURITY: Rate limit webhook calls
    const ip = getClientIP(req);
    const rateLimit = await checkRateLimit(RateLimiters.webhook, ip);

    if (!rateLimit.allowed) {
      console.warn('[Webhook] Rate limit exceeded from:', ip);
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429 }
      );
    }

    // Get raw body for signature verification
    const rawBody = await req.text();

    // SECURITY: Verify webhook signature from Neynar
    const signature = req.headers.get('x-neynar-signature');

    if (!verifyWebhookSignature(rawBody, signature)) {
      console.error('[Webhook] Signature verification failed');
      return NextResponse.json(
        { error: 'Invalid webhook signature' },
        { status: 401 }
      );
    }

    const body = JSON.parse(rawBody);
    const cast: CastData = body.data;

    // Validate cast data structure
    if (!cast || !cast.author || !cast.hash) {
      console.error('[Webhook] Invalid cast data structure');
      return NextResponse.json(
        { error: 'Invalid payload' },
        { status: 400 }
      );
    }

    if (cast.replies?.to_fid !== Number(BOT_FID)) {
      return NextResponse.json({ ok: true });
    }

    // SECURITY: Sanitize and limit text input
    const text = (cast.text || '')
      .toLowerCase()
      .slice(0, 500); // Limit command length

    const authorFid = cast.author.fid;

    // Validate FID
    if (!authorFid || authorFid <= 0) {
      return NextResponse.json(
        { error: 'Invalid author FID' },
        { status: 400 }
      );
    }

    console.log(`[Webhook] Processing command from FID ${authorFid}: ${text.slice(0, 100)}...`);

    let command = await parseCommand(text, authorFid);

    let txHash: string | null = null;
    switch (command.type) {
      case 'mint_music':
        txHash = await mintNFT('music', authorFid);
        break;
      case 'mint_passport':
        txHash = await mintNFT('passport', authorFid, { countryCode: 'US', countryName: 'United States' });
        break;
      case 'buy_itinerary':
        if (command.id && command.id > 0 && command.id < 1000000) { // Validate ID range
          txHash = await buyItinerary(command.id, authorFid);
          if (txHash) {
            await mintItineraryAfterPurchase(command.id, authorFid, txHash);
          }
        } else {
          await replyCast(cast.hash, 'Invalid itinerary ID');
          return NextResponse.json({ ok: true });
        }
        break;
      case 'view_casts':
        await replyCast(cast.hash, `Your recent casts: [list via Neynar]`);
        return NextResponse.json({ ok: true });
      default:
        await replyCast(cast.hash, 'Unknown command. Try: "mint music", "mint passport", "buy itinerary 1"');
        return NextResponse.json({ ok: true });
    }

    if (txHash) {
      await replyCast(cast.hash, `@${cast.author.username} Executed ${command.type}! Tx: ${txHash}\n${EXPLORER_URL}/tx/${txHash}`);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('[Webhook] Error:', err);
    // SECURITY: Don't expose internal errors
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function parseCommand(text: string, fid: number) {
  if (process.env.USE_GEMINI === 'true') {
    try {
      // SECURITY: Sanitize prompt input
      const sanitizedText = text
        .replace(/[<>{}[\]]/g, '')
        .slice(0, 200);

      const prompt = `Parse Farcaster command: "${sanitizedText}". Return only valid JSON: {"type": "mint_music|mint_passport|buy_itinerary|view_casts|unknown", "id"?: number}`;
      const result = await getAI().models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });
      const responseText = result.text?.trim() || '';
      const parsed = JSON.parse(responseText);
      if (parsed.type !== 'unknown') return parsed;
    } catch (err) {
      console.error('[Webhook] Gemini parsing error:', err);
    }
  }

  // Regex fallback
  if (text.includes('mint music')) {
    return { type: 'mint_music' };
  } else if (text.includes('mint passport')) {
    return { type: 'mint_passport' };
  } else if (text.match(/buy itinerary (\d+)/i)) {
    const id = parseInt(RegExp.$1);
    // Validate ID is reasonable
    if (id > 0 && id < 1000000) {
      return { type: 'buy_itinerary', id };
    }
  } else if (text.includes('view casts')) {
    return { type: 'view_casts' };
  }
  return { type: 'unknown' };
}

async function mintNFT(type: 'music' | 'passport', fid: number, extra?: { countryCode: string; countryName: string }) {
  const userAddress = await getUserAddress(fid);
  let abi: any, address: Address, args: any[] = [userAddress];

  switch (type) {
    case 'music':
      abi = MusicNFTABI;
      address = MUSIC_NFT_ADDRESS;
      break;
    case 'passport':
      abi = PassportNFTABI;
      address = PASSPORT_NFT_ADDRESS;
      args.push(extra?.countryCode, extra?.countryName);
      break;
  }

  const data = encodeFunctionData({
    abi,
    functionName: 'mint',
    args,
  });

  const result = await sendUserSafeTransaction(userAddress, [
    { to: address, value: 0n, data }
  ]);

  return result.txHash;
}

async function buyItinerary(id: number, fid: number) {
  const userAddress = await getUserAddress(fid);

  const data = encodeFunctionData({
    abi: ItineraryMarketABI,
    functionName: 'purchaseItinerary',
    args: [BigInt(id)],
  });

  const result = await sendUserSafeTransaction(userAddress, [
    { to: ITINERARY_MARKET_ADDRESS, value: 0n, data }
  ]);

  return result.txHash;
}

async function mintItineraryAfterPurchase(id: number, fid: number, purchaseTxHash: string) {
  try {
    const listing = await publicClient.readContract({
      address: ITINERARY_MARKET_ADDRESS,
      abi: ItineraryMarketABI,
      functionName: 'itineraries',
      args: [BigInt(id)],
    }) as any;

    const userAddress = await getUserAddress(fid);
    const metadata = {
      destination: listing.description || 'Adventure Destination',
      country: 'US',
      climbingGrade: 'Beginner',
    };
    const tokenUri = `ipfs://itinerary-${id}`;

    const data = encodeFunctionData({
      abi: ItineraryNFTABI,
      functionName: 'mintItinerary',
      args: [userAddress, metadata, tokenUri],
    });

    const result = await sendUserSafeTransaction(userAddress, [
      { to: ITINERARY_NFT_ADDRESS, value: 0n, data }
    ]);

    console.log(`[Webhook] Minted Itinerary NFT after purchase ${purchaseTxHash}: ${result.txHash}`);
  } catch (err) {
    console.error('[Webhook] Error minting itinerary NFT:', err);
  }
}

async function getUserAddress(fid: number): Promise<Address> {
  try {
    const user = await neynar.fetchBulkUsers({ fids: [fid] });
    const userData = user.users[0];
    if (userData?.verified_addresses?.eth_addresses?.[0]) {
      return userData.verified_addresses.eth_addresses[0] as Address;
    }
  } catch (err) {
    console.error('[Webhook] Error fetching user address:', err);
  }
  return process.env.NEYNAR_WALLET_ID! as Address;
}

async function replyCast(parentHash: string, text: string) {
  await neynar.publishCast({
    signerUuid: BOT_SIGNER_UUID,
    text,
    parent: parentHash,
  });
}
