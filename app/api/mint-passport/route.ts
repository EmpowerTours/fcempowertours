import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { JsonRpcProvider, Wallet, Contract, ZeroAddress, parseEther, Log, LogDescription } from "ethers";
import { generatePassportMetadata, isValidCountryCode } from "@/lib/passport/generatePassportSVG";
import { getCountryByCode } from "@/lib/passport/countries";

const PASSPORT_NFT_ADDRESS = "0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4";
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_JWT = process.env.PINATA_JWT!;

const PASSPORT_ABI = [
  {
    inputs: [{ internalType: "address", name: "to", type: "address" }],
    name: "mint",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
  {
    inputs: [
      { internalType: "uint256", name: "tokenId", type: "uint256" },
      { internalType: "string", name: "uri", type: "string" },
    ],
    name: "setTokenURI",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [{ internalType: "address", name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ internalType: "uint256", name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: "address", name: "from", type: "address" },
      { indexed: true, internalType: "address", name: "to", type: "address" },
      { indexed: true, internalType: "uint256", name: "tokenId", type: "uint256" },
    ],
    name: "Transfer",
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
    const { fid, countryCode, countryName, userAddress, tokenId } = await req.json();
    console.log('🎫 Passport mint request:', { fid, countryCode, countryName, userAddress, tokenId });

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
    console.log(`🌍 Country validated: ${countryInfo?.flag} ${countryInfo?.name} (${countryInfo?.region}, ${countryInfo?.continent})`);

    let recipientAddress = userAddress;
    let username = "traveler";

    // If FID provided, resolve to wallet address - but DON'T use custody address
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

    // REMOVED: Check for existing passport by wallet
    // Users can mint to different wallets (Privy vs Farcaster)
    // Only check if setting tokenURI for existing mint
    if (!tokenId) {
      console.log('✅ New mint - no duplicate check needed');
    }

    let transaction_hash: string;
    let newTokenId: number;

    // Generate metadata with SVG image (supports all 195 countries!)
    console.log(`🎨 Generating passport image for ${countryName}...`);
    const metadata = generatePassportMetadata(
      countryCode,
      countryName,
      tokenId || 0 // Use provided tokenId or 0 as placeholder
    );

    // Upload metadata to IPFS
    const tokenURI = await uploadMetadataToPinata(metadata, countryCode, tokenId || 0);

    // Two paths: 1) Set tokenURI for existing mint, 2) Server-side mint
    if (tokenId) {
      // Path 1: Client already minted, just set tokenURI
      console.log(`📝 Setting tokenURI for existing token ${tokenId}...`);

      const gasEstimateUri = await contract.setTokenURI.estimateGas(tokenId, tokenURI);
      const setUriTx = await contract.setTokenURI(tokenId, tokenURI, {
        gasLimit: gasEstimateUri * 120n / 100n,
      });
      await setUriTx.wait();

      console.log(`✅ TokenURI set for token ${tokenId}: ${tokenURI}`);
      transaction_hash = setUriTx.hash;
      newTokenId = tokenId;

    } else {
      // Path 2: Server-side mint (deployer pays 0.01 MON)
      console.log(`⚡ Minting passport to ${recipientAddress}...`);

      // CRITICAL FIX: Include value in gas estimation
      const gasEstimate = await contract.mint.estimateGas(recipientAddress, {
        value: parseEther("0.01")
      });
      console.log(`⛽ Gas estimate: ${gasEstimate.toString()}`);

      const tx = await contract.mint(recipientAddress, {
        gasLimit: gasEstimate * 120n / 100n,
        value: parseEther("0.01"),
      });

      console.log(`📤 Mint tx sent: ${tx.hash}`);
      const receipt = await tx.wait();

      if (receipt?.status !== 1) {
        throw new Error("Mint transaction reverted");
      }

      // Extract tokenId from Transfer event
      const transferLog = receipt.logs
        .map((log: Log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((parsedLog: LogDescription | null) =>
          parsedLog?.name === "Transfer" &&
          parsedLog.args.from === ZeroAddress
        );

      if (!transferLog || !transferLog.args.tokenId) {
        throw new Error("Failed to extract tokenId from mint receipt");
      }

      newTokenId = Number(transferLog.args.tokenId);
      console.log(`🎫 Token ID: ${newTokenId}`);

      // Now generate metadata with correct tokenId
      const finalMetadata = generatePassportMetadata(countryCode, countryName, newTokenId);
      const finalTokenURI = await uploadMetadataToPinata(finalMetadata, countryCode, newTokenId);

      // Set tokenURI
      console.log(`📝 Setting tokenURI for token ${newTokenId}...`);
      const gasEstimateUri = await contract.setTokenURI.estimateGas(newTokenId, finalTokenURI);
      const setUriTx = await contract.setTokenURI(newTokenId, finalTokenURI, {
        gasLimit: gasEstimateUri * 120n / 100n,
      });
      await setUriTx.wait();

      console.log(`✅ TokenURI set: ${finalTokenURI}`);
      transaction_hash = tx.hash;
    }

    // Post cast via empowertoursbot
    if (fid) {
      try {
        const castText = `🎫 New EmpowerTours Passport Minted!\n\n${countryInfo?.flag || ''} ${countryName} ${countryCode}\n\nToken #${newTokenId}\n\n@${username}\n\nView: https://testnet.monadscan.com/tx/${transaction_hash}\n\n@empowertours`;

        await axios.post(
          "https://api.neynar.com/v2/farcaster/cast",
          {
            text: castText,
            signer_uuid: process.env.BOT_SIGNER_UUID,
          },
          {
            headers: { api_key: NEYNAR_API_KEY },
          }
        );

        console.log("📢 Cast posted via empowertoursbot");
      } catch (castError: any) {
        console.warn("⚠️ Failed to post cast (mint still succeeded):", castError.message);
      }
    }

    return NextResponse.json({
      success: true,
      txHash: transaction_hash,
      tokenId: Number(newTokenId),
      tokenURI,
      country: {
        code: countryCode,
        name: countryName,
        flag: countryInfo?.flag,
        region: countryInfo?.region,
        continent: countryInfo?.continent,
      },
      metadata,
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
