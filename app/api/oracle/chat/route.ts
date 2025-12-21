import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createWalletClient, http, parseEther, createPublicClient, decodeEventLog } from 'viem';
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
  type: 'navigate' | 'execute' | 'game' | 'chat' | 'concierge' | 'create_nft' | 'unknown';
  destination?: string; // Page to navigate to
  game?: 'TETRIS' | 'TICTACTOE' | 'MIRROR';
  transaction?: {
    contract: string;
    function: string;
    args: any[];
  };
  message?: string;
  requiresMapsGrounding?: boolean; // Whether this query needs Google Maps data
  estimatedCost?: string; // Cost in MON tokens
  concierge?: {
    serviceType: string; // TAXI, RESTAURANT_RESERVATION, ACTIVITY_BOOKING, etc.
    details: string;
    suggestedPrice: string; // in MON
  };
}

interface MapsGroundingSource {
  uri: string;
  title: string;
  placeId?: string;
}

// Detect user's country from IP or location
async function detectUserTerritory(req: NextRequest): Promise<string | null> {
  try {
    // Try IPInfo API for country detection
    const ipInfoToken = process.env.IPINFO_TOKEN;
    if (!ipInfoToken) {
      console.log('[Oracle] IPInfo token not configured, skipping territory check');
      return null;
    }

    // Get client IP from request headers
    const forwardedFor = req.headers.get('x-forwarded-for');
    const realIp = req.headers.get('x-real-ip');
    const ip = forwardedFor?.split(',')[0] || realIp || null;

    if (!ip) {
      console.log('[Oracle] Could not detect client IP');
      return null;
    }

    const response = await fetch(`https://ipinfo.io/${ip}?token=${ipInfoToken}`);
    const data = await response.json();

    console.log('[Oracle] Detected country:', data.country);
    return data.country || null;
  } catch (error) {
    console.error('[Oracle] Failed to detect territory:', error);
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, userAddress, userFid, userLocation, confirmPayment } = await req.json();

    if (!message) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    console.log('[Oracle] Received:', { message, userAddress, userLocation, confirmPayment });

    // Create GoogleGenAI instance with correct SDK
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY!
    });

    // Check for prohibited emergency/high-risk activities
    if (isProhibitedActivity(message)) {
      console.log('[Oracle] Prohibited activity detected (emergency services)');
      return NextResponse.json({
        success: true,
        action: {
          type: 'chat',
          message: '⚠️ Emergency queries cannot use Google Maps services.\n\nFor emergencies, please contact local emergency services directly:\n• US: 911\n• EU: 112\n• UK: 999\n\nFor non-emergency location queries, please rephrase your question.',
        },
      });
    }

    // Detect if query needs Google Maps grounding (location-based)
    // Best Practice: Only enable Maps tool when query has clear geographical context
    const needsMapsGrounding = detectMapsQuery(message);

    console.log('[Oracle] Needs Maps Grounding:', needsMapsGrounding);

    // Best Practice: Inform user that Maps data will be used
    if (needsMapsGrounding && !confirmPayment) {
      console.log('[Oracle] Location-based query detected, Maps tool will be enabled');
    }

    // Check territory restrictions for Maps Grounding
    if (needsMapsGrounding) {
      const userCountry = await detectUserTerritory(req);

      if (userCountry && PROHIBITED_TERRITORIES.includes(userCountry)) {
        console.log('[Oracle] User in prohibited territory:', userCountry);
        return NextResponse.json({
          success: true,
          action: {
            type: 'chat',
            message: '🌍 Google Maps services are not available in your region.\n\nDue to Google Maps terms of service, location-based features cannot be provided in certain territories. However, I can still help you with:\n\n• Travel recommendations\n• Blockchain services\n• NFT browsing\n• Games and entertainment\n\nHow else can I assist you?',
          },
        });
      }
    }

    // If Maps grounding needed and user hasn't confirmed payment, return cost estimate
    if (needsMapsGrounding && !confirmPayment) {
      // Google Maps Pricing:
      // - Free Tier: 1,500 RPD (requests per day)
      // - Paid Tier: $25 per 1,000 requests = $0.025 per request
      // - Model costs: ~$0.003 per request
      // - Total cost: ~$0.028 per request
      // - Charge: 2 MON (~$0.10) for healthy profit margin
      return NextResponse.json({
        success: true,
        requiresPayment: true,
        estimatedCost: '2', // 2 MON per Maps query (250%+ markup for profitability)
        message: 'This query requires real-time location data from Google Maps. Cost: 2 MON',
      });
    }

    // If payment confirmed, charge the user via delegated transaction
    let paymentTxHash: string | null = null;
    if (needsMapsGrounding && confirmPayment && userAddress) {
      try {
        paymentTxHash = await chargeMONForMapsQuery(userAddress);
        console.log('[Oracle] Payment collected (delegated):', paymentTxHash);
      } catch (error) {
        console.error('[Oracle] Payment failed:', error);
        return NextResponse.json({
          success: false,
          error: 'Payment failed. Please ensure you have 2 MON in your wallet and have approved the Oracle contract.',
        }, { status: 402 });
      }
    }

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

