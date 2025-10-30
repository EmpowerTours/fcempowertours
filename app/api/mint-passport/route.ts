import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { JsonRpcProvider, Wallet, Contract, parseEther, Interface } from "ethers";
import { Neynar } from "@neynar/nodejs-sdk";
import { generatePassportMetadata, isValidCountryCode } from "@/lib/passport/generatePassportSVG";
import { getCountryByCode } from "@/lib/passport/countries";

const PASSPORT_NFT_ADDRESS = process.env.NEXT_PUBLIC_PASSPORT || "0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08";
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_JWT = process.env.PINATA_JWT!;
const ENVIO_ENDPOINT = process.env.NEXT_PUBLIC_ENVIO_ENDPOINT || 'http://localhost:8080/v1/graphql';

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

    // Validate country code against our 195 countries database
    if (!isValidCountryCode(countryCode)) {
      throw new Error(`Invalid country code: ${countryCode}. Must be one of 195 recognized countries.`);
    }

    // Get full country info
    const countryInfo = getCountryByCode(countryCode);
    if (!countryInfo) {
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
        query CheckExistingPassport($owner: String!, $countryCode: String!) {
          PassportNFT(
            where: {
              owner: {_eq: $owner}
              countryCode: {_eq: $countryCode}
            }
            limit: 1
          ) {
            id
            tokenId
            countryCode
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
            countryCode: countryCode
          }
        })
      });

      if (checkResponse.ok) {
        const checkResult = await checkResponse.json();
        const existingPassports = checkResult.data?.PassportNFT || [];

        if (existingPassports.length > 0) {
          console.log(`❌ DUPLICATE DETECTED: User already has ${countryCode} passport #${existingPassports[0].tokenId}`);
          
          return NextResponse.json({
            error: `You already own a ${countryInfo.flag} ${countryName} passport!`,
            details: `Each wallet can only mint ONE passport per country. Your existing passport: Token #${existingPassports[0].tokenId}`,
            existingTokenId: existingPassports[0].tokenId
          }, { status: 400 });
        }

        console.log(`✅ No existing ${countryCode} passport found - proceeding with mint`);
      } else {
        console.warn('⚠️ Envio check failed, proceeding with caution');
      }
    } catch (checkError) {
      console.warn('⚠️ Could not verify duplicate passport:', checkError);
      // Continue with mint - better to allow than block legitimate mints
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

    // ✅ FIXED: Post cast using Neynar SDK (reliable, same as music)
    if (fid) {
      try {
        const castText = `🎫 New EmpowerTours Passport Minted!

${countryInfo.flag} ${countryName} ${countryCode}

Token #${tokenId}

@${username}

View: https://testnet.monadscan.com/tx/${tx.hash}

@empowertours`;

        console.log('📢 Posting cast to Farcaster using Neynar SDK...');
        
        // Initialize Neynar client (same as music)
        const client = new Neynar({
          apiKey: NEYNAR_API_KEY,
        });

        // ✅ Use SDK publishCast method (reliable)
        const result = await client.publishCast({
          signerUuid: process.env.BOT_SIGNER_UUID || '',
          text: castText,
        });

        console.log('✅ Cast posted successfully:', {
          hash: result.cast?.hash,
          country: countryName,
          tokenId,
        });
      } catch (castError: any) {
        console.warn('⚠️ Cast failed (mint still succeeded):', castError.message);
        // Don't fail the entire mint if cast fails
      }
    }

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
