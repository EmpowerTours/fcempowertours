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

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cast: CastData = body.data;

    if (cast.replies?.to_fid !== Number(BOT_FID)) {
      return NextResponse.json({ ok: true });
    }

    const text = cast.text.toLowerCase();
    const authorFid = cast.author.fid;
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
        txHash = await buyItinerary(command.id!, authorFid);
        if (txHash) {
          await mintItineraryAfterPurchase(command.id!, authorFid, txHash);
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
    console.error('Bot webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

async function parseCommand(text: string, fid: number) {
  if (process.env.USE_GEMINI === 'true') {
    try {
      const prompt = `Parse Farcaster command: "${text}". Return only valid JSON: {"type": "mint_music|mint_passport|buy_itinerary|view_casts|unknown", "id"?: number}`;
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
      console.error('Gemini parsing error:', err);
    }
  }

  // Regex fallback
  if (text.includes('mint music')) {
    return { type: 'mint_music' };
  } else if (text.includes('mint passport')) {
    return { type: 'mint_passport' };
  } else if (text.match(/buy itinerary (\d+)/i)) {
    return { type: 'buy_itinerary', id: parseInt(RegExp.$1) };
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

    console.log(`Minted Itinerary NFT after purchase ${purchaseTxHash}: ${result.txHash}`);
  } catch (err) {
    console.error('Error minting itinerary NFT:', err);
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
    console.error('Error fetching user address:', err);
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
