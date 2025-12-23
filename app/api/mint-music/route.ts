import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract, Interface, parseEther } from 'ethers';
import { NeynarAPIClient } from "@neynar/nodejs-sdk";

// ✅ EmpowerToursNFTv9 with FID support (Dec 21, 2025)
const MUSIC_NFT_ADDRESS = process.env.NEXT_PUBLIC_NFT_ADDRESS || '0x5B5aB516fcBC1fF0ac26E3BaD0B72f52E0600b08';
const TOURS_TOKEN_ADDRESS = '0xa123600c82E69cB311B0E068B06Bfa9F787699B7';
const MONAD_RPC = process.env.NEXT_PUBLIC_MONAD_RPC || 'https://rpc-testnet.monadinfra.com';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;
const APP_URL = process.env.NEXT_PUBLIC_URL || 'https://fcempowertours-production-6551.up.railway.app';
const NEYNAR_API_KEY = process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '';

// EmpowerToursNFTv9 ABI with FID (Dec 21, 2025)
const MUSIC_NFT_ABI = [
  {
    inputs: [
      { internalType: 'address', name: 'artist', type: 'address' },
      { internalType: 'uint256', name: 'artistFid', type: 'uint256' },
      { internalType: 'string', name: 'tokenURI', type: 'string' },
      { internalType: 'string', name: 'title', type: 'string' },
      { internalType: 'uint256', name: 'price', type: 'uint256' },
      { internalType: 'uint8', name: 'nftType', type: 'uint8' }
    ],
    name: 'mintMaster',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'nonpayable',
    type: 'function',
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, internalType: 'uint256', name: 'tokenId', type: 'uint256' },
      { indexed: true, internalType: 'address', name: 'artist', type: 'address' },
      { indexed: false, internalType: 'string', name: 'tokenURI', type: 'string' },
      { indexed: false, internalType: 'uint256', name: 'price', type: 'uint256' },
      { indexed: false, internalType: 'uint8', name: 'nftType', type: 'uint8' }
    ],
    name: 'MasterMinted',
    type: 'event',
  },
];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { recipient, tokenURI, metadataCID, metadataCid, price, fid, songTitle } = body;
    let finalTokenURI = tokenURI;
    const cid = metadataCid || metadataCID;
    if (!finalTokenURI && cid) {
      finalTokenURI = `ipfs://${cid}`;
    }
    console.log('🎵 MusicLicenseNFTv4 mint request:', {
      recipient,
      tokenURI: finalTokenURI,
      songTitle: songTitle || 'Untitled',
      price,
      contract: MUSIC_NFT_ADDRESS,
    });
    if (!recipient) {
      return NextResponse.json({ error: 'Missing recipient address' }, { status: 400 });
    }
    if (!finalTokenURI || finalTokenURI === 'ipfs://undefined') {
      return NextResponse.json({ error: 'Missing or invalid metadata CID' }, { status: 400 });
    }
    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }
    
    // Parse price from string to wei
    let priceInWei: bigint;
    try {
      priceInWei = parseEther(price?.toString() || '1');
    } catch (err) {
      console.error('Invalid price format:', price);
      priceInWei = parseEther('1');
    }
    console.log('💰 Price in wei:', priceInWei.toString(), `(${price || '1'} TOURS)`);
    
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    
    // Create contract instance
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);
    console.log('⚡ Minting music master NFT...');
    console.log('   Artist:', recipient);
    console.log('   Song Title:', songTitle || 'Untitled');
    console.log('   Token URI:', finalTokenURI);
    console.log('   License Price:', price || '1', 'TOURS');
    
    const tx = await contract.mintMaster(
      recipient,
      fid || 0,                // artistFid (0 if not provided)
      finalTokenURI,
      songTitle || 'Untitled',
      priceInWei,
      0                        // nftType: 0 = MUSIC
    );
    console.log('📤 Mint tx sent:', tx.hash);
    const receipt = await tx.wait();
    if (receipt?.status !== 1) {
      throw new Error('Mint transaction failed');
    }
    
    // Extract tokenId from MasterMinted event
    let tokenId = 0;
    if (receipt.logs && receipt.logs.length > 0) {
      const iface = new Interface(MUSIC_NFT_ABI);
      for (const log of receipt.logs) {
        try {
          const parsed = iface.parseLog({
            topics: log.topics as string[],
            data: log.data,
          });
          if (parsed?.name === 'MasterMinted') {
            tokenId = Number(parsed.args[0]);
            break;
          }
        } catch (e) {
          // Skip logs that don't match
        }
      }
    }
    console.log('✅ Music Master NFT minted!', {
      tokenId,
      txHash: tx.hash,
      price: price || '1',
      songTitle: songTitle || 'Untitled'
    });
    
    // ✅ Post cast using Neynar SDK with OG image embed
    if (fid) {
      try {
        const castText = `🎵 New Music Master NFT Minted!

"${songTitle || 'Untitled'}" - Token #${tokenId}
💰 License Price: ${price || '1'} TOURS

⚡ Gasless minting powered by @empowertours
🎶 Purchase license to stream full track

View: https://testnet.monadscan.com/tx/${tx.hash}

@empowertours`;

        console.log('📢 Posting cast to Farcaster with OG image...');
        
        // ✅ Generate OG image URL
        const ogImageUrl = `${APP_URL}/api/og/music?tokenId=${tokenId}`;
        console.log('🎨 OG Image URL:', ogImageUrl);
        
        // Initialize Neynar client with correct SDK
        const client = new NeynarAPIClient({
          apiKey: NEYNAR_API_KEY,
        });

        // ✅ Use publishCast method with OG image embed
        const result = await client.publishCast({
          signerUuid: process.env.BOT_SIGNER_UUID || '',
          text: castText,
          embeds: [
            {
              url: ogImageUrl  // 🎨 This triggers OG image generation!
            }
          ]
        });

        console.log('✅ Cast with OG image posted successfully:', {
          hash: result.cast?.hash,
          songTitle: songTitle || 'Untitled',
          tokenId,
          ogImageUrl,
        });
      } catch (castError: any) {
        console.warn('⚠️ Cast failed (mint still succeeded):', castError.message);
        // Don't fail the entire mint if cast fails
      }
    } else {
      console.log('ℹ️ No FID provided, skipping Farcaster cast');
    }
    
    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      tokenId,
      recipient,
      tokenURI: finalTokenURI,
      songTitle: songTitle || 'Untitled',
      price: price || '1',
      // ✅ Also return OG image URL for client-side reference
      ogImageUrl: `${APP_URL}/api/og/music?tokenId=${tokenId}`,
    });
  } catch (error: any) {
    console.error('❌ Mint error:', error);
    let errorMessage = error.message || 'Mint failed';
    if (error.code === 'CALL_EXCEPTION') {
      errorMessage = 'Contract call failed. Possible reasons:\n';
      errorMessage += '1. Artist already minted a song with this title\n';
      errorMessage += '2. Invalid parameters\n';
      errorMessage += '3. Contract is paused or has restrictions';
    }
    return NextResponse.json(
      {
        error: errorMessage,
        details: error.reason || error.shortMessage,
        code: error.code
      },
      { status: 500 }
    );
  }
}
