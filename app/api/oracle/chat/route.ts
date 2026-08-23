import { NextRequest, NextResponse } from "next/server";
import { forwardAuthHeader } from "@/lib/quick-auth";
import { GoogleGenAI, Type } from "@google/genai";
import {
  parseEther,
  decodeEventLog,
  encodeFunctionData,
  type Address,
  type Hex,
} from "viem";
import { sendUserSafeTransaction } from "@/lib/user-safe";
import { getCountryByCode } from "@/lib/passport/countries";
import { publicClient } from "@/lib/pimlico-safe-aa";
import { Redis } from "@upstash/redis";

// Redis client, used for per-user dedup caches.
const redis = Redis.fromEnv();

interface OracleAction {
  type:
    | "navigate"
    | "execute"
    | "game"
    | "chat"
    | "create_nft"
    | "mint_passport"
    | "sponsorship"
    | "admin"
    | "withdraw"
    | "create_epk"
    | "manage_epk"
    | "unknown";
  destination?: string; // Page to navigate to
  game?: "TETRIS" | "TICTACTOE" | "MIRROR";
  transaction?: {
    contract: string;
    function: string;
    args: any[];
  };
  message?: string;
  estimatedCost?: string; // Cost in MON tokens
  passport?: {
    countryCode: string;
    countryName: string;
  };
  sponsorship?: {
    action: "list_open" | "check_status" | "checkin" | "vote";
    id?: number;
    vote?: boolean;
  };
  admin?: {
    action: "burn_nft" | "lookup_nft";
    tokenId?: number;
    reason?: string;
    // Note: signature and timestamp come from request body, not Gemini
  };
  withdraw?: {
    token: "mon" | "wmon" | "tours";
    amount: string;
  };
  epk?: {
    action: "create" | "view" | "list_bookings";
  };
}

