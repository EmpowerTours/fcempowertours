import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, Type } from '@google/genai';
import { createWalletClient, http, parseEther, createPublicClient, decodeEventLog } from 'viem';
import { monadTestnet } from '@/app/chains';
import { privateKeyToAccount } from 'viem/accounts';

const PIMLICO_RPC_URL = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com';

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
  type: 'navigate' | 'execute' | 'game' | 'chat' | 'concierge' | 'create_nft' | 'mint_passport' | 'unknown';
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
  passport?: {
    countryCode: string;
    countryName: string;
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
      // Pricing: 100 WMON per Maps query (~$5 at $0.05/WMON)
      // Covers: Google Maps API ($0.025), Gemini ($0.003), infrastructure,
      // and provides healthy margin for sustainability
      return NextResponse.json({
        success: true,
        requiresPayment: true,
        estimatedCost: '100', // 100 WMON per Maps query
        message: 'This query uses Google Maps real-time location data. Cost: 100 WMON',
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

    const systemPrompt = `You are the EmpowerTours Oracle AI. Parse user requests into actions.

CRITICAL: Function names MUST be exactly as listed. No variations.

Actions:
- type:"execute" + transaction.function:"buy_music" + transaction.args:["<tokenId>"] - Buy music NFT
- type:"execute" + transaction.function:"buy_art" + transaction.args:["<tokenId>"] - Buy art NFT
- type:"create_nft" - Open NFT creation modal
- type:"mint_passport" - Open passport minting modal
- type:"navigate" + destination:"/path" - Navigate to page
- type:"game" + game:"MIRROR" - Launch game
- type:"chat" - Conversational response

For "Buy MUSIC NFT #X" requests:
{"type":"execute","message":"Purchasing Music NFT #X","transaction":{"function":"buy_music","args":["X"],"contract":"music"}}

For "Buy ART NFT #X" requests:
{"type":"execute","message":"Purchasing Art NFT #X","transaction":{"function":"buy_art","args":["X"],"contract":"art"}}

User message: "${message}"

Return valid JSON only.`;

    // Configure Maps grounding if needed
    const config: any = {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: ['navigate', 'execute', 'game', 'chat', 'concierge', 'create_nft', 'mint_passport'],
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
          passport: {
            type: Type.OBJECT,
            properties: {
              countryCode: {
                type: Type.STRING,
                description: 'ISO country code (e.g. US, GB, JP)'
              },
              countryName: {
                type: Type.STRING,
                description: 'Full country name'
              }
            },
            description: 'Passport minting details if type is mint_passport'
          },
          message: {
            type: Type.STRING,
            description: 'Response message to user'
          }
        },
        required: ['type', 'message'],
        propertyOrdering: ['type', 'message', 'destination', 'game', 'concierge', 'transaction', 'passport']
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

    console.log('[Oracle] Parsed action:', JSON.stringify(action, null, 2));

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

    if (action.type === 'execute' && action.transaction) {
      // Check for special delegated actions that go through execute-delegated API
      const funcName = action.transaction.function;
      if ((funcName === 'buy_music' || funcName === 'buy_art') && userAddress && userFid) {
        // Route buy_music/buy_art to execute-delegated API
        const tokenId = action.transaction.args?.[0];
        if (tokenId) {
          try {
            const buyResponse = await fetch(`${process.env.NEXT_PUBLIC_URL || 'http://localhost:3000'}/api/execute-delegated`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                action: 'buy_music', // Both use the same endpoint
                userAddress,
                fid: userFid,
                params: { tokenId: tokenId.toString().replace('#', '') }
              })
            });
            const buyData = await buyResponse.json();
            if (buyData.success) {
              txHash = buyData.txHash;
              const nftType = funcName === 'buy_art' ? 'Art' : 'Music';
              action.message = buyData.message || `Successfully purchased ${nftType} NFT #${tokenId}!`;
            } else {
              action.message = `Purchase failed: ${buyData.error}`;
            }
          } catch (buyError: any) {
            console.error('Buy NFT error:', buyError);
            action.message = `Purchase failed: ${buyError.message}`;
          }
        } else {
          action.message = 'Missing token ID for purchase';
        }
      } else {
        // Execute other delegated transactions directly
        txHash = await executeDelegatedTransaction(
          action.transaction,
          userAddress,
          userFid
        );
      }
    } else if (action.type === 'mint_passport' && action.passport && userAddress) {
      // Mint passport via execute-delegated API with auto-wrap
      const result = await mintPassportForUser(
        userAddress,
        action.passport.countryCode,
        action.passport.countryName,
        userFid
      );
      txHash = result.txHash;
      if (result.error) {
        action.message = result.error;
      } else {
        action.message = `Passport minted successfully! ${action.passport.countryName} - Token #${result.tokenId || 'pending'}`;
      }
    }

    // =============================================
    // AUTONOMOUS ITINERARY CREATION/RECOMMENDATION
    // =============================================
    // When user makes a Maps query:
    // 1. Check if similar itinerary already exists -> recommend it
    // 2. If not exists -> create new itinerary with user as creator
    let itineraryTxHash: string | null = null;
    let itineraryData: any = null;

    if (needsMapsGrounding && mapsSources.length > 0 && userAddress && userFid) {
      try {
        console.log('[Oracle] Processing itinerary for Maps results...');

        // Extract city/country from the query
        const locationInfo = extractLocationFromQuery(message);
        const city = locationInfo.city || 'Unknown City';
        const country = locationInfo.country || 'Unknown';

        // Check if similar itinerary already exists
        const existingItinerary = await findExistingItinerary(city, mapsSources);

        if (existingItinerary) {
          // Recommend existing itinerary to user
          console.log('[Oracle] Found existing itinerary:', existingItinerary.id);
          itineraryData = {
            exists: true,
            id: existingItinerary.id,
            title: existingItinerary.title,
            creator: existingItinerary.creator,
            price: existingItinerary.price,
            rating: existingItinerary.rating
          };

          action.message = `${action.message}\n\n📍 **Recommended Itinerary**\n"${existingItinerary.title}" by ${existingItinerary.creatorName || 'a fellow traveler'}\nPrice: ${existingItinerary.price} WMON | Rating: ${existingItinerary.rating}/5\nPurchase to unlock the full guide and earn completion stamps!`;
        } else {
          // Create new itinerary with user as creator
          console.log('[Oracle] Creating new itinerary...');

          const locations = mapsSources.map((source, index) => ({
            name: source.title,
            placeId: source.placeId || '',
            uri: source.uri,
            latitude: 0,
            longitude: 0,
            description: `Discover ${source.title}`
          }));

          const itineraryResult = await createItineraryFromMaps(
            userAddress,
            userFid,
            `${city} Explorer: ${message.slice(0, 50)}`,
            city,
            country,
            locations
          );

          if (itineraryResult.success) {
            itineraryTxHash = itineraryResult.txHash || null;
            itineraryData = {
              exists: false,
              created: true,
              txHash: itineraryTxHash
            };
            console.log('[Oracle] Itinerary created:', itineraryTxHash);

            action.message = `${action.message}\n\n🎉 **Itinerary Created!**\nYou are now the creator of "${city} Explorer". You'll earn 70% of all future sales when others purchase it!`;
          }
        }
      } catch (itinError: any) {
        console.error('[Oracle] Itinerary processing error:', itinError);
        // Don't fail the main request
      }
    }

    return NextResponse.json({
      success: true,
      action,
      txHash,
      explorer: txHash ? `https://testnet.monadscan.com/tx/${txHash}` : null,
      paymentTxHash,
      mapsSources,
      mapsWidgetToken,
      itineraryTxHash,
      itineraryData,
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
    [process.env.NEXT_PUBLIC_PASSPORT_NFT || '']: 'PassportNFT',
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

  const lowerMessage = message.toLowerCase();

  // Exclude NFT/game commands from Maps detection
  const excludePatterns = [
    'create nft', 'mint nft', 'make nft', 'new nft', 'upload',
    'play tetris', 'play tictactoe', 'play mirror', 'mirrormate',
    'swap', 'stake', 'lottery', 'passport', 'beat match'
  ];
  if (excludePatterns.some(pattern => lowerMessage.includes(pattern))) {
    return false;
  }

  const mapsKeywords = [
    'restaurant', 'cafe', 'coffee', 'food', 'dining',
    'hotel', 'accommodation', 'stay', 'lodge',
    'museum', 'attraction', 'tourist', 'visit',
    'near me', 'nearby', 'around here', 'close by', 'walking distance',
    'directions to', 'how to get to', 'route to',
    'shop', 'store', 'shopping',
    'bar', 'nightlife', 'club',
    'park', 'beach', 'outdoor',
    'top rated', 'recommended places',
    'open now', 'what time',
    'address of', 'where is the'
  ];

  return mapsKeywords.some(keyword => lowerMessage.includes(keyword));
}

// Charge WMON tokens for Maps query via delegation
async function chargeMONForMapsQuery(userAddress: string): Promise<string> {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fcempowertours-production-6551.up.railway.app';

  // Pricing: 100 WMON per Maps query (~$5 at $0.05/WMON)
  // Provides healthy margin for infrastructure, API costs, and sustainability
  const CHARGE_AMOUNT = '100'; // 100 WMON per Maps query

  // Use delegation API to transfer WMON from user to treasury
  const response = await fetch(`${APP_URL}/api/execute-delegated`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userAddress,
      action: 'maps_payment',
      params: {
        amount: CHARGE_AMOUNT
      }
    })
  });

  const data = await response.json();

  if (!data.success) {
    throw new Error(data.error || 'Payment failed');
  }

  return data.txHash;
}