3. CREATE_NFT - Open NFT creation studio
   - When users want to "create an nft", "mint an nft", "upload music", "upload art", "create music nft", "make nft" etc.
   - Opens the NFT creation modal with full step-by-step wizard
   - Supports both music and art NFTs with delegation and royalties (NFTv9)

4. CONCIERGE - Request personalized travel services
   - TAXI - Book a taxi/ride
   - RESTAURANT_RESERVATION - Reserve a table
   - ACTIVITY_BOOKING - Book tours/activities
   - HOTEL_BOOKING - Reserve accommodations
   - TOUR_GUIDE - Request a personal tour guide

5. EXECUTE - Execute blockchain transactions via delegation
   - swap_tokens(amount, from, to)
   - mint_nft(type, metadata)
   - buy_item(contract, tokenId)
   - transfer(to, amount)

6. CHAT - Conversational response with travel advice

Parse this user message: "${message}"

You MUST return ONLY valid JSON matching the specified schema.
`;

    // Configure Maps grounding if needed
    const config: any = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['navigate', 'execute', 'game', 'chat', 'concierge', 'create_nft'],
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
          concierge: {
            type: Type.OBJECT,
            properties: {
              serviceType: {
                type: Type.STRING,
                enum: ['TAXI', 'RESTAURANT_RESERVATION', 'ACTIVITY_BOOKING', 'HOTEL_BOOKING', 'TOUR_GUIDE'],
                description: 'Type of concierge service'
              },
              details: {
                type: Type.STRING,
                description: 'Service details and requirements'
              },
              suggestedPrice: {
                type: Type.STRING,
                description: 'Suggested price in MON tokens'
              }
            },
            description: 'Concierge service details if type is concierge'
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
        propertyOrdering: ['type', 'message', 'destination', 'game', 'concierge', 'transaction']
      }
    };

    // Add Maps grounding tool if needed
    // Best Practice: Only enable when query has geographical context (off by default)
    if (needsMapsGrounding) {
      console.log('[Oracle] Enabling Google Maps grounding tool');
      config.tools = [{ googleMaps: { enableWidget: true } }];

      // Best Practice: Always provide user location for most relevant responses
      if (userLocation?.latitude && userLocation?.longitude) {
        console.log('[Oracle] User location provided:', userLocation);
        config.toolConfig = {
          retrievalConfig: {
            latLng: {
              latitude: userLocation.latitude,
              longitude: userLocation.longitude
            }
          }
        };
      } else {
        console.warn('[Oracle] Maps query detected but no user location available');
      }
    }

    // Track latency for monitoring (Best Practice: Monitor P95 latency)
    const startTime = Date.now();

    // Use gemini-2.5-flash (GA stable):
    // - Best price-performance model
    // - Supports Maps Grounding
    // - Optimized for high-volume tasks
    // - Better rate limits with Tier 1 billing enabled
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: systemPrompt,
      config
    });

    const latency = Date.now() - startTime;
    console.log('[Oracle] Gemini API latency:', latency, 'ms');

    // Best Practice: Monitor P95 latency for conversational apps
    if (needsMapsGrounding && latency > 5000) {
      console.warn('[Oracle] High latency detected for Maps query:', latency, 'ms');
    }

    const responseText = response.text || '';

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

    // Extract Maps grounding sources if present
    let mapsSources: MapsGroundingSource[] = [];
    let mapsWidgetToken: string | null = null;

    if (needsMapsGrounding && response.candidates?.[0]?.groundingMetadata) {
      const grounding = response.candidates[0].groundingMetadata as any;

      // Extract sources
      if (grounding.groundingChunks) {
        mapsSources = grounding.groundingChunks
          .filter((chunk: any) => chunk.maps)
          .map((chunk: any) => ({
            uri: chunk.maps.uri,
            title: chunk.maps.title,
            placeId: chunk.maps.placeId
          }));
      }

      // Extract widget token (property not in TypeScript types but exists at runtime)
      if (grounding.googleMapsWidgetContextToken) {
        mapsWidgetToken = grounding.googleMapsWidgetContextToken;
      }

      console.log('[Oracle] Maps sources:', mapsSources.length);
    }

    // Execute action
    let txHash: string | null = null;
    let requestId: number | null = null;

    if (action.type === 'execute' && action.transaction) {
      // Execute delegated transaction
      txHash = await executeDelegatedTransaction(
        action.transaction,
        userAddress,
        userFid
      );
    } else if (action.type === 'concierge' && action.concierge && userAddress) {
      // Create concierge service request
      const result = await createConciergeRequest(
        userAddress,
        action.concierge.serviceType,
        action.concierge.details,
        action.concierge.suggestedPrice
      );
      txHash = result.txHash;
      requestId = result.requestId;
    }

    return NextResponse.json({
      success: true,
      action,
      txHash,
      explorer: txHash ? `https://testnet.monadscan.com/tx/${txHash}` : null,
      paymentTxHash,
      mapsSources,
      mapsWidgetToken,
      requestId,
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