export async function POST(req: NextRequest) {
  try {
    // SECURITY: rate limit — this calls the paid Gemini API unauthenticated.
    const { checkRateLimit, getClientIP, RateLimiters } = await import(
      "@/lib/rate-limit"
    );
    const fwdAuth = forwardAuthHeader(req);
    const aiRl = await checkRateLimit(RateLimiters.ai, getClientIP(req));
    if (!aiRl.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: `Rate limit exceeded. Try again in ${aiRl.resetIn}s.`,
        },
        { status: 429 },
      );
    }

    const {
      message,
      userAddress,
      userFid,
      userLocation,
      confirmPayment,
      adminSignature, // For admin actions (burn NFT)
      adminTimestamp, // Timestamp for admin signature verification
    } = await req.json();

    if (!message) {
      return NextResponse.json({ error: "Message required" }, { status: 400 });
    }

    console.log("[Oracle] Received:", {
      message,
      userAddress,
      userLocation,
      confirmPayment,
    });

    // Create GoogleGenAI instance with correct SDK
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      console.error("[Oracle] GEMINI_API_KEY is not set!");
      return NextResponse.json(
        {
          success: false,
          error: "Oracle API key not configured",
        },
        { status: 500 },
      );
    }

    const ai = new GoogleGenAI({
      apiKey: geminiKey,
    });

    // Check for prohibited emergency/high-risk activities
    if (isProhibitedActivity(message)) {
      console.log("[Oracle] Prohibited activity detected (emergency services)");
      return NextResponse.json({
        success: true,
        action: {
          type: "chat",
          message:
            "⚠️ I can't help with emergencies.\n\nPlease contact local emergency services directly:\n• US: 911\n• EU: 112\n• UK: 999",
        },
      });
    }

    // If payment confirmed, charge the user via delegated transaction (with dedup cache)
    let paymentTxHash: string | null = null;

    // OSM provider path: search via Nominatim, pass results as context to Gemini

    let systemPrompt: string;

    systemPrompt = `You are the EmpowerTours Oracle AI. Parse user requests into actions.

CRITICAL: Function names MUST be exactly as listed. No variations.

Actions:
- type:"execute" + transaction.function:"buy_music" + transaction.args:["<tokenId>"] - Buy music NFT
- type:"execute" + transaction.function:"buy_art" + transaction.args:["<tokenId>"] - Buy art NFT
- type:"create_nft" - Open NFT creation modal
- type:"mint_passport" - Mint passport NFT. Include passport:{countryCode, countryName} if user specifies a country, otherwise the system will use their detected location
- type:"navigate" + destination:"/path" - Navigate to page
- type:"game" + game:"MIRROR" - Launch game
- type:"sponsorship" + sponsorship.action:"list_open" - Show open sponsorship offers/requests
- type:"sponsorship" + sponsorship.action:"check_status" + sponsorship.id:<id> - Check sponsorship status
- type:"sponsorship" + sponsorship.action:"checkin" + sponsorship.id:<id> - Check-in to sponsored event
- type:"sponsorship" + sponsorship.action:"vote" + sponsorship.id:<id> + sponsorship.vote:<true/false> - Vote on sponsorship
- type:"admin" + admin.action:"burn_nft" + admin.tokenId:<id> + admin.reason:"<reason>" - Burn stolen/infringing NFT (admin only)
- type:"admin" + admin.action:"lookup_nft" + admin.tokenId:<id> - Lookup NFT info before burning
- type:"withdraw" + withdraw.token:"mon"|"wmon"|"tours" + withdraw.amount:"<number>" - Withdraw tokens from User Safe to Farcaster wallet
- type:"create_epk" - Create an Electronic Press Kit (EPK). Triggers when user says "create my epk", "make a press kit", "build my press kit"
- type:"manage_epk" + epk.action:"view"|"list_bookings" - View EPK or list booking inquiries. "show my epk", "my booking inquiries", "show my bookings"
- type:"chat" - Conversational response

For "Buy MUSIC NFT #X" requests:
{"type":"execute","message":"Purchasing Music NFT #X","transaction":{"function":"buy_music","args":["X"],"contract":"music"}}

For "Buy ART NFT #X" requests:
{"type":"execute","message":"Purchasing Art NFT #X","transaction":{"function":"buy_art","args":["X"],"contract":"art"}}

User message: "${message}"

Return valid JSON only.`;

    const config: any = {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          type: {
            type: Type.STRING,
            enum: [
              "navigate",
              "execute",
              "game",
              "chat",
              "create_nft",
              "mint_passport",
              "sponsorship",
              "admin",
              "withdraw",
              "create_epk",
              "manage_epk",
            ],
            description: "The type of action to perform",
          },
          destination: {
            type: Type.STRING,
            description: "Page path if type is navigate",
          },
          game: {
            type: Type.STRING,
            enum: ["TETRIS", "TICTACTOE", "MIRROR"],
            description: "Game type if type is game",
          },
          transaction: {
            type: Type.OBJECT,
            properties: {
              contract: { type: Type.STRING },
              function: { type: Type.STRING },
              args: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            description: "Transaction details if type is execute",
          },
          passport: {
            type: Type.OBJECT,
            properties: {
              countryCode: {
                type: Type.STRING,
                description: "ISO country code (e.g. US, GB, JP)",
              },
              countryName: {
                type: Type.STRING,
                description: "Full country name",
              },
            },
            description: "Passport minting details if type is mint_passport",
          },
          sponsorship: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                enum: ["list_open", "check_status", "checkin", "vote"],
                description: "Sponsorship action type",
              },
              id: {
                type: Type.NUMBER,
                description: "Sponsorship ID for status/checkin/vote actions",
              },
              vote: {
                type: Type.BOOLEAN,
                description: "true=sponsor was mentioned, false=not mentioned",
              },
            },
            description: "Sponsorship action details if type is sponsorship",
          },
          admin: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                enum: ["burn_nft", "lookup_nft"],
                description: "Admin action type",
              },
              tokenId: {
                type: Type.NUMBER,
                description: "NFT token ID to burn or lookup",
              },
              reason: {
                type: Type.STRING,
                description: "Reason for burning (required for burn_nft)",
              },
            },
            description: "Admin action details if type is admin",
          },
          withdraw: {
            type: Type.OBJECT,
            properties: {
              token: {
                type: Type.STRING,
                enum: ["mon", "wmon", "tours"],
                description:
                  "Token to withdraw: mon (native), wmon (wrapped), or tours",
              },
              amount: {
                type: Type.STRING,
                description: 'Amount to withdraw (e.g. "100", "0.5")',
              },
            },
            description:
              "Withdraw details if type is withdraw. Sends tokens from User Safe to Farcaster wallet.",
          },
          epk: {
            type: Type.OBJECT,
            properties: {
              action: {
                type: Type.STRING,
                enum: ["create", "view", "list_bookings"],
                description:
                  "EPK action: create new EPK, view existing, or list booking inquiries",
              },
            },
            description:
              "EPK action details if type is create_epk or manage_epk",
          },
          message: {
            type: Type.STRING,
            description: "Response message to user",
          },
        },
        required: ["type", "message"],
        propertyOrdering: [
          "type",
          "message",
          "destination",
          "game",
          "transaction",
          "passport",
          "sponsorship",
          "admin",
          "withdraw",
          "epk",
        ],
      },
    };

    // Best Practice: Only enable when query has geographical context (off by default)
    // OSM path also uses text output (no structured JSON)

    // Track latency for monitoring (Best Practice: Monitor P95 latency)
    const startTime = Date.now();

    // Use gemini-2.5-flash (GA stable):
    // - Best price-performance model
    // - Optimized for high-volume tasks
    // - Better rate limits with Tier 1 billing enabled
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: systemPrompt,
      config,
    });

    const latency = Date.now() - startTime;
    console.log("[Oracle] Gemini API latency:", latency, "ms");

    // Best Practice: Monitor P95 latency for conversational apps

    const responseText = response.text || "";

    let action: OracleAction;
    try {
      action = JSON.parse(responseText);
    } catch (parseError) {
      console.error("Failed to parse AI response:", responseText);
      throw new Error("Invalid JSON response from AI");
    }

    console.log("[Oracle] Parsed action:", JSON.stringify(action, null, 2));

    // Validate required fields
    if (!action.type || !action.message) {
      throw new Error("Invalid response structure from AI");
    }

    // Execute action
    let txHash: string | null = null;

    if (action.type === "execute" && action.transaction) {
      // Aggressively extract function name - Gemini often hallucinates extra text
      let rawFunc = action.transaction.function || "";
      let funcName = rawFunc.replace(/[,\s]+$/, "").trim();

      // If function starts with buy_music or buy_art, extract just that
      // This handles: "buy_music," "buy_music','args':[" "buy_music overjoyed with..."
      if (rawFunc.toLowerCase().startsWith("buy_music")) {
        funcName = "buy_music";
        console.log(
          "[Oracle] Extracted buy_music from:",
          rawFunc.substring(0, 50),
        );
      } else if (rawFunc.toLowerCase().startsWith("buy_art")) {
        funcName = "buy_art";
        console.log(
          "[Oracle] Extracted buy_art from:",
          rawFunc.substring(0, 50),
        );
      }
      action.transaction.function = funcName;

      // Check for special delegated actions that go through execute-delegated API
      if (
        (funcName === "buy_music" || funcName === "buy_art") &&
        userAddress &&
        userFid
      ) {
        // Route buy_music/buy_art to execute-delegated API
        // Try to get tokenId from args, or extract from the original message
        let tokenId = action.transaction.args?.[0];
        if (!tokenId) {
          // Gemini often malforms the JSON - try to extract tokenId from the user message
          const tokenIdMatch = message.match(/#?(\d+)/);
          if (tokenIdMatch) {
            tokenId = tokenIdMatch[1];
            console.log("[Oracle] Extracted tokenId from message:", tokenId);
          }
        }
        if (tokenId) {
          try {
            const buyResponse = await fetch(
              `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/execute-delegated`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json", ...fwdAuth },
                body: JSON.stringify({
                  action: "buy_music", // Both use the same endpoint
                  userAddress,
                  fid: userFid,
                  params: { tokenId: tokenId.toString().replace("#", "") },
                }),
              },
            );
            const buyData = await buyResponse.json();
            if (buyData.success) {
              txHash = buyData.txHash;
              const nftType = funcName === "buy_art" ? "Art" : "Music";
              action.message =
                buyData.message ||
                `Successfully purchased ${nftType} NFT #${tokenId}!`;
            } else {
              action.message = `Purchase failed: ${buyData.error}`;
            }
          } catch (buyError: any) {
            console.error("Buy NFT error:", buyError);
            action.message = `Purchase failed: ${buyError.message}`;
          }
        } else {
          action.message = "Missing token ID for purchase";
        }
      } else {
        // Execute other delegated transactions directly
        txHash = await executeDelegatedTransaction(
          action.transaction,
          userAddress,
          userFid,
        );
      }
    } else if (action.type === "mint_passport" && userAddress) {
      // Determine country: use Gemini's passport data, or fall back to user's location
      let countryCode = action.passport?.countryCode;
      let countryName = action.passport?.countryName;

      if (!countryCode && userLocation?.country) {
        countryCode = userLocation.country as string;
        const countryInfo = getCountryByCode(countryCode);
        countryName = countryInfo?.name || countryCode;
        console.log(
          `[Oracle] No passport data from Gemini, using location: ${countryCode} (${countryName})`,
        );
      }

      if (!countryCode) {
        action.message =
          'Could not determine your country. Please specify which country passport to mint (e.g. "mint passport for Mexico").';
      } else {
        const result = await mintPassportForUser(
          userAddress,
          countryCode,
          countryName || countryCode,
          userFid,
          fwdAuth,
        );
        txHash = result.txHash;
        if (result.error) {
          action.message = result.error;
        } else {
          action.message = `Passport minted successfully! ${countryName} - Token #${result.tokenId || "pending"}`;
        }
      }
    } else if (action.type === "sponsorship" && action.sponsorship) {
      // Handle sponsorship actions
      const sponsorshipResult = await handleSponsorshipAction(
        action.sponsorship,
        userAddress,
        userLocation,
      );
      if (sponsorshipResult.txHash) {
        txHash = sponsorshipResult.txHash;
      }
      action.message = sponsorshipResult.message;
      if (sponsorshipResult.data) {
        (action as any).sponsorshipData = sponsorshipResult.data;
      }
    } else if (action.type === "admin" && action.admin) {
      // Handle admin actions (burn NFT, etc.)
      // Pass signature and timestamp from request body (not from Gemini)
      const adminResult = await handleAdminAction(
        action.admin,
        userAddress,
        adminSignature,
        adminTimestamp,
      );
      if (adminResult.txHash) {
        txHash = adminResult.txHash;
      }
      action.message = adminResult.message;
      if (adminResult.data) {
        (action as any).adminData = adminResult.data;
      }
    } else if (action.type === "withdraw" && action.withdraw && userAddress) {
      // Handle withdraw from User Safe to Farcaster wallet
      const token = action.withdraw.token || "mon";
      const amount = action.withdraw.amount;

      if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
        action.message =
          'Please specify a valid amount to withdraw (e.g. "withdraw 100 MON to my wallet")';
      } else {
        try {
          const withdrawResponse = await fetch(
            `${process.env.NEXT_PUBLIC_URL || "http://localhost:3000"}/api/execute-delegated`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", ...fwdAuth },
              body: JSON.stringify({
                action: "withdraw_to_user",
                userAddress,
                params: { token, amount },
              }),
            },
          );
          const withdrawData = await withdrawResponse.json();
          if (withdrawData.success) {
            txHash = withdrawData.txHash;
            action.message = `Successfully withdrew ${amount} ${token.toUpperCase()} to your Farcaster wallet!`;
          } else {
            action.message = `Withdrawal failed: ${withdrawData.error}`;
          }
        } catch (withdrawError: any) {
          console.error("[Oracle] Withdraw error:", withdrawError);
          action.message = `Withdrawal failed: ${withdrawError.message}`;
        }
      }
    }

    // Handle EPK actions
    if (action.type === "create_epk") {
      action.message = `I'll help you create your Electronic Press Kit (EPK)! This will be stored on IPFS and registered on Monad blockchain.\n\nOpening the EPK wizard now...`;
    } else if (action.type === "manage_epk" && action.epk) {
      if (action.epk.action === "list_bookings" && userAddress) {
        try {
          const baseUrl =
            process.env.NEXT_PUBLIC_URL || "http://localhost:3000";
          const bookingsRes = await fetch(
            `${baseUrl}/api/epk/booking?artist=${userAddress}`,
          );
          const bookingsData = await bookingsRes.json();
          if (bookingsData.success && bookingsData.inquiries?.length > 0) {
            const list = bookingsData.inquiries
              .slice(0, 5)
              .map(
                (b: any, i: number) =>
                  `${i + 1}. **${b.eventName}** - ${b.name} (${b.status}) - ${b.location}`,
              )
              .join("\n");
            action.message = `Your booking inquiries:\n\n${list}\n\n${bookingsData.inquiries.length > 5 ? `...and ${bookingsData.inquiries.length - 5} more` : ""}`;
          } else {
            action.message =
              "No booking inquiries found yet. Share your EPK page to start receiving bookings!";
          }
        } catch {
          action.message =
            "Could not fetch booking inquiries. Try again later.";
        }
      } else if (action.epk.action === "view") {
        action.message = "Opening your EPK page...";
        action.type = "navigate";
        action.destination = `/epk/${userAddress || ""}`;
      }
    }

    return NextResponse.json({
      success: true,
      action,
      txHash,
      explorer: txHash ? `https://monadscan.com/tx/${txHash}` : null,
    });
  } catch (error: any) {
    console.error("Oracle chat error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Oracle error",
      },
      { status: 500 },
    );
  }
}

