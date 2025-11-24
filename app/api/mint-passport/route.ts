import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { JsonRpcProvider, Wallet, Contract, parseEther, Interface } from "ethers";
import { NeynarAPIClient } from "@neynar/nodejs-sdk";
import { generatePassportMetadata, isValidCountryCode } from "@/lib/passport/generatePassportSVG";
import { getCountryByCode } from "@/lib/passport/countries";
import { redis } from "@/lib/redis";

const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT_NFT_V2 || process.env.NEXT_PUBLIC_PASSPORT || "0x04a8983587B79cd0a4927AE71040caf3baA613f1";
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
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_JWT = process.env.PINATA_JWT!;
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';

// ✅ UPDATED ABI FOR PassportNFTv2
const PASSPORT_ABI = [
  {
    inputs: [
      { internalType: "address", name: "to", type: "address" },
      { internalType: "string", name: "countryCode", type: "string" },
      { internalType: "string", name: "countryName", type: "string" },
      { internalType: "string", name: "region", type: "string" },
      { internalType: "string", name: "continent", type: "string" },
      { internalType: "string", name: "uri", type: "string" }
    ],
    name: "mint",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
      { indexed: true, internalType: "address", name: "owner", type: "address" },
      { indexed: false, internalType: "string", name: "countryCode", type: "string" },
      { indexed: false, internalType: "string", name: "countryName", type: "string" },
      { indexed: false, internalType: "string", name: "region", type: "string" },
      { indexed: false, internalType: "string", name: "continent", type: "string" }
    ],
    name: "PassportMinted",
    type: "event",
  },
];

const provider = new JsonRpcProvider("https://testnet-rpc.monad.xyz");
const wallet = new Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", provider);
const contract = new Contract(PASSPORT_NFT_ADDRESS, PASSPORT_ABI, wallet);

async function uploadMetadataToPinata(metadata: any, countryCode: string, tokenId: number) {
  try {
    const response = await axios.post(
      PINATA_API_URL,
      metadata,
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
    if (geoData.country !== countryCode) {
      console.warn(`🚨 GEO MISMATCH: User IP is in ${geoData.country} but requested ${countryCode}`);
      return NextResponse.json({
        error: `Location mismatch! You can only mint a passport for your current country.`,
        details: `Your detected location is ${geoData.country}, but you requested ${countryCode}. VPN usage is not allowed.`,
        detectedCountry: geoData.country,
        requestedCountry: countryCode
      }, { status: 403 });
    }

    console.log(`✅ Geo verified: User is in ${geoData.country}`);

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

    let recipientAddress = userAddress;
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

    // 🚨 Check for existing passport for this country + wallet combination (using Envio)
    console.log(`🔍 Checking for existing ${countryCode} passport for ${recipientAddress}...`);
    
    try {
      const checkQuery = `
        query CheckExistingPassport($owner: String!, $countryCode: String!, $contract: String!) {
          PassportNFT(
            where: {
              owner: {_eq: $owner}
              countryCode: {_eq: $countryCode}
              contract: {_eq: $contract}
            }
            limit: 1
          ) {
            id
            tokenId
            countryCode
            contract
          }
        }
      `;

      const checkResponse = await fetch(ENVIO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: checkQuery,
          variables: {
            owner: recipientAddress.toLowerCase(),
            countryCode: countryCode,
            contract: PASSPORT_NFT_ADDRESS.toLowerCase()
          }
        })
      });

      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        const existingPassports = checkResult.data?.PassportNFT || [];

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
      } else {
        // 🛡️ ANTI-GAMING: Fail-closed - block mints if Envio check fails
        console.error('❌ Envio check failed - blocking mint for safety');
        await redis.del(lockKey); // Release lock
        return NextResponse.json({
          error: "Could not verify passport eligibility. Please try again.",
          details: "Our verification system is temporarily unavailable."
        }, { status: 503 });
      }
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

    // ✅ Mint using PassportNFTv2 with all country data
    console.log(`⚡ Minting passport to ${recipientAddress}...`);
    console.log(`📍 Country data:`, {
      code: countryInfo.code,
      name: countryInfo.name,
      region: countryInfo.region,
      continent: countryInfo.continent
    });

    const tx = await contract.mint(
      recipientAddress,
      countryInfo.code,        // countryCode
      countryInfo.name,        // countryName  
      countryInfo.region,      // region
      countryInfo.continent,   // continent
      tokenURI                 // uri
    );

    console.log(`📤 Mint tx sent: ${tx.hash}`);
    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
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
      } catch (e) {
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
      txHash: tx.hash,
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
