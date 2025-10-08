import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { ethers } from "ethers";

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

const provider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", provider);
const contract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PASSPORT_ABI, wallet);

async function generateMetadata(countryCode: string, countryName: string) {
  try {
    // Replace with your actual Gemini API call (based on your logs)
    const geminiResponse = await axios.post(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent",
      {
        contents: [
          {
            parts: [
              { text: `Generate NFT metadata for a travel passport in ${countryName}. Include a description and image URL.` }
            ],
          },
        ],
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": GEMINI_API_KEY,
        },
      }
    );

    const generatedContent = geminiResponse.data.candidates[0].content.parts[0].text;
    // Parse or format the response as needed
    const metadata = {
      name: `EmpowerTours Passport: ${countryName}`,
      description: generatedContent || `A unique NFT passport for ${countryName} (Code: ${countryCode})`,
      image: `https://harlequin-used-hare-224.mypinata.cloud/ipfs/QmPK4TiGqmFRFuYuEVUecqvVy6gjpkoJquJ2Dm11P5ui9W`, // Your logged CID
      attributes: [
        { trait_type: "Country Code", value: countryCode },
        { trait_type: "Country Name", value: countryName },
      ],
    };

    return metadata;
  } catch (error: any) {
    throw new Error(`Metadata generation failed: ${error.message}`);
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
    throw new Error(`Pinata upload failed: ${error.message}`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const { fid, countryCode, countryName, userAddress, tokenId } = await req.json();
    if (!fid || !countryCode || !countryName || !userAddress) {
      throw new Error("Missing fid, countryCode, countryName, or userAddress");
    }

    // 1️⃣ Get user wallet from FID
    const accountRes = await fetch(`https://fnames.farcaster.xyz/transfers?fid=${fid}`);
    const accountData = await accountRes.json();
    const fetchedAddress = accountData.transfers?.[0]?.owner;
    if (!fetchedAddress || fetchedAddress.toLowerCase() !== userAddress.toLowerCase()) {
      throw new Error("FID wallet does not match provided userAddress");
    }

    // 2️⃣ Check balance (no multiples)
    const balance = await contract.balanceOf(userAddress);
    if (balance > 0 && !tokenId) {
      return NextResponse.json({ error: "Already owns a passport" }, { status: 400 });
    }

    let transaction_hash, newTokenId;

    // 3️⃣ Generate and upload metadata to Pinata
    const metadata = await generateMetadata(countryCode, countryName);
    const tokenURI = await uploadToPinata(metadata);

    // 4️⃣ If tokenId provided, only set tokenURI (client-side mint)
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
      // 5️⃣ Server-side mint (deployer pays 0.01 MON)
      console.log("Minting directly to:", userAddress);
      const gasEstimate = await contract.mint.estimateGas(userAddress);
      console.log("Gas estimate:", gasEstimate.toString());

      const tx = await contract.mint(userAddress, {
        gasLimit: gasEstimate * 120n / 100n,
        value: ethers.parseEther("0.01"),
      });
      console.log("Mint tx sent:", tx.hash);

      const receipt = await tx.wait();
      if (receipt.status !== 1) {
        throw new Error(`Mint reverted: Check logs for reason`);
      }

      newTokenId = receipt.logs
        .filter((log: any) => log.address.toLowerCase() === PASSPORT_NFT_ADDRESS.toLowerCase())
        .map((log: any) => contract.interface.parseLog(log))
        .find((log: any) => log?.name === "Transfer" && log.args.from === ethers.ZeroAddress)?.args.tokenId;

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

    // 6️⃣ Post cast via empowertoursbot
    try {
      await axios.post(
        "https://api.neynar.com/v2/farcaster/cast",
        {
          text: `Minted a new EmpowerTours Passport for ${countryName} to @${accountData.transfers?.[0]?.username}! Token ID: ${newTokenId} 🎉 View at https://harlequin-used-hare-224.mypinata.cloud/ipfs/${tokenURI.split("ipfs://")[1]}`,
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
    });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