async function executeDelegatedTransaction(
  transaction: { contract: string; function: string; args: any[] },
  beneficiary: string,
  userFid: number,
): Promise<string> {
  // Load contract ABI based on contract address
  const { default: abi } = await import(
    `@/lib/abis/${getAbiName(transaction.contract)}.json`
  );

  const data = encodeFunctionData({
    abi,
    functionName: transaction.function,
    args: transaction.args,
  }) as Hex;

  const result = await sendUserSafeTransaction(beneficiary, [
    { to: transaction.contract as Address, value: 0n, data },
  ]);

  return result.txHash;
}

function getAbiName(contractAddress: string): string {
  // Map contract addresses to ABI names
  const contracts: Record<string, string> = {
    [process.env.NEXT_PUBLIC_TOKEN_SWAP || ""]: "TokenSwap",
    [process.env.NEXT_PUBLIC_NFT_CONTRACT || ""]: "MusicNFT",
    [process.env.NEXT_PUBLIC_PASSPORT_NFT || ""]: "PassportNFT",
    [process.env.NEXT_PUBLIC_MIRRORMATE_ADDRESS || ""]: "MirrorMate",
  };

  return contracts[contractAddress] || "ERC20";
}

// Queries the Oracle refuses outright: emergencies and high-risk activities, where a
// confident AI answer is worse than none.
const EMERGENCY_KEYWORDS = [
  "emergency",
  "911",
  "ambulance",
  "fire department",
  "police",
  "urgent medical",
  "hospital emergency",
  "ER",
  "life threatening",
  "call emergency",
  "fire rescue",
  "medical emergency",
  "crisis",
  "urgent care",
  "emergency room",
  "paramedic",
];

