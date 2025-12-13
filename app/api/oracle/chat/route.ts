import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
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

    // Create GoogleGenAI instance with correct SDK
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!
    });

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

You MUST return ONLY valid JSON matching the specified schema.
`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            type: {
              type: Type.STRING,
              enum: ['navigate', 'execute', 'game', 'chat'],
              description: 'The type of action to perform'
            },
            destination: {
              type: Type.STRING,
              description: 'Page path if type is navigate'
            },
            game: {
              type: Type.STRING,
              enum: ['TETRIS', 'TICTACTOE', 'MIRROR'],
              description: 'Game type if type is game'
            },
            transaction: {
              type: Type.OBJECT,
              properties: {
                contract: { type: Type.STRING },
                function: { type: Type.STRING },
                args: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                }
              },
              description: 'Transaction details if type is execute'
            },
            message: {
              type: Type.STRING,
              description: 'Response message to user'
            }
          },
          required: ['type', 'message'],
          propertyOrdering: ['type', 'message', 'destination', 'game', 'transaction']
        },
        thinkingConfig: {
          thinkingBudget: 0 // Disable thinking for speed
        }
      }
    });

    const responseText = response.text;

    // Parse JSON response
    let action: OracleAction;
    try {
      action = JSON.parse(responseText);
    } catch (parseError) {
      console.error('Failed to parse AI response:', responseText);
      throw new Error('Invalid JSON response from AI');
    }

    // Validate required fields
    if (!action.type || !action.message) {
      throw new Error('Invalid response structure from AI');
    }

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
