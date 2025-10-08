import { NextRequest, NextResponse } from "next/server";
import axios from "axios";
import { ethers } from "ethers"; // Correct ethers v6 import

// Contract details
const PASSPORT_NFT_ADDRESS = "0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4";
const NEYNAR_API_URL = "https://api.neynar.com/v2/farcaster/nft/mint/";
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY!;
const NEYNAR_WALLET_ID = process.env.NEYNAR_WALLET_ID!; // Add to .env.local
const PASSPORT_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "to", "type": "address" }
    ],
    "name": "mint",
    "outputs": [],
    "stateMutability": "payable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "tokenId", "type": "uint256" },
      { "internalType": "string", "name": "uri", "type": "string" }
    ],
    "name": "setTokenURI",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" }
    ],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      { "indexed": true, "internalType": "address", "name": "from", "type": "address" },
      { "indexed": true, "internalType": "address", "name": "to", "type": "address" },
      { "indexed": true, "internalType": "uint256", "name": "tokenId", "type": "uint256" }
    ],
    "name": "Transfer",
    "type": "event"
  }
];

const provider = new ethers.JsonRpcProvider("https://testnet-rpc.monad.xyz");
const wallet = new ethers.Wallet(process.env.DEPLOYER_PRIVATE_KEY || "", provider);
const contract = new ethers.Contract(PASSPORT_NFT_ADDRESS, PASSPORT_ABI, wallet);

export async function POST(req: NextRequest) {
  try {
    const { fid, countryCode, countryName, tokenURI } = await req.json();
    if (!fid || !tokenURI || !countryCode || !countryName) {
      throw new Error("Missing fid, tokenURI, countryCode, or countryName");
    }

    // 1️⃣ Get user wallet from FID
    const accountRes = await fetch(`https://fnames.farcaster.xyz/transfers?fid=${fid}`);
    const accountData = await accountRes.json();
    const userAddress = accountData.transfers?.[0]?.owner;
    if (!userAddress) {
      throw new Error("No wallet found for FID");
    }

    // 2️⃣ Check balance
    const balance = await contract.balanceOf(userAddress);
    if (balance > 0) {
      return NextResponse.json({ error: "Already owns a passport" }, { status: 400 });
    }

    // 3️⃣ Gasless mint via Neynar's Farcaster NFT Mint API
    const mintResponse = await axios.post(
      NEYNAR_API_URL,
      {
        network: "monad-testnet",
        contract_address: PASSPORT_NFT_ADDRESS,
        function_signature: "mint(address)",
        args: [userAddress],
        recipients: [
          {
            fid: fid,
            quantity: 1
          }
        ],
        async: false
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-api-key": NEYNAR_API_KEY,
          "x-wallet-id": NEYNAR_WALLET_ID
        }
      }
    );

    if (mintResponse.status !== 200) {
      throw new Error(`Neynar mint failed: ${mintResponse.data.message || mintResponse.statusText}`);
    }

    const { transactions } = mintResponse.data;
    const { transaction_hash, receipt } = transactions[0];
    if (!receipt?.status || receipt.status !== "1") {
      throw new Error(`Mint transaction failed: ${transaction_hash}`);
    }

    // 4️⃣ Extract tokenId from receipt logs
    const tokenId = receipt.logs
      .filter((log: any) => log.address.toLowerCase() === PASSPORT_NFT_ADDRESS.toLowerCase())
      .map((log: any) => contract.interface.parseLog(log))
      .find((log: any) => log?.name === "Transfer")?.args.tokenId;

    if (!tokenId) {
      throw new Error("Failed to extract tokenId from mint receipt");
    }

    // 5️⃣ Set tokenURI using deployer wallet
    const setUriTx = await contract.setTokenURI(tokenId, tokenURI);
    await setUriTx.wait();
    console.log(`Set tokenURI for token ${tokenId}: ${tokenURI}`);

    // 6️⃣ Post cast via empowertoursbot
    await axios.post(
      "https://api.neynar.com/v2/farcaster/cast",
      {
        text: `Minted a new EmpowerTours Passport for ${countryName} to @${accountData.transfers?.[0]?.username}! Token ID: ${tokenId} 🎉 View at https://harlequin-used-hare-224.mypinata.cloud/ipfs/${tokenURI.split("ipfs://")[1]}`,
        signer_uuid: process.env.BOT_SIGNER_UUID
      },
      {
        headers: { api_key: NEYNAR_API_KEY }
      }
    );
    console.log("Cast posted via empowertoursbot");

    return NextResponse.json({
      success: true,
      txHash: transaction_hash,
      tokenId: Number(tokenId)
    });
  } catch (error: any) {
    console.error("Mint error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
