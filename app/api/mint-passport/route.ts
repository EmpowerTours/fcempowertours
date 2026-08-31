import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { Interface } from "ethers";
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { generatePassportMetadata, isValidCountryCode } from "@/lib/passport/generatePassportSVG";
import { getCountryByCode } from "@/lib/passport/countries";
import { redis } from "@/lib/redis";
import { encodeFunctionData, type Address, type Hex, type PublicClient } from 'viem';
import { findAllPassports } from '@/lib/passport-lookup';
import { sendSafeTransaction, publicClient, safeAddress } from '@/lib/pimlico-safe-aa';
import { preflightPassportMint, buildPassportMintCalls } from '@/lib/passport-mint';

const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT as string;
const IPINFO_TOKEN = process.env.IPINFO_TOKEN;

// Anti-gaming constants
const RATE_LIMIT_WINDOW = 3600; // 1 hour in seconds
const MAX_MINTS_PER_HOUR = 3;   // Max 3 mints per wallet per hour
const MINT_COOLDOWN = 30;       // 30 seconds between mints
const LOCK_TTL = 60;            // 60 second lock to prevent concurrent mints

/**
 * Get user's actual country from their IP (server-side verification)
 */
async function getCountryFromIP(request: NextRequest): Promise<{ country: string; ip: string } | null> {
  try {
    // Get IP from headers
    const xForwardedFor = request.headers.get('x-forwarded-for');
    const xRealIp = request.headers.get('x-real-ip');
    const cfConnectingIp = request.headers.get('cf-connecting-ip');

    let ip = '';
    if (xForwardedFor) {
      ip = xForwardedFor.split(',')[0].trim();
    } else if (xRealIp) {
      ip = xRealIp.trim();
    } else if (cfConnectingIp) {
      ip = cfConnectingIp.trim();
    }

    if (!ip || !IPINFO_TOKEN) {
      console.warn('⚠️ Could not determine IP or IPINFO_TOKEN not set');
      return null;
    }

    // Call IPinfo to verify actual location
    const response = await fetch(`https://ipinfo.io/${ip}?token=${IPINFO_TOKEN}`, {
      headers: { 'Accept': 'application/json' },
      cache: 'no-store'
    });

    if (!response.ok) {
      console.warn('⚠️ IPinfo request failed:', response.status);
      return null;
    }

    const data = await response.json();
    console.log('🌍 Server-side geo verification:', { ip: data.ip, country: data.country });

    return { country: data.country, ip: data.ip };
  } catch (error) {
    console.error('❌ Geo verification error:', error);
    return null;
  }
}
const NEYNAR_API_KEY = (process.env.NEYNAR_API_KEY || process.env.NEXT_PUBLIC_NEYNAR_API_KEY)!;
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_JWT = process.env.PINATA_JWT!;
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

// ✅ UPDATED ABI FOR PassportNFT with FID (Dec 21, 2025)
const PASSPORT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "beneficiary", type: "address" },
      { internalType: "uint256", name: "userFid", type: "uint256" },
      { internalType: "string", name: "countryCode", type: "string" },
      { internalType: "string", name: "countryName", type: "string" },
      { internalType: "string", name: "region", type: "string" },
      { internalType: "string", name: "continent", type: "string" },
      { internalType: "string", name: "uri", type: "string" }
    ],
    name: "mintFor",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "user", type: "address" }],
    name: "getCooldownStatus",
    outputs: [
      { internalType: "bool", name: "isOnCooldown", type: "bool" },
      { internalType: "uint256", name: "timeRemaining", type: "uint256" }
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: true, internalType: "uint256", name: "userFid", type: "uint256" },
      { indexed: false, internalType: "string", name: "countryCode", type: "string" },
      { indexed: false, internalType: "string", name: "countryName", type: "string" },
      { indexed: false, internalType: "string", name: "region", type: "string" },
      { indexed: false, internalType: "string", name: "continent", type: "string" },
      { indexed: false, internalType: "bool", name: "verified", type: "bool" }
    ],
    name: "PassportMinted",
    type: "event",
  },
];