// Google Maps Grounding - Prohibited Territories (as per Google Terms)
const PROHIBITED_TERRITORIES = [
  'CN', // China
  'CU', // Cuba
  'IR', // Iran
  'KP', // North Korea
  'SY', // Syria
  'VN', // Vietnam
  'UA-43', // Crimea
  // Note: Donetsk and Luhansk People's Republics are also prohibited but harder to detect via country codes
];

// Prohibited activities for Maps Grounding (high-risk activities)
const EMERGENCY_KEYWORDS = [
  'emergency', '911', 'ambulance', 'fire department', 'police',
  'urgent medical', 'hospital emergency', 'ER', 'life threatening',
  'call emergency', 'fire rescue', 'medical emergency',
  'crisis', 'urgent care', 'emergency room', 'paramedic'
];

// Detect if query is a prohibited emergency/high-risk activity
function isProhibitedActivity(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return EMERGENCY_KEYWORDS.some(keyword => lowerMessage.includes(keyword));
}

// Detect if a query needs Google Maps grounding
function detectMapsQuery(message: string): boolean {
  // First, check if it's a prohibited activity
  if (isProhibitedActivity(message)) {
    return false; // Don't use Maps Grounding for emergency services
  }

  const mapsKeywords = [
    'restaurant', 'cafe', 'coffee', 'food', 'eat', 'dining',
    'hotel', 'accommodation', 'stay', 'lodge',
    'museum', 'attraction', 'tourist', 'visit', 'see',
    'near me', 'nearby', 'around', 'close', 'walking distance',
    'directions', 'how to get', 'route',
    'shop', 'store', 'buy', 'shopping',
    'bar', 'nightlife', 'club', 'entertainment',
    'park', 'beach', 'outdoor',
    'best', 'top rated', 'recommended',
    'open now', 'hours', 'when',
    'address', 'location', 'where is'
  ];

  const lowerMessage = message.toLowerCase();
  return mapsKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Charge MON tokens for Maps query
async function chargeMONForMapsQuery(userAddress: string): Promise<string> {
  const TREASURY = process.env.TREASURY_ADDRESS as `0x${string}`;
  const WMON_ADDRESS = process.env.NEXT_PUBLIC_WMON as `0x${string}`;
  const CHARGE_AMOUNT = parseEther('2'); // 2 MON (~$0.10 at $0.05/MON)
  // Cost breakdown:
  // - Google Maps: $0.025 (after free tier)
  // - Model tokens: ~$0.003
  // - Total cost: ~$0.028
  // - Charge: 2 MON (~$0.10)
  // - Profit: ~$0.072 (257% markup)

  const { default: erc20Abi } = await import('@/lib/abis/ERC20.json');

  // Transfer MON from user to treasury
  const hash = await walletClient.writeContract({
    address: WMON_ADDRESS,
    abi: erc20Abi,
    functionName: 'transferFrom',
    args: [userAddress, TREASURY, CHARGE_AMOUNT],
  });

  await publicClient.waitForTransactionReceipt({ hash });
  return hash;
}

// Create concierge service request via PersonalAssistant contract
async function createConciergeRequest(
  beneficiary: string,
  serviceType: string,
  details: string,
  suggestedPrice: string
): Promise<{ txHash: string; requestId: number }> {
  const PERSONAL_ASSISTANT = process.env.NEXT_PUBLIC_PERSONAL_ASSISTANT as `0x${string}`;
  const { default: personalAssistantAbi } = await import('@/lib/abis/PersonalAssistantV2.json');

  // Convert suggestedPrice from MON to wei
  const priceInWei = parseEther(suggestedPrice);

  // Create service request on behalf of the user
  const hash = await walletClient.writeContract({
    address: PERSONAL_ASSISTANT,
    abi: personalAssistantAbi,
    functionName: 'createServiceRequestFor',
    args: [beneficiary, serviceType, details, priceInWei],
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });

  // Extract requestId from ServiceRequestCreated event
  const serviceRequestEvent = receipt.logs.find((log: any) => {
    try {
      const decoded = decodeEventLog({
        abi: personalAssistantAbi,
        data: log.data,
        topics: log.topics,
      });
      return decoded.eventName === 'ServiceRequestCreated';
    } catch {
      return false;
    }
  });

  let requestId = 0;
  if (serviceRequestEvent) {
    const decoded = decodeEventLog({
      abi: personalAssistantAbi,
      data: serviceRequestEvent.data,
      topics: serviceRequestEvent.topics,
    });
    requestId = Number((decoded.args as any).requestId);
  }

  return { txHash: hash, requestId };
}
