import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWalletClient, http, encodeFunctionData, parseEther, createPublicClient } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';
import TokenSwapABI from '@/lib/abis/TokenSwap.json';
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
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const PIMLICO_BUNDLER_URL = 'https://api.pimlico.io/v1/monad-testnet/rpc';
const PIMLICO_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';
const API_KEY = process.env.PIMLICO_API_KEY!;
const BOT_FID = process.env.BOT_FID!;
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID!;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(PIMLICO_RPC_URL),
});

const walletClient = createWalletClient({
  account: privateKeyToAccount(
    process.env.DEPLOYER_PRIVATE_KEY!.startsWith('0x') 
      ? process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`
      : `0x${process.env.DEPLOYER_PRIVATE_KEY!}` as `0x${string}`
  ),
  chain: monadTestnet,
  transport: http(PIMLICO_RPC_URL),
});

const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA' as `0x${string}`;
const MUSIC_NEXT_PUBLIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_ADDRESS! as `0x${string}`;
const PASSPORT_NEXT_PUBLIC_NFT_ADDRESS = (process.env.NEXT_PUBLIC_PASSPORT || '0x54e935c5f1ec987bb87f36fc046cf13fb393acc8') as `0x${string}`; // NEW PassportNFTv2
const ITINERARY_MARKET_ADDRESS = '0x48a4B5b9F97682a4723eBFd0086C47C70B96478C' as `0x${string}`;
const ITINERARY_NEXT_PUBLIC_NFT_ADDRESS = '0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934' as `0x${string}`;

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
      case 'swap':
        txHash = await executeSwap(command.amount, authorFid);
        break;
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
        await replyCast(cast.hash, 'Unknown command. Try: "swap 0.1 MON for TOURS", "mint music", etc.');
        return NextResponse.json({ ok: true });
    }

    if (txHash) {
      if (command.type === 'swap') {
        try {
          const rate = await publicClient.readContract({
            address: TOKEN_SWAP_ADDRESS,
            abi: TokenSwapABI,
            functionName: 'exchangeRate',
          }) as bigint;
          const toursAmount = (command.amount * Number(rate) / 1e18).toFixed(0);
          const castText = `Swapped ${command.amount} MON for ${toursAmount} $TOURS. Tx: ${txHash}\nhttps://testnet.monadscan.com/tx/${txHash}`;
          await replyCast(cast.hash, castText);
        } catch (err) {
          await replyCast(cast.hash, `Swap executed! Tx: ${txHash}\nhttps://testnet.monadscan.com/tx/${txHash}`);
        }
      } else {
        await replyCast(cast.hash, `@${cast.author.username} Executed ${command.type}! Tx: ${txHash}\nhttps://testnet.monadscan.com/tx/${txHash}`);
      }
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
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const prompt = `Parse Farcaster command: "${text}". Return only valid JSON: {"type": "swap|mint_music|mint_passport|buy_itinerary|view_casts|unknown", "amount"?: number, "id"?: number}`;
      const result = await model.generateContent(prompt);
      const responseText = result.response.text().trim();
      const parsed = JSON.parse(responseText);
      if (parsed.type !== 'unknown') return parsed;
    } catch (err) {
      console.error('Gemini parsing error:', err);
    }
  }
  
  // Regex fallback
  if (text.includes('swap')) {
    const match = text.match(/swap ([\d.]+) mon/i);
    return { type: 'swap', amount: parseFloat(match?.[1] || '0.1') };
  } else if (text.includes('mint music')) {
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

async function executeSwap(amount: number, fid: number) {
  const userAddress = await getUserAddress(fid);
  const monValue = parseEther(amount.toString());
  
  // Send transaction directly using wallet client
  const hash = await walletClient.writeContract({
    address: TOKEN_SWAP_ADDRESS,
    abi: TokenSwapABI,
    functionName: 'swap',
    args: [monValue],
    value: monValue,
  });
  
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function mintNFT(type: 'music' | 'passport', fid: number, extra?: { countryCode: string; countryName: string }) {
  const userAddress = await getUserAddress(fid);
  let abi, address: `0x${string}`, args: any[] = [userAddress];
  
  switch (type) {
    case 'music':
      abi = MusicNFTABI;
      address = MUSIC_NEXT_PUBLIC_NFT_ADDRESS;
      break;
    case 'passport':
      abi = PassportNFTABI;
      address = PASSPORT_NEXT_PUBLIC_NFT_ADDRESS;
      args.push(extra?.countryCode, extra?.countryName);
      break;
  }
  
  const hash = await walletClient.writeContract({
    address,
    abi,
    functionName: 'mint',
    args,
  });
  
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

async function buyItinerary(id: number, fid: number) {
  const userAddress = await getUserAddress(fid);
  
  const hash = await walletClient.writeContract({
    address: ITINERARY_MARKET_ADDRESS,
    abi: ItineraryMarketABI,
    functionName: 'purchaseItinerary',
    args: [BigInt(id)],
  });
  
  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
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
    
    const hash = await walletClient.writeContract({
      address: ITINERARY_NEXT_PUBLIC_NFT_ADDRESS,
      abi: ItineraryNFTABI,
      functionName: 'mintItinerary',
      args: [userAddress, metadata, tokenUri],
    });
    
    await publicClient.waitForTransactionReceipt({ hash });
    console.log(`Minted Itinerary NFT after purchase ${purchaseTxHash}: ${hash}`);
  } catch (err) {
    console.error('Error minting itinerary NFT:', err);
  }
}

async function getUserAddress(fid: number): Promise<`0x${string}`> {
  try {
    const user = await neynar.fetchBulkUsers({ fids: [fid] });
    const userData = user.users[0];
    if (userData?.verified_addresses?.eth_addresses?.[0]) {
      return userData.verified_addresses.eth_addresses[0] as `0x${string}`;
    }
  } catch (err) {
    console.error('Error fetching user address:', err);
  }
  return process.env.NEYNAR_WALLET_ID! as `0x${string}`;
}

async function replyCast(parentHash: string, text: string) {
  await neynar.publishCast({
    signerUuid: BOT_SIGNER_UUID,
    text,
    parent: parentHash,
  });
}