// ABI for viem encodeFunctionData
const PASSPORT_VIEM_ABI = [
  {
    inputs: [
      { name: "beneficiary", type: "address" },
      { name: "userFid", type: "uint256" },
      { name: "countryCode", type: "string" },
      { name: "countryName", type: "string" },
      { name: "region", type: "string" },
      { name: "continent", type: "string" },
      { name: "uri", type: "string" }
    ],
    name: "mintFor",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
] as const;

async function uploadMetadataToPinata(metadata: any, countryCode: string, tokenId: number) {
  try {
    const response = await axios.post(
      PINATA_API_URL,
      {
        pinataContent: metadata,
        pinataMetadata: {
          name: `passport-${countryCode}-${tokenId}`,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PINATA_JWT}`,
          "Content-Type": "application/json",
        },
      }
    );
    const cid = response.data.IpfsHash;
    console.log(`✅ Metadata uploaded to IPFS: ipfs://${cid}`);
    return `ipfs://${cid}`;
  } catch (error: any) {
    console.error("❌ Pinata upload error:", error.response?.data || error.message);
    throw new Error(`Pinata upload failed: ${error.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fid, countryCode, countryName, userAddress } = await req.json();
    console.log('🎫 Passport mint request:', { fid, countryCode, countryName, userAddress });

    // Validate required fields
    if (!countryCode || !countryName) {
      throw new Error("Missing countryCode or countryName");
    }

    if (!userAddress) {
      throw new Error("Missing userAddress");
    }

    const normalizedAddress = userAddress.toLowerCase();

    // ============================================
    // 🛡️ ANTI-GAMING: Server-side geo verification
    // ============================================
    const geoData = await getCountryFromIP(req);

    if (!geoData) {
      console.warn('⚠️ Could not verify location - blocking mint for safety');
      return NextResponse.json({
        error: "Could not verify your location. Please try again.",
        details: "Server-side geo verification failed. Make sure you're not using a VPN."
      }, { status: 403 });
    }

    // Verify the requested country matches the user's actual location
    // Special case: IPinfo returns "CN" for Hong Kong IPs (administrative classification)
    // but client geolocation correctly detects "HK", so allow this mismatch
    const isHongKongOverride = geoData.country === "CN" && countryCode === "HK";
    
    if (geoData.country !== countryCode && !isHongKongOverride) {
      console.warn(`🚨 GEO MISMATCH: User IP is in ${geoData.country} but requested ${countryCode}`);
      return NextResponse.json({
        error: `Location mismatch! You can only mint a passport for your current country.`,
        details: `Your detected location is ${geoData.country}, but you requested ${countryCode}. VPN usage is not allowed.`,
        detectedCountry: geoData.country,
        requestedCountry: countryCode
      }, { status: 403 });
    }

    if (isHongKongOverride) {
      console.log(`✅ Geo verified: Hong Kong override (IPinfo CN → HK)`);
    } else {
      console.log(`✅ Geo verified: User is in ${geoData.country}`);
    }

    // ============================================
    // 🛡️ ANTI-GAMING: Rate limiting & cooldown
    // ============================================
    const rateLimitKey = `passport:ratelimit:${normalizedAddress}`;
    const cooldownKey = `passport:cooldown:${normalizedAddress}`;
    const lockKey = `passport:lock:${normalizedAddress}:${countryCode}`;

    // Check cooldown (30 seconds between mints)
    const lastMintTime = await redis.get(cooldownKey);
    if (lastMintTime) {
      const elapsed = Date.now() - Number(lastMintTime);
      const remaining = Math.ceil((MINT_COOLDOWN * 1000 - elapsed) / 1000);
      if (remaining > 0) {
        return NextResponse.json({
          error: `Please wait ${remaining} seconds before minting another passport.`,
          cooldownRemaining: remaining
        }, { status: 429 });
      }
    }

    // Check rate limit (max 3 per hour)
    const mintCount = await redis.get(rateLimitKey);
    if (mintCount && Number(mintCount) >= MAX_MINTS_PER_HOUR) {
      return NextResponse.json({
        error: `Rate limit exceeded. Maximum ${MAX_MINTS_PER_HOUR} passport mints per hour.`,
        details: "Please try again later."
      }, { status: 429 });
    }

    // Acquire lock to prevent concurrent mints
    const lockAcquired = await redis.set(lockKey, '1', { nx: true, ex: LOCK_TTL });
    if (!lockAcquired) {
      return NextResponse.json({
        error: "A mint is already in progress for this country. Please wait.",
      }, { status: 429 });
    }

    // Validate country code against our 195 countries database
    if (!isValidCountryCode(countryCode)) {
      await redis.del(lockKey); // Release lock
      throw new Error(`Invalid country code: ${countryCode}. Must be one of 195 recognized countries.`);
    }

    // Get full country info
    const countryInfo = getCountryByCode(countryCode);
    if (!countryInfo) {
      await redis.del(lockKey); // Release lock
      throw new Error(`Country not found: ${countryCode}`);
    }

    console.log(`🌍 Country validated: ${countryInfo.flag} ${countryInfo.name} (${countryInfo.region}, ${countryInfo.continent})`);

    const recipientAddress = userAddress;
    let username = "traveler";

    // If FID provided, resolve to wallet address
    if (fid) {
      try {
        const neynarRes = await axios.get(
          `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
          { headers: { api_key: NEYNAR_API_KEY } }
        );
        const userData = neynarRes.data.users[0];
        if (userData) {
          username = userData.username || "traveler";
          console.log(`✅ Farcaster user: @${username} (FID ${fid})`);
        }
      } catch (neynarError: any) {
        console.warn("⚠️ Neynar lookup failed, proceeding anyway:", neynarError.message);
      }
    }

    if (!recipientAddress) {
      throw new Error("No recipient address provided");
    }

    console.log(`👤 Recipient: ${recipientAddress} (@${username})`);

    // 🚨 Check for existing passport for this country + wallet combination (read from chain)
    console.log(`🔍 Checking for existing ${countryCode} passport for ${recipientAddress}...`);
    
    try {
      // Ask the contract. This used to ask the indexer, whose passport entry is two contract
      // generations behind — named V2, pointing at V3, live contract V4 — so it answered "no
      // passport" for every V4 holder and this guard passed every duplicate straight through to
      // a revert on chain. One read, narrowed to the one country being minted.
      //
      // The fail-closed behaviour below is unchanged and load-bearing: a read that throws must
      // BLOCK the mint, never wave it through. That is what the catch does.
      const existingPassports = await findAllPassports(publicClient as PublicClient, {
        passportAddress: PASSPORT_NFT_ADDRESS as Address,
        countryCodes: [countryCode.toUpperCase()],
        address: recipientAddress as Address,
      });

      if (existingPassports.length > 0) {
        console.log(`❌ DUPLICATE DETECTED: User already has ${countryCode} passport #${existingPassports[0].tokenId}`);
        await redis.del(lockKey); // Release lock

        return NextResponse.json({
          error: `You already own a ${countryInfo.flag} ${countryName} passport!`,
          details: `Each wallet can only mint ONE passport per country. Your existing passport: Token #${existingPassports[0].tokenId}`,
          existingTokenId: existingPassports[0].tokenId
        }, { status: 400 });
      }

      console.log(`✅ No existing ${countryCode} passport found - proceeding with mint`);
    } catch (checkError) {
      // 🛡️ ANTI-GAMING: Fail-closed - block mints on any verification error
      console.error('❌ Passport verification error - blocking mint:', checkError);
      await redis.del(lockKey); // Release lock
      return NextResponse.json({
        error: "Could not verify passport eligibility. Please try again.",
        details: "Verification system error."
      }, { status: 503 });
    }

    // Generate metadata with SVG image (supports all 195 countries!)
    console.log(`🎨 Generating passport metadata for ${countryName}...`);
    const metadata = generatePassportMetadata(
      countryCode,
      countryName,
      0  // We don't know the tokenId yet
    );

    // Upload metadata to IPFS
    const tokenURI = await uploadMetadataToPinata(metadata, countryCode, 0);

    // ✅ Mint using PassportNFT with FID support via Platform Safe
    console.log(`⚡ Minting passport to ${recipientAddress}...`);
    console.log(`📍 Country data:`, {
      code: countryInfo.code,
      name: countryInfo.name,
      region: countryInfo.region,
      continent: countryInfo.continent,
      fid: fid || 0
    });

    // ============================================
    // 🛡️ CHECK 24-HOUR CONTRACT-LEVEL COOLDOWN
    // ============================================
    try {
      const [isOnCooldown, timeRemaining] = await publicClient.readContract({
        address: PASSPORT_NFT_ADDRESS as Address,
        abi: PASSPORT_ABI,
        functionName: 'getCooldownStatus',
        args: [recipientAddress as Address],
      }) as [boolean, bigint];

      if (isOnCooldown) {
        const seconds = Number(timeRemaining);
        const hours = Math.ceil(seconds / 3600);
        const minutes = Math.ceil((seconds % 3600) / 60);
        
        let timeText = "";
        if (hours > 0) {
          timeText = `${hours} hour${hours > 1 ? 's' : ''}`;
          if (minutes > 0) {
            timeText += ` and ${minutes} minute${minutes > 1 ? 's' : ''}`;
          }
        } else {
          timeText = `${seconds} second${seconds > 1 ? 's' : ''}`;
        }

        await redis.del(lockKey); // Release lock
        return NextResponse.json({
          error: `You already minted a passport recently. Please wait ${timeText} to mint another passport.`,
          cooldownReason: "24-hour cooldown between passports (anti-gaming measure)",
          timeRemaining: seconds,
          timeText: timeText
        }, { status: 429 });
      }
    } catch (cooldownCheckError) {
      console.error('❌ Error checking contract cooldown:', cooldownCheckError);
      // Don't block on error - let transaction fail gracefully
    }

    const mintData = encodeFunctionData({
      abi: PASSPORT_VIEM_ABI,
      functionName: 'mintFor',
      args: [
        recipientAddress as Address,  // beneficiary
        BigInt(fid || 0),             // userFid
        countryInfo.code,             // countryCode
        countryInfo.name,             // countryName
        countryInfo.region,           // region
        countryInfo.continent,        // continent
        tokenURI                      // uri
      ],
    });

    // Two reverts sat between this route and a working mint, and both looked identical from the
    // outside: an opaque "Mint transaction reverted" after the gas was spent.
    //
    //   1. The Safe was never added to `authorizedMinters`, so `mintFor` failed its modifier.
    //   2. `_mintPassport` does `wmonToken.safeTransferFrom(msg.sender, platformWallet,
    //      MINT_PRICE)` and the Safe's allowance to the passport contract was 0.
    //
    // Checked BEFORE sending, so a misconfigured deployment says which one it is instead of
    // charging for the discovery. Everything read from the contract — MINT_PRICE included,
    // because a hard-coded 150 is a number that silently goes stale.
    const preflight = await preflightPassportMint(
      publicClient as unknown as PublicClient,
      {
        passport: PASSPORT_NFT_ADDRESS as Address,
        sender: safeAddress,
      },
    );

    if (!preflight.ok) {
      await redis.del(lockKey);
      console.error('❌ Passport mint preflight failed:', preflight.reason);
      return NextResponse.json(
        { error: preflight.reason, fix: preflight.fix },
        { status: 503 },
      );
    }

    const txHash = await sendSafeTransaction(
      buildPassportMintCalls({
        passport: PASSPORT_NFT_ADDRESS as Address,
        wmon: preflight.wmon,
        mintPrice: preflight.mintPrice,
        allowance: preflight.allowance,
        mintData: mintData as Hex,
      }),
    );

    console.log(`📤 Mint tx sent: ${txHash}`);
    const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash as `0x${string}` });

    if (receipt.status !== 'success') {
      throw new Error("Mint transaction reverted");
    }

    // ✅ Extract tokenId from PassportMinted event (not Transfer!)
    const iface = new Interface(PASSPORT_ABI);
    let tokenId = 0;
    
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === 'PassportMinted') {
          tokenId = Number(parsed.args.tokenId);
          console.log(`🎫 PassportMinted event found! Token ID: ${tokenId}`);
          break;
        }
      } catch {
        // Skip logs that don't match
      }
    }

    if (tokenId === 0) {
      console.warn('⚠️ Could not extract tokenId from PassportMinted event');
      // Try to get it from the return value instead
      tokenId = 0; // Fallback - you might need to query the contract
    }

    console.log(`✅ Passport #${tokenId} minted for ${recipientAddress}`);

    // Now update metadata with correct tokenId
    const finalMetadata = generatePassportMetadata(countryCode, countryName, tokenId);
    const finalTokenURI = await uploadMetadataToPinata(finalMetadata, countryCode, tokenId);

    console.log(`✅ Final metadata uploaded: ${finalTokenURI}`);

    // ✅ Post cast using Neynar SDK with frame embed (opens in miniapp!)
    if (fid) {
      try {
        // Frame URL that opens passport in miniapp when clicked
        const frameUrl = `${APP_URL}/api/frames/passport/${tokenId}`;

        const castText = `🎫 New EmpowerTours Passport Minted!

${countryInfo.flag} ${countryName} ${countryCode}

Token #${tokenId}

@${username}

@empowertours`;

        console.log('📢 Posting cast to Farcaster using Neynar SDK...');
        console.log('🎬 Frame URL (opens in miniapp):', frameUrl);

        // Initialize Neynar client with correct SDK
        const client = new NeynarAPIClient({
          apiKey: NEYNAR_API_KEY,
        });

        // ✅ Use SDK publishCast method with frame embed
        const result = await client.publishCast({
          signerUuid: process.env.BOT_SIGNER_UUID || '',
          text: castText,
          embeds: [{ url: frameUrl }]  // Frame opens in miniapp, not browser!
        });

        console.log('✅ Cast posted successfully:', {
          hash: result.cast?.hash,
          country: countryName,
          tokenId,
          frameUrl,
        });
      } catch (castError: any) {
        console.warn('⚠️ Cast failed (mint still succeeded):', castError.message);
        // Don't fail the entire mint if cast fails
      }
    }

    // ============================================
    // 🛡️ ANTI-GAMING: Update rate limits on success
    // ============================================
    await redis.incr(rateLimitKey);
    await redis.expire(rateLimitKey, RATE_LIMIT_WINDOW);
    await redis.set(cooldownKey, Date.now().toString(), { ex: MINT_COOLDOWN });
    await redis.del(lockKey); // Release lock

    console.log(`✅ Rate limits updated for ${normalizedAddress}`);

    return NextResponse.json({
      success: true,
      txHash: txHash,
      tokenId: tokenId,
      tokenURI: finalTokenURI,
      country: {
        code: countryInfo.code,
        name: countryInfo.name,
        flag: countryInfo.flag,
        region: countryInfo.region,
        continent: countryInfo.continent,
      },
      metadata: finalMetadata,
    });

  } catch (error: any) {
    // Note: Lock will auto-expire after LOCK_TTL (60s) if not released
    console.error("❌ Mint error:", {
      message: error.message,
      reason: error.reason || error.shortMessage,
      data: error.data,
      response: error.response?.data,
    });

    return NextResponse.json({
      error: error.message || "Mint failed",
      details: error.reason || error.shortMessage,
    }, { status: 500 });
  }
}
