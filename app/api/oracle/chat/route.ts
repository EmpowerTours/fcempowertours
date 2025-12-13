import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createWalletClient, http, parseEther, createPublicClient } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';

const PIMLICO_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://testnet-rpc.monad.xyz';

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

interface OracleAction {
  type: 'navigate' | 'execute' | 'game' | 'chat' | 'unknown';
  destination?: string; // Page to navigate to
  game?: 'TETRIS' | 'TICTACTOE' | 'MIRROR';
  transaction?: {
    contract: string;
    function: string;
    args: any[];
  };
  message?: string;
}

export async function POST(req: NextRequest) {
  try {
    const { message, userAddress, userFid } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Create fresh client instance for each request with API key
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

    // Use current model (gemini-pro is deprecated)
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const systemPrompt = `
You are the EmpowerTours Global Guide Oracle AI. You help travelers with blockchain-powered travel experiences.

Available Actions:
1. NAVIGATE - Direct users to specific pages
   - /passport - View/mint travel passports
   - /discover - Browse experiences
   - /market - NFT marketplace
   - /lottery - Daily lottery
   - /beat-match - Music rhythm game
   - /country-collector - Country collection game
   - /mirror-mate - Travel guide matching
   - /swap - Token swaps
   - /staking - Stake tokens

2. GAMES - Launch interactive games
   - TETRIS - Classic block game
   - TICTACTOE - Tic tac toe
   - MIRROR - MirrorMate travel guide matching

3. EXECUTE - Execute blockchain transactions via delegation
   - swap_tokens(amount, from, to)
   - mint_nft(type, metadata)
   - buy_item(contract, tokenId)
   - transfer(to, amount)

4. CHAT - Conversational response with travel advice

Parse this user message: "${message}"

Return ONLY valid JSON with this structure:
{
  "type": "navigate|execute|game|chat",
  "destination": "/page-path" (if navigate),
  "game": "TETRIS|TICTACTOE|MIRROR" (if game),
  "transaction": {"contract": "address", "function": "name", "args": []} (if execute),
  "message": "Response to user"
}
`;

    const result = await model.generateContent(systemPrompt);
    const responseText = result.response.text().trim();

    // Clean JSON from markdown
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse AI response');
    }

    const action: OracleAction = JSON.parse(jsonMatch[0]);

    // Execute action
    let txHash: string | null = null;

    if (action.type === 'execute' && action.transaction) {
      // Execute delegated transaction
      txHash = await executeDelegatedTransaction(
        action.transaction,
        userAddress,
        userFid
      );
    }

    return NextResponse.json({
      success: true,
      action,
      txHash,
      explorer: txHash ? `https://testnet.monadscan.com/tx/${txHash}` : null,
    });

  } catch (error: any) {
    console.error('Oracle chat error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Oracle error',
      },
      { status: 500 }
    );
  }
}

async function executeDelegatedTransaction(
  transaction: { contract: string; function: string; args: any[] },
  beneficiary: string,
  userFid: number
): Promise<string> {
  // Load contract ABI based on contract address
  const { default: abi } = await import(`@/lib/abis/${getAbiName(transaction.contract)}.json`);

  const hash = await walletClient.writeContract({
    address: transaction.contract as `0x${string}`,
    abi,
    functionName: transaction.function,
    args: transaction.args,
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

function getAbiName(contractAddress: string): string {
  // Map contract addresses to ABI names
  const contracts: Record<string, string> = {
    [process.env.NEXT_PUBLIC_TOKEN_SWAP || '']: 'TokenSwap',
    [process.env.NEXT_PUBLIC_NFT_ADDRESS || '']: 'MusicNFT',
    [process.env.NEXT_PUBLIC_PASSPORT_NFT_V2 || '']: 'PassportNFT',
    [process.env.NEXT_PUBLIC_MIRRORMATE_ADDRESS || '']: 'MirrorMate',
  };

  return contracts[contractAddress] || 'ERC20';
}