// Mint passport via execute-delegated API with auto-wrap
async function mintPassportForUser(
  userAddress: string,
  countryCode: string,
  countryName: string,
  fid?: number
): Promise<{ txHash: string | null; tokenId?: number; error?: string }> {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fcempowertours-production-6551.up.railway.app';

  try {
    // First ensure delegation exists with wrap_mon permission
    const delegationRes = await fetch(`${APP_URL}/api/delegation-status?address=${userAddress}`);
    const delegationData = await delegationRes.json();

    const hasValidDelegation = delegationData.success &&
                              delegationData.delegation &&
                              Array.isArray(delegationData.delegation.permissions) &&
                              delegationData.delegation.permissions.includes('mint_passport') &&
                              delegationData.delegation.permissions.includes('wrap_mon');

    if (!hasValidDelegation) {
      console.log('[Oracle] Creating delegation with mint_passport and wrap_mon permissions...');
      const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          durationHours: 24,
          maxTransactions: 100,
          permissions: ['mint_passport', 'wrap_mon', 'mint_music', 'swap_mon_for_tours', 'send_tours', 'buy_music']
        })
      });

      const createData = await createRes.json();
      if (!createData.success) {
        return { txHash: null, error: 'Failed to create delegation: ' + createData.error };
      }
    }

    // Try to mint passport
    let mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress,
        action: 'mint_passport',
        params: {
          countryCode,
          countryName,
          fid
        }
      })
    });

    let mintData = await mintRes.json();

    // Auto-wrap if needed
    if (!mintData.success && mintData.needsWrap) {
      console.log('[Oracle] Need to wrap MON first, amount:', mintData.wmonNeeded);

      const wrapRes = await fetch(`${APP_URL}/api/execute-delegated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          action: 'wrap_mon',
          params: { amount: mintData.wmonNeeded }
        })
      });

      const wrapData = await wrapRes.json();
      if (!wrapData.success) {
        return { txHash: null, error: wrapData.error || 'Failed to wrap MON' };
      }
      console.log('[Oracle] Wrapped MON, now minting...');

      // Retry mint after wrap
      mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress,
          action: 'mint_passport',
          params: {
            countryCode,
            countryName,
            fid
          }
        })
      });
      mintData = await mintRes.json();
    }

    if (!mintData.success) {
      return { txHash: null, error: mintData.error || 'Mint failed' };
    }

    console.log('[Oracle] Passport minted:', mintData.txHash);
    return { txHash: mintData.txHash, tokenId: mintData.tokenId };
  } catch (error: any) {
    console.error('[Oracle] Passport mint error:', error);
    return { txHash: null, error: error.message || 'Mint failed' };
  }
}

// =============================================
// ITINERARY HELPER FUNCTIONS
// =============================================

// Extract city and country from user query
function extractLocationFromQuery(message: string): { city: string | null; country: string | null } {
  const lowerMessage = message.toLowerCase();

  // Common city patterns
  const cityPatterns = [
    /(?:in|near|around|at)\s+([A-Z][a-zA-Z\s]+?)(?:,|\s+(?:city|town|area)|\s*$)/i,
    /([A-Z][a-zA-Z]+)\s+(?:restaurants?|cafes?|hotels?|attractions?|things to do)/i,
    /best\s+(?:\w+\s+)?(?:in|near)\s+([A-Z][a-zA-Z\s]+)/i,
  ];

  // Common cities list for detection
  const knownCities: Record<string, string> = {
    'tokyo': 'Japan', 'paris': 'France', 'london': 'UK', 'new york': 'USA',
    'los angeles': 'USA', 'sydney': 'Australia', 'barcelona': 'Spain',
    'rome': 'Italy', 'berlin': 'Germany', 'bangkok': 'Thailand',
    'singapore': 'Singapore', 'dubai': 'UAE', 'miami': 'USA',
    'amsterdam': 'Netherlands', 'seoul': 'South Korea', 'hong kong': 'China',
    'istanbul': 'Turkey', 'cairo': 'Egypt', 'mumbai': 'India',
    'bali': 'Indonesia', 'lisbon': 'Portugal', 'athens': 'Greece',
  };

  // Check known cities
  for (const [city, country] of Object.entries(knownCities)) {
    if (lowerMessage.includes(city)) {
      return { city: city.charAt(0).toUpperCase() + city.slice(1), country };
    }
  }

  // Try pattern matching
  for (const pattern of cityPatterns) {
    const match = message.match(pattern);
    if (match && match[1]) {
      return { city: match[1].trim(), country: null };
    }
  }

  return { city: null, country: null };
}

// Find existing itinerary matching the city/locations
async function findExistingItinerary(
  city: string,
  sources: MapsGroundingSource[]
): Promise<{
  id: number;
  title: string;
  creator: string;
  creatorName?: string;
  price: string;
  rating: string;
} | null> {
  const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'https://indexer.dev.hyperindex.xyz/157f9ed/v1/graphql';

  try {
    // Query Envio for itineraries in this city
    const query = `
      query FindItinerary($city: String!) {
        ItineraryNFT_ItineraryCreated(
          where: { city: { _ilike: $city } }
          order_by: { totalPurchases: desc }
          limit: 1
        ) {
          itineraryId
          title
          creator
          price
          averageRating
        }
      }
    `;

    const response = await fetch(ENVIO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { city: `%${city}%` }
      })
    });

    const data = await response.json();
    const itinerary = data?.data?.ItineraryNFT_ItineraryCreated?.[0];

    if (itinerary) {
      return {
        id: itinerary.itineraryId,
        title: itinerary.title,
        creator: itinerary.creator,
        price: (Number(itinerary.price) / 1e18).toFixed(0),
        rating: (itinerary.averageRating / 100).toFixed(1)
      };
    }

    return null;
  } catch (error) {
    console.error('[Oracle] Failed to query existing itineraries:', error);
    return null;
  }
}

// Create itinerary from Maps results via execute-delegated
async function createItineraryFromMaps(
  userAddress: string,
  userFid: number,
  title: string,
  city: string,
  country: string,
  locations: Array<{
    name: string;
    placeId: string;
    uri: string;
    latitude: number;
    longitude: number;
    description: string;
  }>
): Promise<{ success: boolean; txHash?: string; error?: string }> {
  const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://fcempowertours-production-6551.up.railway.app';

  try {
    const response = await fetch(`${APP_URL}/api/execute-delegated`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userAddress,
        action: 'create_itinerary',
        params: {
          creatorFid: userFid,
          title,
          description: `Curated travel guide for ${city}`,
          city,
          country,
          price: '10', // 10 WMON default price
          photoProofIPFS: '',
          locations
        }
      })
    });

    const data = await response.json();
    return {
      success: data.success,
      txHash: data.txHash,
      error: data.error
    };
  } catch (error: any) {
    console.error('[Oracle] Create itinerary error:', error);
    return { success: false, error: error.message };
  }
}
