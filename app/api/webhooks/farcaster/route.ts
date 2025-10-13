import { NextRequest, NextResponse } from 'next/server';
import { NeynarAPIClient, Cast } from '@neynar/nodejs-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWalletClient, http, encodeFunctionData, parseEther, createPublicClient } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount, parseAbiItem } from 'viem/accounts';
import TokenSwapABI from '@/lib/abis/TokenSwap.json';
import MusicNFTABI from '@/lib/abis/MusicNFT.json';
import PassportNFTABI from '@/lib/abis/PassportNFT.json';
import ItineraryMarketABI from '@/lib/abis/ItineraryMarket.json'; // For purchasing
import ItineraryNFTABI from '@/lib/abis/ItineraryNFT.json'; // For minting after purchase

const neynar = new NeynarAPIClient(process.env.NEXT_PUBLIC_NEYNAR_API_KEY!);
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const PIMLICO_BUNDLER_URL = 'https://api.pimlico.io/v1/monad/10143/api/v2';
const PIMLICO_RPC_URL = 'https://api.pimlico.io/v2/10143/rpc?apikey=pim_H5mQxH2vk7s2J83BhPJnt8';
const API_KEY = process.env.PIMLICO_API_KEY!;
const BOT_FID = process.env.BOT_FID!;

const publicClient = createPublicClient({
  chain: monadTestnet,
  transport: http(PIMLICO_RPC_URL),
});

const walletClient = createWalletClient({
  account: privateKeyToAccount(`0x${process.env.DEPLOYER_PRIVATE_KEY}`!), // Bot signer
  chain: monadTestnet,
  transport: http(PIMLICO_RPC_URL),
});

const TOKEN_SWAP_ADDRESS = '0xe004F2eaCd0AD74E14085929337875b20975F0AA' as `0x${string}`;
const MUSIC_NFT_ADDRESS = process.env.MUSICNFT_ADDRESS! as `0x${string}`;
const PASSPORT_NFT_ADDRESS = '0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4' as `0x${string}`;
const ITINERARY_MARKET_ADDRESS = '0x48a4B5b9F97682a4723eBFd0086C47C70B96478C' as `0x${string}`;
const ITINERARY_NFT_ADDRESS = '0x382072Abe7Eb9f72c08b1BDB252FE320F0d00934' as `0x${string}`;

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
        // Optionally mint NFT after purchase
        if (txHash) {
          await mintItineraryAfterPurchase(command.id!, cast.fid, txHash);
        }
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
      // Publish tx confirmation cast
      if (command.type === 'swap') {
        const rate = await publicClient.readContract({
          address: TOKEN_SWAP_ADDRESS,
          abi: TokenSwapABI,
          functionName: 'exchangeRate',
        }) as bigint;
        const toursAmount = (command.amount * Number(rate) / 1e18).toFixed(0);
        const castText = `Swapped ${command.amount} MON for ${toursAmount} $TOURS. Tx: ${txHash} https://testnet.monadscan.com/tx/${txHash}`;
        await replyCast(cast.hash, castText);
      } else {
        await replyCast(cast.hash, `@${cast.fid} Executed ${command.type}! Tx: ${txHash} https://testnet.monadscan.com/tx/${txHash}`);
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

async function executeUserOp(callData: string, value?: bigint) {
  const nonce = await publicClient.getTransactionCount({
    address: process.env.NEYNAR_WALLET_ID! as `0x${string}`,
    blockTag: 'pending',
  });

  const userOp = {
    sender: process.env.NEYNAR_WALLET_ID! as `0x${string}`,
    nonce,
    initCode: '0x',
    callData,
    callGasLimit: 500000n,
    verificationGasLimit: 150000n,
    preVerificationGas: 21000n,
    maxFeePerGas: 1000000000n,
    maxPriorityFeePerGas: 1000000000n,
    paymasterAndData: '0x',
    signature: await walletClient.signTypedData({
      account: walletClient.account!,
      domain: { /* ERC-4337 domain for signature */ },
      types: { /* UserOp type */ },
      primaryType: 'UserOperation',
      message: { /* UserOp hash */ },
    }) as `0x${string}`, // Simplified; use proper ERC-4337 signing in prod
  };

  // Simulate
  const simRes = await fetch(`${PIMLICO_BUNDLER_URL}/bundler/simulateUserOperation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userOp,
      entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
    }),
  }).then(r => r.json());
  if (!simRes.success) throw new Error(`Simulation failed: ${simRes.error}`);

  // Send
  const bundleRes = await fetch(`${PIMLICO_BUNDLER_URL}/bundler/sendUserOperation`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userOp,
      entryPoint: '0x0000000071727De22E5E9d8BAf0edAc6f37da032'
    }),
  }).then(r => r.json());
  const userOpHash = bundleRes.userOpHash;
  // Wait for inclusion
  const receipt = await publicClient.waitForTransactionReceipt({ hash: parseAbiItem(bundleRes.receipt?.transactionHash || userOpHash) });
  return receipt.transactionHash;
}

async function executeSwap(amount: number, fid: number) {
  const userAddress = await getUserAddress(fid);
  const monValue = parseEther(amount.toString());
  const callData = encodeFunctionData({
    abi: TokenSwapABI,
    functionName: 'swap',
    args: [monValue],
  });
  return await executeUserOp(callData, monValue);
}

async function mintNFT(type: 'music' | 'passport', fid: number, extra?: { countryCode: string; countryName: string }) {
  const userAddress = await getUserAddress(fid);
  let abi, address: `0x${string}`, args: any[] = [userAddress];
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
  const callData = encodeFunctionData({ abi, functionName: 'mint', args });
  return await executeUserOp(callData);
}

async function buyItinerary(id: number, fid: number) {
  const userAddress = await getUserAddress(fid);
  // Approve TOURS if needed (assume pre-approved or handle separately)
  const callData = encodeFunctionData({
    abi: ItineraryMarketABI,
    functionName: 'purchaseItinerary',
    args: [BigInt(id)],
  });
  return await executeUserOp(callData);
}

async function mintItineraryAfterPurchase(id: number, fid: number, purchaseTxHash: string) {
  // Fetch listing details for metadata
  const listing = await publicClient.readContract({
    address: ITINERARY_MARKET_ADDRESS,
    abi: ItineraryMarketABI,
    functionName: 'itineraries',
    args: [BigInt(id)],
  });
  const userAddress = await getUserAddress(fid);
  const metadata = {
    destination: listing.description as string, // Map description to destination
    country: 'US', // Default or from IP
    climbingGrade: 'Beginner', // Default; enhance with prompt
  };
  const tokenUri = `ipfs://your-generated-uri`; // Generate via Pinata API
  const callData = encodeFunctionData({
    abi: ItineraryNFTABI,
    functionName: 'mintItinerary',
    args: [userAddress, metadata, tokenUri],
  });
  const mintTxHash = await executeUserOp(callData);
  console.log(`Minted Itinerary NFT after purchase ${purchaseTxHash}: ${mintTxHash}`);
}

async function getUserAddress(fid: number): Promise<`0x${string}`> {
  try {
    const user = await neynar.fetchUser(fid);
    return user.result.verified_wallet.address as `0x${string}`; // Use verified wallet
  } catch {
    return process.env.NEYNAR_WALLET_ID! as `0x${string}`; // Fallback
  }
}

async function replyCast(parentHash: string, text: string) {
  await neynar.publishCast({
    fid: Number(BOT_FID),
    text,
    replyTo: parentHash,
  });
}
