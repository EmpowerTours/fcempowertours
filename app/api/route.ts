import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient, Cast } from '@neynar/nodejs-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWalletClient, http, encodeFunctionData, parseEther } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';
import TokenSwapABI from '@/lib/abis/TokenSwap.json'; // Add this ABI file if missing
import MusicNFTABI from '@/lib/abis/MusicNFT.json';
import PassportNFTABI from '@/lib/abis/PassportNFT.json';
import ItineraryABI from '@/lib/abis/Itinerary.json'; // Assume exists; add if missing

const neynar = new NeynarAPIClient(process.env.NEXT_PUBLIC_NEYNAR_API_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const PIMLICO_URL = 'https://api.pimlico.io/v1/monad/10143/api/v2';
const API_KEY = process.env.PIMLICO_API_KEY!;
const BOT_FID = process.env.BOT_FID!;

const walletClient = createWalletClient({
  account: privateKeyToAccount(`0x${process.env.DEPLOYER_PRIVATE_KEY}`!), // Bot signer
  chain: monadTestnet,
  transport: http(),
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const cast: Cast = body.data; // Neynar webhook payload
    if (cast.replies?.to_fid !== Number(BOT_FID)) return NextResponse.json({ ok: true });

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
        // Assume country from IP or prompt; simplify to default
        txHash = await mintNFT('passport', cast.fid, { countryCode: 'US', countryName: 'United States' });
        break;
      case 'buy_itinerary':
        txHash = await buyItinerary(command.id!, cast.fid);
        break;
      case 'view_casts':
        // No tx, just reply with casts
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
    return NextResponse.json({ error: err.message }, { status: 500 });
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
    nonce: await walletClient.getTransactionCount({ blockTag: 'pending' }),
    initCode: '0x',
    callData,
    callGasLimit: 500000n,
    verificationGasLimit: 150000n,
    preVerificationGas: 21000n,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: '0x',
    signature: '0x', // Sign with bot private key; expand for prod
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
  const userAddress = await getUserAddress(fid); // Implement via Neynar fetchUser(fid)
  const callData = encodeFunctionData({
    abi: TokenSwapABI,
    functionName: 'swap',
    args: [parseEther(amount.toString())],
  });
  const txHash = await executeUserOp(callData);
  // Send value via paymaster or separate tx
  return txHash;
}

async function mintNFT(type: 'music' | 'passport' | 'itinerary', fid: number, extra?: { countryCode: string; countryName: string }) {
  const userAddress = await getUserAddress(fid);
  let abi, address, args: any[] = [userAddress];
  switch (type) {
    case 'music': abi = MusicNFTABI; address = process.env.MUSICNFT_ADDRESS!; break;
    case 'passport': 
      abi = PassportNFTABI; 
      address = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4'; 
      args.push(extra?.countryCode, extra?.countryName);
      break;
    case 'itinerary': abi = ItineraryABI; address = '0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934'; args.push(1); // e.g., ID 1
  }
  const callData = encodeFunctionData({ abi, functionName: 'mint', args });
  return await executeUserOp(callData);
}

async function buyItinerary(id: number, fid: number) {
  // Similar to mint, call market/buy on Itinerary contract
  const userAddress = await getUserAddress(fid);
  const callData = encodeFunctionData({
    abi: ItineraryABI,
    functionName: 'buy',
    args: [BigInt(id)],
  });
  return await executeUserOp(callData);
}

async function getUserAddress(fid: number): Promise<`0x${string}`> {
  // Fetch via Neynar: neynar.fetchUser(fid).wallet.address or derive
  return process.env.NEYNAR_WALLET_ID! as `0x${string}`; // Placeholder
}

async function replyCast(parentHash: string, text: string) {
  await neynar.publishCast({
    fid: Number(BOT_FID),
    text,
    replyTo: parentHash,
  });
}
