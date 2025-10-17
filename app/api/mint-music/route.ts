import { NextRequest, NextResponse } from 'next/server';
import { JsonRpcProvider, Wallet, Contract } from 'ethers';

const MUSIC_NFT_ADDRESS = '0x61A9d192b577EE197Db153753bAD5A93a772eB52';
const MONAD_RPC = 'https://testnet-rpc.monad.xyz';
const DEPLOYER_PRIVATE_KEY = process.env.DEPLOYER_PRIVATE_KEY;

// Complete ABI for MusicNFTv2
const MUSIC_NFT_ABI = [
  {
    inputs: [
      { name: 'to', type: 'address' },
      { name: 'tokenURI', type: 'string' },
      { name: 'preview', type: 'bytes' },
      { name: 'coverArtBase64', type: 'string' },
      { name: 'artist', type: 'address' }
    ],
    name: 'mintFree',
    outputs: [],
    stateMutability: 'nonpayable',
    type: 'function',
  },
];

export async function POST(req: NextRequest) {
  try {
    const { recipient, tokenURI, preview, coverArt, artist, fid } = await req.json();

    console.log('🎵 Music NFT mint request (server-paid FREE):', { 
      recipient, 
      tokenURI, 
      hasPreview: !!preview,
      hasCoverArt: !!coverArt,
      artist: artist || recipient,
      fid 
    });

    if (!recipient || !tokenURI) {
      return NextResponse.json(
        { error: 'Missing recipient or tokenURI' },
        { status: 400 }
      );
    }

    if (!DEPLOYER_PRIVATE_KEY) {
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Initialize provider and wallet
    const provider = new JsonRpcProvider(MONAD_RPC);
    const deployer = new Wallet(DEPLOYER_PRIVATE_KEY, provider);
    const contract = new Contract(MUSIC_NFT_ADDRESS, MUSIC_NFT_ABI, deployer);

    console.log('⚡ Minting music NFT (server pays - FREE for user)...');

    // Prepare parameters
    const previewBytes = preview || '0x'; // Empty bytes if no preview
    const coverArtBase64 = coverArt || ''; // Empty string if no cover
    const artistAddress = artist || recipient; // Use recipient as artist if not specified

    // Mint the NFT using mintFree (only owner can call)
    const tx = await contract.mintFree(
      recipient,
      tokenURI,
      previewBytes,
      coverArtBase64,
      artistAddress
    );
    
    console.log('📤 Mint tx sent:', tx.hash);
    const receipt = await tx.wait();

    if (receipt?.status !== 1) {
      throw new Error('Mint transaction failed');
    }

    console.log('✅ Music NFT minted (FREE - server paid gas)!');

    // Post to Farcaster
    if (fid) {
      try {
        const castText = `🎵 New Music NFT Minted!\n\n⚡ Free minting powered by EmpowerTours\n\nView: https://testnet.monadscan.com/tx/${tx.hash}`;
        
        await fetch('https://api.neynar.com/v2/farcaster/cast', {
          method: 'POST',
          headers: {
            'api_key': process.env.NEXT_PUBLIC_NEYNAR_API_KEY || '',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            signer_uuid: process.env.BOT_SIGNER_UUID,
            text: castText,
          }),
        });
        
        console.log('📢 Cast posted');
      } catch (castError) {
        console.warn('⚠️ Cast failed (mint succeeded):', castError);
      }
    }

    return NextResponse.json({
      success: true,
      txHash: tx.hash,
      recipient,
      tokenURI,
    });

  } catch (error: any) {
    console.error('❌ Server-paid mint error:', error);
    
    return NextResponse.json(
      {
        error: error.message || 'Server-paid mint failed',
        details: error.reason || error.message,
      },
      { status: 500 }
    );
  }
}
