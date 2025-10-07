import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";
import axios from "axios";

// Contract details
const PASSPORT_NFT_ADDRESS = "0x2c26632F67f5E516704C3b6bf95B2aBbD9FC2BB4";
const PASSPORT_ABI = [
  "function mint(address to) external payable",
  "function setTokenURI(uint256 tokenId, string uri) external",
  "function balanceOf(address owner) external view returns (uint256)",
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
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

    // 3️⃣ Airdrop mint (server pays 0.01 ETH)
    const mintPrice = ethers.parseEther("0.01");
    const mintTx = await contract.mint(userAddress, { value: mintPrice });
    const mintReceipt = await mintTx.wait();
    console.log(`Minted passport to ${userAddress} with tx: ${mintTx.hash}`);

    // 4️⃣ Set tokenURI
    const tokenId = mintReceipt.logs
      .filter((log: any) => log.topics[0] === ethers.id("Transfer(address,address,uint256)"))
      .map((log: any) => ethers.AbiCoder.defaultAbiCoder().decode(["uint256"], log.topics[3])[0])[0];
    await contract.setTokenURI(tokenId, tokenURI);
    console.log(`Set tokenURI for token ${tokenId}: ${tokenURI}`);

    // 5️⃣ Post cast via bot
    await axios.post(
      "https://api.neynar.com/v2/farcaster/cast",
      {
        text: `Minted a new EmpowerTours Passport for ${countryName} to @${accountData.transfers?.[0]?.username}! Token ID: ${tokenId} 🎉`,
        signer_uuid: process.env.BOT_SIGNER_UUID,
      },
      {
        headers: { "api_key": process.env.NEXT_PUBLIC_NEYNAR_API_KEY },
      }
    );
    console.log("Cast posted via empowertoursbot");

    return NextResponse.json({ success: true, txHash: mintTx.hash, tokenId: Number(tokenId) });
  } catch (error: any) {
    console.error("Mint error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