// Detect if query is a prohibited emergency/high-risk activity
function isProhibitedActivity(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  return EMERGENCY_KEYWORDS.some((keyword) => lowerMessage.includes(keyword));
}
async function mintPassportForUser(
  userAddress: string,
  countryCode: string,
  countryName: string,
  fid?: number,
  fwdAuth: Record<string, string> = {},
): Promise<{ txHash: string | null; tokenId?: number; error?: string }> {
  const APP_URL =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://fcempowertours-production-6551.up.railway.app";

  try {
    // First ensure delegation exists with wrap_mon permission
    const delegationRes = await fetch(
      `${APP_URL}/api/delegation-status?address=${userAddress}`,
    );
    const delegationData = await delegationRes.json();

    const hasValidDelegation =
      delegationData.success &&
      delegationData.delegation &&
      Array.isArray(delegationData.delegation.permissions) &&
      delegationData.delegation.permissions.includes("mint_passport") &&
      delegationData.delegation.permissions.includes("wrap_mon");

    if (!hasValidDelegation) {
      console.log(
        "[Oracle] Creating delegation with mint_passport and wrap_mon permissions...",
      );
      const createRes = await fetch(`${APP_URL}/api/create-delegation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userAddress,
          authMethod: "farcaster",
          fid,
          durationHours: 24,
          maxTransactions: 100,
          permissions: [
            "mint_passport",
            "wrap_mon",
            "mint_music",
            "swap_mon_for_tours",
            "send_tours",
            "buy_music",
          ],
        }),
      });

      const createData = await createRes.json();
      if (!createData.success) {
        return {
          txHash: null,
          error: "Failed to create delegation: " + createData.error,
        };
      }
    }

    // Try to mint passport
    let mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...fwdAuth },
      body: JSON.stringify({
        userAddress,
        action: "mint_passport",
        params: {
          countryCode,
          countryName,
          fid,
        },
      }),
    });

    let mintData = await mintRes.json();

    // Auto-wrap if needed
    if (!mintData.success && mintData.needsWrap) {
      console.log(
        "[Oracle] Need to wrap MON first, amount:",
        mintData.wmonNeeded,
      );

      const wrapRes = await fetch(`${APP_URL}/api/execute-delegated`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...fwdAuth },
        body: JSON.stringify({
          userAddress,
          action: "wrap_mon",
          params: { amount: mintData.wmonNeeded },
        }),
      });

      const wrapData = await wrapRes.json();
      if (!wrapData.success) {
        return { txHash: null, error: wrapData.error || "Failed to wrap MON" };
      }
      console.log("[Oracle] Wrapped MON, now minting...");

      // Retry mint after wrap
      mintRes = await fetch(`${APP_URL}/api/execute-delegated`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...fwdAuth },
        body: JSON.stringify({
          userAddress,
          action: "mint_passport",
          params: {
            countryCode,
            countryName,
            fid,
          },
        }),
      });
      mintData = await mintRes.json();
    }

    if (!mintData.success) {
      return { txHash: null, error: mintData.error || "Mint failed" };
    }

    console.log("[Oracle] Passport minted:", mintData.txHash);
    return { txHash: mintData.txHash, tokenId: mintData.tokenId };
  } catch (error: any) {
    console.error("[Oracle] Passport mint error:", error);
    return { txHash: null, error: error.message || "Mint failed" };
  }
} // =============================================
// SPONSORSHIP ACTIONS
// =============================================

interface SponsorshipActionResult {
  message: string;
  txHash?: string;
  data?: any;
}

async function handleSponsorshipAction(
  sponsorship: { action: string; id?: number; vote?: boolean },
  userAddress?: string,
  userLocation?: {
    latitude?: number;
    longitude?: number;
    city?: string;
    country?: string;
  },
): Promise<SponsorshipActionResult> {
  const baseUrl = process.env.NEXT_PUBLIC_URL || "http://localhost:3000";

  try {
    switch (sponsorship.action) {
      case "list_open": {
        // List open sponsorship offers and requests
        const response = await fetch(`${baseUrl}/api/sponsorship/open`);
        const data = await response.json();

        if (!data.success) {
          return { message: `Failed to fetch sponsorships: ${data.error}` };
        }

        const { offers, requests } = data;

        if (offers.count === 0 && requests.count === 0) {
          return {
            message:
              "📋 **No open sponsorships found**\n\nThere are currently no open sponsorship offers or requests. Check back later or create your own!",
            data: { offers: [], requests: [] },
          };
        }

        let message = "📋 **Open Sponsorships**\n\n";

        if (offers.count > 0) {
          message += `🎁 **Sponsor Offers** (${offers.count})\n`;
          offers.sponsorships.slice(0, 3).forEach((s: any) => {
            message += `• #${s.id}: ${s.eventName} (${s.city}) - ${s.amountFormatted} WMON\n`;
          });
          if (offers.count > 3)
            message += `  ...and ${offers.count - 3} more\n`;
          message += "\n";
        }

        if (requests.count > 0) {
          message += `🙋 **Host Requests** (${requests.count})\n`;
          requests.sponsorships.slice(0, 3).forEach((s: any) => {
            message += `• #${s.id}: ${s.eventName} (${s.city}) - Seeking ${s.amountFormatted} WMON\n`;
          });
          if (requests.count > 3)
            message += `  ...and ${requests.count - 3} more\n`;
        }

        return { message, data };
      }

      case "check_status": {
        if (!sponsorship.id) {
          return {
            message:
              'Please provide a sponsorship ID to check. Example: "check sponsorship #1"',
          };
        }

        const response = await fetch(
          `${baseUrl}/api/sponsorship/${sponsorship.id}${userAddress ? `?user=${userAddress}` : ""}`,
        );
        const data = await response.json();

        if (!data.success) {
          return { message: `Sponsorship #${sponsorship.id} not found.` };
        }

        const s = data.sponsorship;
        const userStatus = data.userStatus;

        let message = `📊 **Sponsorship #${s.id}**\n\n`;
        message += `📍 ${s.eventName}\n`;
        message += `📌 ${s.city}, ${s.country}\n`;
        message += `💰 ${s.amountFormatted} WMON\n`;
        message += `📈 Status: ${s.status}\n`;
        message += `👥 Check-ins: ${s.checkedInCount}/${s.expectedGuests}\n`;
        message += `🗳️ Votes: ${s.yesVotes} yes / ${s.noVotes} no\n`;

        if (s.eventDate > 0) {
          message += `📅 Event: ${new Date(s.eventDate * 1000).toLocaleDateString()}\n`;
        }

        if (userStatus) {
          message += `\n**Your Status:**\n`;
          message += `✅ Checked in: ${userStatus.isCheckedIn ? "Yes" : "No"}\n`;
          message += `🗳️ Voted: ${userStatus.hasVoted ? "Yes" : "No"}\n`;
        }

        return { message, data: s };
      }

      case "checkin": {
        if (!sponsorship.id) {
          return {
            message:
              'Please provide a sponsorship ID to check in. Example: "check in to sponsorship #1"',
          };
        }
        if (!userAddress) {
          return {
            message: "Please connect your wallet to check in to events.",
          };
        }

        const response = await fetch(`${baseUrl}/api/sponsorship/checkin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sponsorshipId: sponsorship.id,
            guestAddress: userAddress,
            latitude: userLocation?.latitude,
            longitude: userLocation?.longitude,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          return { message: `❌ Check-in failed: ${data.error}` };
        }

        return {
          message: `✅ Successfully checked in to sponsorship #${sponsorship.id}!\n\nYou can now vote on whether the sponsor was mentioned at the event after check-in closes.`,
          txHash: data.txHash,
          data,
        };
      }

      case "vote": {
        if (!sponsorship.id) {
          return {
            message:
              'Please provide a sponsorship ID to vote on. Example: "vote yes on sponsorship #1"',
          };
        }
        if (!userAddress) {
          return { message: "Please connect your wallet to vote." };
        }

        const response = await fetch(`${baseUrl}/api/sponsorship/vote`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sponsorshipId: sponsorship.id,
            voterAddress: userAddress,
            vote: sponsorship.vote ?? true,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          return { message: `❌ Vote failed: ${data.error}` };
        }

        const voteText = sponsorship.vote
          ? "YES (sponsor was mentioned)"
          : "NO (sponsor was NOT mentioned)";
        return {
          message: `🗳️ Vote prepared: ${voteText}\n\nSubmit the transaction to complete your vote on sponsorship #${sponsorship.id}.`,
          data,
        };
      }

      default:
        return { message: `Unknown sponsorship action: ${sponsorship.action}` };
    }
  } catch (error: any) {
    console.error("[Oracle] Sponsorship action error:", error);
    return { message: `Sponsorship error: ${error.message}` };
  }
}

