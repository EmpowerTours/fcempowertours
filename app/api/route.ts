import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient, Configuration } from '@neynar/nodejs-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWalletClient, createPublicClient, http, encodeFunctionData, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { monadTestnet } from '@/app/chains';
import TokenSwapABI from '@/lib/abis/TokenSwap.json';
import MusicNFTABI from '@/lib/abis/MusicNFT.json';
import PassportNFTABI from '@/lib/abis/PassportNFT.json';
import ItineraryABI from '@/lib/abis/Itinerary.json';

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
const PIMLICO_URL = 'https://api.pimlico.io/v1/monad/10143/api/v2';
const API_KEY = process.env.PIMLICO_API_KEY!;
const BOT_FID = Number(process.env.BOT_FID!);
const BOT_SIGNER_UUID = process.env.BOT_SIGNER_UUID!;

const walletClient = createWalletClient({
  account: privateKeyToAccount(
    process.env.DEPLOYER_PRIVATE_KEY!.startsWith('0x') 
      ? process.env.DEPLOYER_PRIVATE_KEY! as `0x${string}`
      : `0x${process.env.DEPLOYER_PRIVATE_KEY!}` as `0x${string}`
  ),
  chain: monadTestnet,
  transport: http(),
});

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cast = body.data;
    if (cast.replies?.to_fid !== BOT_FID) return NextResponse.json({ ok: true });

    const text = cast.text.toLowerCase();
    let command = await parseCommand(text, cast.fid);

    let txHash: string | null = null;
    switch (command.type) {
      case 'swap':
        txHash = await executeSwap(command.amount, cast.fid);
        break;
      case 'mint_music':
        txHash = await mintNFT('music', cast.fid);
        break;
      case 'mint_passport':
        txHash = await mintNFT('passport', cast.fid, { countryCode: 'US', countryName: 'United States' });
        break;
      case 'buy_itinerary':
        txHash = await buyItinerary(command.id!, cast.fid);
        break;
      case 'view_casts':
        await replyCast(cast.hash, `Your recent casts: [list via Neynar]`);
        return NextResponse.json({ ok: true });
      default:
        await replyCast(cast.hash, 'Unknown command. Try: "swap 0.1 MON for TOURS", "mint music", etc.');
        return NextResponse.json({ ok: true });
    }

    if (txHash) {
      await replyCast(cast.hash, `@${cast.fid} Executed ${command.type}! Tx: ${txHash} https://testnet.monadscan.com/tx/${txHash}`);
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error('Bot webhook error:', err);
    return NextResponse.json({ error: String(err.message || err) }, { status: 500 });
  }
}

async function parseCommand(text: string, fid: number) {
  if (process.env.USE_GEMINI === 'true') {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const prompt = `Parse Farcaster command: "${text}". JSON: {"type": "swap|mint_music|mint_passport|buy_itinerary|view_casts|unknown", "amount"?: number, "id"?: number}`;
    const result = await model.generateContent(prompt);
    try {
      const parsed = JSON.parse(result.response.text().trim());
      if (parsed.type !== 'unknown') return parsed;
    } catch {}
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

async function executeUserOp(callData: string) {
  const userOp = {
    sender: process.env.NEYNAR_WALLET_ID! as `0x${string}`,
    nonce: await publicClient.getTransactionCount({ 
      address: process.env.NEYNAR_WALLET_ID! as `0x${string}`,
      blockTag: 'pending' 
    }),
    initCode: '0x',
    callData,
    callGasLimit: 500000n,
    verificationGasLimit: 150000n,
    preVerificationGas: 21000n,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: '0x',
    signature: '0x',
  };

  // Simulate
  const simRes = await fetch(`${PIMLICO_URL}/bundler/simulateUserOperation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userOp, entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' }),
  }).then(r => r.json());
  if (!simRes.success) throw new Error('Simulation failed');

  // Send
  const bundleRes = await fetch(`${PIMLICO_URL}/bundler/sendUserOperation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ userOp, entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032' }),
  }).then(r => r.json());
  return bundleRes.userOpHash;
}

async function executeSwap(amount: number, fid: number) {
  const userAddress = await getUserAddress(fid);
  const callData = encodeFunctionData({
    abi: TokenSwapABI,
    functionName: 'swap',
    args: [parseEther(amount.toString())],
  });
  const txHash = await executeUserOp(callData);
  return txHash;
}

async function mintNFT(type: 'music' | 'passport' | 'itinerary', fid: number, extra?: { countryCode: string; countryName: string }) {
  const userAddress = await getUserAddress(fid);
  let abi, address, args: any[] = [userAddress];
  switch (type) {
    case 'music': 
      abi = MusicNFTABI; 
      address = process.env.MUSICNFT_ADDRESS!; 
      break;
    case 'passport':
      abi = PassportNFTABI;
      address = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4';
      args.push(extra?.countryCode, extra?.countryName);
      break;
    case 'itinerary': 
      abi = ItineraryABI; 
      address = '0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934'; 
      args.push(1);
      break;
  }
  const callData = encodeFunctionData({ abi, functionName: 'mint', args });
  return await executeUserOp(callData);
}

async function buyItinerary(id: number, fid: number) {
  const userAddress = await getUserAddress(fid);
  const callData = encodeFunctionData({
    abi: ItineraryABI,
    functionName: 'buy',
    args: [BigInt(id)],
  });
  return await executeUserOp(callData);
}

async function getUserAddress(fid: number): Promise<`0x${string}`> {
  return process.env.NEYNAR_WALLET_ID! as `0x${string}`;
}

async function replyCast(parentHash: string, text: string) {
  await neynar.publishCast({
    signerUuid: BOT_SIGNER_UUID,
    text,
    parent: parentHash,
  });
}
