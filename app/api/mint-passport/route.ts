import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { JsonRpcProvider, Wallet, Contract, ZeroAddress, parseEther, Log, LogDescription } from "ethers";

const PASSPORT_NFT_ADDRESS = "0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4";
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const PINATA_API_URL = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PINATA_JWT = process.env.PINATA_JWT!;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY!;
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

async function generateMetadata(countryCode: string, countryName: string) {
  try {
    // Use the correct Gemini API v1beta endpoint
    const geminiResponse = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            parts: [
              { 
                text: `Generate a brief, exciting description (2-3 sentences) for a travel passport NFT representing ${countryName}. Focus on adventure and exploration.` 
              }
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
      }
    );
    
    const generatedContent = geminiResponse.data.candidates?.[0]?.content?.parts?.[0]?.text || 
      `A unique digital passport commemorating your adventures in ${countryName}. Collect these NFTs as proof of your global travels!`;
    
    const metadata = {
      name: `EmpowerTours Passport: ${countryName}`,
      description: generatedContent,
      image: `https://harlequin-used-hare-224.mypinata.cloud/ipfs/QmPK4TiGqmFRFuYuEVUecqvVy6gjpkoJquJ2Dm11P5ui9W`,
      attributes: [
        { trait_type: "Country Code", value: countryCode },
        { trait_type: "Country Name", value: countryName },
        { trait_type: "Minted On", value: new Date().toISOString() },
      ],
    };
    return metadata;
  } catch (error: any) {
    console.error("Gemini API error:", error.response?.data || error.message);
    // Fallback to basic metadata if Gemini fails
    const metadata = {
      name: `EmpowerTours Passport: ${countryName}`,
      description: `A unique digital passport NFT commemorating your travels to ${countryName}. Part of the EmpowerTours collection powered by Monad and Farcaster.`,
      image: `https://harlequin-used-hare-224.mypinata.cloud/ipfs/QmPK4TiGqmFRFuYuEVUecqvVy6gjpkoJquJ2Dm11P5ui9W`,
      attributes: [
        { trait_type: "Country Code", value: countryCode },
        { trait_type: "Country Name", value: countryName },
        { trait_type: "Minted On", value: new Date().toISOString() },
      ],
    };
    return metadata;
  }
}

async function uploadToPinata(metadata: any) {
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
    console.log("Metadata uploaded to IPFS:", `ipfs://${cid}`);
    return `ipfs://${cid}`;
  } catch (error: any) {
    console.error("Pinata upload error:", error.response?.data || error.message);
    throw new Error(`Pinata upload failed: ${error.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fid, countryCode, countryName, userAddress, tokenId } = await req.json();
    console.log('API received:', { fid, countryCode, countryName, userAddress, tokenId });
    
    if (!fid || !countryCode || !countryName) {
      throw new Error("Missing fid, countryCode, or countryName");
    }

    // Resolve FID to wallet address via Neynar
    const neynarRes = await axios.get(
      `https://api.neynar.com/v2/farcaster/user/bulk?fids=${fid}`,
      { headers: { api_key: NEYNAR_API_KEY } }
    );
    const userData = neynarRes.data.users[0];
    if (!userData || !userData.custody_address) {
      throw new Error("User not found or no custody address for FID");
    }
    const fetchedAddress = userData.custody_address;
    const username = userData.username || "unknown";

    // Verify userAddress if provided (for client-side mint)
    if (userAddress && userAddress.toLowerCase() !== fetchedAddress.toLowerCase()) {
      throw new Error("Provided userAddress does not match FID's custody address");
    }
    const recipientAddress = userAddress || fetchedAddress;

    // Check balance (no multiples)
    const balance = await contract.balanceOf(recipientAddress);
    if (balance > 0 && !tokenId) {
      return NextResponse.json({ error: "Already owns a passport" }, { status: 400 });
    }

    let transaction_hash, newTokenId;
    
    // Generate and upload metadata
    const metadata = await generateMetadata(countryCode, countryName);
    const tokenURI = await uploadToPinata(metadata);

    // If tokenId provided, only set tokenURI (client-side mint)
    if (tokenId) {
      console.log("Setting tokenURI for existing token:", tokenId);
      const gasEstimateUri = await contract.setTokenURI.estimateGas(tokenId, tokenURI);
      const setUriTx = await contract.setTokenURI(tokenId, tokenURI, {
        gasLimit: gasEstimateUri * 120n / 100n,
      });
      await setUriTx.wait();
      console.log(`Set tokenURI for token ${tokenId}: ${tokenURI}`);
      transaction_hash = setUriTx.hash;
      newTokenId = tokenId;
    } else {
      // Server-side mint (deployer pays 0.01 MON)
      console.log("Minting directly to:", recipientAddress);
      const gasEstimate = await contract.mint.estimateGas(recipientAddress);
      console.log("Gas estimate:", gasEstimate.toString());
      const tx = await contract.mint(recipientAddress, {
        gasLimit: gasEstimate * 120n / 100n,
        value: parseEther("0.01"),
      });
      console.log("Mint tx sent:", tx.hash);
      const receipt = await tx.wait();
      if (receipt?.status !== 1) {
        throw new Error(`Mint reverted: Check logs for reason`);
      }
      newTokenId = receipt.logs
        .map((log: Log) => contract.interface.parseLog(log))
        .find((parsedLog: LogDescription | null) => parsedLog?.name === "Transfer" && parsedLog.args.from === ZeroAddress)?.args.tokenId;
      if (!newTokenId) {
        throw new Error("Failed to extract tokenId from receipt");
      }

      // Set tokenURI
      const gasEstimateUri = await contract.setTokenURI.estimateGas(newTokenId, tokenURI);
      const setUriTx = await contract.setTokenURI(newTokenId, tokenURI, {
        gasLimit: gasEstimateUri * 120n / 100n,
      });
      await setUriTx.wait();
      console.log(`Set tokenURI for token ${newTokenId}: ${tokenURI}`);
      transaction_hash = tx.hash;
    }

    // Post cast via empowertoursbot
    try {
      await axios.post(
        "https://api.neynar.com/v2/farcaster/cast",
        {
          text: `🌍 New EmpowerTours Passport minted for ${countryName}! @${username} Token #${newTokenId}\n\nView: https://harlequin-used-hare-224.mypinata.cloud/ipfs/${tokenURI.split("ipfs://")[1]}`,
          signer_uuid: process.env.BOT_SIGNER_UUID,
        },
        {
          headers: { api_key: NEYNAR_API_KEY },
        }
      );
      console.log("Cast posted via empowertoursbot");
    } catch (castError: any) {
      console.warn("Failed to post cast, but mint succeeded:", castError.message);
    }

    return NextResponse.json({
      success: true,
      txHash: transaction_hash,
      tokenId: Number(newTokenId),
      tokenURI,
    });
  } catch (error: any) {
    console.error("Mint error details:", {
      message: error.message,
      reason: error.reason || error.shortMessage,
      data: error.data,
      response: error.response?.data,
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