/**
 * Handle admin actions (burn stolen NFTs, etc.)
 */
async function handleAdminAction(
  admin: { action: string; tokenId?: number; reason?: string },
  userAddress?: string,
  signature?: string,
  timestamp?: number,
): Promise<{ message: string; txHash?: string; data?: any }> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // Admin addresses that can perform admin actions
  const ADMIN_ADDRESSES = [
    process.env.ADMIN_ADDRESS || "",
    process.env.NEXT_PUBLIC_PLATFORM_SAFE || "",
  ]
    .filter(Boolean)
    .map((a) => a.toLowerCase());

  try {
    switch (admin.action) {
      case "lookup_nft": {
        if (!admin.tokenId) {
          return {
            message:
              'Please provide a token ID to lookup. Example: "lookup NFT #1"',
          };
        }

        const response = await fetch(
          `${baseUrl}/api/admin/burn-stolen?tokenId=${admin.tokenId}`,
        );
        const data = await response.json();

        if (!data.success) {
          return { message: `❌ ${data.error}` };
        }

        return {
          message:
            `🔍 **NFT #${data.tokenId} Info**\n\n` +
            `**Owner:** \`${data.owner.slice(0, 6)}...${data.owner.slice(-4)}\`\n` +
            `**Contract:** \`${data.contract.slice(0, 6)}...${data.contract.slice(-4)}\`\n` +
            (data.tokenURI
              ? `**Token URI:** ${data.tokenURI.slice(0, 50)}...\n`
              : "") +
            `\nTo burn this NFT, say: "burn NFT #${data.tokenId} reason: [your reason]"`,
          data,
        };
      }

      case "burn_nft": {
        if (!admin.tokenId) {
          return {
            message:
              'Please provide a token ID to burn. Example: "burn NFT #1 reason: stolen content"',
          };
        }

        if (!admin.reason || admin.reason.length < 10) {
          return {
            message:
              'Please provide a reason for burning (at least 10 characters). Example: "burn NFT #1 reason: Copyright infringement - DMCA takedown"',
          };
        }

        if (!userAddress) {
          return {
            message: "Please connect your wallet to perform admin actions.",
          };
        }

        // Check if user is admin
        if (!ADMIN_ADDRESSES.includes(userAddress.toLowerCase())) {
          return {
            message:
              "⛔ You are not authorized to perform admin actions. Only platform admins can burn NFTs.",
          };
        }

        // Check if signature was provided (from frontend after user signs)
        if (!signature || !timestamp) {
          // Return the message that needs to be signed
          const newTimestamp = Date.now();
          const messageToSign = `BURN_NFT:${admin.tokenId}:${admin.reason}:${newTimestamp}`;

          return {
            message:
              `🔐 **Signature Required**\n\n` +
              `To burn NFT #${admin.tokenId}, please sign this message:\n\n` +
              `\`${messageToSign}\`\n\n` +
              `After signing, include the signature in your request.`,
            data: {
              requiresSignature: true,
              messageToSign,
              timestamp: newTimestamp,
              tokenId: admin.tokenId,
              reason: admin.reason,
            },
          };
        }

        const response = await fetch(`${baseUrl}/api/admin/burn-stolen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tokenId: admin.tokenId,
            reason: admin.reason,
            adminAddress: userAddress,
            signature,
            timestamp,
          }),
        });

        const data = await response.json();

        if (!data.success) {
          return { message: `❌ Burn failed: ${data.error}` };
        }

        return {
          message:
            `🔥 **NFT #${admin.tokenId} Burned Successfully**\n\n` +
            `**Previous Owner:** \`${data.previousOwner.slice(0, 6)}...${data.previousOwner.slice(-4)}\`\n` +
            `**Reason:** ${admin.reason}\n` +
            `**Block:** ${data.blockNumber}\n\n` +
            `[View Transaction](https://monadscan.com/tx/${data.txHash})`,
          txHash: data.txHash,
          data,
        };
      }

      default:
        return {
          message: `Unknown admin action: ${admin.action}. Available: lookup_nft, burn_nft`,
        };
    }
  } catch (error: any) {
    console.error("[Oracle] Admin action error:", error);
    return { message: `Admin action error: ${error.message}` };
  }
}
